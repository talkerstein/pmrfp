"use client";

/**
 * Searchable select / combobox. Used for long taxonomy filters (categories,
 * regions, property types) where a 40-item scroll is friction. Matches the
 * visual treatment of @/components/ui/select so the filter bar reads as one
 * cohesive control system.
 *
 * Behavior:
 *  - Trigger: same shape + sizing as SelectTrigger; shows selected option name.
 *  - Popover: search input at top; filtered list below; "All / Any" reset row
 *    pinned at top below the search.
 *  - Filter: case-insensitive substring match on `name`.
 *  - Keyboard: ⬆/⬇ navigate, Enter selects, Escape closes.
 *  - Click outside closes.
 *  - No animations / transitions per the muted aesthetic.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  slug: string;
  name: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "All",
  allLabel = "All",
  emptyText = "No matches",
  className,
}: {
  options: SearchableOption[];
  value: string | null;
  onChange: (slug: string | null) => void;
  placeholder?: string;
  allLabel?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.slug === value) ?? null;
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  // Reset query + highlight when opening / closing.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightIdx(0);
      // Focus the input next tick — Base UI portal-less popovers render synchronously.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  function selectAt(idx: number) {
    if (idx < 0) {
      // The "all" reset row.
      onChange(null);
    } else {
      const opt = filtered[idx];
      if (opt) onChange(opt.slug);
    }
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectAt(highlightIdx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "hover:bg-secondary/40",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="line-clamp-1 text-left">{selected ? selected.name : placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5"
        >
          <div className="border-b border-border p-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightIdx(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search…"
                className="h-8 w-full rounded-md border border-transparent bg-secondary/40 pl-8 pr-7 text-sm outline-none focus:border-ring focus:bg-background"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <ul className="max-h-56 overflow-y-auto p-1">
            <li>
              <button
                type="button"
                onMouseEnter={() => setHighlightIdx(-1)}
                onClick={() => selectAt(-1)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                  highlightIdx === -1 ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                <span>{allLabel}</span>
                {value === null && <Check className="size-3.5 text-teal-ink" />}
              </button>
            </li>

            {filtered.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">{emptyText}</li>
            ) : (
              filtered.map((o, i) => (
                <li key={o.slug}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlightIdx(i)}
                    onClick={() => selectAt(i)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                      i === highlightIdx ? "bg-secondary text-foreground" : "text-foreground/85 hover:bg-secondary/60",
                    )}
                  >
                    <span className="line-clamp-1">{o.name}</span>
                    {value === o.slug && <Check className="size-3.5 shrink-0 text-teal-ink" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
