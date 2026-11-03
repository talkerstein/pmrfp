import type { Messages } from "@/i18n/dictionaries";
import { fmt } from "@/i18n/format";
import type { RosterCountry, RosterRow } from "./rules";

/**
 * Labels for a roster row, shared by the editor, the emergency card, the
 * print view and the share page. Country-first spelling (mould / mold).
 */

type R = Messages["roster"];

export function rowLabel(r: RosterRow, t: R, country: RosterCountry): string {
  return r.category === "custom" ? r.customLabel || "" : t.categories[country][r.category];
}

/** "Hamilton, Ontario" (null when the building has neither). */
export function placeOf(r: { city: string | null; province: string | null }): string | null {
  return [r.city, r.province].filter(Boolean).join(", ") || null;
}

/** "a 24/7 plumber" for "Find {who} near {place}". */
export function findWhoFor(r: RosterRow, t: R, label: string): string {
  return r.category === "custom" ? fmt(t.findWho.custom, { trade: label.toLowerCase() }) : t.findWho[r.category];
}

/**
 * The trade named in the on-call contract RFP ("plumbing"). A custom row
 * uses its directory trade's name; no directory trade, no RFP.
 */
export function rfpTradeFor(r: RosterRow, t: R, tradeNames: ReadonlyMap<string, string>): string | null {
  if (!r.tradeSlug) return null;
  if (r.category !== "custom") return t.rfpTrade[r.category];
  return tradeNames.get(r.tradeSlug)?.toLowerCase() ?? null;
}
