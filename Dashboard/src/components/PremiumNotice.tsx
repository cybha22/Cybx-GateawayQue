"use client";

import { Crown, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PremiumNoticeProps {
  title?: string;
  description?: string;
  className?: string;
}

export function PremiumNotice({
  title = "Premium Source Available",
  description = "This open source version only supports Kiro and does not include auto-registration. Auto-registration, multi-provider batching (Codebuddy, Cline, Qoder, Codex), and the full source code are sold separately.",
  className = "",
}: PremiumNoticeProps) {
  return (
    <Card className={`relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/[0.06] via-card to-card ${className}`}>
      <div className="absolute inset-y-0 left-0 w-0.5 bg-primary/60" />
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Crown className="size-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          <a
            href="https://t.me/Cyb192"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-primary/40 text-primary hover:text-primary hover:bg-primary/10 dark:bg-transparent dark:hover:bg-primary/10"
            )}
          >
            <Send className="size-3.5" />
            Contact Telegram @Cyb192
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
