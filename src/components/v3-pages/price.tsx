"use client";

import { useUsdPerCad, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { marketMoney, priceLine } from "@/lib/pricing/money";
import type { Locale } from "@/i18n/config";

/**
 * Prices in ONE currency per visitor, same rule as the homepage: CAD in Canada,
 * USD in the U.S. (today's rate). On a cached page a neutral placeholder shows
 * until the market is known, so a cached Canadian price never flashes for a
 * U.S. visitor; under a ServerMarketProvider (dynamic pages such as /pricing)
 * the market is known on the server and the price is in the HTML.
 */
export function useMoney(lang: Locale) {
  const market = useVisitorMarket();
  const rate = useUsdPerCad();
  const m = marketMoney(market ?? "CA", rate, lang);
  return { known: market != null, currency: m.currency, money: m.money, founding: m.founding, line: (tpl: string, cad: Record<string, number>) => priceLine(tpl, cad, m) };
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
 * `cad`, {currency} and {founding} are filled in. The whole line waits for the market.
 */
export function PriceLine({ tpl, cad, lang, w = "14em" }: { tpl: string; cad: Record<string, number>; lang: Locale; w?: string }) {
  const m = useMoney(lang);
  if (!m.known) return <Sk w={w} />;
  return <>{m.line(tpl, cad)}</>;
}
