"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useScraperStore } from "@/stores/scraper";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Play,
  Loader2,
  Download,
  Globe,
  Zap,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const GEONODE_COUNTRIES = [
  { value: "all", label: "All regions" },
  { value: "SG", label: "Singapore" },
  { value: "ID", label: "Indonesia" },
  { value: "US", label: "United States" },
  { value: "JP", label: "Japan" },
  { value: "DE", label: "Germany" },
  { value: "GB", label: "United Kingdom" },
  { value: "NL", label: "Netherlands" },
  { value: "FR", label: "France" },
  { value: "IN", label: "India" },
  { value: "BR", label: "Brazil" },
];

export default function ScraperPage() {
  const {
    sources,
    job,
    loading,
    fetchSources,
    fetchStatus,
    startScrape,
    cancelScrape,
    integrate,
  } = useScraperStore();

  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [concurrency, setConcurrency] = useState(50);
  const [geonodeCountry, setGeonodeCountry] = useState("SG");
  const [autoPoll, setAutoPoll] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchSources();
    fetchStatus();
  }, [fetchSources, fetchStatus]);

  const selectedSourceIds = useMemo(
    () => selectedSources.size > 0 ? Array.from(selectedSources) : sources.map((source) => source.id),
    [selectedSources, sources]
  );
  const selectedSourceSet = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds]);

  const isRunning = job?.status === "fetching" || job?.status === "testing";
  const hasGeonodeSelected = selectedSourceSet.has("geonode-http");

  useEffect(() => {
    if (isRunning || autoPoll) {
      pollRef.current = setInterval(fetchStatus, 2000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isRunning, autoPoll, fetchStatus]);

  const toggleSource = (id: string) => {
    setSelectedSources(() => {
      const next = new Set(selectedSourceIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleStart = async () => {
    const ids = selectedSourceIds;
    if (ids.length === 0) { toast.error("Select at least one source"); return; }
    const ok = await startScrape(ids, concurrency, {
      geonodeCountry: hasGeonodeSelected && geonodeCountry !== "all" ? geonodeCountry : undefined,
    });
    if (ok) { toast.success("Scrape started"); setAutoPoll(true); }
    else toast.error("Failed to start scrape");
  };

  const handleCancel = async () => {
    await cancelScrape();
    toast.success("Scrape cancelled");
    fetchStatus();
  };

  const handleIntegrateAll = async () => {
    if (!job?.results.length) return;
    const result = await integrate();
    if (result) toast.success(`Added ${result.added} proxies (${result.duplicates} duplicates)`);
    else toast.error("Failed to integrate");
  };

  const progress = job && job.totalTesting > 0
    ? Math.round((job.totalTested / job.totalTesting) * 100) : 0;

  return (
    <div>
      <PageHeader title="Proxy Scraper" subtitle="Fetch and test free proxies from public sources" />

      {/* Sources */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-500">
                <Globe className="size-4" />
              </div>
              <div>
                <CardTitle>Proxy Sources</CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">Select sources to scrape</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-4">
              {sources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => toggleSource(source.id)}
                  disabled={isRunning}
                  className={cn(
                    "flex items-center gap-2 rounded-sm border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
                    selectedSourceSet.has(source.id)
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  <div className={cn(
                    "size-3 rounded-sm border transition-colors",
                    selectedSourceSet.has(source.id) ? "bg-primary border-primary" : "border-muted-foreground/30"
                  )} />
                  <span className="flex-1 truncate">{source.name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">{source.type}</Badge>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-4">
              {hasGeonodeSelected && (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Geonode Region</Label>
                  <Select value={geonodeCountry} onValueChange={(value: string | null) => setGeonodeCountry(value ?? "all")}>
                    <SelectTrigger className="h-8 w-44 rounded-sm">
                      <SelectValue placeholder="All regions" />
                    </SelectTrigger>
                    <SelectContent>
                      {GEONODE_COUNTRIES.map((country) => (
                        <SelectItem key={country.value} value={country.value}>{country.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Concurrency</Label>
                <input
                  type="number" min={10} max={200} value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value) || 50)}
                  className="h-8 w-24 rounded-sm border border-border bg-transparent px-2 text-sm font-mono"
                  disabled={isRunning}
                />
              </div>

              {isRunning ? (
                <Button variant="destructive" onClick={handleCancel}>
                  <Square className="size-3.5" />
                  Cancel
                </Button>
              ) : (
                <Button onClick={handleStart} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : <Play />}
                  Start Scrape
                </Button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <Label className="text-xs text-muted-foreground">Auto-poll</Label>
                <Switch checked={autoPoll} onCheckedChange={setAutoPoll} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Progress */}
      {job && job.status !== "idle" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
                    <Zap className="size-4" />
                  </div>
                  <div>
                    <CardTitle>Scrape Progress</CardTitle>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {job.status === "fetching" && "Fetching proxy lists..."}
                      {job.status === "testing" && `Testing ${job.totalTesting.toLocaleString()} proxies...`}
                      {job.status === "done" && (job.error ? `Stopped: ${job.error}` : "Scrape complete")}
                      {job.status === "error" && `Error: ${job.error}`}
                    </p>
                  </div>
                </div>
                <Badge variant={job.status === "done" ? "default" : job.status === "error" ? "destructive" : "secondary"}>
                  {job.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                {[
                  { label: "Fetched", value: job.totalFetched },
                  { label: "To Test", value: job.totalTesting },
                  { label: "Tested", value: job.totalTested },
                  { label: "Alive", value: job.totalAlive, color: "text-emerald-500" },
                  { label: "Dead", value: job.totalDead, color: "text-red-500" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={cn("text-lg font-bold", s.color)}>{s.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {(job.status === "testing" || job.status === "done") && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{job.totalTested.toLocaleString()} / {job.totalTesting.toLocaleString()}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {job.status === "done" && job.totalAlive > 0 && (
                <Button onClick={handleIntegrateAll}>
                  <Download />
                  Integrate {job.totalAlive} Proxies to Pool
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Results */}
      {job?.results && job.results.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <CardTitle>Alive Proxies ({job.results.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proxy URL</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Ping</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {job.results.map((proxy, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{proxy.url}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-mono">{proxy.type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{proxy.source}</TableCell>
                        <TableCell className="text-right">
                          {proxy.pingMs != null ? (
                            <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                              <span className={cn(
                                "size-2 rounded-full shrink-0",
                                proxy.pingMs < 500 ? "bg-emerald-500" :
                                proxy.pingMs < 1500 ? "bg-yellow-500" :
                                proxy.pingMs < 3000 ? "bg-orange-500" : "bg-red-500"
                              )} />
                              {proxy.pingMs}ms
                            </span>
                          ) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
