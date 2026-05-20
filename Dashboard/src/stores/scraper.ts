import { create } from "zustand";
import { apiFetch } from "@/lib/api";

export interface ProxySource {
  id: string;
  name: string;
  type: "http" | "socks4" | "socks5";
  url: string;
  format?: "text" | "geonode";
}

export interface ScrapeOptions {
  geonodeCountry?: string;
}

export interface ScrapedProxy {
  url: string;
  type: string;
  source: string;
  alive: boolean;
  pingMs: number | null;
  testedAt: number;
}

export interface ScrapeJob {
  id: string;
  status: "idle" | "fetching" | "testing" | "done" | "error";
  sources: string[];
  totalFetched: number;
  totalTesting: number;
  totalTested: number;
  totalAlive: number;
  totalDead: number;
  results: ScrapedProxy[];
  startedAt: number | null;
  error?: string;
  concurrency: number;
}

export interface ScraperState {
  sources: ProxySource[];
  job: ScrapeJob | null;
  loading: boolean;
  error: string | null;
  fetchSources: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  startScrape: (sourceIds?: string[], concurrency?: number, options?: ScrapeOptions) => Promise<boolean>;
  cancelScrape: () => Promise<void>;
  integrate: (proxyUrls?: string[]) => Promise<{ added: number; duplicates: number } | null>;
}

export const useScraperStore = create<ScraperState>()((set) => ({
  sources: [],
  job: null,
  loading: false,
  error: null,

  fetchSources: async () => {
    try {
      const sources = await apiFetch<ProxySource[]>("/api/scraper/sources");
      set({ sources });
    } catch {}
  },

  fetchStatus: async () => {
    try {
      const job = await apiFetch<ScrapeJob>("/api/scraper/status");
      set({ job });
    } catch {}
  },

  startScrape: async (sourceIds, concurrency, options) => {
    set({ loading: true, error: null });
    try {
      await apiFetch("/api/scraper/start", {
        method: "POST",
        body: JSON.stringify({ sourceIds, concurrency, options }),
      });
      set({ loading: false });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to start scrape", loading: false });
      return false;
    }
  },

  cancelScrape: async () => {
    try {
      await apiFetch("/api/scraper/cancel", { method: "POST" });
    } catch {}
  },

  integrate: async (proxyUrls) => {
    try {
      return await apiFetch<{ added: number; duplicates: number }>("/api/scraper/integrate", {
        method: "POST",
        body: JSON.stringify({ proxyUrls }),
      });
    } catch {
      return null;
    }
  },
}));
