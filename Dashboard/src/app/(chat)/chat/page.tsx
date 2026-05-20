"use client";

import { Suspense, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { useChatStore } from "@/stores/chat";
import { useChatApiKey, ChatAuthGate } from "@/components/chat/ChatAuthGate";

function ChatPageInner() {
  const searchParams = useSearchParams();
  const { activeSessionId, setActiveSession } = useChatStore();
  const initializedRef = useRef(false);
  const { apiKey, loaded, saveKey, clearKey } = useChatApiKey();

  useEffect(() => {
    if (initializedRef.current) return;
    const idFromUrl = searchParams.get("id");
    if (idFromUrl && idFromUrl !== activeSessionId) {
      setActiveSession(idFromUrl);
    }
    initializedRef.current = true;
  }, [searchParams, activeSessionId, setActiveSession]);

  useEffect(() => {
    if (!initializedRef.current) return;
    const currentId = searchParams.get("id");
    if (activeSessionId && activeSessionId !== currentId) {
      window.history.replaceState(null, "", `/chat?id=${activeSessionId}`);
    } else if (!activeSessionId && currentId) {
      window.history.replaceState(null, "", "/chat");
    }
  }, [activeSessionId, searchParams]);

  const handleUnlock = useCallback((key: string) => {
    if (key) {
      saveKey(key);
    } else {
      clearKey();
    }
  }, [saveKey, clearKey]);

  return (
    <ChatAuthGate apiKey={apiKey} loaded={loaded} onUnlock={handleUnlock}>
      <div className="flex h-full flex-1 overflow-hidden">
        <ChatSidebar chatApiKey={apiKey ?? undefined} />
        <ChatArea chatApiKey={apiKey ?? undefined} onLogout={clearKey} />
      </div>
    </ChatAuthGate>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
