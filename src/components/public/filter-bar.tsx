"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

type Option = { slug: string; name: string };

export function FilterBar({
  categories,
  regions,
  propertyTypes,
  showVerified,
  sortOptions,
  sticky = true,
}: {
  categories: Option[];
  regions: Option[];
  propertyTypes: Option[];
  showVerified?: boolean;
  sortOptions?: { value: string; label: string }[];
  /** Stick the bar to the top on scroll. Default true. */
  sticky?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
    setQ("");
  }

  // Build the active-filter chip list. Each chip knows how to remove itself.
  const activeChips = useMemo(() => {
    const out: { key: string; label: string; value: string }[] = [];
    const cat = params.get("category");
    const reg = params.get("region");
    const pt = params.get("propertyType");
    const ver = params.get("verified");
    const kw = params.get("q");
    if (kw) out.push({ key: "q", label: "Keyword", value: kw });
    if (cat) {
      const m = categories.find((c) => c.slug === cat);
      out.push({ key: "category", label: "Category", value: m?.name ?? cat });
    }
    if (reg) {
      const m = regions.find((r) => r.slug === reg);
      out.push({ key: "region", label: "Region", value: m?.name ?? reg });
    }
    if (pt) {
      const m = propertyTypes.find((p) => p.slug === pt);
      out.push({ key: "propertyType", label: "Property type", value: m?.name ?? pt });
    }
    if (ver) out.push({ key: "verified", label: "Verified", value: "Only verified" });
    return out;
  }, [params, categories, regions, propertyTypes]);

  return (
    <div className={cn(sticky && "sticky top-[72px] z-30 -mx-4 px-4 pt-4 sm:-mx-0 sm:px-0 sm:pt-0")}>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-lg border border-border bg-card/95 p-4 backdrop-blur sm:flex-row sm:flex-wrap sm:items-end",
          sticky && "shadow-sm",
        )}
      >
        <form
          className="flex-1 sm:min-w-[220px]"
          onSubmit={(e) => {
            e.preventDefault();
            update("q", q || null);
          }}
        >
          <label className="eyebrow mb-1 block text-muted-foreground">Keyword</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => {
                // Commit on blur as well as submit, so users who tab away don't lose
                // their keyword.
                if ((params.get("q") ?? "") !== q) update("q", q || null);
              }}
              placeholder="Search…"
              className="h-9 pl-8"
            />
          </div>
        </form>

        <FilterField label="Category">
          <SearchableSelect
            options={categories}
            value={params.get("category")}
            onChange={(v) => update("category", v)}
            placeholder="All categories"
            allLabel="All categories"
          />
        </FilterField>

        <FilterField label="Region">
          <SearchableSelect
            options={regions}
            value={params.get("region")}
            onChange={(v) => update("region", v)}
            placeholder="All regions"
            allLabel="All regions"
          />
        </FilterField>

        <FilterField label="Property type">
          <SearchableSelect
            options={propertyTypes}
            value={params.get("propertyType")}
            onChange={(v) => update("propertyType", v)}
            placeholder="All property types"
            allLabel="All property types"
          />
        </FilterField>

        {sortOptions && (
          <FilterField label="Sort" widthClass="sm:w-44">
            {/* Sort stays a plain Select — only 2-3 options, no search needed. */}
            <Select value={params.get("sort") ?? sortOptions[0]?.value} onValueChange={(v) => update("sort", v)}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {sortOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        )}

        {showVerified && (
          <div className="self-end">
            <button
              type="button"
              onClick={() => update("verified", params.get("verified") ? null : "1")}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                params.get("verified")
                  ? "border-teal-400 bg-teal-100 text-teal-ink"
                  : "border-border bg-card text-muted-foreground hover:border-teal-400 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-colors",
                  params.get("verified") ? "bg-teal-ink" : "bg-border",
                )}
              />
              Verified only
            </button>
          </div>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Filters</span>
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                if (c.key === "q") setQ("");
                update(c.key, null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80 hover:border-teal-400 hover:text-foreground"
            >
              <span className="text-muted-foreground">{c.label}:</span>
              <span className="text-foreground">{c.value}</span>
              <X className="size-3 text-muted-foreground" />
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="ml-1 h-7 px-2 text-xs"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
  widthClass = "sm:w-56",
}: {
  label: string;
  children: React.ReactNode;
  widthClass?: string;
}) {
  return (
    <div className={cn("w-full", widthClass)}>
      <label className="eyebrow mb-1 block text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
