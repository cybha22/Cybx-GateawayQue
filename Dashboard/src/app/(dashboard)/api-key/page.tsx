"use client";

import { useEffect, useState } from "react";
import { useKeysStore } from "@/stores/keys";
import {
  Eye,
  EyeOff,
  Copy,
  Loader2,
  KeyRound,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { copyText } from "@/lib/utils";
import { BASE_URL } from "@/lib/api";

function copyToClipboard(text: string, label = "Copied to clipboard") {
  copyText(text).then(() => toast.success(label)).catch(() => toast.error("Failed to copy"));
}

export default function ApiKeyPage() {
  const { keys, loading, saving, error, fetch, rotate, remove } = useKeysStore();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [customKey, setCustomKey] = useState("");

  useEffect(() => {
    fetch();
  }, [fetch]);

  const toggleReveal = (key: string) =>
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleGenerate = async () => {
    const res = await rotate();
    if (res.ok && res.key) {
      toast.success("New API key generated");
    } else {
      toast.error(res.error || "Failed to generate");
    }
  };

  const handleSetCustom = async () => {
    const trimmed = customKey.trim();
    if (!trimmed) {
      toast.error("Paste a key first");
      return;
    }
    if (!trimmed.startsWith("cy-")) {
      toast.error("Custom key should start with cy-");
      return;
    }
    const res = await rotate(trimmed);
    if (res.ok) {
      toast.success("Custom key saved");
      setCustomKey("");
    } else {
      toast.error(res.error || "Failed");
    }
  };

  const handleRemove = async () => {
    const res = await remove();
    if (res.ok) {
      toast.success("API key disabled");
    } else {
      toast.error(res.error || "Failed");
    }
  };

  const baseUrlForExample = (BASE_URL || "http://127.0.0.1:8085") + "/v1";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">API Key</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Single key model: every request to {baseUrlForExample} authenticates with <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {loading && keys.length === 0 && (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-sm border border-destructive/50 px-4 py-3">
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {!loading && !error && keys.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No API key set. Click <strong>Generate New Key</strong> below to create one.
            </CardContent>
          </Card>
        )}

        {keys.map((k, i) => {
          const isRevealed = revealed[k.key] ?? false;
          const displayValue = isRevealed ? k.key : k.masked;

          return (
            <motion.div
              key={k.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="rounded-sm border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  {k.name ?? "Primary API Key"}
                </p>
                {k.enabled === false && (
                  <Badge variant="outline" className="text-xs">disabled</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-sm border border-border bg-muted/50 px-3 py-2 font-mono text-sm select-all truncate">
                  {displayValue}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => toggleReveal(k.key)}
                  aria-label={isRevealed ? "Hide key" : "Reveal key"}
                >
                  {isRevealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button
                  variant="default"
                  size="icon"
                  onClick={() => copyToClipboard(k.key, "API key copied")}
                  aria-label="Copy key"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            Manage Key
          </CardTitle>
          <CardDescription>
            Generate a fresh key, paste your own, or disable the current key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerate} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
              Generate New Key
            </Button>
            {keys.length > 0 && (
              <Dialog>
                <DialogTrigger render={<Button variant="outline" disabled={saving} />}>
                  <Trash2 className="size-4 mr-2" />
                  Disable Key
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Disable API Key?</DialogTitle>
                    <DialogDescription>
                      All clients using the current key will be rejected. Public endpoints will accept any caller (no auth) until a new key is set.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                    <DialogClose render={<Button variant="destructive" onClick={handleRemove} />}>
                      Disable
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label htmlFor="custom-key" className="text-xs">Set custom key (must start with <code className="font-mono">cy-</code>)</Label>
            <div className="flex gap-2">
              <Input
                id="custom-key"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="cy-..."
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={handleSetCustom} disabled={saving || !customKey.trim()}>
                Save Custom
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="rounded-sm border border-border bg-card p-4 mt-6"
      >
        <p className="text-sm font-medium mb-3">Usage</p>
        <p className="text-sm text-muted-foreground mb-4">
          Use this key to authenticate requests to the CybxAI proxy. Include
          it in the{" "}
          <Badge variant="outline" className="text-xs font-mono">
            Authorization
          </Badge>{" "}
          header of every request.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Example Header
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex-1 rounded-sm border border-border bg-muted/50 px-3 py-2 font-mono text-sm select-all truncate">
                Authorization: Bearer &lt;your-key&gt;
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard("Authorization: Bearer <your-key>", "Header example copied")}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Proxy Base URL
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex-1 rounded-sm border border-border bg-muted/50 px-3 py-2 font-mono text-sm select-all truncate">
                {baseUrlForExample}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(baseUrlForExample, "Base URL copied")}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
