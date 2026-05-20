import { create } from "zustand";
import { apiFetch } from "@/lib/api";


export interface UsageRecord {
  id: string;
  model: string;
  accountId: string;
  tokens: number;
  timestamp: string;
  cost?: number;
  [key: string]: unknown;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  byModel: Record<string, number>;
  [key: string]: unknown;
}

export interface ChartBucket {
  label: string;
  requests: number;
  tokens: number;
  [key: string]: unknown;
}

export type ChartRange = "day" | "week" | "month";

export interface UsageRecordsParams {
  limit?: number;
  model?: string;
  accountId?: string;
  since?: string;
}

export interface UsageState {
  records: UsageRecord[];
  recordsLoading: boolean;
  recordsError: string | null;

  stats: UsageStats | null;
  statsLoading: boolean;
  statsError: string | null;

  chart: ChartBucket[];
  chartRange: ChartRange;
  chartLoading: boolean;
  chartError: string | null;

  weekChart: ChartBucket[];
  weekChartLoading: boolean;

  fetchRecords: (params?: UsageRecordsParams) => Promise<void>;
  fetchStats: (since?: string) => Promise<void>;
  fetchChart: (range?: ChartRange) => Promise<void>;
  fetchWeekChart: () => Promise<void>;
}


function buildQuery(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}


export const useUsageStore = create<UsageState>()((set) => ({
  records: [],
  recordsLoading: false,
  recordsError: null,

  stats: null,
  statsLoading: false,
  statsError: null,

  chart: [],
  chartRange: "day",
  chartLoading: false,
  chartError: null,

  weekChart: [],
  weekChartLoading: false,

  fetchRecords: async (params) => {
    set({ recordsLoading: true, recordsError: null });
    try {
      const qs = buildQuery({
        limit: params?.limit,
        model: params?.model,
        accountId: params?.accountId,
        since: params?.since,
      });
      const records = await apiFetch<UsageRecord[]>(
        `/api/usage/records${qs}`,
      );
      set({ records, recordsLoading: false });
    } catch (err) {
      set({
        recordsError:
          err instanceof Error ? err.message : "Failed to fetch usage records",
        recordsLoading: false,
      });
    }
  },

  fetchStats: async (since) => {
    set({ statsLoading: true, statsError: null });
    try {
      const qs = since ? `?since=${encodeURIComponent(since)}` : "";
      const stats = await apiFetch<UsageStats>(`/api/usage/stats${qs}`);
      set({ stats, statsLoading: false });
    } catch (err) {
      set({
        statsError:
          err instanceof Error ? err.message : "Failed to fetch usage stats",
        statsLoading: false,
      });
    }
  },

  fetchChart: async (range) => {
    const chartRange = range ?? "day";
    set({ chartLoading: true, chartError: null, chartRange });
    try {
      const res = await apiFetch<{ range: string; buckets: ChartBucket[] } | ChartBucket[]>(
        `/api/usage/chart?range=${chartRange}`,
      );
      const chart = Array.isArray(res) ? res : res.buckets ?? [];
      set({ chart, chartLoading: false });
    } catch (err) {
      set({
        chartError:
          err instanceof Error ? err.message : "Failed to fetch chart data",
        chartLoading: false,
      });
    }
  },

  fetchWeekChart: async () => {
    set({ weekChartLoading: true });
    try {
      const res = await apiFetch<{ range: string; buckets: ChartBucket[] } | ChartBucket[]>(
        `/api/usage/chart?range=week`,
      );
      const weekChart = Array.isArray(res) ? res : res.buckets ?? [];
      set({ weekChart, weekChartLoading: false });
    } catch {
      set({ weekChartLoading: false });
    }
  },
}));
