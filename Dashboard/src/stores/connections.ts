import { create } from "zustand";
import { apiFetch } from "@/lib/api";


export interface Connection {
  id: string;
  email: string;
  label?: string;
  status: "active" | "disabled" | "expired";
  enabled?: boolean;
  tokenValid?: boolean;
  lastChecked?: string;
  credit?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BatchConnectRequest {
  accounts: { email: string; password: string; label?: string }[];
  concurrency?: number;
  headless?: boolean;
  providers?: string[];
}

export interface BatchTaskLog {
  time: string;
  level: "info" | "error" | "success";
  message: string;
}

export interface BatchTask {
  taskId: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  results?: unknown[];
  logs?: BatchTaskLog[];
  [key: string]: unknown;
}

export interface BulkRefreshTokensResult {
  provider: string;
  checked: number;
  valid: number;
  refreshed: number;
  expired: number;
  suspended: number;
  failed: number;
  results: Array<{
    id: string;
    label: string;
    provider: string;
    valid: boolean;
    refreshed?: boolean;
    expired?: boolean;
    suspended?: boolean;
    reason?: string;
    credit?: unknown;
  }>;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FetchParams {
  page?: number;
  limit?: number;
  search?: string;
  provider?: string;
  status?: string;
  pro?: string;
}

export interface ConnectionsState {
  connections: Connection[];
  pagination: PaginationInfo;
  loading: boolean;
  error: string | null;

  fetchParams: FetchParams;

  batchTaskId: string | null;
  batchTask: BatchTask | null;
  batchLoading: boolean;
  batchError: string | null;

  fetch: (params?: FetchParams) => Promise<void>;
  setFetchParams: (params: FetchParams) => void;
  remove: (id: string) => Promise<void>;
  removeByProvider: (provider: string) => Promise<number>;
  enable: (id: string) => Promise<void>;
  disable: (id: string) => Promise<void>;
  enableByProvider: (provider: string) => Promise<number>;
  disableByProvider: (provider: string) => Promise<number>;
  checkToken: (id: string) => Promise<void>;
  bulkRefreshTokens: (provider: string) => Promise<BulkRefreshTokensResult>;
  checkAllCredits: () => Promise<void>;
  removeExhausted: () => Promise<number>;
  removeExpired: () => Promise<number>;
  removeBanned: () => Promise<number>;
  exportData: (provider?: string) => Promise<unknown>;
  importData: (data: unknown) => Promise<{ imported: number; skipped: number } | null>;
  batchConnect: (req: BatchConnectRequest) => Promise<string>;
  cancelBatch: (taskId: string) => Promise<void>;
  fetchBatchStatus: (taskId: string) => Promise<void>;
}


const BATCH_TASK_STORAGE_KEY = "cybxai_batch_task_id";

function getPersistedBatchTaskId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BATCH_TASK_STORAGE_KEY);
}

function persistBatchTaskId(taskId: string | null) {
  if (typeof window === "undefined") return;
  if (taskId) localStorage.setItem(BATCH_TASK_STORAGE_KEY, taskId);
  else localStorage.removeItem(BATCH_TASK_STORAGE_KEY);
}

export const useConnectionsStore = create<ConnectionsState>()((set, get) => ({
  connections: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  loading: false,
  error: null,

  fetchParams: { page: 1, limit: 20 },

  batchTaskId: getPersistedBatchTaskId(),
  batchTask: null,
  batchLoading: false,
  batchError: null,

  setFetchParams: (params) => {
    const merged = { ...get().fetchParams, ...params };
    set({ fetchParams: merged });
  },

  fetch: async (params) => {
    const merged = params ? { ...get().fetchParams, ...params } : get().fetchParams;
    if (params) set({ fetchParams: merged });

    set({ loading: true, error: null });
    try {
      const qs = new URLSearchParams();
      if (merged.page) qs.set("page", String(merged.page));
      if (merged.limit) qs.set("limit", String(merged.limit));
      if (merged.search) qs.set("search", merged.search);
      if (merged.provider) qs.set("provider", merged.provider);
      if (merged.status) qs.set("status", merged.status);
      if (merged.pro) qs.set("pro", merged.pro);

      const result = await apiFetch<{ data: Connection[]; pagination: PaginationInfo }>(
        `/api/connections?${qs.toString()}`,
      );
      const connections = Array.isArray(result?.data) ? result.data : [];
      const pagination = result?.pagination ?? {
        page: merged.page ?? 1,
        limit: merged.limit ?? 20,
        total: connections.length,
        totalPages: connections.length > 0 ? 1 : 0,
      };
      set({ connections, pagination, loading: false });
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to fetch connections",
        loading: false,
      });
    }
  },

  remove: async (id) => {
    try {
      await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
      // Re-fetch to update pagination counts; go back a page if current page is now empty
      const { pagination, connections, fetchParams } = get();
      if (connections.length <= 1 && pagination.page > 1) {
        await get().fetch({ ...fetchParams, page: pagination.page - 1 });
      } else {
        await get().fetch();
      }
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to remove connection",
      });
    }
  },

  removeByProvider: async (provider) => {
    try {
      const { removed } = await apiFetch<{ removed: number }>(
        `/api/connections/provider/${encodeURIComponent(provider)}`,
        { method: "DELETE" },
      );
      if (removed > 0) {
        await get().fetch({ provider: undefined, page: 1 });
      }
      return removed;
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to remove provider accounts",
      });
      return 0;
    }
  },

  enable: async (id) => {
    try {
      await apiFetch(`/api/connections/${id}/enable`, { method: "POST" });
      set((s) => ({
        connections: s.connections.map((c) =>
          c.id === id ? { ...c, status: "active" as const } : c,
        ),
      }));
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to enable connection",
      });
    }
  },

  disable: async (id) => {
    try {
      await apiFetch(`/api/connections/${id}/disable`, { method: "POST" });
      set((s) => ({
        connections: s.connections.map((c) =>
          c.id === id ? { ...c, status: "disabled" as const } : c,
        ),
      }));
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to disable connection",
      });
    }
  },

  enableByProvider: async (provider) => {
    try {
      const { enabled } = await apiFetch<{ enabled: number }>(
        `/api/connections/provider/${encodeURIComponent(provider)}/enable`,
        { method: "POST" },
      );
      if (enabled > 0) await get().fetch();
      return enabled;
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to enable provider accounts",
      });
      return 0;
    }
  },

  disableByProvider: async (provider) => {
    try {
      const { disabled } = await apiFetch<{ disabled: number }>(
        `/api/connections/provider/${encodeURIComponent(provider)}/disable`,
        { method: "POST" },
      );
      if (disabled > 0) await get().fetch();
      return disabled;
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to disable provider accounts",
      });
      return 0;
    }
  },

  checkToken: async (id) => {
    try {
      const result = await apiFetch<{ valid: boolean; creditRefreshed?: boolean; creditError?: string }>(
        `/api/connections/${id}/check`,
        { method: "POST" },
      );
      set((s) => ({
        connections: s.connections.map((c) =>
          c.id === id
            ? { ...c, tokenValid: result.valid, lastChecked: new Date().toISOString() }
            : c,
        ),
      }));
      if (result.valid) {
        await get().fetch();
      }
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to check token",
      });
    }
  },

  bulkRefreshTokens: async (provider) => {
    const result = await apiFetch<BulkRefreshTokensResult>(
      "/api/connections/bulk-refresh-tokens",
      { method: "POST", body: JSON.stringify({ provider }), timeoutMs: 300_000 },
    );
    await get().fetch();
    return result;
  },

  checkAllCredits: async () => {
    try {
      await apiFetch("/api/connections/check-credits", { method: "POST", timeoutMs: 300_000 });
      await get().fetch();
    } catch {}
  },

  removeExhausted: async () => {
    try {
      const { removed } = await apiFetch<{ removed: number }>(
        "/api/connections/remove-exhausted",
        { method: "POST" },
      );
      if (removed > 0) await get().fetch();
      return removed;
    } catch {
      return 0;
    }
  },

  removeExpired: async () => {
    try {
      const { removed } = await apiFetch<{ removed: number }>(
        "/api/connections/remove-expired",
        { method: "POST" },
      );
      if (removed > 0) await get().fetch();
      return removed;
    } catch {
      return 0;
    }
  },

  removeBanned: async () => {
    try {
      const { removed } = await apiFetch<{ removed: number }>(
        "/api/connections/remove-banned",
        { method: "POST" },
      );
      if (removed > 0) await get().fetch();
      return removed;
    } catch {
      return 0;
    }
  },

  exportData: async (provider?: string) => {
    try {
      const url = provider ? `/api/export?provider=${encodeURIComponent(provider)}` : "/api/export";
      return await apiFetch(url);
    } catch {
      return null;
    }
  },

  importData: async (data) => {
    try {
      const result = await apiFetch<{ imported: number; skipped: number }>(
        "/api/import",
        { method: "POST", body: JSON.stringify(data) },
      );
      await get().fetch();
      return result;
    } catch {
      return null;
    }
  },

  batchConnect: async (req) => {
    set({ batchLoading: true, batchError: null });
    try {
      const result = await apiFetch<{ taskId: string }>("/api/batch-connect", {
        method: "POST",
        body: JSON.stringify(req),
      });
      persistBatchTaskId(result.taskId);
      set({ batchLoading: false, batchTaskId: result.taskId });
      return result.taskId;
    } catch (err) {
      set({
        batchError:
          err instanceof Error ? err.message : "Failed to start batch connect",
        batchLoading: false,
      });
      throw err;
    }
  },

  cancelBatch: async (taskId) => {
    // Optimistically mark as cancelled immediately to prevent UI spam
    const current = get().batchTask;
    if (current) {
      set({ batchTask: { ...current, status: "cancelled" } });
    }
    try {
      await apiFetch(`/api/batch-connect/${taskId}/cancel`, { method: "POST" });
    } catch {}
    persistBatchTaskId(null);
    set({ batchTaskId: null, batchTask: null });
    get().fetch();
  },

  fetchBatchStatus: async (taskId) => {
    try {
      const task = await apiFetch<BatchTask>(
        `/api/batch-connect/${taskId}`,
      );
      set({ batchTask: task });

      if (task.status === "completed" || task.status === "done" || task.status === "cancelled" || task.status === "failed") {
        persistBatchTaskId(null);
        get().fetch();
      }
    } catch (err) {
      persistBatchTaskId(null);
      set({
        batchTaskId: null,
        batchTask: null,
        batchError:
          err instanceof Error
            ? err.message
            : "Failed to fetch batch status",
      });
    }
  },
}));
