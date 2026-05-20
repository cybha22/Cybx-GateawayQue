"use client";

import { motion } from "motion/react";
import type { Connection } from "@/stores/connections";
import {
  Card,
  CardHeader,
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { AccountRow } from "./AccountRow";
import { ConnectionsToolbar } from "./ConnectionsToolbar";

interface ConnectionsTableProps {
  connections: Connection[];
  pagination: {
    total: number;
    totalPages: number;
    page: number;
    limit: number;
  };
  loading: boolean;
  error: string | null;
  fetchParams: { provider?: string; status?: string; search?: string; pro?: string; page?: number; limit?: number };
  busyId: string | null;
  onToggle: (id: string, enabled: boolean) => void;
  onCheck: (id: string) => void;
  onRemove: (id: string) => void;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onProviderFilter: (provider: string) => void;
  onStatusFilter: (status: string) => void;
  onProFilter: (pro: string) => void;
  checkingCredits: boolean;
  onCheckCredits: () => void;
  roundRobinEnabled: boolean;
  routingLoading: boolean;
  onRoundRobinToggle: (enabled: boolean) => void;
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
  refreshStats: () => void;
}

export function ConnectionsTable({
  connections,
  pagination,
  loading,
  error,
  fetchParams,
  busyId,
  onToggle,
  onCheck,
  onRemove,
  onPageChange,
  onLimitChange,
  searchInput,
  onSearchChange,
  onProviderFilter,
  onStatusFilter,
  onProFilter,
  checkingCredits,
  onCheckCredits,
  roundRobinEnabled,
  routingLoading,
  onRoundRobinToggle,
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
  refreshStats,
}: ConnectionsTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mb-6"
    >
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <ConnectionsToolbar
            total={pagination.total}
            checkingCredits={checkingCredits}
            onCheckCredits={onCheckCredits}
            roundRobinEnabled={roundRobinEnabled}
            routingLoading={routingLoading}
            onRoundRobinToggle={onRoundRobinToggle}
            bulkRefreshingTokens={bulkRefreshingTokens}
            onBulkRefreshTokens={onBulkRefreshTokens}
            onRemoveExpired={onRemoveExpired}
            onRemoveBanned={onRemoveBanned}
            onRemoveExhausted={onRemoveExhausted}
            onRemoveProvider={onRemoveProvider}
            onEnableProvider={onEnableProvider}
            onDisableProvider={onDisableProvider}
            onExport={onExport}
            onImport={onImport}
            onRefresh={onRefresh}
            loading={loading}
            searchInput={searchInput}
            onSearchChange={onSearchChange}
            fetchParams={fetchParams}
            onProviderFilter={onProviderFilter}
            onStatusFilter={onStatusFilter}
            onProFilter={onProFilter}
            refreshStats={refreshStats}
          />
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-high-impact/50 bg-high-impact/10 px-4 py-3 text-sm text-high-impact">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Usage</TableHead>
                  <TableHead className="text-right">Last Used</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Fails</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && connections.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : connections.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {(fetchParams.search || fetchParams.provider || fetchParams.status)
                        ? "No accounts match the current filters"
                        : "No accounts connected"}
                    </TableCell>
                  </TableRow>
                ) : (
                  connections.map((conn) => (
                    <AccountRow
                      key={conn.id}
                      conn={conn}
                      onToggle={onToggle}
                      onCheck={onCheck}
                      onRemove={onRemove}
                      busy={busyId}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {}
          {pagination.totalPages > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-2 pt-4 border-t border-border mt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Rows per page:</span>
                <Select value={String(pagination.limit)} onValueChange={(v: string | null) => onLimitChange(Number(v ?? 20))}>
                  <SelectTrigger size="sm" className="text-xs w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="ml-2">
                  {((pagination.page - 1) * pagination.limit) + 1}
                  {"\u2013"}
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                  {" of "}
                  {pagination.total}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => onPageChange(1)}
                  disabled={pagination.page <= 1}
                  title="First page"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => onPageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  title="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2 text-xs text-muted-foreground">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => onPageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  title="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => onPageChange(pagination.totalPages)}
                  disabled={pagination.page >= pagination.totalPages}
                  title="Last page"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
