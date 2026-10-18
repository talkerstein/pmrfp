import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";
import { COMMERCIAL_PLATFORMS, linkOnly, type BuyerPage, type PlatformKey } from "./model";

type T = Messages["buyers"];

/** "bids&tenders and its own website" (en) / "bids&tenders, Bonfire et son propre site Web". */
export function platformList(keys: readonly PlatformKey[], t: T, and: string): string {
  const names = keys.map((k) => t.platforms[k]);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}

export const AND: Record<string, string> = { en: "and", fr: "et", es: "y" };

/** Commercial platforms this buyer uses (we link to them, never list their tenders). */
export const commercialOf = (p: BuyerPage) => p.buyer.platforms.filter((k) => COMMERCIAL_PLATFORMS.has(k));

/**
 * The page's questions and answers, shown on the page and as FAQPage
 * structured data (the two always match: one source).
 */
export function buyerFaq(p: BuyerPage, t: T, lang: string): { q: string; a: string }[] {
  const name = p.buyer.name;
  const and = AND[lang] ?? "and";
  const platform = platformList(p.buyer.platforms, t, and);
  const out: { q: string; a: string }[] = [];
  out.push({
    q: fmt(t.faq.whereQ, { name }),
    a: platform && p.buyer.tendersUrl ? fmt(t.faq.whereA, { name, platform, url: p.buyer.tendersUrl }) : fmt(t.faq.whereAUnknown, { name }),
  });
  const first = p.buyer.platforms[0] ?? "unknown";
  out.push({ q: fmt(t.faq.registerQ, { name }), a: (t.tips[first] ?? t.tips.unknown).join(" ") });
  const winners = p.awards.topWinners.slice(0, 3);
  out.push({
    q: fmt(t.faq.winnersQ, { name }),
    a: winners.length ? fmt(t.faq.winnersA, { winners: winners.map((w) => `${w.name} (${w.awards})`).join(", ") }) : fmt(t.faq.winnersNone, { name }),
  });
  if (p.buyer.platforms.length) {
    const commercial = commercialOf(p);
    out.push({
      q: fmt(t.faq.listQ, { name }),
      a: linkOnly(p.buyer) || commercial.length ? fmt(t.faq.listLinkOnly, { name, platform: platformList(commercial.length ? commercial : p.buyer.platforms, t, and) }) : fmt(t.faq.listOwn, { name }),
    });
  }
  return out;
}
