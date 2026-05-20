"use client";

import { useEffect, useState, useCallback } from "react";
import { useDashboardStore } from "@/stores/dashboard";
import { useUsageStore, type ChartRange } from "@/stores/usage";
import { useConnectionsStore } from "@/stores/connections";
import { PageHeader } from "@/components/PageHeader";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { usePrivacyMode } from "@/lib/privacy";
import { Switch } from "@/components/ui/switch";
import {
  TrendingUp,
  Cpu,
  CheckCircle,
  Users,
  BarChart3,
  Layers,
  Contact,
  ChevronDown,
  ChevronUp,
  DollarSign,
  PieChart as PieChartIcon,
  Activity,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Pie, PieChart, Cell, Bar, BarChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";


function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatPercent(n: number): string {
  return n.toFixed(1) + "%";
}

function formatCost(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(2) + "K cr";
  if (n >= 1) return n.toFixed(2) + " cr";
  return n.toFixed(4) + " cr";
}

function formatUptime(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}


interface StatDef {
  title: string;
  desc: string;
  getValue: (u: Record<string, number>, a: Record<string, number>, s: Record<string, unknown>) => string;
  icon: React.ReactNode;
  iconBg: string;
}

const STAT_DEFS: StatDef[] = [
  {
    title: "Total Requests",
    desc: "All time requests",
    getValue: (u, _a, s) => formatNumber(u.totalRequests ?? (s.totalRequests as number) ?? 0),
    icon: <TrendingUp className="h-4 w-4" />,
    iconBg: "bg-blue-500/10 text-blue-500",
  },
  {
    title: "Total Tokens",
    desc: "Tokens processed",
    getValue: (u, _a, s) => formatNumber(u.totalTokens ?? (s.totalTokens as number) ?? 0),
    icon: <Cpu className="h-4 w-4" />,
    iconBg: "bg-violet-500/10 text-violet-500",
  },
  {
    title: "Success Rate",
    desc: "Request success",
    getValue: (u) => formatPercent(u.successRate ?? 0),
    icon: <CheckCircle className="h-4 w-4" />,
    iconBg: "bg-emerald-500/10 text-emerald-500",
  },
  {
    title: "Active Accounts",
    desc: "Connected accounts",
    getValue: (_u, a, s) => String(a.active ?? (s.activeAccounts as number) ?? 0),
    icon: <Users className="h-4 w-4" />,
    iconBg: "bg-pink-500/10 text-pink-500",
  },
  {
    title: "Total Accounts",
    desc: "All providers",
    getValue: (_u, a) => String(a.total ?? 0),
    icon: <Users className="h-4 w-4" />,
    iconBg: "bg-cyan-500/10 text-cyan-500",
  },
  {
    title: "Total Credits",
    desc: "Kiro credits consumed (raw upstream metering)",
    getValue: (u) => formatCost(u.totalCost ?? 0),
    icon: <DollarSign className="h-4 w-4" />,
    iconBg: "bg-emerald-500/10 text-emerald-500",
  },
];


const ACCOUNT_PREVIEW_LIMIT = 10;

function PrivacyToggle() {
  const privacy = usePrivacyMode();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none rounded-md border px-3 py-1.5 bg-card">
      {privacy.enabled ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      <span>Privacy mode</span>
      <Switch size="sm" checked={privacy.enabled} onCheckedChange={privacy.setEnabled} />
    </label>
  );
}

function UsageByAccountCard({ data, loading }: { data: Array<Record<string, unknown>>; loading: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const privacy = usePrivacyMode();
  const visible = expanded ? data : data.slice(0, ACCOUNT_PREVIEW_LIMIT);
  const hasMore = data.length > ACCOUNT_PREVIEW_LIMIT;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.85 }}
    >
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
              <Contact className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Usage by Account</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{data.length}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Activity breakdown per account</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={cn("overflow-x-auto", expanded && "overflow-auto max-h-[500px]")}>
            <Table>
              <TableHeader className={cn(expanded && "sticky top-0 z-10 bg-card")}>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Last Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No data
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-[160px] truncate">
                        {privacy.mask(String(a.accountLabel ?? a.label ?? a.account ?? a.email ?? "\u2014"))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber((a.requests as number) ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber((a.totalTokens as number) ?? (a.tokens as number) ?? 0)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-500 font-mono text-xs">
                        {formatCost((a.cost as number) ?? 0)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {(() => {
                          const ts = Number(a.lastUsed ?? a.lastUsedAt ?? 0);
                          if (!ts) return "\u2014";
                          const d = new Date(ts);
                          return isNaN(d.getTime()) ? "\u2014" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                        })()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {hasMore && (
            <div className="flex justify-center pt-3 border-t border-border mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Show top {ACCOUNT_PREVIEW_LIMIT}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Show all {data.length} accounts
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

const RANGES: { label: string; value: ChartRange }[] = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];


export default function DashboardPage() {
  const { stats, loading: dashLoading, fetch: fetchDash } = useDashboardStore();
  const { chart, chartLoading, fetchChart, weekChart, fetchWeekChart } = useUsageStore();
  const { fetch: fetchConnections } = useConnectionsStore();

  const [activeRange, setActiveRange] = useState<ChartRange>("day");

  const usage = ((stats as Record<string, unknown>)?.usage ?? {}) as Record<string, number>;
  const accounts = ((stats as Record<string, unknown>)?.accounts ?? {}) as Record<string, number>;
  const statsRecord = (stats ?? {}) as Record<string, unknown>;

  const byModelRaw = (stats as Record<string, unknown>)?.byModel as
    | Record<string, Record<string, unknown>>
    | Array<Record<string, unknown>>
    | undefined;
  const byAccountRaw = (stats as Record<string, unknown>)?.byAccount as
    | Record<string, Record<string, unknown>>
    | Array<Record<string, unknown>>
    | undefined;

  const byModel: Array<Record<string, unknown>> = Array.isArray(byModelRaw)
    ? byModelRaw
    : byModelRaw
      ? Object.entries(byModelRaw).map(([key, val]) => ({ model: key, ...val }))
      : [];
  const byAccount: Array<Record<string, unknown>> = Array.isArray(byAccountRaw)
    ? byAccountRaw
    : byAccountRaw
      ? Object.entries(byAccountRaw).map(([key, val]) => ({ accountId: key, ...val }))
      : [];

  const serverData = (stats as Record<string, unknown>)?.server as { startedAt: number; uptimeMs: number } | undefined;
  const [liveUptimeMs, setLiveUptimeMs] = useState(0);

  useEffect(() => {
    if (!serverData?.startedAt) return;
    const tick = () => setLiveUptimeMs(Date.now() - serverData.startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [serverData?.startedAt]);

  const uptime = formatUptime(liveUptimeMs);

  const refresh = useCallback(() => {
    fetchDash();
    fetchChart(activeRange);
    fetchWeekChart();
    fetchConnections();
  }, [fetchDash, fetchChart, fetchWeekChart, fetchConnections, activeRange]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  function handleRangeChange(range: ChartRange) {
    setActiveRange(range);
    fetchChart(range);
  }

  const sortedByModel = [...byModel].sort(
    (a, b) => ((b.requests as number) ?? 0) - ((a.requests as number) ?? 0),
  );
  const sortedByAccount = [...byAccount].sort(
    (a, b) => ((b.requests as number) ?? 0) - ((a.requests as number) ?? 0),
  );
  const sortedByModelCost = [...byModel].sort(
    (a, b) => ((b.cost as number) ?? 0) - ((a.cost as number) ?? 0),
  );
  const totalModelRequests = sortedByModel.reduce((sum, m) => sum + ((m.requests as number) ?? 0), 0);

  const chartTotalTokens = chart.reduce((sum, b) => sum + (Number(b.tokens) || Number(b.promptTokens || 0) + Number(b.completionTokens || 0)), 0);
  const chartPromptTokens = chart.reduce((sum, b) => sum + (Number(b.promptTokens) || 0), 0);
  const chartCompletionTokens = chart.reduce((sum, b) => sum + (Number(b.completionTokens) || 0), 0);

  const MODEL_COLORS = [
    "hsl(35, 92%, 60%)",   
    "hsl(262, 83%, 68%)",  
    "hsl(160, 60%, 50%)",  
    "hsl(200, 80%, 60%)",  
    "hsl(340, 75%, 60%)",  
    "hsl(45, 90%, 55%)",   
    "hsl(180, 60%, 50%)",  
    "hsl(280, 60%, 60%)",  
  ];

  const knownModels = sortedByModel.map((m) => String(m.model ?? m.name ?? "")).filter(Boolean);

  const modelKeys = knownModels.length > 0 ? knownModels.slice(0, 8) : ["tokens"];

  const chartConfig: Record<string, { label: string; color: string }> = {};
  modelKeys.forEach((model, i) => {
    const safeKey = model.replace(/[^a-zA-Z0-9]/g, "-");
    chartConfig[safeKey] = {
      label: model,
      color: MODEL_COLORS[i % MODEL_COLORS.length],
    };
  });

  const totalModelTokens = sortedByModel.reduce((sum, m) => sum + (Number(m.totalTokens ?? m.tokens ?? 0)), 0);
  const modelProportions = sortedByModel.map((m) => ({
    key: String(m.model ?? m.name ?? "").replace(/[^a-zA-Z0-9]/g, "-"),
    proportion: totalModelTokens > 0 ? (Number(m.totalTokens ?? m.tokens ?? 0)) / totalModelTokens : 0,
  }));

  const chartDataByModel = chart.map((bucket) => {
    const row: Record<string, unknown> = { label: bucket.label };
    const bucketTotal = Number(bucket.tokens) || (Number(bucket.promptTokens || 0) + Number(bucket.completionTokens || 0));

    if (modelProportions.length > 0) {
      modelProportions.forEach(({ key, proportion }) => {
        row[key] = Math.round(bucketTotal * proportion);
      });
    } else {
      row["tokens"] = bucketTotal;
    }
    return row;
  });

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader title="Dashboard" subtitle="Overview of your Proxy gateway" />
        <PrivacyToggle />
      </div>

      {}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-3 ">
        {STAT_DEFS.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className={cn(
              "h-full border border-l-0",
              index === 0 && "border-l",
              index % 2 === 0 && "max-sm:border-l",
              index % 3 === 0 && "max-lg:sm:border-l",
            )}>
              <CardHeader className="flex flex-row items-center justify-between ">
                <CardTitle className="text-xs font-bold text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={cn("flex h-5 w-5 items-center justify-center rounded-md")}>
                  {stat.icon}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  {stat.getValue(usage, accounts, statsRecord)}
                </div>
              {stat.desc ? (
                  <span className="text-[10px] text-muted-foreground/70 mt-1">{stat.desc}</span>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="mb-3"
      >
        <Card>
          <CardContent className="py-2.5 px-4">
            <div className="flex items-center justify-between gap-3">
              {}
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">Server Uptime</span>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                </div>
              </div>

              {}
              <div className="flex items-center gap-1.5 font-mono text-xl tabular-nums">
                <span className="font-semibold">{String(uptime.days).padStart(2, "0")}</span>
                <span className="text-muted-foreground text-[10px]">d</span>
                <span className="font-semibold">{String(uptime.hours).padStart(2, "0")}</span>
                <span className="text-muted-foreground text-[10px]">h</span>
                <span className="font-semibold">{String(uptime.minutes).padStart(2, "0")}</span>
                <span className="text-muted-foreground text-[10px]">m</span>
                <span className="font-semibold">{String(uptime.seconds).padStart(2, "0")}</span>
                <span className="text-muted-foreground text-[10px]">s</span>
              </div>

              {}
              <div className="hidden sm:flex items-center gap-2.5">
                <div className="flex items-end gap-[6px]">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-[4px] rounded-[1px] bg-emerald-500"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 14, opacity: 1 }}
                      transition={{ delay: 0.6 + i * 0.04, duration: 0.25, ease: "easeOut" }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatPercent(usage.successRate ?? 100)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card className="mb-3">
          <div className="flex flex-col gap-4 px-4 pt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                {}
                <div>
                  <CardTitle>
                    {activeRange === "day" ? "Hourly" : "Daily"} Usage
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Token usage breakdown by model</p>
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-sm bg-muted p-1">
                {RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => handleRangeChange(r.value)}
                    className="relative rounded-sm px-3 py-1 text-sm font-medium transition-colors"
                  >
                    {activeRange === r.value && (
                      <motion.div
                        layoutId="chart-range-pill"
                        className="absolute inset-0 rounded-sm bg-background shadow-sm ring-1 ring-border"
                        transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                      />
                    )}
                    <span className={cn(
                      "relative z-10",
                      activeRange === r.value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}>
                      {r.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total</p>
                <p className="text-2xl font-bold tracking-tight mt-0.5">
                  {formatNumber(chartTotalTokens)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Prompt</p>
                <p className="text-2xl font-bold tracking-tight mt-0.5">
                  {formatNumber(chartPromptTokens)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Completion</p>
                <p className="text-2xl font-bold tracking-tight mt-0.5">
                  {formatNumber(chartCompletionTokens)}
                </p>
              </div>
            </div>
          </div>

          <CardContent>
            {chartLoading && chart.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Loading chart...
              </div>
            ) : chart.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                No chart data available
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <AreaChart
                  data={chartDataByModel}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <defs>
                    {modelKeys.map((model) => {
                      const safeKey = model.replace(/[^a-zA-Z0-9]/g, "-");
                      return (
                        <linearGradient key={safeKey} id={`fill-${safeKey}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={`var(--color-${safeKey})`} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={`var(--color-${safeKey})`} stopOpacity={0.05} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => formatNumber(v)}
                    width={50}
                  />
                  <ChartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const total = payload.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
                      return (
                        <div className="rounded-sm border border-border bg-card px-3 py-2 shadow-md">
                          <p className="text-xs font-medium text-foreground mb-1.5">{label}</p>
                          <div className="flex flex-col gap-1">
                            {payload.map((entry, i) => (
                              <div key={String(entry.dataKey ?? i)} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {chartConfig[String(entry.dataKey)]?.label ?? entry.dataKey}
                                  </span>
                                </div>
                                <span className="text-xs font-mono font-medium text-foreground">
                                  {formatNumber(Number(entry.value) || 0)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-1.5 pt-1.5 border-t border-border flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Total</span>
                            <span className="text-xs font-mono font-bold text-foreground">
                              {formatNumber(total)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  {modelKeys.map((model) => {
                    const safeKey = model.replace(/[^a-zA-Z0-9]/g, "-");
                    return (
                      <Area
                        key={safeKey}
                        type="monotone"
                        dataKey={safeKey}
                        stackId="a"
                        stroke={`var(--color-${safeKey})`}
                        fill={`url(#fill-${safeKey})`}
                        strokeWidth={2}
                      />
                    );
                  })}
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ---- Pie + Bar Charts Row ---- */}
      <div className="grid gap-3 lg:grid-cols-3 mb-3 min-w-0">
        {/* Top Models Used — Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <Card className="min-w-0 overflow-hidden h-full">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                  <PieChartIcon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Top Models Used</CardTitle>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Request distribution by model</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sortedByModel.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                  No data
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Pie chart */}
                  <ChartContainer config={chartConfig} className="h-[280px] w-full sm:w-1/2 shrink-0">
                    <PieChart>
                      <Pie
                        data={sortedByModel.slice(0, 5).map((m, i) => ({
                          name: String(m.model ?? m.name ?? "Unknown"),
                          value: (m.requests as number) ?? 0,
                          fill: MODEL_COLORS[i % MODEL_COLORS.length],
                        }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        label={({ value }) => {
                          const pct = totalModelRequests > 0 ? Math.round((value / totalModelRequests) * 100) : 0;
                          return pct >= 5 ? `${pct}%` : "";
                        }}
                        labelLine={false}
                      >
                        {sortedByModel.slice(0, 5).map((_, i) => (
                          <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const entry = payload[0];
                          const pct = totalModelRequests > 0 ? ((Number(entry.value) / totalModelRequests) * 100).toFixed(1) : "0";
                          return (
                            <div className="rounded-sm border border-border bg-card px-3 py-2 shadow-md">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.payload?.fill }} />
                                <span className="text-xs font-medium text-foreground">{entry.name}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs text-muted-foreground">Requests</span>
                                <span className="text-xs font-mono font-medium text-foreground">{formatNumber(Number(entry.value))}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs text-muted-foreground">Share</span>
                                <span className="text-xs font-mono font-medium text-foreground">{pct}%</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ChartContainer>

                  {/* Detail legend */}
                  <div className="flex flex-col justify-center gap-1.5 sm:w-1/2 min-w-0">
                    {sortedByModel.slice(0, 5).map((m, i) => {
                      const name = String(m.model ?? m.name ?? "Unknown");
                      const requests = (m.requests as number) ?? 0;
                      const tokens = (m.totalTokens as number) ?? (m.tokens as number) ?? 0;
                      const cost = (m.cost as number) ?? 0;
                      const pct = totalModelRequests > 0 ? ((requests / totalModelRequests) * 100).toFixed(1) : "0";
                      return (
                        <div key={i} className="flex items-center gap-2 py-1 px-2 rounded-sm hover:bg-muted/50 transition-colors">
                          <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatNumber(requests)} req · {formatNumber(tokens)} tok · {formatCost(cost)}
                            </p>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground shrink-0">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Cost by Model — Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card className="min-w-0 overflow-hidden h-full">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md ">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Top Cost by Model</CardTitle>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Estimated cost breakdown</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sortedByModelCost.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                  No data
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-[280px] w-full">
                  <BarChart
                    layout="vertical"
                    data={sortedByModelCost.slice(0, 5).map((m, i) => ({
                      name: String(m.model ?? m.name ?? "Unknown"),
                      cost: (m.cost as number) ?? 0,
                      fill: MODEL_COLORS[i % MODEL_COLORS.length],
                    }))}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => formatCost(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                      width={100}
                    />
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const entry = payload[0];
                        return (
                          <div className="rounded-sm border border-border bg-card px-3 py-2 shadow-md">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.payload?.fill }} />
                              <span className="text-xs font-medium text-foreground">{entry.payload?.name}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-xs text-muted-foreground">Cost</span>
                              <span className="text-xs font-mono font-medium text-emerald-500">{formatCost(Number(entry.value))}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                      {sortedByModelCost.slice(0, 5).map((_, i) => (
                        <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Token Spend by Day — Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.72 }}
        >
          <Card className="min-w-0 overflow-hidden h-full">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md ">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Token Spend by Day</CardTitle>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Last 7 days</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {weekChart.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                  No data
                </div>
              ) : (
                <ChartContainer config={{ cost: { label: "Cost", color: "hsl(160, 60%, 50%)" } }} className="h-[280px] w-full">
                  <BarChart
                    data={weekChart.map((bucket) => ({
                      label: bucket.label,
                      cost: Number(bucket.cost ?? 0),
                    }))}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => formatCost(v)}
                      width={50}
                    />
                    <ChartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-sm border border-border bg-card px-3 py-2 shadow-md">
                            <p className="text-xs font-medium text-foreground mb-1">{label}</p>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-xs text-muted-foreground">Cost</span>
                              <span className="text-xs font-mono font-medium text-emerald-500">{formatCost(Number(payload[0].value))}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="cost" fill="hsl(160, 60%, 50%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ---- Tables Row ---- */}
      <div className="grid gap-3 lg:grid-cols-2 min-w-0">
        {/* Usage by Model */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
        >
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-500">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>Usage by Model</CardTitle>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Requests and token usage per model</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashLoading && sortedByModel.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : sortedByModel.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No data
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedByModel.map((m, i) => {
                      const modelName = String(m.model ?? m.name ?? "");
                      const safeKey = modelName.replace(/[^a-zA-Z0-9]/g, "-");
                      const color = chartConfig[safeKey]?.color ?? MODEL_COLORS[i % MODEL_COLORS.length];
                      return (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="font-mono text-xs">{modelName || "\u2014"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber((m.requests as number) ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber((m.totalTokens as number) ?? (m.tokens as number) ?? 0)}
                          </TableCell>
                          <TableCell className="text-right text-emerald-500 font-mono text-xs">
                            {formatCost((m.cost as number) ?? 0)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Usage by Account */}
        <UsageByAccountCard
          data={sortedByAccount}
          loading={dashLoading}
        />
      </div>
    </>
  );
}
