"use client";

import { useVisitorMarket } from "@/components/geo/use-visitor-market";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import { FOUNDING } from "@/lib/founding/config";

/** One price, in the visitor's currency only ("$250 CAD" or "$200 USD"). */
export function useFoundingPriceLabel(): string {
  const t = useT("foundingClient");
  const us = useVisitorMarket() === "US";
  return us ? fmt(t.priceUs, { n: FOUNDING.priceUsd }) : fmt(t.priceCa, { n: FOUNDING.priceCad });
}

export function FoundingPrice() {
  const t = useT("foundingClient");
  return <>{fmt(t.oneTime, { price: useFoundingPriceLabel() })}</>;
}

/** Regular-plan comparison: "$249 CAD/year" in Canada, currency-free in the U.S. */
export function FoundingRegularPrice() {
  const t = useT("foundingClient");
  const us = useVisitorMarket() === "US";
  return <>{us ? t.regularUs : fmt(t.regularCa, { n: FOUNDING.regularAnnualCad })}</>;
}
