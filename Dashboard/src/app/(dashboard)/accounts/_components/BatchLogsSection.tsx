"use client";

import { useEffect, useRef } from "react";
import { useConnectionsStore } from "@/stores/connections";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Terminal } from "lucide-react";

export function BatchLogsSection() {
  const { batchTask, batchTaskId } = useConnectionsStore();
  const taskId = batchTaskId;
  const isRunning = !!taskId;
  const logs = batchTask?.logs ?? [];
  const hasLogs = logs.length > 0;
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Batch Logs</CardTitle>
            </div>
            {hasLogs && (
              <span className="text-[10px] text-muted-foreground">{logs.length} entries</span>
            )}
          </div>
          {batchTask && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <code>{taskId ?? batchTask.taskId}</code>
              <span className="ml-auto">
                {batchTask.completed ?? 0}/{batchTask.total}
                {batchTask.failed > 0 && (
                  <span className="text-high-impact ml-1">({batchTask.failed} failed)</span>
                )}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {!hasLogs ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-xs text-muted-foreground gap-1">
              <Terminal className="h-5 w-5 opacity-30" />
              {isRunning ? "Waiting for logs..." : "No batch running"}
            </div>
          ) : (
            <div className="rounded-sm border border-border bg-muted/30 overflow-hidden">
              <div className="overflow-y-auto max-h-[500px] overscroll-contain">
                {logs.map((log: any, i: number) => (
                  <div
                    key={i}
                    className={`flex gap-2 px-3 py-0.5 text-[11px] font-mono border-b border-border/30 last:border-0 min-w-0 ${log.level === "error" ? "text-high-impact" :
                      log.level === "success" ? "text-emerald-500" :
                        log.level === "warn" ? "text-amber-400" :
                          "text-muted-foreground"
                      }`}
                  >
                    <span className="shrink-0 text-muted-foreground/60 w-[52px]">{log.time}</span>
                    <span className="shrink-0 w-3">
                      {log.level === "error" ? "\u2717" : log.level === "success" ? "\u2713" : log.level === "warn" ? "\u26A0" : "\u2139"}
                    </span>
                    <span className="break-all min-w-0">{log.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
