"use client";

import { useEffect, useState } from "react";
import { useTunnelStore } from "@/stores/tunnel";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Loader2,
  Play,
  Square,
  Copy,
  ExternalLink,
  RefreshCw,
  Wifi,
  WifiOff,
  Cloud,
  Settings,
  FolderSearch,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";

export default function TunnelPage() {
  const { state, config, loading, actionLoading, fetch, fetchConfig, setConfig, startQuick, startNamed, stop } =
    useTunnelStore();

  const [mode, setMode] = useState<"quick" | "named">("quick");
  const [hostname, setHostname] = useState("");
  const [tunnelName, setTunnelName] = useState("kiro-cybxai");
  const [binaryPath, setBinaryPath] = useState("");
  const [configLoading, setConfigLoading] = useState(false);
  const [configResult, setConfigResult] = useState<{ valid: boolean; version?: string; error?: string } | null>(null);

  useEffect(() => {
    fetch();
    fetchConfig();
    const interval = setInterval(() => {
      if (state?.status === "starting") {
        fetch();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetch, fetchConfig, state?.status]);

  useEffect(() => {
    if (config?.binaryPath) setBinaryPath(config.binaryPath);
  }, [config?.binaryPath]);

  const handleSavePath = async () => {
    setConfigLoading(true);
    setConfigResult(null);
    try {
      const result = await setConfig(binaryPath.trim() || null);
      setConfigResult(result);
      if (result.valid) {
        toast.success(result.version ? `Saved: ${result.version}` : "Path cleared, using PATH default");
      } else {
        toast.error(result.error || "Invalid path");
      }
    } catch {
      toast.error("Failed to save config");
    }
    setConfigLoading(false);
  };

  const handleDetect = async () => {
    await fetchConfig();
    if (config?.detectedPaths && config.detectedPaths.length > 0) {
      toast.success(`Found ${config.detectedPaths.length} location(s)`);
    } else {
      toast.info("No cloudflared binary found in common locations");
    }
  };

  const handleStart = async () => {
    try {
      if (mode === "named") {
        if (!hostname.trim()) {
          toast.error("Hostname is required for named tunnel");
          return;
        }
        await startNamed(hostname.trim(), tunnelName.trim() || "kiro-cybxai");
      } else {
        await startQuick();
      }
      toast.success("Tunnel started!");
    } catch (err: unknown) {
      toast.error(
        `Failed to start tunnel: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  };

  const handleStop = async () => {
    try {
      await stop();
      toast.success("Tunnel stopped");
    } catch {
      toast.error("Failed to stop tunnel");
    }
  };

  const copyUrl = () => {
    if (state?.url) {
      navigator.clipboard.writeText(state.url);
      toast.success("URL copied to clipboard");
    }
  };

  const statusBadge = () => {
    if (!state) return null;
    switch (state.status) {
      case "running":
        return (
          <Badge variant="default" className="bg-green-600">
            <Wifi className="mr-1 h-3 w-3" /> Running
          </Badge>
        );
      case "starting":
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Starting
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <WifiOff className="mr-1 h-3 w-3" /> Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <WifiOff className="mr-1 h-3 w-3" /> Stopped
          </Badge>
        );
    }
  };

  if (loading && !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cloudflare Tunnel"
        subtitle="Expose the Kiro-Cybxai backend (port 8085) to the internet via secure HTTPS tunnel."
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cloud className="h-5 w-5 text-orange-500" />
                <div>
                  <CardTitle>Tunnel Status</CardTitle>
                  <CardDescription>
                    {state?.installed
                      ? `cloudflared ${state.version || ""}`
                      : "cloudflared not installed"}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge()}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={fetch}
                  disabled={loading}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!state?.installed && (
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
                <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                  cloudflared is not installed
                </p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {state?.installInstructions}
                </pre>
              </div>
            )}

            {state?.status === "running" && state.url && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border bg-green-500/5 p-4">
                  <Globe className="h-5 w-5 text-green-500" />
                  <span className="flex-1 font-mono text-sm">{state.url}</span>
                  <Button variant="ghost" size="icon" onClick={copyUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(state.url!, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Mode: {state.mode}</span>
                  {state.startedAt && (
                    <span>
                      Started:{" "}
                      {new Date(state.startedAt).toLocaleTimeString()}
                    </span>
                  )}
                  {state.hostname && <span>Domain: {state.hostname}</span>}
                </div>
                <Button
                  variant="destructive"
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="mt-2"
                >
                  {actionLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="mr-2 h-4 w-4" />
                  )}
                  Stop Tunnel
                </Button>
              </div>
            )}

            {state?.status === "error" && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {state.error}
                </p>
              </div>
            )}

            {state?.status === "stopped" && state?.installed && (
              <p className="text-sm text-muted-foreground">
                Tunnel is not running. Start one below to get a public HTTPS
                URL.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {state?.installed && state?.status !== "running" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Start Tunnel</CardTitle>
              <CardDescription>
                Choose a tunnel mode to expose your Kiro-Cybxai proxy publicly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={mode === "quick" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("quick")}
                >
                  Quick Tunnel
                </Button>
                <Button
                  variant={mode === "named" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("named")}
                >
                  Named Tunnel
                </Button>
              </div>

              {mode === "quick" && (
                <div className="rounded-lg border p-4 space-y-2">
                  <p className="text-sm font-medium">Quick Tunnel</p>
                  <p className="text-xs text-muted-foreground">
                    No Cloudflare account needed. Generates a random{" "}
                    <code className="rounded bg-muted px-1">
                      *.trycloudflare.com
                    </code>{" "}
                    URL. URL changes each time you restart.
                  </p>
                </div>
              )}

              {mode === "named" && (
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="text-sm font-medium">Named Tunnel</p>
                  <p className="text-xs text-muted-foreground">
                    Requires{" "}
                    <code className="rounded bg-muted px-1">
                      cloudflared login
                    </code>{" "}
                    first. Uses a persistent custom domain.
                  </p>
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="hostname" className="text-xs">
                        Hostname (e.g. api.example.com)
                      </Label>
                      <Input
                        id="hostname"
                        value={hostname}
                        onChange={(e) => setHostname(e.target.value)}
                        placeholder="api.example.com"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="tunnelName" className="text-xs">
                        Tunnel Name
                      </Label>
                      <Input
                        id="tunnelName"
                        value={tunnelName}
                        onChange={(e) => setTunnelName(e.target.value)}
                        placeholder="kiro-cybxai"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              <Button
                onClick={handleStart}
                disabled={actionLoading || state?.status === "starting"}
                className="w-full"
              >
                {actionLoading || state?.status === "starting" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Start {mode === "quick" ? "Quick" : "Named"} Tunnel
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.15 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Cloudflared Settings</CardTitle>
            </div>
            <CardDescription>
              Set custom binary path if cloudflared is not in your system PATH
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="binaryPath" className="text-xs">Binary Path</Label>
              <div className="flex gap-2">
                <Input
                  id="binaryPath"
                  value={binaryPath}
                  onChange={(e) => { setBinaryPath(e.target.value); setConfigResult(null); }}
                  placeholder="Leave empty to use PATH (e.g. C:\Program Files\cloudflared\cloudflared.exe)"
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSavePath}
                  disabled={configLoading}
                >
                  {configLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
              </div>
              {configResult && (
                <div className={`flex items-center gap-1.5 text-xs ${configResult.valid ? "text-green-500" : "text-red-500"}`}>
                  {configResult.valid ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {configResult.valid ? configResult.version || "Using PATH default" : configResult.error}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleDetect} className="text-xs">
                  <FolderSearch className="mr-1 h-3 w-3" />
                  Auto-detect
                </Button>
              </div>
              {config?.detectedPaths && config.detectedPaths.length > 0 && (
                <div className="rounded border p-2 space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Detected Locations</p>
                  {config.detectedPaths.map((p) => (
                    <div key={p} className="flex items-center justify-between gap-2">
                      <code className="text-xs font-mono truncate flex-1">{p}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-6 px-2"
                        onClick={() => { setBinaryPath(p); setConfigResult(null); }}
                      >
                        Use
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Leave empty to use the default <code className="bg-muted px-1 rounded">cloudflared</code> from system PATH.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Cloudflare Tunnel creates a secure outbound connection from your
              machine to Cloudflare&apos;s edge network, giving you a public HTTPS
              URL without opening ports or configuring firewalls.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Quick Tunnel:</strong> No account needed. Random URL
                (changes on restart). Great for testing.
              </li>
              <li>
                <strong>Named Tunnel:</strong> Requires Cloudflare account.
                Persistent custom domain. Run{" "}
                <code className="rounded bg-muted px-1">
                  cloudflared login
                </code>{" "}
                first.
              </li>
              <li>
                Use the public URL as your OpenAI-compatible API base URL in
                any AI tool.
              </li>
              <li>
                API key authentication still applies — your proxy stays
                protected.
              </li>
            </ul>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
