"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { motion } from "motion/react";
import { Aws, Codex, Qoder } from "@lobehub/icons";
import { ChevronRight, Users } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface ProviderCard {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  href: string;
  badge?: string;
  disabled?: boolean;
}

const providers: ProviderCard[] = [
  {
    id: "kiro",
    name: "Kiro",
    description:
      "AWS CodeWhisperer — Kiro models with manual refresh token import, usage check, and Pro account detection.",
    icon: Aws,
    href: "/providers/kiro",
    badge: "7 models",
  },
  {
    id: "codex",
    name: "Codex",
    description:
      "OpenAI — GPT-5.5, GPT-5.4, GPT-5.3 Codex models via ChatGPT. Free with ChatGPT Plus subscription.",
    icon: Codex.Color,
    href: "/providers/codex",
    badge: "6 models",
    disabled: true,
  },
  {
    id: "qoder",
    name: "Qoder",
    description:
      "Alibaba Cloud — Qwen, GLM, Kimi, MiniMax models. Google OAuth, CLI import, IDE import, or manual token.",
    icon: Qoder.Color,
    href: "/providers/qoder",
    badge: "9 models",
    disabled: true,
  },
];

export default function ProvidersPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    apiFetch<{ provider: string; label: string }[]>("/api/connections/labels")
      .then((labels) => {
        const map: Record<string, number> = {};
        for (const l of Array.isArray(labels) ? labels : []) {
          map[l.provider] = (map[l.provider] || 0) + 1;
        }
        setCounts(map);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <PageHeader
        title="Providers"
        subtitle="Manage provider credentials. Select a provider to configure authentication."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {providers.map((p, i) => {
          const cardInner = (
            <Card
              className={`h-full transition-colors ${
                p.disabled ? "opacity-70" : "group-hover:border-primary/50"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-2xl font-semibold">
                    <p.icon className="size-8" />
                    {p.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {(counts[p.id] ?? 0) > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <Users className="size-3" />
                        {counts[p.id]}
                      </Badge>
                    )}
                    {p.badge && (
                      <Badge variant="outline" className="text-xs">
                        {p.badge}
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="text-xs mt-2 leading-relaxed">
                  {p.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <span
                  className={`text-xs flex items-center gap-1 ${
                    p.disabled
                      ? "text-muted-foreground"
                      : "text-primary group-hover:underline"
                  }`}
                >
                  Configure
                  <ChevronRight className="size-3" />
                </span>
              </CardContent>
            </Card>
          );

          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
            >
              {p.disabled ? (
                <div
                  className="block cursor-not-allowed"
                  aria-disabled="true"
                  title="Coming soon"
                >
                  {cardInner}
                </div>
              ) : (
                <Link href={p.href} className="block group">
                  {cardInner}
                </Link>
              )}
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
