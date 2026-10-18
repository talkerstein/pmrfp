import { FOUNDING } from "@/lib/founding/config";
import { toUsd } from "@/lib/markets";
import type { MarketCode } from "@/lib/visitor-geo";
import type { Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";

/**
 * Prices in ONE currency per visitor: CAD in Canada, USD in the U.S. (CAD
 * converted at the given rate; the Founding 500 has its own fixed USD price).
 * Pure, so the server render and the client hook format the same string.
 */
export interface MarketMoney {
  market: MarketCode;
  currency: "CAD" | "USD";
  /** A CAD list price in the visitor's currency: "$249", "249 $", "$179". */
  money: (cad: number) => string;
  /** The Founding 500 one-time price in the visitor's currency. */
  founding: () => string;
}

/** "$1,234" (en/es) or "1 234 $" (fr), whole dollars. */
export function amountLabel(n: number, lang: Locale): string {
  const s = formatNumber(n, lang);
  return lang === "fr" ? `${s} $` : `$${s}`;
}

export function marketMoney(market: MarketCode, usdPerCad: number, lang: Locale): MarketMoney {
  const us = market === "US";
  return {
    market,
    currency: us ? "USD" : "CAD",
    money: (cad) => amountLabel(us ? toUsd(cad, usdPerCad) : cad, lang),
    founding: () => amountLabel(us ? FOUNDING.priceUsd : FOUNDING.priceCad, lang),
  };
}

/** A sentence with prices: {name} takes a CAD amount from `cad`; {currency} and {founding} are filled in. */
export function priceLine(tpl: string, cad: Record<string, number>, m: MarketMoney): string {
  const vals: Record<string, string> = { currency: m.currency, founding: m.founding() };
  for (const [k, v] of Object.entries(cad)) vals[k] = m.money(v);
  return fmt(tpl, vals);
}
