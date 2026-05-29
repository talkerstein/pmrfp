"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
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

type Option = { slug: string; name: string };

export function FilterBar({
  categories,
  regions,
  propertyTypes,
  showVerified,
  sortOptions,
}: {
  categories: Option[];
  regions: Option[];
  propertyTypes: Option[];
  showVerified?: boolean;
  sortOptions?: { value: string; label: string }[];
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

  const hasFilters = ["category", "region", "propertyType", "verified", "q", "sort"].some((k) =>
    params.get(k),
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
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
            placeholder="Search…"
            className="pl-8"
          />
        </div>
      </form>

      <FilterSelect label="Category" value={params.get("category")} onChange={(v) => update("category", v)} options={categories} />
      <FilterSelect label="Region" value={params.get("region")} onChange={(v) => update("region", v)} options={regions} />
      <FilterSelect label="Property type" value={params.get("propertyType")} onChange={(v) => update("propertyType", v)} options={propertyTypes} />

      {sortOptions && (
        <div className="sm:w-44">
          <label className="eyebrow mb-1 block text-muted-foreground">Sort</label>
          <Select value={params.get("sort") ?? sortOptions[0]?.value} onValueChange={(v) => update("sort", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {sortOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showVerified && (
        <Button
          type="button"
          variant={params.get("verified") ? "default" : "outline"}
          onClick={() => update("verified", params.get("verified") ? null : "1")}
        >
          Verified only
        </Button>
      )}

      {hasFilters && (
        <Button type="button" variant="ghost" onClick={() => router.push(pathname)}>
          <X className="size-4" /> Clear
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <div className="sm:w-48">
      <label className="eyebrow mb-1 block text-muted-foreground">{label}</label>
      <Select value={value ?? "all"} onValueChange={(v) => onChange(v ?? "all")}>
        <SelectTrigger><SelectValue placeholder={`All`} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.slug} value={o.slug}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
