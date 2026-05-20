"use client";

import { create } from "zustand";

export interface ChatAttachment {
  type: "image";
  name: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: ChatAttachment[];
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  messageCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  sessions: Omit<ChatSession, "messages">[];
  activeSessionId: string | null;
  activeMessages: ChatMessage[];
  selectedModel: string;
  isGenerating: boolean;
  loading: boolean;

  fetchSessions: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  createSession: () => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  setActiveSession: (id: string | null) => void;
  setSelectedModel: (model: string) => void;
  addMessage: (sessionId: string, message: Omit<ChatMessage, "id" | "createdAt">) => Promise<ChatMessage>;
  updateMessageLocal: (messageId: string, content: string) => void;
  saveMessage: (sessionId: string, messageId: string, content: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  setIsGenerating: (v: boolean) => void;
  clearSessions: () => Promise<void>;
}

const SESSIONS_KEY = "cybxai_chat_sessions";
const SELECTED_MODEL_KEY = "cybxai-chat-model";

type StoredSession = ChatSession;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readSessions(): StoredSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredSession[];
  } catch {
    return [];
  }
}

function writeSessions(sessions: StoredSession[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {}
}

function getSavedModel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SELECTED_MODEL_KEY) || "";
}

function summarize(sessions: StoredSession[]): Omit<ChatSession, "messages">[] {
  return sessions
    .map((s) => ({
      id: s.id,
      title: s.title,
      model: s.model,
      messageCount: s.messages?.length ?? 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export const useChatStore = create<ChatState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeMessages: [],
  selectedModel: getSavedModel(),
  isGenerating: false,
  loading: false,

  fetchSessions: async () => {
    set({ loading: true });
    const stored = readSessions();
    set({ sessions: summarize(stored), loading: false });
  },

  loadSession: async (id: string) => {
    const stored = readSessions();
    const session = stored.find((s) => s.id === id);
    if (!session) return;
    set({ activeSessionId: id, activeMessages: session.messages });
  },

  createSession: async () => {
    const id = generateId();
    const session: StoredSession = {
      id,
      title: "New Chat",
      model: get().selectedModel,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const stored = readSessions();
    stored.unshift(session);
    writeSessions(stored);
    set({
      sessions: summarize(stored),
      activeSessionId: id,
      activeMessages: [],
    });
    return id;
  },

  deleteSession: async (id) => {
    const stored = readSessions().filter((s) => s.id !== id);
    writeSessions(stored);
    const sessions = summarize(stored);
    let activeSessionId = get().activeSessionId;
    let activeMessages = get().activeMessages;
    if (activeSessionId === id) {
      activeSessionId = sessions[0]?.id ?? null;
      activeMessages = [];
    }
    set({ sessions, activeSessionId, activeMessages });
    if (activeSessionId && activeSessionId !== id) {
      await get().loadSession(activeSessionId);
    }
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id });
    if (id) {
      void get().loadSession(id);
    } else {
      set({ activeMessages: [] });
    }
  },

  setSelectedModel: (model) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(SELECTED_MODEL_KEY, model);
    }
    set({ selectedModel: model });
  },

  addMessage: async (sessionId, message) => {
    const msg: ChatMessage = {
      ...message,
      id: generateId(),
      createdAt: Date.now(),
    };
    set((state) => ({
      activeMessages: [...state.activeMessages, msg],
    }));
    const stored = readSessions();
    const idx = stored.findIndex((s) => s.id === sessionId);
    if (idx >= 0) {
      stored[idx].messages = [...(stored[idx].messages ?? []), msg];
      stored[idx].updatedAt = Date.now();
      writeSessions(stored);
      set({ sessions: summarize(stored) });
    }
    return msg;
  },

  updateMessageLocal: (messageId, content) => {
    set((state) => ({
      activeMessages: state.activeMessages.map((m) =>
        m.id === messageId ? { ...m, content } : m
      ),
    }));
  },

  saveMessage: async (sessionId, messageId, content) => {
    const stored = readSessions();
    const idx = stored.findIndex((s) => s.id === sessionId);
    if (idx < 0) return;
    stored[idx].messages = (stored[idx].messages ?? []).map((m) =>
      m.id === messageId ? { ...m, content } : m
    );
    stored[idx].updatedAt = Date.now();
    writeSessions(stored);
    set({ sessions: summarize(stored) });
  },

  updateSessionTitle: async (sessionId, title) => {
    const stored = readSessions();
    const idx = stored.findIndex((s) => s.id === sessionId);
    if (idx < 0) return;
    stored[idx].title = title;
    stored[idx].updatedAt = Date.now();
    writeSessions(stored);
    set({
      sessions: summarize(stored),
    });
  },

  setIsGenerating: (v) => set({ isGenerating: v }),

  clearSessions: async () => {
    writeSessions([]);
    set({ sessions: [], activeSessionId: null, activeMessages: [] });
  },
}));
