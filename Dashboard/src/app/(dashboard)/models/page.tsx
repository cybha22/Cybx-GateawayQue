"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import { useModelsStore, type CustomModelRequest, type Model } from "@/stores/models";
import { Search, Copy, Check, Loader2, Brain, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { copyText } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Aws,
  Anthropic,
  OpenAI,
  Gemini,
  DeepSeek,
  Kimi,
  ChatGLM,
  Minimax,
  Grok,
  Qwen,
} from "@lobehub/icons";


function formatContextWindow(value: unknown): string | null {
  if (value == null) return null;
  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num)) return String(value);
  if (num >= 1_000_000)
    return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}M`;
  if (num >= 1_000)
    return `${(num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1)}K`;
  return String(num);
}

/* ------------------------------------------------------------------ */
/*  Model Card                                                         */
/* ------------------------------------------------------------------ */

function ModelIcon({ name }: { name: string }) {
  const s = String(name ?? "").toLowerCase();
  if (s.includes("claude") || s.includes("anthropic")) return <Anthropic className="size-6 shrink-0" />;
  if (s.includes("gpt")) return <OpenAI className="size-6 shrink-0" />;
  if (s.includes("gemini") || s.includes("gemma")) return <Gemini className="size-6 shrink-0" />;
  if (s.includes("deepseek")) return <DeepSeek className="size-6 shrink-0" />;
  if (s.includes("kimi")) return <Kimi className="size-6 shrink-0" />;
  if (s.includes("glm")) return <ChatGLM className="size-6 shrink-0" />;
  if (s.includes("minimax")) return <Minimax className="size-6 shrink-0" />;
  if (s.includes("grok")) return <Grok className="size-6 shrink-0" />;
  if (s.includes("qwen")) return <Qwen className="size-6 shrink-0" />;
  return <Brain className="size-6 shrink-0" />;
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "kiro") return <Aws className="size-5" />;
  return <Brain className="size-5" />;
}

const PROVIDER_META: Record<string, { label: string; prefix: string }> = {
  kiro: { label: "Kiro", prefix: "kr" },
};

function AddCustomModelDialog({ provider, onAdd }: { provider: string; onAdd: (model: CustomModelRequest) => Promise<Model> }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [upstreamModel, setUpstreamModel] = useState("");
  const [contextWindow, setContextWindow] = useState("");
  const [saving, setSaving] = useState(false);
  const meta = PROVIDER_META[provider];

  const reset = useCallback(() => {
    setId("");
    setName("");
    setUpstreamModel("");
    setContextWindow("");
  }, []);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await onAdd({
        provider,
        id,
        name,
        upstreamModel,
        contextWindow: contextWindow ? Number(contextWindow) : undefined,
        accountTier: provider === "kiro" ? "kiro_pro" : undefined,
      });
      toast.success(`Added ${created.id}`);
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add custom model");
    } finally {
      setSaving(false);
    }
  }, [contextWindow, id, name, onAdd, provider, reset, upstreamModel]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus className="size-3.5" />
        Add Model
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add {meta?.label ?? provider} Model</DialogTitle>
            <DialogDescription>
              The model ID will be accepted by CybxAI and mapped to the upstream model you enter.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">CybxAI Model ID</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{meta?.prefix ?? provider}/</Badge>
                <Input value={id} onChange={(event) => setId(event.target.value)} placeholder="custom-model" required />
              </div>
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Display Name</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Custom Model" required />
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Upstream Model</span>
              <Input value={upstreamModel} onChange={(event) => setUpstreamModel(event.target.value)} placeholder="provider-real-model-id" required />
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Context Window</span>
              <Input value={contextWindow} onChange={(event) => setContextWindow(event.target.value)} placeholder="200000" inputMode="numeric" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Add Model
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModelCard({ model, index, onRemoveCustom }: { model: Model; index: number; onRemoveCustom?: (id: string) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await copyText(model.id);
      setCopied(true);
      toast.success(`Copied ${model.id}`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [model.id]);

  const contextWindow = formatContextWindow(model.contextWindow);

  const handleRemove = useCallback(async () => {
    if (!onRemoveCustom) return;
    setRemoving(true);
    try {
      await onRemoveCustom(model.id);
      toast.success(`Removed ${model.id}`);
    } catch {
      toast.error("Failed to remove custom model");
    } finally {
      setRemoving(false);
    }
  }, [model.id, onRemoveCustom]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="flex items-center gap-3">
              <ModelIcon name={model.name} />
              <div className="flex flex-col">
                <CardTitle className="font-semibold">{model.name}</CardTitle>
                <span className="text-xs text-muted-foreground">{model.id}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              aria-label="Copy model ID"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
            {model.custom && onRemoveCustom && (
              <Dialog>
                <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-destructive" />}>
                  <Trash2 className="size-3.5" />
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Remove Custom Model</DialogTitle>
                    <DialogDescription>
                      This will remove <strong>{model.id}</strong> from the CybxAI custom model catalog.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                    <DialogClose render={<Button variant="destructive" onClick={handleRemove} disabled={removing} />}>
                      {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      Remove
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {contextWindow && (
              <Badge variant="secondary">
                {contextWindow} ctx
              </Badge>
            )}
            {model.provider && (
              <Badge variant="outline" className="text-[10px]">
                {model.provider}
              </Badge>
            )}
            {model.custom && (
              <Badge variant="secondary" className="text-[10px]">
                custom
              </Badge>
            )}
            {model.accountTier === "kiro_pro" && (
              <Badge variant="outline" className="border-sky-500/50 bg-sky-500/10 text-[10px] text-sky-500">
                Kiro Pro
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ModelsPage() {
  const { models, loading, error, fetch, addCustomModel, removeCustomModel } = useModelsStore();
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Flat filtered list for search mode
  const filteredFlat = models.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      (m.provider && m.provider.toLowerCase().includes(q))
    );
  });

  // Group models by provider for the non-search view
  const groups: Record<string, Model[]> = {};
  if (!loading && !error) {
    for (const m of models) {
      const p = m.provider || "";
      if (!groups[p]) groups[p] = [];
      groups[p].push(m);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Models</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Available AI models
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search models..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <Card className="mb-4 border-destructive/50">
          <CardContent className="flex items-center justify-between py-3">
            <span className="text-sm text-destructive">{error}</span>
            <Button variant="ghost" size="sm" onClick={fetch}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && (search ? filteredFlat.length === 0 : models.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          {search ? "No models match your search." : "No models available."}
        </div>
      )}

      {/* Model cards grid */}
      {!loading && (
        <>
          {search ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredFlat.map((model, i) => (
                <ModelCard key={model.id} model={model} index={i} onRemoveCustom={removeCustomModel} />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {(() => {
                let idx = 0;
                return Object.entries(groups).map(([providerKey, list]) => {
                  if (!list || list.length === 0) return null;
                  const meta = PROVIDER_META[providerKey] ?? { label: providerKey, prefix: providerKey };
                  return (
                    <section key={providerKey} aria-label={`${meta.label} models`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-lg font-semibold text-foreground/90">
                          <ProviderIcon provider={providerKey} />
                          <span>{meta.label} ({list.length} models)</span>
                        </div>
                        <AddCustomModelDialog provider={providerKey} onAdd={addCustomModel} />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {list.map((m) => (
                          <ModelCard key={m.id} model={m} index={idx++} onRemoveCustom={removeCustomModel} />
                        ))}
                      </div>
                    </section>
                  );
                });
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
