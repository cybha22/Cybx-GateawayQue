import { create } from "zustand";
import { apiFetch } from "@/lib/api";

export interface ApiKey {
  id: string;
  key: string;
  masked: string;
  name?: string;
  createdAt?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface KeysState {
  keys: ApiKey[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  rotate: (key?: string) => Promise<{ ok: boolean; key?: string; error?: string }>;
  remove: () => Promise<{ ok: boolean; error?: string }>;
}

export const useKeysStore = create<KeysState>()((set, get) => ({
  keys: [],
  loading: false,
  saving: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const keys = await apiFetch<ApiKey[]>("/api/keys");
      set({ keys, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to fetch API keys",
        loading: false,
      });
    }
  },

  rotate: async (key) => {
    set({ saving: true, error: null });
    try {
      const res = await apiFetch<{ success?: boolean; key?: string; error?: string }>(
        "/api/keys",
        {
          method: "POST",
          body: JSON.stringify(key ? { key } : {}),
        },
      );
      if (res.success) {
        await get().fetch();
        set({ saving: false });
        return { ok: true, key: res.key };
      }
      set({ saving: false, error: res.error || "Failed" });
      return { ok: false, error: res.error || "Failed" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      set({ saving: false, error: msg });
      return { ok: false, error: msg };
    }
  },

  remove: async () => {
    set({ saving: true, error: null });
    try {
      await apiFetch("/api/keys", { method: "DELETE" });
      await get().fetch();
      set({ saving: false });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      set({ saving: false, error: msg });
      return { ok: false, error: msg };
    }
  },
}));
