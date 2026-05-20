import { create } from "zustand";
import { apiFetch } from "@/lib/api";


export interface AuthStatus {
  authenticated: boolean;
  authEnabled: boolean;
  isLocal: boolean;
  enabled: boolean;
  hasPassword: boolean;
  sessionTimeoutHours: number;
  activeSessions: number;
}

export interface SessionInfo {
  id: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
  userAgent: string;
}

export interface AuthStore {
  status: AuthStatus | null;
  loading: boolean;
  loginLoading: boolean;
  error: string | null;
  sessions: SessionInfo[];

  checkAuth: () => Promise<void>;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  removePassword: () => Promise<void>;
  toggleAuth: (enabled: boolean) => Promise<void>;
  setSessionTimeout: (hours: number) => Promise<void>;
  fetchSessions: () => Promise<void>;
  clearSessions: () => Promise<void>;
}


export const useAuthStore = create<AuthStore>((set, get) => ({
  status: null,
  loading: false,
  loginLoading: false,
  error: null,
  sessions: [],

  checkAuth: async () => {
    set({ loading: true });
    try {
      const data = await apiFetch<AuthStatus>("/api/auth/status");
      set({ status: data, loading: false, error: null });
    } catch (err: unknown) {
      set({ loading: false, error: err instanceof Error ? err.message : "Failed to check auth" });
    }
  },

  login: async (password: string) => {
    set({ loginLoading: true, error: null });
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      set({ loginLoading: false });
      await get().checkAuth();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      set({ loginLoading: false, error: msg });
      return false;
    }
  },

  logout: async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    set({ status: null });
    await get().checkAuth();
  },

  setPassword: async (password: string) => {
    await apiFetch("/api/auth/set-password", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    await get().checkAuth();
  },

  removePassword: async () => {
    await apiFetch("/api/auth/remove-password", { method: "POST" });
    await get().checkAuth();
  },

  toggleAuth: async (enabled: boolean) => {
    await apiFetch("/api/auth/toggle", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
    await get().checkAuth();
  },

  setSessionTimeout: async (hours: number) => {
    await apiFetch("/api/auth/session-timeout", {
      method: "POST",
      body: JSON.stringify({ hours }),
    });
    await get().checkAuth();
  },

  fetchSessions: async () => {
    try {
      const data = await apiFetch<{ sessions: SessionInfo[] }>("/api/auth/sessions");
      set({ sessions: data.sessions });
    } catch {}
  },

  clearSessions: async () => {
    await apiFetch("/api/auth/sessions/clear", { method: "POST" });
    set({ sessions: [] });
    await get().checkAuth();
  },
}));
