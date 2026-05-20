"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Loader2,
  Download,
  Upload,
  Trash2,
  Search,
  Power,
  PowerOff,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";

function ExportDialog({ onExport }: { onExport: (provider?: string) => void }) {
  const [exportProvider, setExportProvider] = useState("all");

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Download className="h-3.5 w-3.5" />
        Export
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Accounts</DialogTitle>
          <DialogDescription>
            Choose which provider accounts to export.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select value={exportProvider} onValueChange={(v) => v && setExportProvider(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              <SelectItem value="kiro">Kiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <DialogClose
            render={
              <Button
                onClick={() => onExport(exportProvider === "all" ? undefined : exportProvider)}
              />
            }
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConnectionsToolbarProps {
  total: number;
  checkingCredits: boolean;
  onCheckCredits: () => void;
  bulkRefreshingTokens: boolean;
  onBulkRefreshTokens: (provider: string) => void;
  onRemoveExpired: () => Promise<number>;
  onRemoveBanned: () => Promise<number>;
  onRemoveExhausted: () => Promise<number>;
  onRemoveProvider: (provider: string) => Promise<number>;
  onEnableProvider: (provider: string) => Promise<number>;
  onDisableProvider: (provider: string) => Promise<number>;
  onExport: (provider?: string) => void;
  onImport: (data: unknown) => void;
  onRefresh: () => void;
  loading: boolean;
  searchInput: string;
  onSearchChange: (value: string) => void;
  fetchParams: { provider?: string; status?: string; search?: string; pro?: string };
  onProviderFilter: (provider: string) => void;
  onStatusFilter: (status: string) => void;
  onProFilter: (pro: string) => void;
  refreshStats: () => void;
  roundRobinEnabled: boolean;
  routingLoading: boolean;
  onRoundRobinToggle: (enabled: boolean) => void;
}

export function ConnectionsToolbar({
  total,
  checkingCredits,
  onCheckCredits,
  bulkRefreshingTokens,
  onBulkRefreshTokens,
  onRemoveExpired,
  onRemoveBanned,
  onRemoveExhausted,
  onRemoveProvider,
  onEnableProvider,
  onDisableProvider,
  onExport,
  onImport,
  onRefresh,
  loading,
  searchInput,
  onSearchChange,
  fetchParams,
  onProviderFilter,
  onStatusFilter,
  onProFilter,
  refreshStats,
  roundRobinEnabled,
  routingLoading,
  onRoundRobinToggle,
}: ConnectionsToolbarProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const selectedProvider = fetchParams.provider || "";
  const selectedProviderLabel = selectedProvider === "kiro"
    ? "Kiro"
    : "selected provider";

  return (
    <>
      {}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h3 className="text-lg font-semibold">Connections</h3>
        <Badge variant="secondary">{total}</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 border border-border px-3 text-sm">
            <Shuffle className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">Round Robin</span>
            <Badge variant={roundRobinEnabled ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
              {roundRobinEnabled ? "Enabled" : "Disabled"}
            </Badge>
            {routingLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                size="sm"
                checked={roundRobinEnabled}
                onCheckedChange={onRoundRobinToggle}
                aria-label="Toggle round robin"
              />
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onCheckCredits}
            disabled={checkingCredits}
          >
            {checkingCredits ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check Credits
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkRefreshTokens("kiro")}
            disabled={selectedProvider !== "kiro" || bulkRefreshingTokens}
            title={selectedProvider === "kiro" ? "Bulk refresh Kiro tokens" : "Select Kiro provider first"}
          >
            {bulkRefreshingTokens ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Bulk Refresh Token
          </Button>
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                  disabled={!selectedProvider}
                />
              }
            >
              <Power className="h-3.5 w-3.5" />
              Enable All
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enable {selectedProviderLabel} Accounts</DialogTitle>
                <DialogDescription>
                  This will enable all accounts for <strong>{selectedProviderLabel}</strong>. Enabled accounts can be used again for proxy requests.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <DialogClose
                  render={
                    <Button
                      onClick={async () => {
                        if (!selectedProvider) { toast.error("Select a provider first"); return; }

                        const enabled = await onEnableProvider(selectedProvider);
                        if (enabled > 0) { toast.success(`Enabled ${enabled} ${selectedProviderLabel} accounts`); refreshStats(); }
                        else toast(`No disabled ${selectedProviderLabel} accounts to enable`);
                      }}
                    />
                  }
                >
                  Enable All
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  disabled={!selectedProvider}
                />
              }
            >
              <PowerOff className="h-3.5 w-3.5" />
              Disable All
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Disable {selectedProviderLabel} Accounts</DialogTitle>
                <DialogDescription>
                  This will disable all accounts for <strong>{selectedProviderLabel}</strong>. Disabled accounts will not be used for proxy requests until enabled again.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <DialogClose
                  render={
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        if (!selectedProvider) { toast.error("Select a provider first"); return; }

                        const disabled = await onDisableProvider(selectedProvider);
                        if (disabled > 0) { toast.success(`Disabled ${disabled} ${selectedProviderLabel} accounts`); refreshStats(); }
                        else toast(`No active ${selectedProviderLabel} accounts to disable`);
                      }}
                    />
                  }
                >
                  Disable All
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            onClick={async () => {
              const removed = await onRemoveExpired();
              if (removed > 0) { toast.success(`Removed ${removed} invalid token accounts`); refreshStats(); }
              else toast("No invalid token accounts");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove Invalid
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-high-impact/50 text-high-impact hover:bg-high-impact/10"
            onClick={async () => {
              const removed = await onRemoveBanned();
              if (removed > 0) { toast.success(`Removed ${removed} banned accounts`); refreshStats(); }
              else toast("No banned accounts");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove Banned
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-high-impact/50 text-high-impact hover:bg-high-impact/10"
            onClick={async () => {
              const removed = await onRemoveExhausted();
              if (removed > 0) { toast.success(`Removed ${removed} exhausted accounts`); refreshStats(); }
              else toast("No exhausted accounts");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove Exhausted
          </Button>
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="border-high-impact/50 text-high-impact hover:bg-high-impact/10"
                  disabled={!selectedProvider}
                />
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Provider
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {selectedProviderLabel} Accounts</DialogTitle>
                <DialogDescription>
                  This will permanently delete all accounts for <strong>{selectedProviderLabel}</strong>. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <DialogClose
                  render={
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        if (!selectedProvider) { toast.error("Select a provider first"); return; }

                        const removed = await onRemoveProvider(selectedProvider);
                        if (removed > 0) { toast.success(`Deleted ${removed} ${selectedProviderLabel} accounts`); refreshStats(); }
                        else toast(`No ${selectedProviderLabel} accounts to delete`);
                      }}
                    />
                  }
                >
                  Delete All
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <ExportDialog onExport={onExport} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => importRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const data = JSON.parse(text);
                onImport(data);
              } catch {
                toast.error("Invalid JSON file");
              }
              e.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 w-[200px] pl-8 text-xs"
          />
        </div>
        <Select value={fetchParams.provider || "all"} onValueChange={(v: string | null) => onProviderFilter(!v || v === "all" ? "" : v)}>
          <SelectTrigger size="sm" className="text-xs">
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            <SelectItem value="kiro">Kiro (KR)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fetchParams.status || "all"} onValueChange={(v: string | null) => onStatusFilter(!v || v === "all" ? "" : v)}>
          <SelectTrigger size="sm" className="text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fetchParams.pro || "all"} onValueChange={(v: string | null) => onProFilter(!v || v === "all" ? "" : v)}>
          <SelectTrigger size="sm" className="text-xs">
            <SelectValue placeholder="All Plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="pro">Pro Only</SelectItem>
            <SelectItem value="free">Free Only</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
