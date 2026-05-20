import { create } from "zustand";
import { apiFetch } from "@/lib/api";


export interface ProxyEntry {
  id: string;
  url: string;
  status: "active" | "dead" | "checking";
  pingMs: number | null;
  lastChecked: number | null;
  failCount: number;
  addedAt: number;
  label?: string;
}

export interface BatchAddResult {
  added: number;
  duplicates: number;
  invalid: number;
}

export interface ProxyState {
  proxies: ProxyEntry[];
  loading: boolean;
  error: string | null;
  checkingAll: boolean;

  fetch: () => Promise<void>;
  addProxy: (url: string, label?: string) => Promise<boolean>;
  batchAdd: (text: string) => Promise<BatchAddResult | null>;
  remove: (id: string) => Promise<void>;
  removeDead: () => Promise<number>;
  removeAll: () => Promise<number>;
  checkOne: (id: string) => Promise<void>;
  checkAll: () => Promise<void>;
}


export const useProxyStore = create<ProxyState>()((set, get) => ({
  proxies: [],
  loading: false,
  error: null,
  checkingAll: false,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const proxies = await apiFetch<ProxyEntry[]>("/api/proxies");
      set({ proxies, loading: false });
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to fetch proxies",
        loading: false,
      });
    }
  },

  addProxy: async (url, label) => {
    try {
      const entry = await apiFetch<ProxyEntry>("/api/proxies", {
        method: "POST",
        body: JSON.stringify({ url, label }),
      });
      set((s) => ({ proxies: [...s.proxies, entry] }));
      return true;
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to add proxy",
      });
      return false;
    }
  },

  batchAdd: async (text) => {
    try {
      const result = await apiFetch<BatchAddResult>("/api/proxies/batch", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      await get().fetch();
      return result;
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to batch add proxies",
      });
      return null;
    }
  },

  remove: async (id) => {
    try {
      await apiFetch(`/api/proxies/${id}`, { method: "DELETE" });
      set((s) => ({
        proxies: s.proxies.filter((p) => p.id !== id),
      }));
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to remove proxy",
      });
    }
  },

  removeDead: async () => {
    try {
      const { removed } = await apiFetch<{ removed: number }>(
        "/api/proxies/remove-dead",
        { method: "POST" },
      );
      set((s) => ({
        proxies: s.proxies.filter((p) => p.status !== "dead"),
      }));
      return removed;
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to remove dead proxies",
      });
      return 0;
    }
  },

  removeAll: async () => {
    try {
      const { removed } = await apiFetch<{ removed: number }>(
        "/api/proxies/remove-all",
        { method: "POST" },
      );
      set({ proxies: [] });
      return removed;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to remove all proxies",
      });
      return 0;
    }
  },

  checkOne: async (id) => {
    // Optimistic: mark as checking
    set((s) => ({
      proxies: s.proxies.map((p) =>
        p.id === id ? { ...p, status: "checking" as const } : p,
      ),
    }));
    try {
      const { alive, pingMs } = await apiFetch<{
        alive: boolean;
        pingMs: number;
      }>(`/api/proxies/${id}/check`, { method: "POST" });
      set((s) => ({
        proxies: s.proxies.map((p) =>
          p.id === id
            ? {
                ...p,
                status: alive ? ("active" as const) : ("dead" as const),
                pingMs,
                lastChecked: Date.now(),
              }
            : p,
        ),
      }));
    } catch (err) {
      // Revert to dead on error
      set((s) => ({
        proxies: s.proxies.map((p) =>
          p.id === id ? { ...p, status: "dead" as const } : p,
        ),
        error:
          err instanceof Error ? err.message : "Failed to check proxy",
      }));
    }
  },

  checkAll: async () => {
    set({ checkingAll: true });
    // Optimistic: mark all as checking
    set((s) => ({
      proxies: s.proxies.map((p) => ({
        ...p,
        status: "checking" as const,
      })),
    }));
    try {
      const { proxies } = await apiFetch<{
        ok: boolean;
        proxies: ProxyEntry[];
      }>("/api/proxies/check-all", { method: "POST" });
      set({ proxies, checkingAll: false });
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : "Failed to check all proxies",
        checkingAll: false,
      });
      // Refresh to get actual state
      await get().fetch();
    }
  },
}));
