"use client";

import { useState, useEffect } from "react";
import { Play, Square, Loader2, Copy, Check } from "lucide-react";
import { useApiExecutor, type ExecuteConfig, type ResponseType } from "./useApiExecutor";

interface EndpointDef {
  id: string;
  method: "GET" | "POST";
  path: string;
  auth: "bearer" | "x-api-key" | "none";
  responseType: ResponseType;
  defaultBody?: Record<string, unknown>;
  editableFields?: Array<{
    key: string;
    label: string;
    type: "text" | "textarea" | "select";
    options?: string[];
    nested?: string[];
  }>;
  extraHeaders?: Record<string, string>;
}

export function ApiPlayground({ endpoint }: { endpoint: EndpointDef }) {
  const { execute, cancel, loading, result, streamContent } = useApiExecutor();
  const [apiKey, setApiKey] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (endpoint.auth === "none") return;
    import("@/lib/api").then(({ apiFetch }) => {
      apiFetch<Array<{ key: string }>>("/api/keys")
        .then((keys) => { if (keys?.[0]?.key) setApiKey(keys[0].key); })
        .catch(() => {});
    });
  }, [endpoint.auth]);

  useEffect(() => {
    if (endpoint.defaultBody && endpoint.editableFields) {
      const initial: Record<string, string> = {};
      for (const field of endpoint.editableFields) {
        let val: unknown = endpoint.defaultBody;
        if (field.nested) {
          for (const k of field.nested) val = (val as Record<string, unknown>)?.[k];
        } else {
          val = (endpoint.defaultBody as Record<string, unknown>)[field.key];
        }
        initial[field.key] = typeof val === "string" ? val : JSON.stringify(val);
      }
      setParams(initial);
    }
  }, [endpoint.defaultBody, endpoint.editableFields]);

  function buildBody(): unknown {
    if (!endpoint.defaultBody) return undefined;
    const body = JSON.parse(JSON.stringify(endpoint.defaultBody));
    if (endpoint.editableFields) {
      for (const field of endpoint.editableFields) {
        if (params[field.key] === undefined) continue;
        if (field.nested) {
          let target = body;
          for (let i = 0; i < field.nested.length - 1; i++) {
            target = target[field.nested[i]];
          }
          const lastKey = field.nested[field.nested.length - 1];
          target[lastKey] = params[field.key];
        } else {
          body[field.key] = params[field.key];
        }
      }
    }
    return body;
  }

  function handleRun() {
    const config: ExecuteConfig = {
      method: endpoint.method,
      path: endpoint.path,
      auth: endpoint.auth,
      responseType: endpoint.responseType,
      body: endpoint.method === "POST" ? buildBody() : undefined,
      headers: endpoint.extraHeaders,
    };
    execute(config, apiKey);
    setExpanded(true);
  }

  function handleCopy() {
    const content = result?.content || streamContent;
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const displayContent = result?.content || streamContent;
  const isStreaming = loading && (endpoint.responseType === "sse-openai" || endpoint.responseType === "sse-anthropic");

  return (
    <div className="my-3 border border-border/50 rounded-lg overflow-hidden bg-card/30">
      {}
      {endpoint.editableFields && endpoint.editableFields.length > 0 && (
        <div className="px-3 py-2 border-b border-border/30 flex flex-wrap gap-2 items-end">
          {endpoint.editableFields.map((field) => (
            <div key={field.key} className="flex flex-col gap-0.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{field.label}</label>
              {field.type === "textarea" ? (
                <textarea
                  className="bg-background border border-border rounded px-2 py-1 text-xs font-mono min-w-[200px] h-[60px] resize-y"
                  value={params[field.key] || ""}
                  onChange={(e) => setParams((p) => ({ ...p, [field.key]: e.target.value }))}
                />
              ) : field.type === "select" && field.options ? (
                <select
                  className="bg-background border border-border rounded px-2 py-1 text-xs font-mono"
                  value={params[field.key] || ""}
                  onChange={(e) => setParams((p) => ({ ...p, [field.key]: e.target.value }))}
                >
                  {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  className="bg-background border border-border rounded px-2 py-1 text-xs font-mono min-w-[160px]"
                  value={params[field.key] || ""}
                  onChange={(e) => setParams((p) => ({ ...p, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-border/30">
        {!loading ? (
          <button
            onClick={handleRun}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Play className="size-3" />
            Run
          </button>
        ) : (
          <button
            onClick={cancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors"
          >
            <Square className="size-3" />
            Cancel
          </button>
        )}

        {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}

        {result && !loading && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground ml-auto">
            <span className={result.status >= 200 && result.status < 400 ? "text-green-500" : "text-red-500"}>
              {result.status || "ERR"}
            </span>
            <span>{result.latencyMs}ms</span>
            {result.tokens && <span>{result.tokens.prompt + result.tokens.completion} tokens</span>}
            {result.error && <span className="text-red-500">{result.error}</span>}
          </div>
        )}
      </div>

      {}
      {(expanded && (displayContent || loading || result?.error)) && (
        <div className="relative">
          <div className="absolute top-2 right-2 z-10">
            {displayContent && (
              <button onClick={handleCopy} className="p-1 rounded hover:bg-muted transition-colors">
                {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5 text-muted-foreground" />}
              </button>
            )}
          </div>
          <div className="max-h-[400px] overflow-auto">
            {isStreaming && streamContent ? (
              <pre className="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
                {streamContent}
                <span className="animate-pulse">▌</span>
              </pre>
            ) : result?.error && !displayContent ? (
              <div className="px-3 py-2 text-xs text-red-500">{result.error}</div>
            ) : displayContent ? (
              <pre className="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
                {displayContent}
              </pre>
            ) : loading ? (
              <div className="px-3 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Waiting for response...
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
