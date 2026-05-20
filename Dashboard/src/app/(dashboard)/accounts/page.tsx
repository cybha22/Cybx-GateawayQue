"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useConnectionsStore } from "@/stores/connections";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { usePrivacyMode } from "@/lib/privacy";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff } from "lucide-react";

import type { AccountStats } from "./_components/account-helpers";
import { AccountSummaryCards } from "./_components/AccountSummaryCards";
import { ProviderCreditCards } from "./_components/ProviderCreditCards";
import { ConnectionsTable } from "./_components/ConnectionsTable";
import { BatchLogsSection } from "./_components/BatchLogsSection";
import { BatchAddSection } from "./_components/BatchAddSection";
import { FilterUnconnectedSection } from "./_components/FilterUnconnectedSection";
import { PremiumNotice } from "@/components/PremiumNotice";

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

interface ProviderCreditSummary {
  total: number;
  used: number;
  remaining: number;
  count: number;
  active: number;
  exhausted: number;
  expired: number;
  banned: number;
}

interface AccountStatsResponse extends AccountStats {
  byProvider?: Record<string, ProviderCreditSummary>;
}

interface RoutingSettings {
  roundRobinEnabled: boolean;
}

export default function AccountsPage() {
  const {
    connections,
    pagination,
    loading,
    error,
    fetch,
    fetchParams,
    enable,
    disable,
    enableByProvider,
    disableByProvider,
    checkToken,
    bulkRefreshTokens,
    checkAllCredits,
    removeExhausted,
    removeExpired,
    removeBanned,
    exportData,
    importData,
    remove,
    removeByProvider,
  } = useConnectionsStore();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkingCredits, setCheckingCredits] = useState(false);
  const [bulkRefreshingTokens, setBulkRefreshingTokens] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [creditByProvider, setCreditByProvider] = useState<Record<string, ProviderCreditSummary>>({});
  const [roundRobinEnabled, setRoundRobinEnabled] = useState(false);
  const [routingLoading, setRoutingLoading] = useState(false);

  useEffect(() => {
    fetch();
    apiFetch<AccountStatsResponse>("/api/connections/credit-summary").then((data) => {
      setStats(data);
      if (data.byProvider) setCreditByProvider(data.byProvider);
    }).catch(() => { });
    apiFetch<RoutingSettings>("/api/routing-settings").then((data) => {
      setRoundRobinEnabled(data.roundRobinEnabled);
    }).catch(() => { });
  }, [fetch]);

  const refreshStats = useCallback(() => {
    apiFetch<AccountStatsResponse>("/api/connections/credit-summary").then((data) => {
      setStats(data);
      if (data.byProvider) setCreditByProvider(data.byProvider);
    }).catch(() => { });
  }, []);

  const handleRoundRobinToggle = useCallback(async (enabled: boolean) => {
    setRoutingLoading(true);
    try {
      const updated = await apiFetch<RoutingSettings>("/api/routing-settings", {
        method: "POST",
        body: JSON.stringify({ roundRobinEnabled: enabled }),
      });
      setRoundRobinEnabled(updated.roundRobinEnabled);
      toast.success(updated.roundRobinEnabled ? "Round robin enabled" : "Round robin disabled");
    } catch {
      toast.error("Failed to update routing mode");
    } finally {
      setRoutingLoading(false);
    }
  }, []);

  const goToPage = useCallback((page: number) => {
    fetch({ page });
  }, [fetch]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetch({ search: value || undefined, page: 1 });
    }, 300);
  }, [fetch]);

  const handleProviderFilter = useCallback((provider: string) => {
    fetch({ provider: provider || undefined, page: 1 });
  }, [fetch]);

  const handleStatusFilter = useCallback((status: string) => {
    fetch({ status: status || undefined, page: 1 });
  }, [fetch]);

  const handleProFilter = useCallback((pro: string) => {
    fetch({ pro: pro || undefined, page: 1 });
  }, [fetch]);

  const handleLimitChange = useCallback((limit: number) => {
    fetch({ limit, page: 1 });
  }, [fetch]);

  const handleToggle = useCallback(
    async (id: string, currentlyActive: boolean) => {
      setBusyId(id);
      try {
        if (currentlyActive) {
          await disable(id);
          toast.success("Account disabled");
        } else {
          await enable(id);
          toast.success("Account enabled");
        }
        await fetch();
      } catch {
        toast.error("Failed to toggle account");
      } finally {
        setBusyId(null);
      }
    },
    [enable, disable, fetch],
  );

  const handleCheck = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await checkToken(id);
        const conn = useConnectionsStore
          .getState()
          .connections.find((c) => c.id === id);
        if (conn?.tokenValid) {
          toast.success("Token is valid");
        } else {
          toast.error("Token is invalid");
        }
        await fetch();
      } catch {
        toast.error("Token check failed");
      } finally {
        setBusyId(null);
      }
    },
    [checkToken, fetch],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await remove(id);
        toast.success("Account removed");
      } catch {
        toast.error("Failed to remove account");
      } finally {
        setBusyId(null);
      }
    },
    [remove],
  );

  const onCheckCredits = useCallback(async () => {
    setCheckingCredits(true);
    await checkAllCredits();
    setCheckingCredits(false);
    refreshStats();
    toast.success("Credits updated");
  }, [checkAllCredits, refreshStats]);

  const onBulkRefreshTokens = useCallback(async (provider: string) => {
    setBulkRefreshingTokens(true);
    try {
      const result = await bulkRefreshTokens(provider);
      refreshStats();
      toast.success(`Checked ${result.checked} accounts, refreshed ${result.refreshed}, expired ${result.expired}`);
    } catch {
      toast.error("Bulk refresh token failed");
    } finally {
      setBulkRefreshingTokens(false);
    }
  }, [bulkRefreshTokens, refreshStats]);

  const onExport = useCallback(async (provider?: string) => {
    const data = await exportData(provider);
    if (!data) { toast.error("Export failed"); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = provider ? `-${provider}` : "";
    a.download = `cybxai-backup${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(provider ? `Exported ${provider} accounts` : "Exported all accounts");
  }, [exportData]);

  const onImport = useCallback(async (data: unknown) => {
    try {
      const result = await importData(data);
      if (result) {
        toast.success(`Imported ${result.imported} accounts (${result.skipped} skipped)`);
      } else {
        toast.error("Import failed");
      }
    } catch {
      toast.error("Invalid JSON file");
    }
  }, [importData]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <PageHeader title="Accounts" subtitle="Manage connected accounts" />
        <PrivacyToggle />
      </div>

      {/* Summary Stats */}
      {stats && (
        <AccountSummaryCards stats={stats} />
      )}

      {/* Credits by provider */}
      {Object.keys(creditByProvider).length > 0 && (
        <ProviderCreditCards creditByProvider={creditByProvider} />
      )}

      {/* Account List */}
      <ConnectionsTable
        connections={connections}
        pagination={pagination}
        loading={loading}
        error={error}
        fetchParams={fetchParams}
        busyId={busyId}
        onToggle={handleToggle}
        onCheck={handleCheck}
        onRemove={handleRemove}
        onPageChange={goToPage}
        onLimitChange={handleLimitChange}
        searchInput={searchInput}
        onSearchChange={handleSearchChange}
        onProviderFilter={handleProviderFilter}
        onStatusFilter={handleStatusFilter}
        onProFilter={handleProFilter}
        checkingCredits={checkingCredits}
        onCheckCredits={onCheckCredits}
        roundRobinEnabled={roundRobinEnabled}
        routingLoading={routingLoading}
        onRoundRobinToggle={handleRoundRobinToggle}
        bulkRefreshingTokens={bulkRefreshingTokens}
        onBulkRefreshTokens={onBulkRefreshTokens}
        onRemoveExpired={removeExpired}
        onRemoveBanned={removeBanned}
        onRemoveExhausted={removeExhausted}
        onRemoveProvider={removeByProvider}
        onEnableProvider={enableByProvider}
        onDisableProvider={disableByProvider}
        onExport={onExport}
        onImport={onImport}
        onRefresh={() => fetch()}
        refreshStats={refreshStats}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start mt-4">
        <div className="flex flex-col gap-4">
          <PremiumNotice />
          <BatchAddSection />
          <FilterUnconnectedSection />
        </div>
        <BatchLogsSection />
      </div>
    </>
  );
}
