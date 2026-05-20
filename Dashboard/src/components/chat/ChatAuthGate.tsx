"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { Shield, Key, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BASE_URL } from "@/lib/api";

const STORAGE_KEY = "cybxai_chat_key";

const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

function useHydrated() {
  return useSyncExternalStore(subscribeNoop, getTrue, getFalse);
}

function getStoredKey() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function useChatApiKey() {
  const loaded = useHydrated();
  const [apiKey, setApiKey] = useState<string | null>(getStoredKey);

  const saveKey = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
  }, []);

  const clearKey = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
  }, []);

  return { apiKey, loaded, saveKey, clearKey };
}

export function ChatAuthGate({
  children,
  apiKey,
  loaded,
  onUnlock,
}: {
  children: React.ReactNode;
  apiKey: string | null;
  loaded: boolean;
  onUnlock: (key: string) => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!loaded || !apiKey || verified) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/v1/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!cancelled) {
          if (res.ok) {
            setVerified(true);
          } else {
            localStorage.removeItem(STORAGE_KEY);
            onUnlock("");
          }
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          onUnlock("");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [loaded, apiKey, verified, onUnlock]);

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (apiKey && verified) {
    return <>{children}</>;
  }

  if (apiKey && !verified) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Validating API key...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = input.trim();

    if (!key) {
      setError("Please enter an API key");
      return;
    }

    if (!key.startsWith("cy-")) {
      setError("Invalid key format. CybxAI keys start with cy-");
      return;
    }

    setError(null);
    setValidating(true);

    try {
      const res = await fetch(`${BASE_URL}/v1/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        setVerified(true);
        onUnlock(key);
      } else {
        setError(
          res.status === 401
            ? "Invalid API key"
            : `Validation failed (${res.status})`
        );
      }
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "network error";
      setError(`Could not connect to server (${detail})`);
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6">
          <div className="flex items-center justify-center size-16 rounded-2xl bg-muted/50 border border-border">
            <Shield className="size-8 text-muted-foreground" />
          </div>

          <div className="text-center space-y-1.5">
            <h1 className="text-xl font-semibold text-foreground">Enter API Key</h1>
            <p className="text-sm text-muted-foreground">
              Enter your CybxAI API key to access the chat
            </p>
          </div>

          <div className="w-full space-y-3">
            <div className="relative">
              <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                type="password"
                placeholder="cy-..."
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (error) setError(null);
                }}
                className="pl-8 h-9"
                autoFocus
                disabled={validating}
              />
            </div>

            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={validating || !input.trim()}
            >
              {validating ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Validating...
                </>
              ) : (
                "Unlock"
              )}
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground/60 text-center">
            Get your API key from the Dashboard → API Key page
          </p>
        </form>
      </div>
    </div>
  );
}
