/**
 * Which PMRFP trades a history row is (building and property work only),
 * reusing the board's own rules so a trade means the same thing on every
 * page: English RULES / BUILDING_WORK (lib/tenders/shared), French RULES_FR
 * (lib/tenders/seao), and the same exclusions (consulting, IT, civil works
 * like roads and bridges).
 */
import { NOT_TRADE } from "@/lib/tenders/awards";
import { EXCLUDE, RULES, tradesFor } from "@/lib/tenders/shared";
import { EXCLUDE_FR, RULES_FR, fold } from "@/lib/tenders/seao";

/** Trade slugs for English text, [] when it isn't building-trade work. */
export function tradesEn(text: string): string[] {
  const t = text.toLowerCase();
  if (!t.trim() || EXCLUDE.test(t) || NOT_TRADE.test(t)) return [];
  return tradesFor(t);
}

/** Trade slugs for French text (accents folded), [] when it isn't building-trade work. */
export function tradesFr(text: string): string[] {
  const t = fold(text);
  if (!t.trim() || EXCLUDE_FR.test(t)) return [];
  return [...new Set(RULES_FR.filter(([, p]) => p.test(t)).map(([s]) => s))].slice(0, 3);
}

/** English or French: whichever finds trades. */
export function tradesAny(text: string): string[] {
  const en = tradesEn(text);
  return en.length ? en : tradesFr(text);
}

/** Trade words in a business name ("Neve Refrigeration", "B.K. Lawn Maintenance"): a hint, used only for generic building work. */
export function tradesFromName(name: string | null): string[] {
  if (!name) return [];
  const t = name.toLowerCase();
  return [...new Set(RULES.filter(([, p]) => p.test(t)).map(([s]) => s))].slice(0, 2);
}
