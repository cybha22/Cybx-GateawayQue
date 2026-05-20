import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  hydrated: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  hydrate: () => void;
}

const STORAGE_KEY = "cybxai-theme";

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: "dark",
  hydrated: false,

  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    set({ theme: next });
  },

  setTheme: (t) => {
    localStorage.setItem(STORAGE_KEY, t);
    if (t === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    set({ theme: t });
  },

  hydrate: () => {
    if (get().hydrated) return;
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const theme = stored === "light" ? "light" : "dark";
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    set({ theme, hydrated: true });
  },
}));
