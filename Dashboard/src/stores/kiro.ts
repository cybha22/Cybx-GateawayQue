"use client";

import { create } from "zustand";
import { apiFetch } from "@/lib/api";

export interface KiroCredit {
  totalCredits: number;
  remainingCredits: number;
  usedCredits: number;
  packageName: string;
  expiresAt?: string;
  nextResetDate?: string;
  usagePercent?: number;
}

export interface KiroConnection {
  id: string;
  label: string;
  email?: string;
  status: string;
  uid?: string;
  authMethod?: string;
  region?: string;
  enabled?: boolean;
  credit?: KiroCredit;
  subscription?: {
    type?: string;
    title?: string;
    daysRemaining?: number;
  };
}

export interface BuilderIdSession {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  status: "idle" | "starting" | "waiting" | "polling" | "slow_down" | "completed" | "expired" | "failed";
  startedAt: number;
  error?: string;
}

export interface IamSsoSession {
  sessionId: string;
  authorizeUrl: string;
  expiresIn: number;
  status: "idle" | "starting" | "waiting" | "completing" | "completed" | "failed";
  startedAt: number;
  error?: string;
}

interface KiroState {
  connections: KiroConnection[];
  loading: boolean;
  error: string | null;
  builderId: BuilderIdSession | null;
  iamSso: IamSsoSession | null;

  fetchConnections: () => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  refreshConnection: (id: string) => Promise<{ ok: boolean; error?: string }>;
  addByRefreshToken: (refreshToken: string, label?: string) => Promise<{ ok: boolean; error?: string; packageName?: string }>;
  addByWebToken: (bearerToken: string, region: string) => Promise<{ ok: boolean; error?: string; imported?: number }>;
  addByCredentials: (payload: {
    accessToken?: string;
    refreshToken: string;
    clientId?: string;
    clientSecret?: string;
    authMethod?: "idc" | "social";
    provider?: string;
    region?: string;
    label?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  startBuilderId: (region?: string) => Promise<void>;
  pollBuilderId: () => Promise<void>;
  cancelBuilderId: () => void;
  startIamSso: (startUrl: string, region?: string) => Promise<void>;
  completeIamSso: (callbackUrl: string) => Promise<{ ok: boolean; error?: string }>;
  cancelIamSso: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useKiroStore = create<KiroState>()((set, get) => ({
  connections: [],
  loading: false,
  error: null,
  builderId: null,
  iamSso: null,

  fetchConnections: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiFetch<{ data: KiroConnection[]; pagination: unknown }>(
        "/api/connections?provider=kiro&limit=100",
      );
      set({ connections: res.data ?? [], loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch", loading: false });
    }
  },

  removeConnection: async (id) => {
    await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
    await get().fetchConnections();
  },

  refreshConnection: async (id) => {
    try {
      await apiFetch("/api/kiro/check-credit", {
        method: "POST",
        body: JSON.stringify({ connectionId: id }),
      });
      await get().fetchConnections();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },

  addByRefreshToken: async (refreshToken, label) => {
    try {
      const res = await apiFetch<{ success?: boolean; ok?: boolean; error?: string; account?: { email?: string }; connection?: { packageName?: string } }>(
        "/api/kiro/add-refresh-token",
        {
          method: "POST",
          body: JSON.stringify({ refreshToken, label }),
        },
      );
      if (res.success || res.ok) {
        await get().fetchConnections();
        return { ok: true, packageName: res.connection?.packageName };
      }
      return { ok: false, error: res.error || "Unknown error" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },

  addByWebToken: async (bearerToken, region) => {
    try {
      const res = await apiFetch<{ success?: boolean; accounts?: unknown[]; errors?: string[]; error?: string }>(
        "/api/kiro/auth/web-token",
        {
          method: "POST",
          body: JSON.stringify({ bearerToken, region }),
        },
      );
      if (res.success) {
        await get().fetchConnections();
        return { ok: true, imported: res.accounts?.length ?? 0 };
      }
      return { ok: false, error: res.error || (res.errors?.join("; ") ?? "Failed") };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },

  addByCredentials: async (payload) => {
    try {
      const res = await apiFetch<{ success?: boolean; error?: string }>(
        "/api/kiro/auth/credentials",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      if (res.success) {
        await get().fetchConnections();
        return { ok: true };
      }
      return { ok: false, error: res.error || "Failed" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },

  startBuilderId: async (region = "us-east-1") => {
    set({ builderId: null });
    try {
      const res = await apiFetch<{ sessionId: string; userCode: string; verificationUri: string; interval: number }>(
        "/api/kiro/auth/builderid/start",
        {
          method: "POST",
          body: JSON.stringify({ region }),
        },
      );
      set({
        builderId: {
          sessionId: res.sessionId,
          userCode: res.userCode,
          verificationUri: res.verificationUri,
          interval: res.interval || 5,
          status: "waiting",
          startedAt: Date.now(),
        },
      });
      if (typeof window !== "undefined") {
        window.open(res.verificationUri, "_blank", "noopener");
      }
      void get().pollBuilderId();
    } catch (err) {
      set({
        builderId: {
          sessionId: "",
          userCode: "",
          verificationUri: "",
          interval: 5,
          status: "failed",
          startedAt: Date.now(),
          error: err instanceof Error ? err.message : "Failed to start Builder ID",
        },
      });
    }
  },

  pollBuilderId: async () => {
    const session = get().builderId;
    if (!session || session.sessionId === "") return;
    const deadline = session.startedAt + 10 * 60 * 1000;
    let interval = session.interval || 5;
    set((state) => ({ builderId: state.builderId ? { ...state.builderId, status: "polling" } : state.builderId }));

    while (Date.now() < deadline) {
      const current = get().builderId;
      if (!current || current.sessionId !== session.sessionId) return;
      try {
        const res = await apiFetch<{
          success?: boolean;
          completed?: boolean;
          status?: string;
          interval?: number;
          account?: { id: string; email: string };
          error?: string;
        }>("/api/kiro/auth/builderid/poll", {
          method: "POST",
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
        if (res.completed) {
          set({ builderId: { ...session, status: "completed" } });
          await get().fetchConnections();
          return;
        }
        if (res.status === "slow_down") {
          interval = Math.max(interval + 5, res.interval ?? interval + 5);
          set((state) => ({ builderId: state.builderId ? { ...state.builderId, status: "slow_down", interval } : state.builderId }));
        } else if (res.interval) {
          interval = res.interval;
        }
      } catch (err) {
        set({ builderId: { ...session, status: "failed", error: err instanceof Error ? err.message : "Polling failed" } });
        return;
      }
      await sleep(Math.max(interval, 1) * 1000);
    }
    set({ builderId: { ...session, status: "expired" } });
  },

  cancelBuilderId: () => {
    set({ builderId: null });
  },

  startIamSso: async (startUrl, region = "us-east-1") => {
    set({ iamSso: null });
    try {
      const res = await apiFetch<{ sessionId: string; authorizeUrl: string; expiresIn: number }>(
        "/api/kiro/auth/iam-sso/start",
        {
          method: "POST",
          body: JSON.stringify({ startUrl, region }),
        },
      );
      set({
        iamSso: {
          sessionId: res.sessionId,
          authorizeUrl: res.authorizeUrl,
          expiresIn: res.expiresIn,
          status: "waiting",
          startedAt: Date.now(),
        },
      });
      if (typeof window !== "undefined") {
        window.open(res.authorizeUrl, "_blank", "noopener");
      }
    } catch (err) {
      set({
        iamSso: {
          sessionId: "",
          authorizeUrl: "",
          expiresIn: 0,
          status: "failed",
          startedAt: Date.now(),
          error: err instanceof Error ? err.message : "Failed to start IAM SSO",
        },
      });
    }
  },

  completeIamSso: async (callbackUrl) => {
    const session = get().iamSso;
    if (!session?.sessionId) return { ok: false, error: "No active IAM SSO session" };
    set({ iamSso: { ...session, status: "completing" } });
    try {
      const res = await apiFetch<{ success?: boolean; account?: { id: string; email: string }; error?: string }>(
        "/api/kiro/auth/iam-sso/complete",
        {
          method: "POST",
          body: JSON.stringify({ sessionId: session.sessionId, callbackUrl }),
        },
      );
      if (res.success) {
        set({ iamSso: { ...session, status: "completed" } });
        await get().fetchConnections();
        return { ok: true };
      }
      set({ iamSso: { ...session, status: "failed", error: res.error || "Failed" } });
      return { ok: false, error: res.error || "Failed" };
    } catch (err) {
      set({ iamSso: { ...session, status: "failed", error: err instanceof Error ? err.message : "Failed" } });
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  },

  cancelIamSso: () => {
    set({ iamSso: null });
  },
}));
