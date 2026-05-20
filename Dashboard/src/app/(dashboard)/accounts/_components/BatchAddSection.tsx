"use client";

import { useState, useEffect, useRef } from "react";
import { useConnectionsStore } from "@/stores/connections";
import { motion } from "motion/react";
import { toast } from "sonner";
import { showPremiumToast } from "@/lib/premium-toast";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Play, Square, Loader2 } from "lucide-react";

export function BatchAddSection() {
  const { batchConnect, cancelBatch, fetchBatchStatus, batchTaskId, batchTask, batchLoading, fetch } =
    useConnectionsStore();

  const [text, setText] = useState("");
  const [concurrency, setConcurrency] = useState(2);
  const [headless, setHeadless] = useState(true);
  const [providers, setProviders] = useState<string[]>(["codebuddy"]);
  const [cancelling, setCancelling] = useState(false);
  const taskId = batchTaskId;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastShownRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!taskId) return;
    toastShownRef.current = null; 

    fetchBatchStatus(taskId);
    pollRef.current = setInterval(() => fetchBatchStatus(taskId), 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [taskId, fetchBatchStatus]);

  useEffect(() => {
    if (!batchTask) return;
    const done = batchTask.status === "completed" || batchTask.status === "done" || batchTask.status === "cancelled" || batchTask.status === "failed";
    if (!done) return;

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const tid = batchTask.taskId ?? taskId ?? "";
    if (toastShownRef.current === tid) return;
    toastShownRef.current = tid;

    if (batchTask.status === "cancelled") {
      toast("Batch cancelled");
    } else if (batchTask.status === "failed") {
      toast.error("Batch failed");
    } else {
      toast.success(`Batch complete: ${batchTask.completed ?? (batchTask as any).success ?? 0} added, ${batchTask.failed} failed`);
    }
    if (typeof window !== "undefined") localStorage.removeItem("cybxai_batch_task_id");
    useConnectionsStore.setState({ batchTaskId: null, batchTask: null });
    fetch();
  }, [batchTask, fetch, taskId]);

  async function handleStart() {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast.error("Paste at least one account");
      return;
    }

    showPremiumToast();
  }

  const isRunning = !!taskId;
  const progress =
    batchTask && batchTask.total > 0
      ? Math.round(((batchTask.completed ?? 0) / batchTask.total) * 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Batch Add Accounts</CardTitle>
          <CardDescription>
            Paste accounts, one per line. Format:{" "}
            <code className="text-xs font-mono">email|password</code> or{" "}
            <code className="text-xs font-mono">email:password</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            className="font-mono text-xs max-h-[160px] overflow-y-auto resize-none"
            rows={5}
            placeholder={"user1@example.com|password123\nuser2@example.com:secret"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isRunning}
          />

          <div className="flex flex-wrap gap-4">
            {[
              { id: "codebuddy", label: "Codebuddy" },
              { id: "cline", label: "Cline" },
              { id: "kiro", label: "Kiro" },
              { id: "qoder", label: "Qoder" },
              { id: "codex", label: "Codex" },
            ].map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={providers.includes(p.id)}
                  onCheckedChange={(checked) => {
                    if (checked) setProviders((prev) => [...prev, p.id]);
                    else setProviders((prev) => prev.filter((x) => x !== p.id));
                  }}
                  disabled={isRunning}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="concurrency">Concurrency</Label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={20}
                className="w-24"
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
                disabled={isRunning}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="headless"
                checked={headless}
                onCheckedChange={setHeadless}
                disabled={isRunning}
              />
              <Label htmlFor="headless" className="text-sm">
                Headless
              </Label>
            </div>

            {isRunning ? (
              <Button
                variant="destructive"
                disabled={cancelling}
                onClick={async () => {
                  if (taskId && !cancelling) {
                    setCancelling(true);
                    await cancelBatch(taskId);
                    setCancelling(false);
                  }
                }}
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                {cancelling ? "Cancelling..." : "Cancel"}
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={batchLoading}
              >
                {batchLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Start Batch Connect
              </Button>
            )}
          </div>

          {/* Progress bar (inline, no logs — logs are in separate panel) */}
          {batchTask && (isRunning || batchTask.status === "completed" || batchTask.status === "failed" || batchTask.status === "cancelled") && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Task: <code className="text-[10px]">{taskId ?? batchTask.taskId}</code>
                </span>
                <div className="flex items-center gap-3">
                  {batchTask.failed > 0 && (
                    <span className="text-high-impact">{batchTask.failed} failed</span>
                  )}
                  <span>{batchTask.completed ?? 0}/{batchTask.total} ({progress}%)</span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
