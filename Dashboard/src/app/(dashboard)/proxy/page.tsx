"use client";

import { useEffect, useRef, useState } from "react";
import { useProxyStore, type BatchAddResult } from "@/stores/proxy";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Shield,
  Info,
  Loader2,
  RefreshCw,
  Trash2,
  Plus,
  Skull,
  Activity,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";


function relativeTime(ts: number | null): string {
  if (!ts) return "-";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const statusBadge = {
  active: "bg-emerald-500/15 text-emerald-500",
  dead: "bg-red-500/15 text-red-500",
  checking: "bg-yellow-500/15 text-yellow-500",
} as const;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ProxyPage() {
  const {
    proxies,
    loading,
    error,
    checkingAll,
    fetch,
    addProxy,
    batchAdd,
    remove,
    removeDead,
    removeAll,
    checkOne,
    checkAll,
  } = useProxyStore();

  /* ---- local state ---- */
  const [addUrl, setAddUrl] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const [batchText, setBatchText] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchAddResult | null>(null);

  const [autoPoll, setAutoPoll] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("cybxai_proxy_autopoll");
    return stored === null ? true : stored === "true";
  });
  const [autoRemoveDead, setAutoRemoveDead] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("cybxai_proxy_autoremove");
    return stored === null ? true : stored === "true";
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialCheckDone = useRef(false);

  const [proxySettings, setProxySettingsState] = useState<any>(null);

  useEffect(() => {
    apiFetch("/api/proxy-settings").then(setProxySettingsState).catch(() => {});
  }, []);

  const updateSettings = async (update: any) => {
    try {
      const updated = await apiFetch("/api/proxy-settings", {
        method: "POST",
        body: JSON.stringify(update),
      });
      setProxySettingsState(updated);
      toast.success("Proxy settings updated");
    } catch {
      toast.error("Failed to update settings");
    }
  };

  /* ---- initial fetch on mount (only check if autoPoll enabled) ---- */
  useEffect(() => {
    fetch().then(() => {
      if (!initialCheckDone.current && autoPoll) {
        initialCheckDone.current = true;
        checkAll();
      }
    });
  }, [fetch, checkAll, autoPoll]);

  /* ---- auto-poll: check all + remove dead ---- */
  useEffect(() => {
    if (autoPoll) {
      pollRef.current = setInterval(async () => {
        await checkAll();
        if (autoRemoveDead) {
          const dead = useProxyStore.getState().proxies.filter((p) => p.status === "dead").length;
          if (dead > 0) await removeDead();
        }
      }, 30_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [autoPoll, autoRemoveDead, checkAll, removeDead]);

  /* ---- derived stats ---- */
  const totalCount = proxies.length;
  const activeCount = proxies.filter((p) => p.status === "active").length;
  const deadCount = proxies.filter((p) => p.status === "dead").length;

  /* ---- handlers ---- */
  const handleAddSingle = async () => {
    const url = addUrl.trim();
    if (!url) return;
    setAdding(true);
    const ok = await addProxy(url, addLabel.trim() || undefined);
    setAdding(false);
    if (ok) {
      toast.success("Proxy added");
      setAddUrl("");
      setAddLabel("");
    } else {
      toast.error(useProxyStore.getState().error ?? "Failed to add proxy");
    }
  };

  const handleBatchAdd = async () => {
    if (!batchText.trim()) return;
    setBatchLoading(true);
    setBatchResult(null);
    const result = await batchAdd(batchText);
    setBatchLoading(false);
    if (result) {
      setBatchResult(result);
      toast.success(`${result.added} proxies added`);
      if (result.added > 0) setBatchText("");
    } else {
      toast.error(
        useProxyStore.getState().error ?? "Failed to batch add proxies",
      );
    }
  };

  const handleCheckAll = async () => {
    await checkAll();
    toast.success("Health check complete");
  };

  const handleRemoveDead = async () => {
    const removed = await removeDead();
    if (removed > 0) {
      toast.success(`Removed ${removed} dead proxies`);
    } else {
      toast("No dead proxies to remove");
    }
  };

  const handleRemove = async (id: string) => {
    await remove(id);
    toast.success("Proxy removed");
  };

  /* ---- render ---- */
  return (
    <div>
      <PageHeader
        title="Proxy Pool"
        subtitle="Manage proxy servers for batch account connection"
      />

      {/* Error banner */}
      {error && (
        <Card className="mb-4 border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center justify-between pt-4">
            <span className="text-sm text-destructive">{error}</span>
            <Button variant="ghost" size="sm" onClick={fetch}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && proxies.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!(loading && proxies.length === 0) && (
        <div className="flex flex-col gap-6">
          {/* ---- Stats row ---- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardContent className="flex items-center gap-3 pt-4">
                  <Globe className="size-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{totalCount}</p>
                    <p className="text-xs text-muted-foreground">
                      Total Proxies
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
            >
              <Card>
                <CardContent className="flex items-center gap-3 pt-4">
                  <Activity className="size-5 text-emerald-500" />
                  <div>
                    <p className="text-2xl font-bold text-emerald-500">
                      {activeCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <Card>
                <CardContent className="flex items-center gap-3 pt-4">
                  <Skull className="size-5 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold text-red-500">
                      {deadCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Dead</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* ---- Apply To Settings ---- */}
          <Card className="mb-0">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Apply To</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={proxySettings?.applyTo?.kiro ?? false}
                    onChange={(e) => updateSettings({ applyTo: { kiro: e.target.checked } })}
                    className="rounded border-muted-foreground/50"
                  />
                  <span className="text-sm">Kiro</span>
                </label>
                <div className="w-px h-5 bg-border mx-1" />
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={proxySettings?.autoTest?.enabled ?? false}
                    onChange={(e) => updateSettings({ autoTest: { enabled: e.target.checked } })}
                    className="rounded border-muted-foreground/50"
                  />
                  <span className="text-sm">Auto-test every</span>
                </label>
                <select
                  value={proxySettings?.autoTest?.intervalMinutes ?? 5}
                  onChange={(e) => updateSettings({ autoTest: { intervalMinutes: parseInt(e.target.value) } })}
                  className="text-xs bg-background border rounded px-2 py-1"
                >
                  <option value="1">1 min</option>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="30">30 min</option>
                </select>
                <div className="w-px h-5 bg-border mx-1" />
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={proxySettings?.autoDeleteFailed ?? true}
                    onChange={(e) => updateSettings({ autoDeleteFailed: e.target.checked })}
                    className="rounded border-muted-foreground/50"
                  />
                  <span className="text-sm">Auto-delete failed</span>
                </label>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {Object.entries(proxySettings?.applyTo ?? {}).filter(([, v]) => v).length} targets active &bull; {proxies.filter(p => p.status === "active").length} proxies ok
              </div>
            </CardContent>
          </Card>

          {/* ---- Actions bar ---- */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4 pt-4">
                <Button
                  onClick={handleCheckAll}
                  disabled={checkingAll || proxies.length === 0}
                >
                  {checkingAll ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Check All
                </Button>

                <Button
                  variant="outline"
                  className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={handleRemoveDead}
                  disabled={deadCount === 0}
                >
                  <Trash2 />
                  Remove Dead
                </Button>

                <Dialog>
                  <DialogTrigger
                    render={
                      <Button
                        variant="destructive"
                        disabled={totalCount === 0}
                      />
                    }
                  >
                    <Trash2 />
                    Delete All
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete All Proxies</DialogTitle>
                      <DialogDescription>
                        This will permanently remove all {totalCount} proxies from the pool. This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                      <DialogClose
                        render={
                          <Button
                            variant="destructive"
                            onClick={async () => {
                              const removed = await removeAll();
                              if (removed > 0) toast.success(`Removed all ${removed} proxies`);
                              else toast("No proxies to remove");
                            }}
                          />
                        }
                      >
                        Delete All
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <div className="ml-auto flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={autoRemoveDead}
                      onCheckedChange={(v) => { setAutoRemoveDead(v); localStorage.setItem("cybxai_proxy_autoremove", String(v)); }}
                      id="auto-remove-dead"
                    />
                    <Label htmlFor="auto-remove-dead" className="text-sm">
                      Auto-remove dead
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={autoPoll}
                      onCheckedChange={(v) => { setAutoPoll(v); localStorage.setItem("cybxai_proxy_autopoll", String(v)); }}
                      id="auto-poll"
                    />
                    <Label htmlFor="auto-poll" className="text-sm">
                      Auto-check 30s
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ---- Single add form ---- */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 pt-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor="proxy-url">Proxy URL</Label>
                  <Input
                    id="proxy-url"
                    className="font-mono text-sm"
                    placeholder="socks5://user:pass@host:port"
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSingle();
                    }}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 sm:w-48">
                  <Label htmlFor="proxy-label">Label (optional)</Label>
                  <Input
                    id="proxy-label"
                    placeholder="e.g. US-East"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSingle();
                    }}
                  />
                </div>
                <Button
                  onClick={handleAddSingle}
                  disabled={adding || !addUrl.trim()}
                >
                  {adding ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* ---- Proxy table ---- */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="size-5 text-primary" />
                  <CardTitle>Proxies</CardTitle>
                </div>
                <CardDescription>
                  {totalCount} {totalCount === 1 ? "proxy" : "proxies"}{" "}
                  configured
                </CardDescription>
              </CardHeader>
              <CardContent>
                {proxies.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No proxies added yet. Add one above or use batch import
                    below.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>URL</TableHead>
                        <TableHead>Label</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ping</TableHead>
                        <TableHead>Last Checked</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proxies.map((proxy) => (
                        <TableRow key={proxy.id}>
                          <TableCell className="max-w-[280px] truncate font-mono text-sm">
                            {proxy.url}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {proxy.label || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={statusBadge[proxy.status]}
                            >
                              {proxy.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {proxy.pingMs != null ? (
                              <span className="flex items-center gap-1.5 font-mono text-xs">
                                <span className={cn(
                                  "size-2 rounded-full shrink-0",
                                  proxy.pingMs < 500 ? "bg-emerald-500" :
                                  proxy.pingMs < 1500 ? "bg-yellow-500" :
                                  proxy.pingMs < 3000 ? "bg-orange-500" : "bg-red-500"
                                )} />
                                {proxy.pingMs}ms
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {relativeTime(proxy.lastChecked)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => checkOne(proxy.id)}
                                disabled={proxy.status === "checking"}
                              >
                                <RefreshCw
                                  className={
                                    proxy.status === "checking"
                                      ? "animate-spin"
                                      : ""
                                  }
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive hover:text-destructive"
                                onClick={() => handleRemove(proxy.id)}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ---- Batch add ---- */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Batch Import</CardTitle>
                <CardDescription>
                  Paste proxy URLs, one per line
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Textarea
                  className="min-h-[120px] font-mono text-sm"
                  placeholder={
                    "http://host:port\nsocks5://user:pass@host:port\nuser:pass@host:port\n..."
                  }
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Supported:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    http://host:port
                  </code>
                  ,{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    http://user:pass@host:port
                  </code>
                  ,{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    socks5://host:port
                  </code>
                  ,{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    socks5://user:pass@host:port
                  </code>
                  ,{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    user:pass@host:port
                  </code>
                  {" "}(auto-imports as HTTP)
                </p>

                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleBatchAdd}
                    disabled={batchLoading || !batchText.trim()}
                  >
                    {batchLoading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    Add Proxies
                  </Button>

                  {batchResult && (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-emerald-500">
                        {batchResult.added} added
                      </span>
                      <span className="text-yellow-500">
                        {batchResult.duplicates} duplicates
                      </span>
                      <span className="text-red-500">
                        {batchResult.invalid} invalid
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ---- Info section ---- */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.35 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Info className="size-5 text-primary" />
                    <CardTitle>How It Works</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Proxies in the pool are randomly assigned to Kiro accounts to
                    distribute outbound traffic and avoid IP-based rate limiting.
                    Each request picks a different active proxy. Dead proxies are
                    skipped automatically and can be auto-removed after failed
                    health checks.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Supported Formats</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <code className="block rounded-md bg-muted px-3 py-1.5 font-mono text-sm">
                    http://host:port
                  </code>
                  <code className="block rounded-md bg-muted px-3 py-1.5 font-mono text-sm">
                    http://user:pass@host:port
                  </code>
                  <code className="block rounded-md bg-muted px-3 py-1.5 font-mono text-sm">
                    socks5://host:port
                  </code>
                  <code className="block rounded-md bg-muted px-3 py-1.5 font-mono text-sm">
                    socks5://user:pass@host:port
                  </code>
                  <code className="block rounded-md bg-muted px-3 py-1.5 font-mono text-sm">
                    user:pass@host:port (imports as http://user:pass@host:port)
                  </code>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
