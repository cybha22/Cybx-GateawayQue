"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Coins } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function ProviderCreditCards({
  creditByProvider,
}: {
  creditByProvider: Record<string, { total: number; used: number; remaining: number; count: number; active: number; exhausted: number; expired: number; banned: number }>;
}) {
  const empty = { total: 0, used: 0, remaining: 0, count: 0, active: 0, exhausted: 0, expired: 0, banned: 0 };
  const items = [
    {
      key: "kr",
      label: "Kiro",
      data: creditByProvider["kiro"] ?? empty,
      iconBg: "bg-sky-500/10 text-sky-500",
      barColor: "bg-sky-500",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="mb-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map((p) => {
          const percent = p.data.total > 0 ? (p.data.used / p.data.total) * 100 : 0;
          return (
            <Card key={p.key}>
              <CardContent className="pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", p.iconBg)}>
                    <Coins className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{p.label} Credits</p>
                  <span className="ml-auto text-[10px] text-muted-foreground">{p.data.count} accs</span>
                </div>
                <p className="text-lg font-bold">
                  {p.data.remaining >= 1000 ? `${(p.data.remaining / 1000).toFixed(1)}K` : p.data.remaining.toFixed(1)}
                  <span className="text-muted-foreground font-normal text-sm"> / {p.data.total >= 1000 ? `${(p.data.total / 1000).toFixed(1)}K` : p.data.total.toFixed(1)}</span>
                </p>
                <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-500", percent > 80 ? "bg-high-impact" : p.barColor)} style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{p.data.remaining >= 1000 ? `${(p.data.remaining / 1000).toFixed(1)}K` : p.data.remaining.toFixed(1)} remaining</span>
                  <div className="flex items-center gap-2">
                    {p.data.banned > 0 && (
                      <span className="text-[10px] text-destructive">{p.data.banned} banned</span>
                    )}
                    {p.data.exhausted > 0 && (
                      <span className="text-[10px] text-high-impact">{p.data.exhausted} exhausted</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}
