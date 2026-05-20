"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "cybxai_privacy_mode";
const EVENT_NAME = "cybxai-privacy-mode-change";

function readStoredMode(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return true;
  return raw === "true";
}

export function maskEmail(email: string | null | undefined, enabled: boolean): string {
  if (!enabled || !email || email.indexOf("@") === -1) {
    return email ?? "";
  }
  const [localPart, domain] = email.split("@");
  const maskedLocal = localPart.length <= 2 ? localPart : localPart.substring(0, 2) + "***";
  const domainParts = domain.split(".");
  if (domainParts.length >= 2) {
    const tld = domainParts[domainParts.length - 1];
    const sld = domainParts[domainParts.length - 2];
    const maskedSld = sld.length <= 2 ? sld : sld.substring(0, 2) + "***";
    const subdomains = domainParts.slice(0, -2).map((sub) =>
      sub.length <= 2 ? sub : sub.substring(0, 2) + "***",
    );
    return maskedLocal + "@" + [...subdomains, maskedSld, tld].join(".");
  }
  return maskedLocal + "@" + domain;
}

export function getDisplayEmail(email: string | null | undefined, accountId: string | undefined, enabled: boolean): string {
  const raw = email || (accountId ? accountId.substring(0, 12) + "..." : "-");
  return maskEmail(raw, enabled);
}

export function usePrivacyMode(): {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
  mask: (email?: string | null) => string;
} {
  const [enabled, setEnabledState] = useState<boolean>(true);

  useEffect(() => {
    setEnabledState(readStoredMode());
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === "boolean") setEnabledState(detail);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(v));
      } catch {}
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: v }));
    }
  };

  return {
    enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled),
    mask: (email?: string | null) => maskEmail(email ?? "", enabled),
  };
}
