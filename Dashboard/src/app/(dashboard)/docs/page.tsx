"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  Terminal,
  FileText,
  Globe,
  BookOpen,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn, copyText } from "@/lib/utils";
import { CodeTabs } from "@/components/animate-ui/components/animate/code-tabs";
import { ApiPlayground } from "@/components/docs/ApiPlayground";

function copyToClipboard(text: string) {
  copyText(text).then(() => toast.success("Copied")).catch(() => toast.error("Failed to copy"));
}

function CodeBlock({ code, label, lang }: { code: string; label?: string; lang?: string }) {
  return (
    <div className="my-3">
      <CodeTabs
        codes={{ [label || "shell"]: code }}
        lang={lang || "bash"}
      />
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted px-1.5 py-0.5 rounded-sm font-mono text-[13px]">
      {children}
    </code>
  );
}

function AvailableModelsTable() {
  const [models, setModels] = useState<Array<{ id: string; name: string; provider: string; contextWindow: number | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import("@/lib/api").then(({ apiFetch }) => {
      apiFetch<Array<{ id: string; name: string; provider: string; contextWindow: number | null }>>("/api/models")
        .then((data) => { setModels(data); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, []);

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">Loading models...</div>;
  }

  if (models.length === 0) {
    return <div className="text-sm text-muted-foreground py-4">No models available. Start the server first.</div>;
  }

  const grouped: Record<string, typeof models> = {};
  for (const m of models) {
    const prefix = m.id.split("/")[0] || "other";
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push(m);
  }

  const providerLabels: Record<string, string> = { kr: "Kiro" };

  return (
    <div className="space-y-4 mb-6">
      <div className="text-sm text-muted-foreground">{models.length} models available</div>
      {Object.entries(grouped).map(([prefix, items]) => (
        <div key={prefix}>
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">{providerLabels[prefix] || prefix} ({items.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground text-xs">Model ID</th>
                  <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground text-xs">Name</th>
                  <th className="text-right py-1.5 font-medium text-muted-foreground text-xs">Context</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-4"><InlineCode>{m.id}</InlineCode></td>
                    <td className="py-1.5 pr-4 text-muted-foreground text-xs">{m.name}</td>
                    <td className="py-1.5 text-right text-muted-foreground text-xs">{m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}K` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <div className="flex items-center gap-2 my-2">
      <Badge variant={method === "POST" ? "default" : "secondary"} className="text-xs">
        {method}
      </Badge>
      <code className="font-mono text-sm font-medium">{path}</code>
    </div>
  );
}

interface DocSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  headings?: { id: string; title: string }[];
}

const SECTIONS: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: <Rocket className="size-4" />,
    headings: [
      { id: "what-is-cybxai", title: "What is Kiro-Cybxai?" },
      { id: "quick-setup", title: "Quick Setup" },
    ],
  },
  {
    id: "cli-commands",
    title: "Configuration",
    icon: <Terminal className="size-4" />,
    headings: [
      { id: "server-commands", title: "Server" },
      { id: "auth-commands", title: "Authentication" },
      { id: "key-commands", title: "API Keys" },
      { id: "usage-commands", title: "Usage" },
      { id: "system-commands", title: "System" },
    ],
  },
  {
    id: "account-format",
    title: "Account File Format",
    icon: <FileText className="size-4" />,
  },
  {
    id: "api-reference",
    title: "API Reference",
    icon: <Globe className="size-4" />,
    headings: [
      { id: "chat-completions", title: "Chat Completions" },
      { id: "messages-api", title: "Messages API" },
      { id: "list-models", title: "List Models" },
      { id: "health-check", title: "Health Check" },
      { id: "usage-stats", title: "Usage Stats" },
      { id: "usage-records", title: "Usage Records" },
    ],
  },
  {
    id: "model-aliases",
    title: "Model Aliases",
    icon: <BookOpen className="size-4" />,
    headings: [
      { id: "alias-mapping", title: "Alias Mapping" },
      { id: "available-models", title: "Available Models" },
      { id: "claude-code-config", title: "Claude Code Config" },
      { id: "opencode-config", title: "OpenCode Config" },
    ],
  },
  {
    id: "load-balancing",
    title: "Load Balancing",
    icon: <Zap className="size-4" />,
    headings: [
      { id: "strategy", title: "Strategy" },
      { id: "failover", title: "Failover" },
      { id: "credit-detection", title: "Credit Detection" },
    ],
  },
];

function useActiveSection() {
  const [active, setActive] = useState("getting-started");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    const headings = document.querySelectorAll("[data-docs-heading]");
    headings.forEach((h) => observer.observe(h));

    return () => observer.disconnect();
  }, []);

  return active;
}

function DocsToC({ active }: { active: string }) {
  const allHeadings = SECTIONS.flatMap((s) => [
    { id: s.id, title: s.title, level: 0 },
    ...(s.headings?.map((h) => ({ id: h.id, title: h.title, level: 1 })) ?? []),
  ]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="hidden xl:block w-48 shrink-0 fixed right-6 top-20 h-[calc(100vh-6rem)] overflow-y-auto">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        On this page
      </p>
      <ul className="flex flex-col gap-0.5">
        {allHeadings.map((h) => (
          <li key={h.id}>
            <button
              onClick={() => scrollTo(h.id)}
              className={cn(
                "w-full text-left text-xs py-1 transition-colors",
                h.level === 1 ? "pl-3" : "pl-0",
                active === h.id
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {h.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      data-docs-heading
      className="text-xl font-bold tracking-tight scroll-mt-20 mt-12 mb-4 first:mt-0 flex items-center gap-2"
    >
      {children}
    </h2>
  );
}

function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3
      id={id}
      data-docs-heading
      className="text-base font-semibold tracking-tight scroll-mt-20 mt-8 mb-3"
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>;
}

export default function DocsPage() {
  const active = useActiveSection();

  return (
    <div>
      <article className="max-w-3xl xl:mr-56">

        <H2 id="getting-started">
          <Rocket className="size-5 text-primary" />
          Getting Started
        </H2>

        <H3 id="what-is-cybxai">What is Kiro-Cybxai?</H3>
        <P>
          Kiro-Cybxai is a self-hosted reverse proxy for Kiro (AWS CodeWhisperer) with
          a multi-account pool, OpenAI Chat Completions and Anthropic Messages API
          compatibility, and a Next.js admin dashboard. The Go backend runs on port
          8085 and the dashboard on port 8084. Routing uses weighted round-robin
          across enabled accounts, with automatic token refresh, ban or exhaustion
          detection, and content filters editable from the dashboard.
        </P>

        <H3 id="quick-setup">Quick Setup</H3>
        <div className="flex flex-col gap-3 mb-6">
          {[
            { step: "1", title: "Clone the repository", code: "git clone https://github.com/cybha22/Cybx-GateawayQue.git\ncd Cybx-GateawayQue" },
            { step: "2", title: "Install root dependencies", code: "npm install" },
            { step: "3", title: "Install dashboard dependencies", code: "cd Dashboard && npm install\ncd .." },
            { step: "4", title: "Run backend + dashboard", code: "npm run dev", desc: "Backend starts on http://127.0.0.1:8085, dashboard on http://127.0.0.1:8084." },
            { step: "5", title: "Open dashboard", desc: "Visit http://127.0.0.1:8084 and sign in with default password 'changeme'. Change it from /security." },
            { step: "6", title: "Add a Kiro account", desc: "Open /providers/kiro and pick one of the five onboarding tabs (Refresh Token, Web Token, IAM SSO, Builder ID, or Credentials JSON)." },
          ].map((s) => (
            <div key={s.step} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">
                {s.step}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{s.title}</span>
                {s.code && <CodeBlock code={s.code} label="terminal" lang="bash" />}
                {s.desc && <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>}
              </div>
            </div>
          ))}
        </div>

        <H2 id="cli-commands">
          <Terminal className="size-5 text-primary" />
          Configuration
        </H2>
        <P>
          Kiro-Cybxai has no CLI subcommands. Configure everything from the dashboard
          pages, by editing <InlineCode>Backend/data/config.json</InlineCode>, or by
          calling the REST endpoints below. Filter rules live at{" "}
          <InlineCode>Backend/context-filtes/filters.json</InlineCode> (typo intentional,
          kept for compatibility) and reload on save.
        </P>

        <H3 id="server-commands">Server</H3>
        <P>
          Backend port 8085, dashboard port 8084. The dashboard talks to the backend via{" "}
          <InlineCode>NEXT_PUBLIC_API_URL</InlineCode> set in{" "}
          <InlineCode>Dashboard/.env.local</InlineCode>. The admin password is{" "}
          <InlineCode>changeme</InlineCode> by default; override with the{" "}
          <InlineCode>ADMIN_PASSWORD</InlineCode> environment variable or change it from /security.
        </P>
        <CodeBlock code={`npm run dev
npm run build`} label="workspace scripts" lang="bash" />
        <P>
          To embed the dashboard inside the Go binary for a single-file deploy, build
          the static export and copy it next to the binary:
        </P>
        <CodeBlock code={`npm run build
rm -rf Backend/web
cp -r Dashboard/out Backend/web
cd Backend && ./kiro-go.exe`} label="single-binary" lang="bash" />

        <H3 id="auth-commands">Authentication</H3>
        <P>
          Open <InlineCode>/providers/kiro</InlineCode> in the dashboard. Five onboarding
          methods are supported, each as a tab on that page:
        </P>
        <ul className="list-disc pl-5 mb-4 text-sm text-muted-foreground space-y-1">
          <li><strong>Refresh Token</strong> — paste an existing AWS refresh token to bind an account.</li>
          <li><strong>Web Token</strong> — paste an SSO token captured from the Kiro web flow.</li>
          <li><strong>IAM SSO</strong> — connect an IAM Identity Center account by start URL and region.</li>
          <li><strong>Builder ID</strong> — device-code flow for an AWS Builder ID account.</li>
          <li><strong>Credentials JSON</strong> — import a credentials JSON exported from another tool.</li>
        </ul>
        <P>
          The accounts list lives at <InlineCode>/accounts</InlineCode>. Use the
          Export and Import buttons there to back up or move{" "}
          <InlineCode>config.json</InlineCode> entries between machines.
        </P>

        <H3 id="key-commands">API Keys</H3>
        <P>
          Open <InlineCode>/api-key</InlineCode> to generate a Bearer key. When{" "}
          <InlineCode>requireApiKey</InlineCode> is true in config,{" "}
          <InlineCode>/v1/*</InlineCode> calls must include{" "}
          <InlineCode>Authorization: Bearer &lt;key&gt;</InlineCode>. Quick test:
        </P>
        <CodeBlock code={`curl http:
  -H "Authorization: Bearer <your-api-key>"`} label="curl" lang="bash" />

        <H3 id="usage-commands">Usage</H3>
        <P>
          Live request logs are at <InlineCode>/logs</InlineCode>. Aggregate stats are
          available from the dashboard or via <InlineCode>GET /api/usage/stats</InlineCode>:
        </P>
        <CodeBlock code={`curl "http://127.0.0.1:8085/api/usage/stats" \\
  -H "X-Admin-Password: <admin-password>"`} label="curl" lang="bash" />

        <H3 id="system-commands">System</H3>
        <P>
          The <InlineCode>/security</InlineCode> page manages the admin password,
          session timeout, and active sessions.{" "}
          <InlineCode>/filters</InlineCode> manages regex content rules and
          per-provider overrides. <InlineCode>/proxy</InlineCode> manages the outbound
          SOCKS5 / HTTP proxy plus the proxy pool and scraper. Health snapshot:
        </P>
        <CodeBlock code={`curl "http://127.0.0.1:8085/api/system" \\
  -H "X-Admin-Password: <admin-password>"`} label="curl" lang="bash" />

        <H2 id="account-format">
          <FileText className="size-5 text-primary" />
          Account File Format
        </H2>
        <P>
          Accounts persist inside <InlineCode>Backend/data/config.json</InlineCode>{" "}
          under the <InlineCode>accounts</InlineCode> array. Each entry is created and
          updated by the dashboard, but the on-disk shape is plain JSON, so you can
          inspect or hand-edit it. Use the Export / Import buttons on{" "}
          <InlineCode>/accounts</InlineCode> to move accounts between installs.
        </P>
        <CodeBlock code={`{
  "accounts": [
    {
      "id": "f1c8e2a4-...",
      "email": "user@example.com",
      "nickname": "Primary",
      "provider": "builder-id",
      "authMethod": "refresh-token",
      "region": "us-east-1",
      "accessToken": "eyJraWQiOi...",
      "refreshToken": "arn:aws:sso::...",
      "expiresAt": 1747400000,
      "profileArn": "arn:aws:codewhisperer:...",
      "enabled": true,
      "weight": 1,
      "allowOverage": false,
      "subscriptionType": "PRO",
      "subscriptionTitle": "Kiro Pro",
      "usageLimit": 1000,
      "usageCurrent": 42,
      "banStatus": "ACTIVE"
    }
  ]
}`} label="config.json" lang="json" />

        <H2 id="api-reference">
          <Globe className="size-5 text-primary" />
          API Reference
        </H2>
        <P>
          Base URL: <InlineCode>http://127.0.0.1:8085</InlineCode>. The backend exposes
          three URL families:{" "}
          <InlineCode>/v1/*</InlineCode> for OpenAI and Anthropic-compatible traffic,{" "}
          <InlineCode>/admin/api/*</InlineCode> for the original admin API, and{" "}
          <InlineCode>/api/*</InlineCode> for the dashboard adapter.{" "}
          <InlineCode>/v1/*</InlineCode> uses{" "}
          <InlineCode>Authorization: Bearer &lt;key&gt;</InlineCode> when{" "}
          <InlineCode>requireApiKey=true</InlineCode>.{" "}
          <InlineCode>/admin/api/*</InlineCode> and <InlineCode>/api/*</InlineCode> use{" "}
          <InlineCode>X-Admin-Password</InlineCode> or the{" "}
          <InlineCode>admin_password</InlineCode> cookie.
        </P>

        <H3 id="chat-completions">Chat Completions</H3>
        <Endpoint method="POST" path="/v1/chat/completions" />
        <P>OpenAI-compatible chat completions. Streams Server-Sent Events. Use this for OpenCode and any OpenAI-format client.</P>
        <CodeBlock code={`curl http:
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <your-api-key>" \\
  -d '{
    "model": "kr/claude-sonnet-4",
    "stream": true,
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ]
  }'`} label="curl" lang="bash" />
        <ApiPlayground endpoint={{
          id: "chat-completions",
          method: "POST",
          path: "/v1/chat/completions",
          auth: "bearer",
          responseType: "sse-openai",
          defaultBody: { model: "kr/claude-sonnet-4", stream: true, messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Hello!" }] },
          editableFields: [
            { key: "model", label: "Model", type: "text" },
            { key: "message", label: "Message", type: "textarea", nested: ["messages", "1", "content"] },
          ],
        }} />
        <p className="text-xs font-medium text-muted-foreground mb-1">Response (SSE)</p>
        <CodeBlock code={`data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"}}]}
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"!"}}],"usage":{"prompt_tokens":25,"completion_tokens":10}}
data: [DONE]`} label="response" lang="text" />

        <H3 id="messages-api">Messages API</H3>
        <Endpoint method="POST" path="/v1/messages" />
        <P>Anthropic Messages format. Backend translates between Anthropic and Kiro upstream. Use this for Claude Code and any Anthropic-format client.</P>
        <CodeBlock code={`curl http://127.0.0.1:8085/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <your-api-key>" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "kr/claude-haiku-4",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Explain recursion briefly."}
    ]
  }'`} label="curl" lang="bash" />
        <ApiPlayground endpoint={{
          id: "messages",
          method: "POST",
          path: "/v1/messages",
          auth: "bearer",
          responseType: "sse-anthropic",
          extraHeaders: { "anthropic-version": "2023-06-01" },
          defaultBody: { model: "kr/claude-haiku-4", max_tokens: 1024, stream: true, messages: [{ role: "user", content: "Explain recursion briefly." }] },
          editableFields: [
            { key: "model", label: "Model", type: "text" },
            { key: "message", label: "Message", type: "textarea", nested: ["messages", "0", "content"] },
          ],
        }} />
        <p className="text-xs font-medium text-muted-foreground mb-1">Response (SSE)</p>
        <CodeBlock code={`event: message_start
data: {"type":"message_start","message":{"id":"msg_xxx","role":"assistant"}}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Recursion is..."}}

event: message_stop
data: {"type":"message_stop"}`} label="response" lang="text" />

        <H3 id="list-models">List Models</H3>
        <Endpoint method="GET" path="/v1/models" />
        <CodeBlock code={`curl http://127.0.0.1:8085/v1/models \\
  -H "Authorization: Bearer <your-api-key>"`} label="curl" lang="bash" />
        <ApiPlayground endpoint={{
          id: "list-models",
          method: "GET",
          path: "/v1/models",
          auth: "bearer",
          responseType: "json",
        }} />
        <CodeBlock code={`[
  {"id": "kr/auto", "name": "auto", "provider": "kiro", "contextWindow": 128000},
  {"id": "kr/claude-opus-4.7", "name": "claude-opus-4.7", "provider": "kiro", "contextWindow": 200000},
  {"id": "kr/claude-sonnet-4", "name": "claude-sonnet-4", "provider": "kiro", "contextWindow": 200000},
  {"id": "kr/claude-haiku-4.5", "name": "claude-haiku-4.5", "provider": "kiro", "contextWindow": 200000}
]`} label="response" lang="json" />

        <H3 id="health-check">Health Check</H3>
        <Endpoint method="GET" path="/api/system" />
        <P>Requires the admin password header or cookie.</P>
        <CodeBlock code={`curl http://127.0.0.1:8085/api/system \\
  -H "X-Admin-Password: <admin-password>"`} label="curl" lang="bash" />
        <ApiPlayground endpoint={{
          id: "system",
          method: "GET",
          path: "/api/system",
          auth: "none",
          responseType: "json",
        }} />
        <CodeBlock code={`{"port":8085,"version":"1.0.7"}`} label="response" lang="json" />

        <H3 id="usage-stats">Usage Stats</H3>
        <Endpoint method="GET" path="/api/usage/stats" />
        <P>Aggregate statistics. Optional <InlineCode>?since=</InlineCode> timestamp (ms).</P>
        <CodeBlock code={`curl "http://127.0.0.1:8085/api/usage/stats" \\
  -H "X-Admin-Password: <admin-password>"`} label="curl" lang="bash" />
        <ApiPlayground endpoint={{
          id: "usage-stats",
          method: "GET",
          path: "/api/usage/stats",
          auth: "none",
          responseType: "json",
        }} />
        <CodeBlock code={`{
  "totalRequests": 4,
  "successRequests": 4,
  "failedRequests": 0,
  "successRate": 100,
  "totalPromptTokens": 18883,
  "totalCompletionTokens": 579,
  "totalTokens": 19462,
  "totalCost": 0.245,
  "byModel": {
    "kr/claude-sonnet-4": { "requests": 1, "promptTokens": 4210, "completionTokens": 105, "totalTokens": 4315 }
  }
}`} label="response" lang="json" />

        <H3 id="usage-records">Usage Records</H3>
        <Endpoint method="GET" path="/api/usage/records" />
        <P>
          Query params: <InlineCode>limit</InlineCode>, <InlineCode>model</InlineCode>,{" "}
          <InlineCode>accountId</InlineCode>, <InlineCode>since</InlineCode>
        </P>
        <CodeBlock code={`curl "http://127.0.0.1:8085/api/usage/records?limit=5&model=kr/claude-sonnet-4" \\
  -H "X-Admin-Password: <admin-password>"`} label="curl" lang="bash" />
        <ApiPlayground endpoint={{
          id: "usage-records",
          method: "GET",
          path: "/api/usage/records?limit=5",
          auth: "none",
          responseType: "json",
        }} />
        <CodeBlock code={`[{
  "id": "c9f5c0d3c00d9ff6",
  "timestamp": 1778944686340,
  "model": "kr/claude-sonnet-4",
  "accountId": "32b80a53-de1d-4771-9e2d-d6070deace2c",
  "accountLabel": "user@example.com",
  "endpoint": "/v1/chat/completions",
  "promptTokens": 4210,
  "completionTokens": 105,
  "totalTokens": 4315,
  "cost": 0.0317,
  "latencyMs": 2798,
  "status": "200",
  "success": true,
  "streaming": true
}]`} label="response" lang="json" />

        <H2 id="model-aliases">
          <BookOpen className="size-5 text-primary" />
          Model Aliases
        </H2>

        <H3 id="alias-mapping">Alias Mapping</H3>
        <P>
          Models exposed by Kiro-Cybxai use the <InlineCode>kr/</InlineCode> prefix and
          report <InlineCode>owned_by: &quot;cybxai&quot;</InlineCode> on{" "}
          <InlineCode>/v1/models</InlineCode>. Anthropic-style names without the prefix
          are accepted on the Messages API and routed to the matching Kiro model. The
          live list is loaded from the dashboard{" "}
          <InlineCode>/models</InlineCode> page; the table below is a generic reference
          across the Claude family.
        </P>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">Input (Anthropic-style)</th>
                <th className="text-left py-2 font-medium text-muted-foreground text-xs">Routes To</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["claude-opus-*", "kr/claude-opus-*"],
                ["claude-sonnet-*", "kr/claude-sonnet-*"],
                ["claude-haiku-*", "kr/claude-haiku-*"],
              ].map(([input, output]) => (
                <tr key={input} className="border-b last:border-0">
                  <td className="py-2 pr-4"><InlineCode>{input}</InlineCode></td>
                  <td className="py-2"><span className="bg-primary/10 text-primary rounded-sm px-1.5 py-0.5 font-mono text-xs">{output}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H3 id="available-models">Available Models</H3>
        <AvailableModelsTable />

        <H3 id="claude-code-config">Claude Code Config</H3>
        <P>Claude Code uses Anthropic format. Use names <strong>without</strong> the <InlineCode>kr/</InlineCode> prefix:</P>
        <CodeBlock code={`{
  "model": "claude-sonnet-4",
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8085/v1",
    "ANTHROPIC_AUTH_TOKEN": "<your-api-key>",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4",
    "CLAUDE_CODE_SUBAGENT_MODEL": "claude-haiku-4",
    "API_TIMEOUT_MS": "3000000"
  }
}`} label="settings.json" lang="json" />

        <H3 id="opencode-config">OpenCode Config</H3>
        <P>OpenCode uses OpenAI format. Use names <strong>with</strong> the <InlineCode>kr/</InlineCode> prefix:</P>
        <CodeBlock code={`{
  "provider": {
    "cybxai": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://127.0.0.1:8085/v1",
        "apiKey": "<your-api-key>"
      },
      "models": {
        "kr/claude-opus-4": { "name": "Claude Opus" },
        "kr/claude-sonnet-4": { "name": "Claude Sonnet" },
        "kr/claude-haiku-4": { "name": "Claude Haiku" }
      }
    }
  },
  "model": "cybxai/kr/claude-sonnet-4"
}`} label="opencode.json" lang="json" />

        <H2 id="load-balancing">
          <Zap className="size-5 text-primary" />
          Load Balancing
        </H2>

        <H3 id="strategy">Strategy</H3>
        <P>
          Kiro-Cybxai uses <strong>weighted round-robin</strong> across enabled
          accounts. Each account has a <InlineCode>weight</InlineCode> field; higher
          weights receive proportionally more traffic. Round-robin can be toggled from{" "}
          <InlineCode>/accounts</InlineCode> (calls{" "}
          <InlineCode>POST /api/routing-settings</InlineCode>). Disabled, expired,
          banned, and exhausted accounts are skipped automatically.
        </P>

        <H3 id="failover">Failover</H3>
        <P>
          On upstream errors the proxy retries the request against the next eligible
          account. Per-status behaviour:
        </P>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">Status</th>
                <th className="text-left py-2 font-medium text-muted-foreground text-xs">Action</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["401", "Try a token refresh and retry once. If refresh fails, mark the account expired."],
                ["429 (rate limit)", "Move to the next account. No failure recorded."],
                ["429 (credit exhausted)", "Mark the account exhausted and move on."],
                ["403 (banned)", "Mark the account banned with the upstream reason."],
                ["5xx", "Record a failure and retry the next account."],
              ].map(([status, action]) => (
                <tr key={status} className="border-b last:border-0">
                  <td className="py-2 pr-4"><InlineCode>{status}</InlineCode></td>
                  <td className="py-2 text-muted-foreground text-xs">{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H3 id="credit-detection">Credit Detection</H3>
        <P>
          Kiro-Cybxai inspects upstream responses to separate temporary rate limits
          from credit exhaustion and bans. Accounts whose body indicates exhaustion or
          quota issues are flagged as <InlineCode>exhausted</InlineCode>; ones that
          fail token refresh become <InlineCode>expired</InlineCode>; ones returning
          ban signals become <InlineCode>banned</InlineCode>. Status is visible on{" "}
          <InlineCode>/accounts</InlineCode>, and bulk actions there can re-check
          credits or remove flagged accounts.
        </P>

        <div className="h-24" />
      </article>

      <DocsToC active={active} />
    </div>
  );
}
