import { create } from "zustand";
import { apiFetch } from "@/lib/api";

export interface TunnelState {
  status: "stopped" | "starting" | "running" | "error";
  url: string | null;
  mode: "quick" | "named";
  hostname?: string;
  tunnelName?: string;
  pid: number | null;
  startedAt: number | null;
  error: string | null;
  installed: boolean;
  version: string | null;
  installInstructions?: string;
}

export interface TunnelConfig {
  binaryPath: string | null;
  detectedPaths: string[];
}

export interface TunnelStore {
  state: TunnelState | null;
  config: TunnelConfig | null;
  loading: boolean;
  actionLoading: boolean;

  fetch: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  setConfig: (binaryPath: string | null) => Promise<{ valid: boolean; version?: string; error?: string }>;
  startQuick: (port?: number) => Promise<void>;
  startNamed: (hostname: string, tunnelName?: string, port?: number) => Promise<void>;
  stop: () => Promise<void>;
}

export const useTunnelStore = create<TunnelStore>((set, get) => ({
  state: null,
  config: null,
  loading: false,
  actionLoading: false,

  fetchConfig: async () => {
    try {
      const data = await apiFetch<TunnelConfig>("/api/tunnel/config");
      set({ config: data });
    } catch {}
  },

  setConfig: async (binaryPath: string | null) => {
    const result = await apiFetch<{ valid: boolean; version?: string; error?: string }>("/api/tunnel/config", {
      method: "POST",
      body: JSON.stringify({ binaryPath }),
    });
    if (result.valid) {
      get().fetchConfig();
      get().fetch();
    }
    return result;
  },

  fetch: async () => {
    set({ loading: true });
    try {
      const data = await apiFetch<TunnelState>("/api/tunnel");
      set({ state: data, loading: false });
    } catch (err: unknown) {
      set({ loading: false });
      console.error("Failed to fetch tunnel state:", err);
    }
  },

  startQuick: async (port = 8085) => {
    set({ actionLoading: true });
    try {
      const data = await apiFetch<TunnelState>("/api/tunnel/start", {
        method: "POST",
        body: JSON.stringify({ mode: "quick", port }),
      });
      set({ state: data, actionLoading: false });
    } catch (err: unknown) {
      set({ actionLoading: false });
      get().fetch();
      throw err;
    }
  },

  startNamed: async (hostname: string, tunnelName = "kiro-cybxai", port = 8085) => {
    set({ actionLoading: true });
    try {
      const data = await apiFetch<TunnelState>("/api/tunnel/start", {
        method: "POST",
        body: JSON.stringify({ mode: "named", hostname, tunnelName, port }),
      });
      set({ state: data, actionLoading: false });
    } catch (err: unknown) {
      set({ actionLoading: false });
      get().fetch();
      throw err;
    }
  },

  stop: async () => {
    set({ actionLoading: true });
    try {
      const data = await apiFetch<TunnelState>("/api/tunnel/stop", {
        method: "POST",
      });
      set({ state: data, actionLoading: false });
    } catch (err: unknown) {
      set({ actionLoading: false });
      get().fetch();
      throw err;
    }
  },
}));
