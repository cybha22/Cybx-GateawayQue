"use client";

import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { useChatStore } from "@/stores/chat";
import { useModelsStore } from "@/stores/models";
import { BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ModelSelector } from "@/components/chat/ModelSelector";
import {
  ArrowUp,
  Square,
  Sun,
  Moon,
  Paperclip,
  X,
  LogOut,
} from "lucide-react";
import type { ChatAttachment } from "@/stores/chat";
import { useThemeStore } from "@/stores/theme";


let _streamContent: string | null = null;
let _streamMsgId: string | null = null;
const _listeners = new Set<() => void>();

function _notify() {
  for (const l of _listeners) l();
}

function setStreamData(msgId: string | null, content: string | null) {
  _streamMsgId = msgId;
  _streamContent = content;
  _notify();
}

function getStreamContent() { return _streamContent; }
function getStreamMsgId() { return _streamMsgId; }
function subscribeStream(cb: () => void) {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}


export interface ToolStatus {
  tool: string;
  status: "executing" | "done";
  query: string;
}

let _toolStatuses: ToolStatus[] = [];
const _toolListeners = new Set<() => void>();

function _notifyTool() {
  for (const l of _toolListeners) l();
}

function addToolStatus(status: ToolStatus) {
  const idx = _toolStatuses.findIndex((t) => t.tool === status.tool && t.query === status.query);
  if (idx >= 0) {
    _toolStatuses = [..._toolStatuses];
    _toolStatuses[idx] = status;
  } else {
    _toolStatuses = [..._toolStatuses, status];
  }
  _notifyTool();
}

function clearToolStatuses() {
  _toolStatuses = [];
  _notifyTool();
}

export function getToolStatuses() { return _toolStatuses; }
export function subscribeToolStatus(cb: () => void) {
  _toolListeners.add(cb);
  return () => { _toolListeners.delete(cb); };
}


const GREETINGS: Record<string, { morning: string; afternoon: string; evening: string; night: string }> = {
  en: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Good night" },
  id: { morning: "Selamat pagi", afternoon: "Selamat siang", evening: "Selamat sore", night: "Selamat malam" },
  ja: { morning: "おはようございます", afternoon: "こんにちは", evening: "こんばんは", night: "おやすみなさい" },
  ko: { morning: "좋은 아침이에요", afternoon: "안녕하세요", evening: "좋은 저녁이에요", night: "안녕히 주무세요" },
  zh: { morning: "早上好", afternoon: "下午好", evening: "晚上好", night: "晚安" },
  es: { morning: "Buenos días", afternoon: "Buenas tardes", evening: "Buenas tardes", night: "Buenas noches" },
  fr: { morning: "Bonjour", afternoon: "Bon après-midi", evening: "Bonsoir", night: "Bonne nuit" },
  de: { morning: "Guten Morgen", afternoon: "Guten Tag", evening: "Guten Abend", night: "Gute Nacht" },
  pt: { morning: "Bom dia", afternoon: "Boa tarde", evening: "Boa noite", night: "Boa noite" },
  it: { morning: "Buongiorno", afternoon: "Buon pomeriggio", evening: "Buonasera", night: "Buonanotte" },
  ru: { morning: "Доброе утро", afternoon: "Добрый день", evening: "Добрый вечер", night: "Спокойной ночи" },
  ar: { morning: "صباح الخير", afternoon: "مساء الخير", evening: "مساء الخير", night: "تصبح على خير" },
  hi: { morning: "सुप्रभात", afternoon: "नमस्ते", evening: "शुभ संध्या", night: "शुभ रात्रि" },
  tr: { morning: "Günaydın", afternoon: "İyi günler", evening: "İyi akşamlar", night: "İyi geceler" },
  th: { morning: "สวัสดีตอนเช้า", afternoon: "สวัสดีตอนบ่าย", evening: "สวัสดีตอนเย็น", night: "ราตรีสวัสดิ์" },
  vi: { morning: "Chào buổi sáng", afternoon: "Chào buổi chiều", evening: "Chào buổi tối", night: "Chúc ngủ ngon" },
  nl: { morning: "Goedemorgen", afternoon: "Goedemiddag", evening: "Goedenavond", night: "Goedenacht" },
  sv: { morning: "God morgon", afternoon: "God eftermiddag", evening: "God kväll", night: "God natt" },
};

function getGreeting(): string {
  const hour = new Date().getHours();
  const period = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 21 ? "evening" : "night";
  const langs = Object.keys(GREETINGS);
  const lang = langs[Math.floor(Math.random() * langs.length)];
  return GREETINGS[lang][period];
}

export function ChatArea({ chatApiKey, onLogout }: { chatApiKey?: string; onLogout?: () => void }) {
  const {
    sessions,
    activeSessionId,
    activeMessages,
    selectedModel,
    isGenerating,
    createSession,
    addMessage,
    updateMessageLocal,
    saveMessage,
    updateSessionTitle,
    setIsGenerating,
    setSelectedModel,
    fetchSessions,
  } = useChatStore();

  const { models, fetch: fetchModels } = useModelsStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const [input, setInput] = useState("");
  const [greeting] = useState(() => getGreeting());
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const streamingContent = useSyncExternalStore(subscribeStream, getStreamContent, () => null);
  const streamingMsgId = useSyncExternalStore(subscribeStream, getStreamMsgId, () => null);
  const toolStatuses = useSyncExternalStore(subscribeToolStatus, getToolStatuses, () => [] as ToolStatus[]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fullContentRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchModels();
    fetchSessions();
  }, [fetchModels, fetchSessions]);

  useEffect(() => {
    if (models.length > 0) {
      if (!selectedModel || !models.some((m) => m.id === selectedModel)) {
        setSelectedModel(models[0].id);
      }
    }
  }, [selectedModel, models, setSelectedModel]);

  const scrollRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (streamingContent !== null) {
      if (scrollRafRef.current === null) {
        scrollRafRef.current = requestAnimationFrame(() => {
          scrollRafRef.current = null;
          messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
        });
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeMessages, streamingContent]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }
  }, [input]);

  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
  };

  // File attachment helpers
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const addFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const newAttachments: ChatAttachment[] = [];
    for (const file of imageFiles) {
      const url = await readFileAsDataUrl(file);
      newAttachments.push({ type: "image", name: file.name, url });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = ""; // Reset so same file can be re-selected
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  };

  /** Generate a short title from the first exchange, fallback to truncated user text */
  const generateSessionTitle = async (userText: string, assistantText: string, sessionId: string) => {
    const fallbackTitle = userText.length > 50 ? userText.slice(0, 50) + "…" : userText;

    // Always set fallback immediately so title is never stuck on "New Chat"
    updateSessionTitle(sessionId, fallbackTitle).catch(() => { });

    try {
      const apiKey = chatApiKey;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: "system",
              content: "Generate a very short title (3-6 words, no quotes, no punctuation at end) that summarizes this conversation. Reply with ONLY the title, nothing else.",
            },
            { role: "user", content: userText.slice(0, 500) },
            { role: "assistant", content: assistantText.slice(0, 500) },
          ],
          stream: false,
          max_tokens: 30,
        }),
      });

      if (!res.ok) return; // fallback already set

      const data = await res.json();
      const generated = data.choices?.[0]?.message?.content?.trim();

      if (generated && generated.length > 0 && generated.length <= 80) {
        updateSessionTitle(sessionId, generated).catch(() => { });
      }
      // If generated title is bad, fallback is already set
    } catch {
      // Fallback already set above
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (isGenerating) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = await createSession();
    }

    // Capture attachments before clearing
    const currentAttachments = attachments.length > 0 ? [...attachments] : undefined;

    // Add user message (fire-and-forget persist)
    await addMessage(sessionId, { role: "user", content: text || "", attachments: currentAttachments });
    setInput("");
    setAttachments([]);

    // Build API messages from current state + the user message we just added
    const prevMessages = useChatStore.getState().activeMessages;
    const apiMessages = prevMessages.map((m) => {
      // If message has image attachments, use multipart content format
      if (m.attachments && m.attachments.length > 0) {
        const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        if (m.content) {
          parts.push({ type: "text", text: m.content });
        }
        for (const att of m.attachments) {
          if (att.type === "image") {
            parts.push({ type: "image_url", image_url: { url: att.url } });
          }
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    // Add placeholder assistant message (fire-and-forget persist)
    const assistantMsg = await addMessage(sessionId, { role: "assistant", content: "" });

    // Start streaming — use external store for tear-free sync updates
    setStreamData(assistantMsg.id, "");
    setIsGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    // Render loop flag — accessible from try/catch/finally
    const streamState = { done: false };

    try {
      const apiKey = chatApiKey;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `Error ${res.status}`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error?.message || errMsg;
        } catch {
          errMsg = errText || errMsg;
        }
        setStreamData(assistantMsg.id, `⚠️ ${errMsg}`);
        updateMessageLocal(assistantMsg.id, `⚠️ ${errMsg}`);
        saveMessage(sessionId!, assistantMsg.id, `⚠️ ${errMsg}`).catch(() => { });
        setStreamData(null, null);
        setIsGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        updateMessageLocal(assistantMsg.id, "⚠️ No response body");
        saveMessage(sessionId!, assistantMsg.id, "⚠️ No response body").catch(() => { });
        setStreamData(null, null);
        setIsGenerating(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      fullContentRef.current = "";

      // Separate rAF render loop — completely decoupled from read loop
      // Reads from fullContentRef and flushes to React at display refresh rate
      // This ensures reading chunks never blocks on React rendering
      const renderLoop = () => {
        if (!streamState.done && fullContentRef.current !== _streamContent) {
          setStreamData(assistantMsg.id, fullContentRef.current);
        }
        if (!streamState.done) {
          requestAnimationFrame(renderLoop);
        }
      };
      requestAnimationFrame(renderLoop);

      // Read loop — runs as fast as chunks arrive, never blocked by rendering
      clearToolStatuses();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let chunkDelta = "";
        let currentEvent = "";
        for (const line of lines) {
          // Track SSE event type
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          // Handle tool status events
          if (currentEvent === "tool_status") {
            try {
              const status = JSON.parse(data);
              addToolStatus(status);
            } catch {}
            currentEvent = "";
            continue;
          }
          currentEvent = "";

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) chunkDelta += delta;
          } catch {
            // skip malformed chunks
          }
        }

        if (chunkDelta) {
          fullContent += chunkDelta;
          fullContentRef.current = fullContent;
        }
      }

      // Stop render loop, final flush, commit to store
      streamState.done = true;
      updateMessageLocal(assistantMsg.id, fullContent);
      setStreamData(null, null);
      saveMessage(sessionId!, assistantMsg.id, fullContent).catch(() => { });

      // Generate title for new sessions
      const currentSession = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      if (currentSession?.title === "New Chat" && text.length > 0) {
        generateSessionTitle(text, fullContent, sessionId!);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — save what we have
        const saved = fullContentRef.current;
        if (saved) {
          updateMessageLocal(assistantMsg.id, saved);
          saveMessage(sessionId!, assistantMsg.id, saved).catch(() => { });
        }
      } else {
        const saved = fullContentRef.current;
        const errContent = (saved || "") + "\n\n⚠️ Connection error";
        updateMessageLocal(assistantMsg.id, errContent);
        saveMessage(sessionId!, assistantMsg.id, errContent).catch(() => { });
      }
    } finally {
      streamState.done = true;
      setStreamData(null, null);
      abortRef.current = null;
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const hasMessages = activeMessages.length > 0;

  /* ---------------------------------------------------------------- */
  /*  Input box with footer (shared between empty & chat states)       */
  /* ---------------------------------------------------------------- */
  const inputBox = (
    <div className="chat-input-box">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Attachment preview strip */}
      {attachments.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto">
          {attachments.map((att, i) => (
            <div key={i} className="relative group shrink-0">
              <img
                src={att.url}
                alt={att.name}
                className="size-16 rounded-lg object-cover border border-border"
              />
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="size-3" />
              </button>
              <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/50 text-white rounded-b-lg truncate px-1">
                {att.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Textarea area */}
      <div className="flex items-end gap-2 px-4 pt-4 pb-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Takon opo wae tak jawab...."
          rows={hasMessages ? 1 : 2}
          className="chat-input flex-1 py-1"
          disabled={isGenerating}
        />
      </div>
      {/* Footer: attachment (left) | model picker + send (right) */}
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Attach image"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleFileSelect}
          >
            <Paperclip className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <ModelSelector models={models} onOpen={fetchModels} />
          {isGenerating ? (
            <Button
              variant="default"
              size="icon-sm"
              onClick={stopGeneration}
              title="Stop generating"
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon-sm"
              onClick={sendMessage}
              disabled={!input.trim() && attachments.length === 0}
              title="Send message"
            >
              <ArrowUp className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-sm font-medium truncate">
          {activeSession?.title && activeSession.title !== "New Chat"
            ? activeSession.title
            : "CybxAI Chat"}
        </h2>
        <div className="flex items-center gap-2">
          {activeSession && hasMessages && (
            <span className="text-xs text-muted-foreground">
              {activeMessages.length} message{activeMessages.length !== 1 ? "s" : ""}
            </span>
          )}
          <ThemeToggle />
          {chatApiKey && onLogout && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onLogout}
              title="Lock Chat"
            >
              <LogOut className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Empty state: greeting + centered input */}
      {!hasMessages && (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          {/* Greeting */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-light text-foreground/80 mb-12 animate-fade-in" suppressHydrationWarning>
            {greeting}
          </h1>

          {/* Centered input */}
          <div className="w-full max-w-3xl animate-fade-in-up">
            {inputBox}
          </div>
        </div>
      )}

      {/* Chat mode: messages + input at bottom */}
      {hasMessages && (
        <>
          <div className="chat-messages-scroll flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
              {activeMessages.map((msg) => {
                // If this is the message being streamed, override content with local state
                const isThisStreaming = streamingMsgId === msg.id && streamingContent !== null;
                const displayMsg = isThisStreaming
                  ? { ...msg, content: streamingContent }
                  : msg;
                return (
                  <ChatMessage
                    key={msg.id}
                    message={displayMsg}
                    isStreaming={isThisStreaming}
                    toolStatuses={isThisStreaming ? toolStatuses : undefined}
                  />
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input pinned to bottom */}
          <div className="bg-background animate-slide-up">
            <div className="max-w-4xl mx-auto px-4 py-3">
              {inputBox}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Theme toggle                                                       */
/* ------------------------------------------------------------------ */

function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="size-3.5" />
      ) : (
        <Moon className="size-3.5" />
      )}
    </Button>
  );
}
