"use client";

import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import {
  getStatus,
  isActive,
  STATUS_BADGE_VARIANT,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  formatDate,
  creditDisplay,
} from "./account-helpers";
import type { AccountRowProps } from "./account-helpers";
import { usePrivacyMode } from "@/lib/privacy";

function loginProviderLabel(provider?: string, authMethod?: string): string {
  const p = (provider ?? "").trim();
  if (p) {
    const lower = p.toLowerCase();
    if (lower === "google") return "Google";
    if (lower === "github") return "GitHub";
    if (lower === "builderid" || lower === "builder_id") return "Builder ID";
    if (lower === "enterprise" || lower === "idc") return "IAM SSO";
    return p.charAt(0).toUpperCase() + p.slice(1);
  }
  const m = (authMethod ?? "").toLowerCase();
  if (m === "social") return "Social";
  if (m === "idc") return "IAM SSO";
  return "Unknown";
}

function tierMeta(subType?: string): { label: string; className: string } | null {
  const s = (subType ?? "").toUpperCase();
  if (!s || s === "FREE") return { label: "FREE", className: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400" };
  if (s.includes("POWER")) return { label: "POWER", className: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400" };
  if (s.includes("PRO_PLUS") || s.includes("PROPLUS")) return { label: "PRO+", className: "border-amber-500/40 bg-amber-500/10 text-amber-400" };
  if (s.includes("PRO")) return { label: "PRO", className: "border-sky-500/40 bg-sky-500/10 text-sky-400" };
  return { label: s, className: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400" };
}

export function AccountRow({ conn, onToggle, onCheck, onRemove, busy }: AccountRowProps) {
  const isBusy = busy === conn.id;
  const status = getStatus(conn);
  const active = isActive(conn);
  const raw = conn as Record<string, unknown>;
  const usageCount = raw.usageCount as number | undefined;
  const failCount = raw.failCount as number | undefined;
  const lastUsedAt = raw.lastUsedAt as string | undefined;
  const provider = (raw.loginProvider as string | undefined) ?? (raw.provider as string | undefined);
  const authMethod = raw.authMethod as string | undefined;
  const subscriptionType = raw.subscriptionType as string | undefined;
  const tier = tierMeta(subscriptionType);
  const loginLabel = loginProviderLabel(provider, authMethod);
  const privacy = usePrivacyMode();
  const displayLabel = privacy.mask(conn.label || conn.email) || conn.id;

  return (
    <TableRow>
      <TableCell className="max-w-[260px] truncate font-medium">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="truncate">{displayLabel}</span>
          <Badge variant="outline" className="text-[9px] font-mono shrink-0">KR</Badge>
          <Badge variant="outline" className="text-[9px] shrink-0 border-violet-500/40 bg-violet-500/10 text-violet-400">
            {loginLabel}
          </Badge>
          {tier && (
            <Badge variant="outline" className={`text-[9px] shrink-0 ${tier.className}`}>
              {tier.label}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant={STATUS_BADGE_VARIANT[status]}
          className={STATUS_BADGE_CLASS[status]}
        >
          {STATUS_LABEL[status]}
        </Badge>
      </TableCell>
      <TableCell className="text-right">{usageCount ?? 0}</TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {formatDate(lastUsedAt)}
      </TableCell>
      <TableCell className="text-right text-xs">
        <span>{creditDisplay(conn)}</span>
      </TableCell>
      <TableCell className="text-right">
        {(failCount ?? 0) > 0 ? (
          <span className="text-destructive font-medium">{failCount}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <Switch
            size="sm"
            checked={active}
            disabled={isBusy}
            onCheckedChange={() => onToggle(conn.id, active)}
          />

          <Button
            variant="ghost"
            size="icon-xs"
            disabled={isBusy}
            onClick={() => onCheck(conn.id)}
            title="Check token and refresh credit"
          >
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
          </Button>

          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="destructive"
                  size="icon-xs"
                  disabled={isBusy}
                  title="Remove"
                />
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove Account</DialogTitle>
                <DialogDescription>
                  Are you sure you want to remove <strong>{displayLabel}</strong>? This action cannot
                  be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button variant="destructive" onClick={() => onRemove(conn.id)}>
                  Remove
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

