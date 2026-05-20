"use client";

import { toast } from "sonner";
import { Crown, ExternalLink, X } from "lucide-react";

const TELEGRAM_URL = "https://t.me/Cyb192";

export function showPremiumToast() {
  toast.custom(
    (id) => (
      <div className="relative w-[360px] overflow-hidden rounded-sm border border-primary/30 bg-card text-card-foreground shadow-lg">
        <div className="absolute inset-y-0 left-0 w-0.5 bg-primary/60" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-card to-card pointer-events-none" />
        <div className="relative flex gap-3 p-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/15 text-primary">
            <Crown className="size-4" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-semibold text-foreground leading-tight">Premium feature</h3>
            <p className="text-xs text-muted-foreground leading-snug">
              Auto-register and batch connect are sold separately. Contact Telegram{" "}
              <span className="text-primary font-medium">@Cyb192</span> to get the full version.
            </p>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => toast.dismiss(id)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <ExternalLink className="size-3" />
              Contact @Cyb192
            </a>
          </div>
          <button
            type="button"
            onClick={() => toast.dismiss(id)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    ),
  );
}
