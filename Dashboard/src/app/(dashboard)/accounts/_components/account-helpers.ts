import { Connection } from "@/stores/connections";

export type ConnectionStatus = "active" | "expired" | "suspended" | "exhausted";

export interface AccountStats {
  totalConnections: number;
  activeConnections: number;
  totalExhausted: number;
  totalExpired: number;
  totalBanned: number;
  byProvider?: Record<string, { total: number; used: number; remaining: number; count: number; active: number; exhausted: number; expired: number; banned: number }>;
}

export interface AccountRowProps {
  conn: Connection;
  onToggle: (id: string, enabled: boolean) => void;
  onCheck: (id: string) => void;
  onRemove: (id: string) => void;
  busy: string | null;
}

export const STATUS_BADGE_VARIANT: Record<ConnectionStatus, "default" | "destructive" | "secondary" | "outline"> = {
  active: "default",
  expired: "outline",
  suspended: "destructive",
  exhausted: "destructive",
};

export const STATUS_BADGE_CLASS: Record<ConnectionStatus, string> = {
  active: "",
  expired: "border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10",
  suspended: "border-red-500/30 bg-red-500/10",
  exhausted: "",
};

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  active: "active",
  expired: "token invalid",
  suspended: "banned",
  exhausted: "exhausted",
};

export function getStatus(conn: Connection): ConnectionStatus {
  const backendStatus = String((conn as any).status || "active").toLowerCase();
  if (backendStatus === "expired") return "expired";
  if (backendStatus === "exhausted") return "exhausted";
  if (backendStatus === "banned" || backendStatus === "suspended") return "suspended";
  if (backendStatus === "disabled") {
    const credit = conn.credit as Record<string, unknown> | undefined;
    const total = Number(credit?.totalCredits ?? 0);
    const remaining = Number(credit?.remainingCredits ?? -1);
    if (total > 0 && remaining <= 0) return "exhausted";
    return "suspended";
  }

  const credit = conn.credit as Record<string, unknown> | undefined;
  const total = Number(credit?.totalCredits ?? 0);
  const remaining = Number(credit?.remainingCredits ?? -1);
  if (total > 0 && remaining <= 0) return "exhausted";
  return "active";
}

export function isActive(conn: Connection): boolean {
  const status = getStatus(conn);
  if (status !== "active") return false;
  return conn.enabled !== false;
}

export function formatDate(d?: string | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCredit(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 100) return `${Math.round(n)}`;
  return n.toFixed(1);
}

export function creditDisplay(conn: Connection): string {
  const credit = conn.credit as
    | { remainingCredits?: number; totalCredits?: number }
    | undefined;
  if (!credit) return "\u2014";
  const rem = credit.remainingCredits ?? 0;
  const tot = credit.totalCredits ?? 0;
  return `${formatCredit(rem)} / ${formatCredit(tot)}`;
}

export function isKiroPro(conn: Connection): boolean {
  const provider = String((conn as Record<string, unknown>).provider ?? "");
  const credit = conn.credit as { packageName?: string } | undefined;
  return provider === "kiro" && String(credit?.packageName ?? "").toUpperCase() === "KIRO PRO";
}
