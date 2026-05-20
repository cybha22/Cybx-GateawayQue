"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sun, Moon } from "lucide-react";
import { useThemeStore } from "@/stores/theme";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/animate-ui/components/radix/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/accounts": "Accounts",
  "/providers": "Providers",
  "/providers/kiro": "Kiro",
  "/models": "Models",
  "/filters": "Filters",
  "/logs": "Logs",
  "/api-key": "API Key",
  "/integration": "Integration",
  "/proxy": "Proxy",
  "/docs": "Docs",
};

export function Navbar() {
  const { theme, toggleTheme } = useThemeStore();
  const pathname = usePathname();

  const isHome = pathname === "/";

  const segments: { label: string; href: string }[] = [];
  if (!isHome) {
    const parts = pathname.split("/").filter(Boolean);
    let accumulated = "";
    for (const part of parts) {
      accumulated += `/${part}`;
      const label = PAGE_LABELS[accumulated] ?? part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, " ");
      segments.push({ label, href: accumulated });
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger className="-ml-1" />

      <Breadcrumb>
        <BreadcrumbList>
          {isHome ? (
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          ) : (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/" />}>
                  CybxAI
                </BreadcrumbLink>
              </BreadcrumbItem>
              {segments.map((seg, i) => (
                <span key={seg.href} className="contents">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {i === segments.length - 1 ? (
                      <BreadcrumbPage>{seg.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={seg.href} />}>
                        {seg.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              ))}
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex-1" />

      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
  );
}
