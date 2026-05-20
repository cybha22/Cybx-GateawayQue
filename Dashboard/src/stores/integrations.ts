import { create } from "zustand";
import { apiFetch } from "@/lib/api";

export interface ModelSlot {
  key: string;
  label: string;
  default: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  configType: "env" | "custom" | "guide";
  configPath: string;
  installed: boolean;
  bound: boolean;
  envVars?: Record<string, string>;
  guideSteps?: string[];
  modelSlots?: ModelSlot[];
  showModelCheckboxes?: boolean;
}

export interface GeneratedConfig {
  toolId: string;
  config: unknown;
  configPath: string;
  error?: string;
}

export interface IntegrationsState {
  integrations: Integration[];
  loading: boolean;
  error: string | null;
  bindingId: string | null;
  fetch: () => Promise<void>;
  bind: (toolId: string, modelMap?: Record<string, string>) => Promise<boolean>;
  unbind: (toolId: string) => Promise<boolean>;
  generateConfig: (toolId: string, modelMap?: Record<string, string>) => Promise<GeneratedConfig | null>;
}

export const useIntegrationsStore = create<IntegrationsState>()(
  (set, get) => ({
    integrations: [],
    loading: false,
    error: null,
    bindingId: null,

    fetch: async () => {
      set({ loading: true, error: null });
      try {
        const integrations = await apiFetch<Integration[]>("/api/integrations");
        set({ integrations, loading: false });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : "Failed to fetch integrations",
          loading: false,
        });
      }
    },

    bind: async (toolId, modelMap) => {
      set({ bindingId: toolId });
      try {
        const res = await apiFetch<{ success: boolean; error?: string }>(
          `/api/integrations/${toolId}/bind`,
          { method: "POST", body: JSON.stringify(modelMap ? { modelMap } : {}) },
        );
        if (!res.success) {
          set({ bindingId: null });
          return false;
        }
        await get().fetch();
        set({ bindingId: null });
        return true;
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : "Failed to bind integration",
          bindingId: null,
        });
        return false;
      }
    },

    generateConfig: async (toolId, modelMap) => {
      try {
        const params = new URLSearchParams();
        if (modelMap) {
          for (const [k, v] of Object.entries(modelMap)) {
            if (v) params.set(k, v);
          }
        }
        const qs = params.toString() ? `?${params.toString()}` : "";
        return await apiFetch<GeneratedConfig>(`/api/integrations/${toolId}/generate${qs}`);
      } catch {
        return null;
      }
    },

    unbind: async (toolId) => {
      set({ bindingId: toolId });
      try {
        const res = await apiFetch<{ success: boolean; error?: string }>(
          `/api/integrations/${toolId}/unbind`,
          { method: "POST" },
        );
        if (!res.success) {
          set({ bindingId: null });
          return false;
        }
        await get().fetch();
        set({ bindingId: null });
        return true;
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : "Failed to unbind integration",
          bindingId: null,
        });
        return false;
      }
    },
  }),
);
