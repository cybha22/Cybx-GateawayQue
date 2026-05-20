"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import { motion } from "motion/react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  Shield,
  Plus,
  Trash2,
  Loader2,
  ToggleLeft,
  Pencil,
  Check,
  X,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";


interface FilterRule {
  id: string;
  label: string;
  pattern: string;
  flags: string;
  replacement: string;
  preset: boolean;
  enabled: boolean;
  category: "brand" | "security" | "custom";
}

interface FilterConfig {
  enabled: boolean;
  providerOverrides: Record<string, boolean>;
  rules: FilterRule[];
}

const PROVIDERS = [
  { id: "kiro", name: "Kiro" },
];


export default function FiltersPage() {
  const [config, setConfig] = useState<FilterConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await apiFetch<FilterConfig>("/api/filters");
      setConfig(data);
    } catch {
      toast.error("Failed to load filter config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const toggleMaster = async (enabled: boolean) => {
    try {
      await apiFetch("/api/filters/toggle", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      setConfig((c) => c ? { ...c, enabled } : c);
    } catch {
      toast.error("Failed to toggle filters");
    }
  };

  const toggleProvider = async (provider: string, enabled: boolean) => {
    try {
      await apiFetch("/api/filters/provider", {
        method: "POST",
        body: JSON.stringify({ provider, enabled }),
      });
      setConfig((c) => c ? {
        ...c,
        providerOverrides: { ...c.providerOverrides, [provider]: enabled },
      } : c);
    } catch {
      toast.error("Failed to toggle provider");
    }
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      await apiFetch(`/api/filters/rules/${ruleId}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      setConfig((c) => c ? {
        ...c,
        rules: c.rules.map((r) => r.id === ruleId ? { ...r, enabled } : r),
      } : c);
    } catch {
      toast.error("Failed to toggle rule");
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      await apiFetch(`/api/filters/rules/${ruleId}`, { method: "DELETE" });
      setConfig((c) => c ? {
        ...c,
        rules: c.rules.filter((r) => r.id !== ruleId),
      } : c);
      toast.success("Rule deleted");
    } catch {
      toast.error("Failed to delete rule");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) return null;

  const presetRules = config.rules.filter((r) => r.preset);
  const customRules = config.rules.filter((r) => !r.preset);

  return (
    <>
      <PageHeader
        title="Content Filters"
        subtitle="Sanitize request content to avoid upstream content filter rejections. Toggle per provider."
      />

      {/* Master toggle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Shield className={cn("size-5", config.enabled ? "text-primary" : "text-muted-foreground")} />
              <div>
                <p className="text-sm font-medium">Content Filters</p>
                <p className="text-xs text-muted-foreground">
                  {config.enabled ? "Active — filtering enabled" : "Disabled — all content passes through unmodified"}
                </p>
              </div>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={toggleMaster}
            />
          </CardContent>
        </Card>
      </motion.div>

      {config.enabled && (
        <>
          {/* Per-provider overrides */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-4"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Provider Overrides</CardTitle>
                <CardDescription>
                  Enable or disable content filters per provider. Useful to avoid degrading AI responses for tools that don't need filtering.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PROVIDERS.map((p) => {
                    const isEnabled = config.providerOverrides[p.id] ?? config.enabled;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <span className="text-sm font-medium">{p.name}</span>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(v) => toggleProvider(p.id, v)}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Preset rules */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  System Presets
                  <Badge variant="secondary">{presetRules.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Built-in rules that sanitize security keywords commonly blocked by upstream content filters.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {presetRules.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      onToggle={(enabled) => toggleRule(rule.id, enabled)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Custom rules */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-4"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  Custom Rules
                  <Badge variant="secondary">{customRules.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Add your own regex replacement rules. Pattern uses JavaScript regex syntax.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {customRules.length > 0 && (
                  <div className="space-y-1">
                    {customRules.map((rule) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        onToggle={(enabled) => toggleRule(rule.id, enabled)}
                        onDelete={() => deleteRule(rule.id)}
                      />
                    ))}
                  </div>
                )}
                {customRules.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">
                    No custom rules yet. Add one below.
                  </p>
                )}
                <Separator />
                <AddRuleForm onAdded={fetchConfig} />
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Rule Row                                                           */
/* ------------------------------------------------------------------ */

function RuleRow({
  rule,
  onToggle,
  onDelete,
}: {
  rule: FilterRule;
  onToggle: (enabled: boolean) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
      <Switch
        checked={rule.enabled}
        onCheckedChange={onToggle}
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm truncate", !rule.enabled && "text-muted-foreground")}>
          {rule.label}
        </p>
        <p className="text-[10px] font-mono text-muted-foreground truncate">
          /{rule.pattern}/{rule.flags} → {rule.replacement || '""'}
        </p>
      </div>
      <Badge variant="outline" className="text-[9px] shrink-0">
        {rule.category}
      </Badge>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Rule Form                                                      */
/* ------------------------------------------------------------------ */

function AddRuleForm({ onAdded }: { onAdded: () => void }) {
  const [label, setLabel] = useState("");
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("gi");
  const [replacement, setReplacement] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!label.trim() || !pattern.trim()) {
      toast.error("Label and pattern are required");
      return;
    }
    // Validate regex
    try {
      new RegExp(pattern, flags);
    } catch {
      toast.error("Invalid regex pattern");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/filters/rules", {
        method: "POST",
        body: JSON.stringify({ label: label.trim(), pattern: pattern.trim(), flags, replacement }),
      });
      toast.success("Rule added");
      setLabel("");
      setPattern("");
      setFlags("gi");
      setReplacement("");
      onAdded();
    } catch {
      toast.error("Failed to add rule");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Custom Rule</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            placeholder="My custom filter"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Replacement</Label>
          <Input
            placeholder="safe text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Pattern (regex)</Label>
          <Input
            placeholder="dangerous\\s+word"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="text-xs font-mono"
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5 w-16">
            <Label className="text-xs">Flags</Label>
            <Input
              value={flags}
              onChange={(e) => setFlags(e.target.value)}
              className="text-xs font-mono"
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={submitting || !label.trim() || !pattern.trim()}
            className="flex-1"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add Rule
          </Button>
        </div>
      </div>
    </div>
  );
}
