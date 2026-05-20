import { create } from "zustand";
import { apiFetch } from "@/lib/api";


export interface Model {
  id: string;
  name: string;
  provider?: string;
  upstreamModel?: string;
  contextWindow?: number | null;
  custom?: boolean;
  accountTier?: "kiro_pro" | null;
  [key: string]: unknown;
}

export interface CustomModelRequest {
  provider: string;
  id: string;
  name: string;
  upstreamModel: string;
  contextWindow?: number | null;
  accountTier?: "kiro_pro";
}

export interface ModelsState {
  models: Model[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  addCustomModel: (model: CustomModelRequest) => Promise<Model>;
  removeCustomModel: (id: string) => Promise<void>;
}


export const useModelsStore = create<ModelsState>()((set) => ({
  models: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const models = await apiFetch<Model[]>("/api/models");
      set({ models, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to fetch models",
        loading: false,
      });
    }
  },

  addCustomModel: async (model) => {
    const created = await apiFetch<Model>("/api/models/custom", {
      method: "POST",
      body: JSON.stringify(model),
    });
    set((state) => ({ models: [...state.models.filter((m) => m.id !== created.id), created] }));
    return created;
  },

  removeCustomModel: async (id) => {
    await apiFetch("/api/models/custom", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    set((state) => ({ models: state.models.filter((m) => m.id !== id) }));
  },
}));
