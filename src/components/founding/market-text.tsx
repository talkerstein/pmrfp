"use client";

import { useVisitorMarket } from "@/components/geo/use-visitor-market";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import { FOUNDING } from "@/lib/founding/config";

/** Fixed-width placeholder shown until the visitor's market is known (no currency, no number). */
export function PriceSkeleton({ width = "6rem" }: { width?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[0.9em] animate-pulse rounded bg-muted align-middle"
      style={{ width }}
    />
  );
}

/** One price in the visitor's currency ("$250 CAD" or "$200 USD"); null until the market is known. */
export function useFoundingPriceLabel(): string | null {
  const t = useT("foundingClient");
  const market = useVisitorMarket();
  if (market == null) return null;
  return market === "US" ? fmt(t.priceUs, { n: FOUNDING.priceUsd }) : fmt(t.priceCa, { n: FOUNDING.priceCad });
}

export function FoundingPrice() {
  const t = useT("foundingClient");
  const price = useFoundingPriceLabel();
  return price == null ? <PriceSkeleton width="9rem" /> : <>{fmt(t.oneTime, { price })}</>;
}

/** Regular-plan comparison: "$249 CAD/year" in Canada, currency-free in the U.S. */
export function FoundingRegularPrice() {
  const t = useT("foundingClient");
  const market = useVisitorMarket();
  if (market == null) return <PriceSkeleton width="10rem" />;
  return <>{market === "US" ? t.regularUs : fmt(t.regularCa, { n: FOUNDING.regularAnnualCad })}</>;
}
