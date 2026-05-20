"use client";

import { useState, useRef, useCallback } from "react";
import { BASE_URL } from "@/lib/api";

export type ResponseType = "json" | "sse-openai" | "sse-anthropic";

export interface ExecuteConfig {
  method: "GET" | "POST";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  auth: "bearer" | "x-api-key" | "none";
  responseType: ResponseType;
}

export interface ExecuteResult {
  status: number;
  latencyMs: number;
  content: string;
  tokens?: { prompt: number; completion: number };
  error?: string;
}

export function useApiExecutor() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [streamContent, setStreamContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (config: ExecuteConfig, apiKey: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setResult(null);
    setStreamContent("");

    const startTime = Date.now();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...config.headers,
    };

    if (config.auth === "bearer" && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (config.auth === "x-api-key" && apiKey) {
      headers["x-api-key"] = apiKey;
    }

    try {
      const res = await fetch(`${BASE_URL}${config.path}`, {
        method: config.method,
        headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (config.responseType === "json") {
        const text = await res.text();
        let formatted: string;
        try {
          formatted = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          formatted = text;
        }
        setResult({ status: res.status, latencyMs, content: formatted });
      } else if (config.responseType === "sse-openai") {
        await readOpenAIStream(res, controller.signal, latencyMs, res.status);
      } else if (config.responseType === "sse-anthropic") {
        await readAnthropicStream(res, controller.signal, latencyMs, res.status);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setResult((prev) => prev ?? { status: 0, latencyMs: Date.now() - startTime, content: streamContent || "", error: "Cancelled" });
      } else {
        setResult({ status: 0, latencyMs: Date.now() - startTime, content: "", error: err instanceof Error ? err.message : "Request failed" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  async function readOpenAIStream(res: Response, signal: AbortSignal, baseLatency: number, status: number) {
    if (!res.body) {
      setResult({ status, latencyMs: baseLatency, content: "", error: "No response body" });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let tokens = { prompt: 0, completion: 0 };

    try {
      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              setStreamContent(fullContent);
            }
            if (parsed.usage) {
              tokens = { prompt: parsed.usage.prompt_tokens || 0, completion: parsed.usage.completion_tokens || 0 };
            }
          } catch {}
        }
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) throw err;
    }

    setResult({ status, latencyMs: Date.now() - (Date.now() - baseLatency), content: fullContent, tokens: tokens.prompt > 0 ? tokens : undefined });
    setResult({ status, latencyMs: baseLatency, content: fullContent, tokens: tokens.prompt > 0 ? tokens : undefined });
  }

  async function readAnthropicStream(res: Response, signal: AbortSignal, baseLatency: number, status: number) {
    if (!res.body) {
      setResult({ status, latencyMs: baseLatency, content: "", error: "No response body" });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    try {
      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              fullContent += parsed.delta.text;
              setStreamContent(fullContent);
            }
          } catch {}
        }
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) throw err;
    }

    setResult({ status, latencyMs: baseLatency, content: fullContent });
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { execute, cancel, loading, result, streamContent };
}
