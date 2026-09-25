"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { visitorMarket, visitorRegionSlug } from "@/lib/visitor-geo";
import { useVisitorGeo } from "@/components/geo/use-visitor-geo";

export interface FinderPlace {
  slug: string;
  name: string;
  country: "CA" | "US";
  /** 0 = country, 1 = province/state, 2+ = inside it. The list arrives in map order (lib/data/place-order). */
  depth: number;
}

/**
 * "Is this useful to me?" before any sign-up: pick a trade and an area, see how
 * many tenders are open right now, and go straight to them. The area defaults
 * to the visitor's province/state (IP geolocation). Counts come from the
 * server (openCountsByTradeRegion) — no client fetching.
 */
export function JobFinder({
  trades,
  places,
  counts,
  livePages,
}: {
  trades: { slug: string; name: string }[];
  places: FinderPlace[];
  /** "trade|place" and "trade|*" → open tenders. */
  counts: Record<string, number>;
  /** "trade|place" combos with a /trades/[trade]/[place] page. */
  livePages: string[];
}) {
  const geo = useVisitorGeo();
  const [trade, setTrade] = useState("");
  const [place, setPlace] = useState("");
  const [touched, setTouched] = useState(false);

  // Default the area to where the visitor is, unless they already picked one.
  useEffect(() => {
    if (!geo || touched) return;
    const home = visitorRegionSlug(geo);
    const country = visitorMarket(geo) === "US" ? "united-states" : "canada";
    const pick = [home, country].find((s) => s && places.some((p) => p.slug === s));
    // Geolocation arrives after mount; this is the one-time sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pick) setPlace(pick);
  }, [geo, touched, places]);

  const tradeName = trades.find((t) => t.slug === trade)?.name;
  const placeName = places.find((p) => p.slug === place)?.name;
  const n = trade ? counts[`${trade}|${place || "*"}`] ?? 0 : null;
  const everywhere = trade ? counts[`${trade}|*`] ?? 0 : 0;
  const live = trade && place && livePages.includes(`${trade}|${place}`);
  const href = !trade ? "/rfps" : live ? `/trades/${trade}/${place}` : `/trades/${trade}`;

  // Native <select> can't indent, so non-breaking spaces do it.
  const indent = (depth: number) => "    ".repeat(Math.max(0, depth - 1));

  const select =
    "h-12 w-full rounded-lg border-0 bg-white px-3 text-sm font-medium text-foreground shadow-sm focus:ring-2 focus:ring-teal-300";

  return (
    <div className="rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10 sm:p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="sr-only" htmlFor="finder-trade">Your trade</label>
        <select id="finder-trade" value={trade} onChange={(e) => setTrade(e.target.value)} className={select}>
          <option value="">Your trade</option>
          {trades.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
              {counts[`${t.slug}|*`] ? ` (${counts[`${t.slug}|*`]} open)` : ""}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="finder-place">Your area</label>
        <select
          id="finder-place"
          value={place}
          onChange={(e) => {
            setTouched(true);
            setPlace(e.target.value);
          }}
          className={select}
        >
          <option value="">Anywhere</option>
          {(["CA", "US"] as const).map((c) => (
            <optgroup key={c} label={c === "CA" ? "Canada" : "United States"}>
              {places
                .filter((p) => p.country === c)
                .map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.depth === 0 ? `All of ${c === "CA" ? "Canada" : "the U.S."}` : `${indent(p.depth)}${p.name}`}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <Link href={href} className={cn(buttonVariants({ size: "lg", variant: "accent" }), "h-12 active:scale-[0.98]")}>
          {n ? `Show ${n} ${n === 1 ? "job" : "jobs"}` : "See what's open"} <ArrowRight className="size-4" />
        </Link>
      </div>
      <p className="mt-3 min-h-5 px-1 text-sm text-indigo-100/80" aria-live="polite">
        {!trade
          ? "Pick your trade to see what's open near you right now."
          : n
            ? `${n} open ${tradeName?.toLowerCase()} ${n === 1 ? "tender" : "tenders"} ${placeName ? `in ${placeName}` : "across Canada and the U.S."} right now.`
            : `Nothing open in ${placeName ?? "that area"} today (${everywhere} elsewhere). Trade Pro emails you the morning one posts.`}
      </p>
    </div>
  );
}
