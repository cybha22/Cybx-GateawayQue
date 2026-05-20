"use client";

import { useChatStore } from "@/stores/chat";
import type { Model } from "@/stores/models";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search, Check } from "lucide-react";

interface Props {
  models: Model[];
  onOpen?: () => void;
}

export function ModelSelector({ models, onOpen }: Props) {
  const { selectedModel, setSelectedModel } = useChatStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 350);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setSearch(""), 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const filteredModels = models.filter(
    (m) =>
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filteredModels.reduce<Record<string, Model[]>>((acc, m) => {
    const provider = m.provider || "other";
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(m);
    return acc;
  }, {});

  const providerLabels: Record<string, string> = {
    kiro: "Kiro",
    other: "Other",
  };

  const currentModel = models.find((m) => m.id === selectedModel);
  const displayName = currentModel?.name || selectedModel;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) onOpen?.();
        }}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium",
          "hover:bg-accent/50 transition-colors",
          open && "bg-accent/50"
        )}
      >
        <span className="truncate max-w-[200px]">{displayName}</span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-[280px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
            "right-0"
          )}
        >
          {}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {}
          <div className="max-h-[300px] overflow-y-auto p-1">
            {Object.keys(grouped).length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                No models found
              </div>
            )}
            {Object.entries(grouped).map(([provider, providerModels]) => (
              <div key={provider} className="mb-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
                  {providerLabels[provider] || provider}
                </div>
                {providerModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-left transition-colors",
                      model.id === selectedModel
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50 text-foreground/80"
                    )}
                  >
                    <span className="flex-1 truncate">{model.name}</span>
                    {model.id === selectedModel && (
                      <Check className="size-3 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
