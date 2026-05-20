"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useKiroStore, type KiroConnection } from "@/stores/kiro";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
  User,
  XCircle,
  Zap,
} from "lucide-react";
import { Aws } from "@lobehub/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { copyText } from "@/lib/utils";
import { usePrivacyMode } from "@/lib/privacy";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff } from "lucide-react";

const REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"];

const KIRO_MODELS = [
  { id: "kr/auto", name: "Auto" },
  { id: "kr/claude-opus-4.7", name: "Claude Opus 4.7" },
  { id: "kr/claude-opus-4.6", name: "Claude Opus 4.6" },
  { id: "kr/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  { id: "kr/claude-opus-4.5", name: "Claude Opus 4.5" },
  { id: "kr/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "kr/claude-sonnet-4", name: "Claude Sonnet 4" },
  { id: "kr/claude-haiku-4.5", name: "Claude Haiku 4.5" },
  { id: "kr/deepseek-3.2", name: "DeepSeek 3.2" },
  { id: "kr/qwen3-coder-next", name: "Qwen3 Coder Next" },
  { id: "kr/glm-5", name: "GLM 5" },
  { id: "kr/minimax-m2.5", name: "MiniMax M2.5" },
  { id: "kr/minimax-m2.1", name: "MiniMax M2.1" },
];

function ConnectionCard({ conn, onRefresh, onRemove, busy, mask }: { conn: KiroConnection; onRefresh: (id: string) => void; onRemove: (id: string) => void; busy: string | null; mask: (email?: string | null) => string }) {
  const credit = conn.credit;
  const remaining = credit?.remainingCredits ?? 0;
  const total = credit?.totalCredits ?? 0;
  const used = Math.max(total - remaining, 0);
  const usedPercent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const isExhausted = total > 0 && remaining <= 0;
  const isActive = conn.status === "active" && !isExhausted;
  const barColor = usedPercent > 80 ? "bg-red-500" : usedPercent > 50 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-card">
      <div className="flex items-center gap-2 min-w-0">
        {isActive ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="size-4 shrink-0 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{mask(conn.label || conn.email) || conn.id}</p>
          <p className="text-[10px] text-muted-foreground truncate font-mono">
            {conn.uid?.slice(0, 32) || conn.email || "no profile"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={busy === conn.id}
          onClick={() => onRefresh(conn.id)}
          title="Refresh credit"
        >
          {busy === conn.id ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-destructive"
          disabled={busy === conn.id}
          onClick={() => onRemove(conn.id)}
          title="Remove account"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant={isActive ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
          {conn.status}
        </Badge>
        {credit?.packageName && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {credit.packageName}
          </Badge>
        )}
        {conn.authMethod && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {conn.authMethod}
          </Badge>
        )}
        {conn.region && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {conn.region}
          </Badge>
        )}
      </div>
      {credit && total > 0 && (
        <div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{Math.floor(remaining)} / {Math.floor(total)} credits</span>
            <span>{usedPercent.toFixed(usedPercent < 10 ? 1 : 0)}% used</span>
          </div>
          <div className="h-1 bg-muted rounded overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${usedPercent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function RefreshTokenTab() {
  const { addByRefreshToken } = useKiroStore();
  const [label, setLabel] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!refreshToken.trim()) {
      toast.error("Refresh token is required");
      return;
    }
    setSubmitting(true);
    const res = await addByRefreshToken(refreshToken.trim(), label.trim() || undefined);
    setSubmitting(false);
    if (res.ok) {
      toast.success(res.packageName ? `Connected (${res.packageName})` : "Kiro account connected");
      setLabel("");
      setRefreshToken("");
    } else {
      toast.error(res.error || "Failed to connect");
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Label (optional)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="kiro-pro-1" />
      </div>
      <div className="space-y-2">
        <Label>Refresh Token</Label>
        <Textarea
          value={refreshToken}
          onChange={(e) => setRefreshToken(e.target.value)}
          placeholder="aorAAAAA..."
          className="min-h-28 font-mono text-xs"
        />
      </div>
      <Button onClick={handleSubmit} disabled={submitting || !refreshToken.trim()}>
        {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : <KeyRound className="size-4 mr-2" />}
        Connect Kiro
      </Button>
    </div>
  );
}

function WebTokenTab() {
  const { addByWebToken } = useKiroStore();
  const [bearerToken, setBearerToken] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!bearerToken.trim()) {
      toast.error("Web token is required");
      return;
    }
    setSubmitting(true);
    const res = await addByWebToken(bearerToken.trim(), region);
    setSubmitting(false);
    if (res.ok) {
      toast.success(`Imported ${res.imported ?? 0} account(s)`);
      setBearerToken("");
    } else {
      toast.error(res.error || "Failed to import web token");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>AWS Region</Label>
          <Select value={region} onValueChange={(v) => v && setRegion(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Bearer Token (paste one or more, one per line)</Label>
        <Textarea
          value={bearerToken}
          onChange={(e) => setBearerToken(e.target.value)}
          placeholder="x-amz-sso_authn=..."
          className="min-h-32 font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Each line is treated as an independent SSO token; failures are reported per token.
        </p>
      </div>
      <Button onClick={handleSubmit} disabled={submitting || !bearerToken.trim()}>
        {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : <KeyRound className="size-4 mr-2" />}
        Import Web Token
      </Button>
    </div>
  );
}

function CredentialsTab() {
  const { addByCredentials } = useKiroStore();
  const [json, setJson] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!json.trim()) {
      toast.error("Credentials JSON is required");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      toast.error("Invalid JSON");
      return;
    }
    if (!parsed.refreshToken) {
      toast.error("`refreshToken` field is required");
      return;
    }
    setSubmitting(true);
    const res = await addByCredentials({
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : undefined,
      refreshToken: String(parsed.refreshToken),
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : undefined,
      clientSecret: typeof parsed.clientSecret === "string" ? parsed.clientSecret : undefined,
      authMethod: (parsed.authMethod === "idc" || parsed.authMethod === "social") ? parsed.authMethod : undefined,
      provider: typeof parsed.provider === "string" ? parsed.provider : undefined,
      region: typeof parsed.region === "string" ? parsed.region : region,
      label: label.trim() || undefined,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Kiro account connected");
      setJson("");
      setLabel("");
    } else {
      toast.error(res.error || "Failed to connect");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Default Region</Label>
          <Select value={region} onValueChange={(v) => v && setRegion(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Label (optional)</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="my-kiro" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Credentials JSON</Label>
        <Textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder={'{\n  "accessToken": "...",\n  "refreshToken": "...",\n  "clientId": "...",\n  "clientSecret": "...",\n  "authMethod": "idc",\n  "region": "us-east-1"\n}'}
          className="min-h-40 font-mono text-xs"
        />
      </div>
      <Button onClick={handleSubmit} disabled={submitting || !json.trim()}>
        {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : <KeyRound className="size-4 mr-2" />}
        Connect via Credentials
      </Button>
    </div>
  );
}

function BuilderIdTab() {
  const { builderId, startBuilderId, cancelBuilderId } = useKiroStore();
  const [region, setRegion] = useState("us-east-1");
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    setStarting(true);
    await startBuilderId(region);
    setStarting(false);
  };

  const status = builderId?.status ?? "idle";
  const showCode = builderId && (status === "waiting" || status === "polling" || status === "slow_down");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>AWS Region</Label>
          <Select value={region} onValueChange={(v) => v && setRegion(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!builderId && (
        <Button onClick={handleStart} disabled={starting}>
          {starting ? <Loader2 className="size-4 animate-spin mr-2" /> : <KeyRound className="size-4 mr-2" />}
          Start AWS Builder ID Login
        </Button>
      )}

      {showCode && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
          <p className="text-sm">
            A new tab opened. Sign in to AWS Builder ID and enter this verification code:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded border px-3 py-2 text-lg font-mono bg-background tracking-widest text-center">
              {builderId?.userCode}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyText(builderId?.userCode ?? "").then(() => toast.success("Code copied"))}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Or open: <a href={builderId?.verificationUri} target="_blank" rel="noreferrer" className="text-primary underline">{builderId?.verificationUri}</a>
          </p>
          <div className="flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            <span className="text-xs text-muted-foreground">
              {status === "slow_down" ? "Slowing down poll rate..." : "Waiting for authorization..."}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={cancelBuilderId}>Cancel</Button>
          </div>
        </div>
      )}

      {status === "completed" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-emerald-500" />
          Account added. You can start another flow if needed.
          <Button variant="ghost" size="sm" className="ml-auto" onClick={cancelBuilderId}>Reset</Button>
        </div>
      )}

      {status === "expired" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2 text-sm">
          <XCircle className="size-4 text-amber-500" />
          Authorization expired (10 min). Try again.
          <Button variant="ghost" size="sm" className="ml-auto" onClick={cancelBuilderId}>Reset</Button>
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">Builder ID failed</p>
          <p className="text-xs text-muted-foreground mt-1">{builderId?.error}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={cancelBuilderId}>Reset</Button>
        </div>
      )}
    </div>
  );
}

function IamSsoTab() {
  const { iamSso, startIamSso, completeIamSso, cancelIamSso } = useKiroStore();
  const [startUrl, setStartUrl] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [callback, setCallback] = useState("");
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    if (!startUrl.trim()) {
      toast.error("AWS SSO start URL is required");
      return;
    }
    setBusy(true);
    await startIamSso(startUrl.trim(), region);
    setBusy(false);
  };

  const handleComplete = async () => {
    if (!callback.trim()) {
      toast.error("Paste the redirect URL after authorization");
      return;
    }
    setBusy(true);
    const res = await completeIamSso(callback.trim());
    setBusy(false);
    if (res.ok) {
      toast.success("IAM SSO account added");
      setCallback("");
    } else {
      toast.error(res.error || "Failed");
    }
  };

  const status = iamSso?.status ?? "idle";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>SSO Start URL</Label>
          <Input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://acme.awsapps.com/start" />
        </div>
        <div className="space-y-2">
          <Label>Region</Label>
          <Select value={region} onValueChange={(v) => v && setRegion(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(status === "idle" || status === "failed") && (
        <Button onClick={handleStart} disabled={busy || !startUrl.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <KeyRound className="size-4 mr-2" />}
          Open SSO Authorize URL
        </Button>
      )}

      {(status === "waiting" || status === "completing") && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
          <p className="text-sm">A new tab opened with the AWS authorize URL. After clicking Allow, AWS redirects to a non-resolvable URL like:</p>
          <code className="block rounded border px-3 py-2 text-xs font-mono bg-background break-all">
            http://127.0.0.1/oauth/callback?code=...&amp;state=...
          </code>
          <p className="text-xs text-muted-foreground">
            That URL will fail to load (it points to your machine root, not the dashboard) — copy the entire URL from the address bar and paste it below.
          </p>
          <div className="space-y-2">
            <Label>Pasted Redirect URL</Label>
            <Textarea
              value={callback}
              onChange={(e) => setCallback(e.target.value)}
              placeholder="http://127.0.0.1/oauth/callback?code=..."
              className="min-h-20 font-mono text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleComplete} disabled={busy || !callback.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <CheckCircle2 className="size-4 mr-2" />}
              Complete IAM SSO
            </Button>
            <Button variant="ghost" onClick={cancelIamSso}>Cancel</Button>
          </div>
        </div>
      )}

      {status === "completed" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-emerald-500" />
          IAM SSO account added.
          <Button variant="ghost" size="sm" className="ml-auto" onClick={cancelIamSso}>Reset</Button>
        </div>
      )}

      {status === "failed" && iamSso?.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">IAM SSO failed</p>
          <p className="text-xs text-muted-foreground mt-1">{iamSso.error}</p>
        </div>
      )}
    </div>
  );
}

export default function KiroProviderPage() {
  const router = useRouter();
  const { connections, loading, error, fetchConnections, removeConnection, refreshConnection } = useKiroStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const privacy = usePrivacyMode();

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleRefresh = async (id: string) => {
    setBusyId(id);
    const res = await refreshConnection(id);
    setBusyId(null);
    if (res.ok) {
      toast.success("Credit refreshed");
    } else {
      toast.error(res.error || "Failed to refresh");
    }
  };

  const handleRemove = async (id: string) => {
    setBusyId(id);
    try {
      await removeConnection(id);
      toast.success("Account removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => router.push("/providers")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Aws size={32} />
            Kiro
            <Badge variant="outline" className="text-xs font-normal">AWS CodeWhisperer</Badge>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Multi-method onboarding: Refresh Token, Web Token, IAM Identity Center, AWS Builder ID, or full Credentials JSON.
          </p>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="size-5" />
                  Connected Accounts
                  {connections.length > 0 && <Badge variant="secondary">{connections.length}</Badge>}
                </CardTitle>
                <CardDescription>Refresh credit, view package, or remove accounts.</CardDescription>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                {privacy.enabled ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                <span>Privacy mode</span>
                <Switch size="sm" checked={privacy.enabled} onCheckedChange={privacy.setEnabled} />
              </label>
            </div>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!loading && connections.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No Kiro accounts connected. Use a tab below to add one.</p>
            )}
            {connections.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {connections.map((conn) => (
                  <ConnectionCard key={conn.id} conn={conn} onRefresh={handleRefresh} onRemove={handleRemove} busy={busyId} mask={privacy.mask} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="size-4" />
              Add Kiro Account
            </CardTitle>
            <CardDescription>Choose an onboarding method below.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="refresh" className="space-y-4">
              <TabsList className="grid grid-cols-5">
                <TabsTrigger value="refresh">Refresh Token</TabsTrigger>
                <TabsTrigger value="web">Web Token</TabsTrigger>
                <TabsTrigger value="iam">IAM SSO</TabsTrigger>
                <TabsTrigger value="builder">Builder ID</TabsTrigger>
                <TabsTrigger value="credentials">Credentials</TabsTrigger>
              </TabsList>
              <TabsContent value="refresh">
                <RefreshTokenTab />
              </TabsContent>
              <TabsContent value="web">
                <WebTokenTab />
              </TabsContent>
              <TabsContent value="iam">
                <IamSsoTab />
              </TabsContent>
              <TabsContent value="builder">
                <BuilderIdTab />
              </TabsContent>
              <TabsContent value="credentials">
                <CredentialsTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="size-4" />
              Available Kiro Models
            </CardTitle>
            <CardDescription>All models routed through the Kiro provider.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {KIRO_MODELS.map((m) => (
                <div key={m.id} className="rounded border p-2">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{m.id}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}
