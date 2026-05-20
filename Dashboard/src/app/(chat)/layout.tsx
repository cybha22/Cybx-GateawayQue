import type { Metadata } from "next";
import "@/app/chat.css";

export const metadata: Metadata = {
  title: "Chat — CybxAI",
  description: "Chat with AI models via CybxAI",
};

export default function ChatGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="chat-root h-screen flex flex-col overflow-hidden">
      {children}
    </div>
  );
}
