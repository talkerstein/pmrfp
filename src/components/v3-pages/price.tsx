"use client";

import { useUsdPerCad, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { FOUNDING } from "@/lib/founding/config";
import { toUsd } from "@/lib/markets";
import type { Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";

/**
 * Prices in ONE currency per visitor, same rule as the homepage: CAD in Canada,
 * USD in the U.S. (today's rate), and a neutral placeholder until the market is
 * known so a cached Canadian price never flashes for a U.S. visitor.
 */
export function useMoney(lang: Locale) {
  const market = useVisitorMarket();
  const rate = useUsdPerCad();
  const known = market != null;
  const us = market === "US";
  const currency = us ? "USD" : "CAD";
  const fmtAmount = (n: number) => {
    const s = formatNumber(n, lang);
    return lang === "fr" ? `${s} $` : `$${s}`;
  };
  return {
    known,
    currency,
    money: (cad: number) => fmtAmount(us ? toUsd(cad, rate) : cad),
    founding: () => fmtAmount(us ? FOUNDING.priceUsd : FOUNDING.priceCad),
  };
}

/** Fixed-width placeholder while the currency is unknown. */
export function Sk({ w }: { w: string }) {
  return <span className="v3-sk" aria-hidden style={{ width: w }} />;
}

/** "$249" (or the placeholder). */
export function Money({ cad, lang, w = "3.2ch" }: { cad: number; lang: Locale; w?: string }) {
  const m = useMoney(lang);
  return m.known ? <>{m.money(cad)}</> : <Sk w={w} />;
}

/** "CAD" / "USD" (or the placeholder). */
export function Currency({ lang }: { lang: Locale }) {
  const m = useMoney(lang);
  return m.known ? <>{m.currency}</> : <Sk w="2.6em" />;
}

/**
 * A sentence with prices in it: {name} placeholders take CAD amounts from
 * `cad`, {currency} is filled in. The whole line waits for the market.
 */
export function PriceLine({ tpl, cad, lang, w = "14em" }: { tpl: string; cad: Record<string, number>; lang: Locale; w?: string }) {
  const m = useMoney(lang);
  if (!m.known) return <Sk w={w} />;
  const vals: Record<string, string> = { currency: m.currency, founding: m.founding() };
  for (const [k, v] of Object.entries(cad)) vals[k] = m.money(v);
  return <>{fmt(tpl, vals)}</>;
}
