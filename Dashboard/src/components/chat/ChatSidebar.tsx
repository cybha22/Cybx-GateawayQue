"use client";

import { useState } from "react";
import { useChatStore } from "@/stores/chat";
import { Button } from "@/components/ui/button";
import {
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  MoreHorizontal,
  LayoutDashboard,
  ArrowLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import Link from "next/link";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ChatSidebar({ chatApiKey }: { chatApiKey?: string } = {}) {
  const {
    sessions,
    activeSessionId,
    deleteSession,
    setActiveSession,
    clearSessions,
  } = useChatStore();
  const [collapsed, setCollapsed] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; sessions: typeof sessions }[] = [];
  const todaySessions = sessions.filter((s) => s.updatedAt >= today.getTime());
  const yesterdaySessions = sessions.filter(
    (s) => s.updatedAt >= yesterday.getTime() && s.updatedAt < today.getTime()
  );
  const weekSessions = sessions.filter(
    (s) => s.updatedAt >= weekAgo.getTime() && s.updatedAt < yesterday.getTime()
  );
  const olderSessions = sessions.filter((s) => s.updatedAt < weekAgo.getTime());

  if (todaySessions.length) groups.push({ label: "Today", sessions: todaySessions });
  if (yesterdaySessions.length) groups.push({ label: "Yesterday", sessions: yesterdaySessions });
  if (weekSessions.length) groups.push({ label: "Previous 7 Days", sessions: weekSessions });
  if (olderSessions.length) groups.push({ label: "Older", sessions: olderSessions });

  return (
    <div
      className={cn(
        "chat-sidebar flex flex-col h-full border-r border-border transition-all duration-200",
        collapsed ? "w-[50px]" : "w-[260px]"
      )}
    >
      {}
      <div className={cn(
        "flex items-center p-2 border-b border-border",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted" title="Back to Dashboard">
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <div className={cn("flex items-center", collapsed ? "" : "gap-1")}>
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setActiveSession(null)}
              title="New Chat"
            >
              <Plus className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <img src="/icon.png" alt="CybxAI" className="size-5" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {}
      {!collapsed ? (
        <div className="px-2 pt-2 pb-1 space-y-0.5 border-b border-border">
          <button
            onClick={() => setActiveSession(null)}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-foreground/70 hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <Plus className="size-4" />
            New Chat
          </button>
          <Link
            href="/"
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-foreground/70 hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <LayoutDashboard className="size-4" />
            Dashboard
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center pt-2 gap-1 border-b border-border pb-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setActiveSession(null);
              setCollapsed(false);
            }}
            title="New Chat"
          >
            <Plus className="size-4" />
          </Button>
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted" title="Dashboard">
            <LayoutDashboard className="size-4" />
          </Link>
        </div>
      )}

      {}
      {!collapsed && (
        <div className="chat-messages-scroll flex-1 overflow-y-auto px-2 py-2 space-y-3">
          {groups.length === 0 && (
            <div className="text-center text-muted-foreground text-xs py-8">
              No conversations yet.
              <br />
              Start a new chat!
            </div>
          )}
          {groups.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "chat-sidebar-item group flex items-center gap-2 px-2 py-1.5 cursor-pointer text-sm",
                      session.id === activeSessionId
                        ? "active text-foreground"
                        : "text-foreground/70"
                    )}
                    onClick={() => setActiveSession(session.id)}
                  >
                    <MessageSquare className="size-3.5 shrink-0 opacity-50" />
                    <span className="flex-1 truncate text-xs">{session.title}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        render={<button className="p-0.5 rounded hover:bg-background/50" />}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {}
      {!collapsed && sessions.length > 0 && (
        <div className="p-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-muted-foreground"
            onClick={() => clearSessions()}
          >
            <Trash2 className="size-3.5 mr-1.5" />
            Clear all chats
          </Button>
        </div>
      )}
    </div>
  );
}
