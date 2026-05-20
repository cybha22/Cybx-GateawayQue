"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useUsageStore, type UsageRecordsParams, type UsageRecord } from "@/stores/usage";
import { useModelsStore } from "@/stores/models";
import { useConnectionsStore } from "@/stores/connections";

import {
  RefreshCw,
  Loader2,
  Clock,
  Cpu,
  User,
  Zap,
  Hash,
  ArrowUpRight,
  ArrowDownLeft,
  Activity,
  CheckCircle2,
  XCircle,
  Globe,
  Copy,
  Radio,
  FileJson,
  MessageSquare,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn, copyText as copyToClipboard } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { usePrivacyMode } from "@/lib/privacy";


function formatRelativeTime(timestamp: string | number): string {
  const now = Date.now();
  const then = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
  const diffMs = now - then;

  if (isNaN(then)) return String(timestamp);

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(then).toLocaleDateString();
}

function formatTokens(value: unknown): string {
  if (value == null) return "-";
  const num = Number(value);
  if (isNaN(num)) return "-";
  return num.toLocaleString();
}

function formatLatency(ms: unknown): string {
  if (ms == null) return "-";
  const num = Number(ms);
  if (isNaN(num)) return "-";
  if (num < 1000) return `${num}ms`;
  return `${(num / 1000).toFixed(2)}s`;
}

function formatCost(cost: number | undefined | null): string {
  if (cost == null) return "-";
  const num = Number(cost);
  if (isNaN(num)) return "-";
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K cr`;
  if (num >= 1) return `${num.toFixed(2)} cr`;
  return `${num.toFixed(4)} cr`;
}

function getProviderFromModel(model: string): string {
  if (!model) return "Kiro";
  if (model.startsWith("kr/")) return "Kiro";
  return "Kiro";
}

function getProviderColor(model: string): string {
  if (!model || model.startsWith("kr/")) return "text-sky-500";
  return "text-sky-500";
}

/* ------------------------------------------------------------------ */
/*  Detail Dialog                                                      */
/* ------------------------------------------------------------------ */

function extractAssistantText(raw?: string): string | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && Array.isArray(obj.content)) {
      const parts = obj.content
        .filter((c: any) => c?.type === "text")
        .map((c: any) => String(c.text ?? ""));
      const joined = parts.join("");
      if (joined.trim()) return joined;
    }
    if (obj?.choices?.[0]?.message?.content) {
      return String(obj.choices[0].message.content);
    }
  } catch {}
  return null;
}

function extractRequestText(raw?: string): string | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    const messages: any[] = Array.isArray(obj?.messages) ? obj.messages : [];
    if (messages.length === 0) {
      if (typeof obj?.prompt === "string") return obj.prompt;
      return null;
    }

    const renderContent = (content: any): string => {
      if (typeof content === "string") return content;
      if (!Array.isArray(content)) return "";
      return content
        .map((c: any) => {
          if (typeof c === "string") return c;
          if (c?.type === "text") return String(c.text ?? "");
          if (c?.type === "image_url") return "[image]";
          if (c?.type === "tool_use") return `[tool_use:${c.name ?? ""}]`;
          if (c?.type === "tool_result") return `[tool_result:${c.tool_use_id ?? ""}]`;
          return "";
        })
        .filter(Boolean)
        .join("\n");
    };

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "user") {
        const text = renderContent(m.content).trim();
        if (text) return text;
      }
    }

    return renderContent(messages[messages.length - 1]?.content) || null;
  } catch {
    return null;
  }
}

function extractRequestFullConversation(raw?: string): string | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    const messages: any[] = Array.isArray(obj?.messages) ? obj.messages : [];
    if (messages.length === 0) return null;

    const renderContent = (content: any): string => {
      if (typeof content === "string") return content;
      if (!Array.isArray(content)) return "";
      return content
        .map((c: any) => {
          if (typeof c === "string") return c;
          if (c?.type === "text") return String(c.text ?? "");
          if (c?.type === "image_url") return "[image]";
          if (c?.type === "tool_use") return `[tool_use:${c.name ?? ""}]`;
          if (c?.type === "tool_result") return `[tool_result:${c.tool_use_id ?? ""}]`;
          return "";
        })
        .filter(Boolean)
        .join("\n");
    };

    const sysObj = obj?.system;
    let systemText = "";
    if (typeof sysObj === "string") {
      systemText = sysObj;
    } else if (Array.isArray(sysObj)) {
      systemText = sysObj
        .map((s: any) => (typeof s === "string" ? s : s?.text ?? ""))
        .filter(Boolean)
        .join("\n");
    }

    const sections: string[] = [];
    if (systemText.trim()) sections.push(`[SYSTEM]\n${systemText}`);
    for (const m of messages) {
      const role = String(m?.role ?? "user").toUpperCase();
      const text = renderContent(m?.content);
      sections.push(`[${role}]\n${text}`.trim());
    }
    return sections.join("\n\n").trim() || null;
  } catch {
    return null;
  }
}

function LogDetailDialog({
  record,
  open,
  onOpenChange,
}: {
  record: UsageRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const privacy = usePrivacyMode();
  if (!record) return null;

  const r = record;
  const isSuccess =
    r.success === true ||
    (r.status != null && String(r.status).toLowerCase() === "success");
  const provider = getProviderFromModel(r.model);
  const providerColor = getProviderColor(r.model);
  const promptTokens = Number(r.promptTokens ?? 0);
  const completionTokens = Number(r.completionTokens ?? 0);
  const totalTokens = Number(r.totalTokens ?? 0);
  const latencyMs = Number(r.latencyMs ?? 0);
  const httpStatus = r.status != null ? Number(r.status) : null;
  const ts = typeof r.timestamp === "number" ? r.timestamp : new Date(r.timestamp).getTime();

  const isStreaming = !!(r as any).streaming;
  const requestBody = (r as any).requestBody as string | undefined;
  const responseBody = (r as any).responseBody as string | undefined;
  const requestText = extractRequestText(requestBody);
  const requestFull = extractRequestFullConversation(requestBody);
  const responseText = extractAssistantText(responseBody);

  const copyId = () => {
    copyToClipboard(r.id).then(() => toast.success("ID copied")).catch(() => toast.error("Failed to copy"));
  };

  const copyField = (text: string, label: string) => {
    copyToClipboard(text).then(() => toast.success(`${label} copied`)).catch(() => toast.error("Failed to copy"));
  };

  const formatJson = (str: string | undefined): string => {
    if (!str) return "";
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="size-4" />
            Request Detail
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <button
              onClick={copyId}
              className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              {r.id}
              <Copy className="size-3" />
            </button>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status banner */}
          {r.status === "streaming" ? (
            <div className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-blue-500 animate-pulse" />
                <span className="text-sm font-medium text-blue-500">Streaming...</span>
              </div>
              <Badge variant="outline" className="border-blue-500/30 text-blue-500">
                In Progress
              </Badge>
            </div>
          ) : (
            <div
              className={cn(
                "flex items-center justify-between rounded-lg border p-3",
                isSuccess
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-destructive/30 bg-destructive/5"
              )}
            >
              <div className="flex items-center gap-2">
                {isSuccess ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : (
                  <XCircle className="size-4 text-destructive" />
                )}
                <span className="text-sm font-medium">
                  {isSuccess ? "Success" : "Failed"}
                </span>
                {isStreaming && (
                  <Badge variant="outline" className="gap-1 text-[10px] border-muted-foreground/30 text-muted-foreground">
                    Streamed
                  </Badge>
                )}
              </div>
              {httpStatus != null && (
                <Badge variant={isSuccess ? "secondary" : "destructive"}>
                  HTTP {httpStatus}
                </Badge>
              )}
            </div>
          )}

          {/* Model & Provider */}
          <div className="grid grid-cols-2 gap-3">
            <DetailItem
              icon={<Cpu className="size-3.5" />}
              label="Model"
              value={
                <Badge variant="secondary" className="font-mono text-xs">
                  {r.model}
                </Badge>
              }
            />
            <DetailItem
              icon={<Globe className={cn("size-3.5", providerColor)} />}
              label="Provider"
              value={<span className={cn("text-sm font-medium", providerColor)}>{provider}</span>}
            />
          </div>

          {/* Account & Endpoint */}
          <div className="grid grid-cols-2 gap-3">
            <DetailItem
              icon={<User className="size-3.5" />}
              label="Account"
              value={
                <span className="text-sm truncate max-w-[180px] block">
                  {privacy.mask(String(r.accountLabel ?? r.accountId ?? "-"))}
                </span>
              }
            />
            <DetailItem
              icon={<Zap className="size-3.5" />}
              label="Endpoint"
              value={
                <span className="text-xs font-mono text-muted-foreground">
                  {String(r.endpoint ?? "-")}
                </span>
              }
            />
          </div>

          <Separator />

          {/* Token breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Token Usage
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <TokenCard
                icon={<ArrowUpRight className="size-3.5 text-blue-500" />}
                label="Input"
                value={promptTokens}
              />
              <TokenCard
                icon={<ArrowDownLeft className="size-3.5 text-green-500" />}
                label="Output"
                value={completionTokens}
              />
              <TokenCard
                icon={<Hash className="size-3.5 text-amber-500" />}
                label="Total"
                value={totalTokens}
                highlight
              />
            </div>
            {/* Cost */}
            <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Credits</span>
              <span className="text-sm font-mono font-semibold text-emerald-400">
                {r.cost != null ? formatCost(r.cost) : "—"}
              </span>
            </div>
            {/* Token ratio bar */}
            {totalTokens > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Input {((promptTokens / totalTokens) * 100).toFixed(0)}%</span>
                  <span>Output {((completionTokens / totalTokens) * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${(promptTokens / totalTokens) * 100}%` }}
                  />
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${(completionTokens / totalTokens) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Timing */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Timing
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <DetailItem
                icon={<Clock className="size-3.5" />}
                label="Latency"
                value={
                  <span className="text-sm font-mono font-medium">
                    {formatLatency(latencyMs)}
                  </span>
                }
              />
              <DetailItem
                icon={<Clock className="size-3.5" />}
                label="Timestamp"
                value={
                  <span className="text-xs text-muted-foreground">
                    {new Date(ts).toLocaleString()}
                  </span>
                }
              />
            </div>
            {/* Tokens per second */}
            {latencyMs > 0 && completionTokens > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="size-3" />
                <span>
                  {(completionTokens / (latencyMs / 1000)).toFixed(1)} tokens/sec
                </span>
              </div>
            )}
          </div>

          {/* Request Body */}
          {requestBody && (
            <>
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <FileJson className="size-3.5" />
                    Request
                  </h4>
                  <button
                    onClick={() => copyField(requestText ?? requestBody!, "Request")}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Copy className="size-3" />
                    Copy
                  </button>
                </div>
                {requestText ? (
                  <>
                    <pre className="rounded-lg border bg-muted/50 p-3 text-[12px] overflow-auto max-h-[260px] whitespace-pre-wrap break-words">
                      {requestText}
                    </pre>
                    {requestFull && requestFull !== requestText && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                          View full conversation
                        </summary>
                        <pre className="rounded-lg border bg-muted/50 p-3 text-[11px] overflow-auto max-h-[260px] whitespace-pre-wrap break-words mt-2">
                          {requestFull}
                        </pre>
                      </details>
                    )}
                    <details className="mt-2">
                      <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                        View raw JSON
                      </summary>
                      <pre className="rounded-lg border bg-muted/50 p-3 text-[11px] font-mono overflow-auto max-h-[200px] whitespace-pre-wrap break-words mt-2">
                        {formatJson(requestBody)}
                      </pre>
                    </details>
                  </>
                ) : (
                  <pre className="rounded-lg border bg-muted/50 p-3 text-[11px] font-mono overflow-auto whitespace-pre-wrap break-all">
                    {formatJson(requestBody)}
                  </pre>
                )}
              </div>
            </>
          )}

          {/* Response Body */}
          {responseBody && (
            <>
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <MessageSquare className="size-3.5" />
                    Response
                  </h4>
                  <button
                    onClick={() => copyField(responseText ?? responseBody!, "Response")}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Copy className="size-3" />
                    Copy
                  </button>
                </div>
                {responseText ? (
                  <>
                    <pre className="rounded-lg border bg-muted/50 p-3 text-[12px] overflow-auto max-h-[260px] whitespace-pre-wrap break-words">
                      {responseText}
                    </pre>
                    <details className="mt-2">
                      <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                        View raw JSON
                      </summary>
                      <pre className="rounded-lg border bg-muted/50 p-3 text-[11px] font-mono overflow-auto max-h-[200px] whitespace-pre-wrap break-words mt-2">
                        {formatJson(responseBody)}
                      </pre>
                    </details>
                  </>
                ) : (
                  <pre className="rounded-lg border bg-muted/50 p-3 text-[11px] font-mono overflow-auto max-h-[200px] whitespace-pre-wrap break-words">
                    {responseBody}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      {value}
    </div>
  );
}

function TokenCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 text-center",
        highlight && "border-primary/30 bg-primary/5"
      )}
    >
      <div className="flex items-center justify-center gap-1 mb-1">
        {icon}
        <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
      </div>
      <span className={cn("text-sm font-mono font-semibold", highlight && "text-primary")}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const LIMIT_OPTIONS = [20, 50, 100, 200] as const;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LogsPage() {
  const { records, recordsLoading, recordsError, fetchRecords } =
    useUsageStore();
  const { models, fetch: fetchModels } = useModelsStore();
  const { connections, fetch: fetchConnections } = useConnectionsStore();
  const privacy = usePrivacyMode();

  const [filterModel, setFilterModel] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [limit, setLimit] = useState<number>(50);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<UsageRecord | null>(null);
  const [clearing, setClearing] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build params from current filter state
  const buildParams = useCallback((): UsageRecordsParams => {
    const params: UsageRecordsParams = { limit };
    if (filterModel) params.model = filterModel;
    if (filterAccount) params.accountId = filterAccount;
    return params;
  }, [limit, filterModel, filterAccount]);

  // Fetch data on mount
  useEffect(() => {
    fetchModels();
    fetchConnections();
    fetchRecords(buildParams());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    fetchRecords(buildParams());
  }, [fetchRecords, buildParams]);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await apiFetch("/api/usage/records", { method: "DELETE" });
      toast.success("All logs cleared");
      fetchRecords({ limit });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to clear logs");
    }
    setClearing(false);
  };

  // Re-fetch when filters change
  useEffect(() => {
    fetchRecords(buildParams());
  }, [limit, filterModel, filterAccount, fetchRecords, buildParams]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchRecords(buildParams());
      }, 10_000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, fetchRecords, buildParams]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Logs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Request logs and usage records
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none rounded-md border px-3 py-1.5 bg-card">
          {privacy.enabled ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          <span>Privacy mode</span>
          <Switch size="sm" checked={privacy.enabled} onCheckedChange={privacy.setEnabled} />
        </label>
      </div>

      {/* Filter bar */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">

          {/* Limit buttons */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Limit</Label>
            <div className="flex gap-1">
              {LIMIT_OPTIONS.map((n) => (
                <Button
                  key={n}
                  variant={limit === n ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLimit(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>

          {/* Refresh button */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={recordsLoading}
            aria-label="Refresh"
          >
            <RefreshCw
              className={cn("size-4", recordsLoading && "animate-spin")}
            />
          </Button>

          {/* Clear All button */}
          <Dialog>
            <DialogTrigger>
              <Button variant="destructive" size="sm" disabled={clearing}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Clear All
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear All Logs?</DialogTitle>
                <DialogDescription>
                  This will permanently delete all usage records and request/response logs. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-4">
                <DialogClose>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose>
                  <Button variant="destructive" onClick={handleClearAll} disabled={clearing}>
                    {clearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Delete All Logs
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>

          {/* Auto-refresh toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground">
              Auto-refresh
            </Label>
            <Switch
              id="auto-refresh"
              size="sm"
              checked={autoRefresh}
              onCheckedChange={(checked) => setAutoRefresh(checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {recordsError && (
        <Card className="mb-4 border-destructive/50">
          <CardContent className="flex items-center justify-between py-3">
            <span className="text-sm text-destructive">{recordsError}</span>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {recordsLoading && records.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!recordsLoading && !recordsError && records.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No log records found.
        </div>
      )}

      {/* Logs table */}
      {records.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-16rem)]">
            <TooltipProvider>
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Prompt</TableHead>
                    <TableHead className="text-right">Completion</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead className="text-right">Latency</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => {
                    const isStreaming = r.status === "streaming";
                    const isSuccess =
                      !isStreaming && (
                        r.success === true ||
                        (r.status != null &&
                          String(r.status).toLowerCase() === "success")
                      );

                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedRecord(r)}
                      >
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger className="cursor-default">
                              {formatRelativeTime(r.timestamp)}
                            </TooltipTrigger>
                            <TooltipContent>
                              {new Date(typeof r.timestamp === "number" ? r.timestamp : r.timestamp).toLocaleString()}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.model}</Badge>
                        </TableCell>
                        <TableCell>
                          {privacy.mask(String(r.accountLabel ?? r.accountId ?? "-"))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatTokens(r.promptTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatTokens(r.completionTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatTokens(r.totalTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-emerald-400">
                          {formatCost(r.cost)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {r.latencyMs != null
                            ? `${Number(r.latencyMs).toLocaleString()}ms`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {r.status === "streaming" ? (
                            <Badge variant="outline" className="gap-1 border-blue-500/30 text-blue-500 animate-pulse">
                              <Radio className="size-3" />
                              streaming
                            </Badge>
                          ) : (
                            <Badge
                              variant={isSuccess ? "default" : "destructive"}
                              className={cn(
                                isSuccess &&
                                  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              )}
                            >
                              {isSuccess ? "success" : "fail"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        </Card>
      )}

      {/* Detail dialog */}
      <LogDetailDialog
        record={selectedRecord}
        open={!!selectedRecord}
        onOpenChange={(open) => {
          if (!open) setSelectedRecord(null);
        }}
      />
    </div>
  );
}
