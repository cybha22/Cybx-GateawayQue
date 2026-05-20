"use client";

import { useEffect, useMemo, useState, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { ListFilter, Play, Square, Loader2 } from "lucide-react";

export function FilterUnconnectedSection() {
  const { batchConnect, cancelBatch, fetchBatchStatus, batchTaskId, batchTask, batchLoading, fetch } =
    useConnectionsStore();

  const [text, setText] = useState("");
  const [provider, setProvider] = useState<string>("cline");
  const [concurrency, setConcurrency] = useState(2);
  const [headless, setHeadless] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [allLabels, setAllLabels] = useState<{ provider: string; label: string }[]>([]);

  const taskId = batchTaskId;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastShownRef = useRef<string | null>(null);

  useEffect(() => {
    async function loadLabels() {
      try {
        const { apiFetch } = await import("@/lib/api");
        const labels = await apiFetch<{ provider: string; label: string }[]>("/api/connections/labels");
        setAllLabels(labels);
      } catch { }
    }
    loadLabels();
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!taskId) return;
    toastShownRef.current = null;
    fetchBatchStatus(taskId);
    pollRef.current = setInterval(() => fetchBatchStatus(taskId), 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [taskId, fetchBatchStatus]);

  useEffect(() => {
    if (!batchTask) return;
    const done = batchTask.status === "completed" || batchTask.status === "done" || batchTask.status === "cancelled" || batchTask.status === "failed";
    if (!done) return;

    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    const tid = batchTask.taskId ?? taskId ?? "";
    if (toastShownRef.current === tid) return;
    toastShownRef.current = tid;

    if (batchTask.status === "cancelled") toast("Batch cancelled");
    else if (batchTask.status === "failed") toast.error("Batch failed");
    else toast.success(`Batch complete: ${batchTask.completed ?? (batchTask as any).success ?? 0} added, ${batchTask.failed} failed`);
    if (typeof window !== "undefined") localStorage.removeItem("cybxai_batch_task_id");
    useConnectionsStore.setState({ batchTaskId: null, batchTask: null });
    fetch();
    // Refresh labels after batch completes
    import("@/lib/api").then(({ apiFetch }) =>
      apiFetch<{ provider: string; label: string }[]>("/api/connections/labels").then(setAllLabels).catch(() => { }),
    );
  }, [batchTask, fetch, taskId]);

  // Build set of connected emails per provider from all labels
  const connectedEmails = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const item of allLabels) {
      const p = item.provider || "codebuddy";
      if (!map.has(p)) map.set(p, new Set());
      map.get(p)!.add((item.label ?? "").toLowerCase());
    }
    return map;
  }, [allLabels]);

  // Parse input and filter out already-connected accounts
  const parsed = useMemo(() => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const connected = connectedEmails.get(provider) ?? new Set();
    const all: { email: string; password: string }[] = [];
    const missing: { email: string; password: string }[] = [];
    const alreadyConnected: string[] = [];

    for (const line of lines) {
      const sep = line.includes("|") ? "|" : line.includes(";") ? ";" : ":";
      const [email, password] = line.split(sep, 2);
      const e = (email ?? "").trim().toLowerCase();
      const p = (password ?? "").trim();
      if (!e) continue;
      all.push({ email: e, password: p });
      if (connected.has(e)) {
        alreadyConnected.push(e);
      } else {
        missing.push({ email: e, password: p });
      }
    }
    return { all, missing, alreadyConnected };
  }, [text, provider, connectedEmails]);

  const isRunning = !!taskId;
  const progress =
    batchTask && batchTask.total > 0
      ? Math.round(((batchTask.completed ?? 0) / batchTask.total) * 100)
      : 0;

  async function handleStart() {
    if (parsed.missing.length === 0) {
      toast.error("No unconnected accounts to process");
      return;
    }
    showPremiumToast();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            <div>
              <CardTitle>Filter Unconnected</CardTitle>
              <CardDescription>
                Paste your account list — only accounts <strong>not yet connected</strong> to the selected provider will be shown and batch-connected.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider selector */}
          <div className="flex items-center flex-wrap gap-3">
            <Label className="text-xs text-muted-foreground shrink-0">Provider:</Label>
            <div className="flex gap-1.5">
              {(["codebuddy", "cline", "kiro", "qoder", "codex"] as string[]).map((p) => (
                <Button
                  key={p}
                  variant={provider === p ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => setProvider(p)}
                >
                  {p === "codebuddy" ? "Codebuddy" : p === "cline" ? "Cline" : p === "kiro" ? "Kiro" : p === "qoder" ? "Qoder" : "Codex"}
                  <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0">
                    {connectedEmails.get(p)?.size ?? 0}
                  </Badge>
                </Button>
              ))}
            </div>
          </div>

          {/* Account list input */}
          <Textarea
            className="font-mono text-xs max-h-[160px] overflow-y-auto resize-none"
            rows={5}
            placeholder={"email|password\nemail:password\nemail;password"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isRunning}
          />

          {/* Stats */}
          {parsed.all.length > 0 && (
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-muted-foreground">
                Total: <strong className="text-foreground">{parsed.all.length}</strong>
              </span>
              <span className="text-muted-foreground">
                Already connected: <strong className="text-green-400">{parsed.alreadyConnected.length}</strong>
              </span>
              <span className="text-muted-foreground">
                Missing: <strong className="text-amber-400">{parsed.missing.length}</strong>
              </span>
            </div>
          )}

          {/* Missing accounts list */}
          {parsed.missing.length > 0 && !isRunning && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Unconnected to {provider === "codebuddy" ? "CodeBuddy" : provider === "cline" ? "Cline" : provider === "kiro" ? "Kiro" : provider === "qoder" ? "Qoder" : "Codex"} ({parsed.missing.length})
                </span>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {parsed.missing.map((acc, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1 text-xs font-mono border-b border-border/50 last:border-0"
                  >
                    <span className="text-amber-400 shrink-0 w-5 text-right text-[10px] text-muted-foreground">{i + 1}</span>
                    <span className="truncate">{acc.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Concurrency:</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value) || 2)}
                className="w-16 h-8 text-xs"
                disabled={isRunning}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                size="sm"
                checked={headless}
                onCheckedChange={setHeadless}
                disabled={isRunning}
              />
              <Label className="text-xs text-muted-foreground">Headless</Label>
            </div>
            <div className="ml-auto flex gap-2">
              {isRunning ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={cancelling}
                  onClick={async () => {
                    if (taskId && !cancelling) {
                      setCancelling(true);
                      await cancelBatch(taskId);
                      setCancelling(false);
                    }
                  }}
                >
                  {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                  {cancelling ? "Cancelling..." : "Cancel"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={batchLoading || parsed.missing.length === 0}
                >
                  {batchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Connect {parsed.missing.length} accounts
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {isRunning && batchTask && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
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
