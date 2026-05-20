"use client";

import React from "react";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, AlertTriangle, Ban, BatteryWarning } from "lucide-react";
import type { AccountStats } from "./account-helpers";

export function AccountSummaryCards({ stats }: { stats: AccountStats }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <Card className="border-border/50">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-4.5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{stats.totalConnections}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </div>
        </CardContent>
      </Card>
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-4.5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-amber-600 dark:text-amber-400">{stats.totalExpired}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Invalid Token</p>
          </div>
        </CardContent>
      </Card>
      <Card className="border-red-500/30 bg-red-500/5">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
            <Ban className="size-4.5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-red-600 dark:text-red-400">{stats.totalBanned}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Banned</p>
          </div>
        </CardContent>
      </Card>
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <BatteryWarning className="size-4.5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-destructive">{stats.totalExhausted}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Exhausted</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
