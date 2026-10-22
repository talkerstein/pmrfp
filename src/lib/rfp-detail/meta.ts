/**
 * Page title and meta description for a listing, by what kind of listing it
 * is, in English, French and Spanish. Fixes the 2026-10-22 depth-study find:
 * a public tender whose summary does not start "Public tender from …" (every
 * Toronto and CanadaBuys listing) was described as "Property manager tender".
 *
 * Pure. The words are in i18n/messages/rfpDepth.ts under `meta`.
 */
import { publicTenderSource } from "@/lib/tenders/sources";
import { isGcPackage } from "@/lib/gc/packages";
import { buyerFromSummary as awardBuyerFromSummary } from "@/lib/data/monthly-winners";
import { buyerFromSummary, cleanTenderTitle, cutAtWord, placeLabel } from "@/lib/seo/rfp-meta";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";

export type MetaCopy = Messages["rfpDepth"]["meta"];

/** public: an open public tender. closedTender: a public tender past its closing date. award: a past public contract. */
export type MetaKind = "public" | "closedTender" | "award" | "gc" | "town" | "pm";

export function metaKindOf(r: { slug: string; sourceType: string | null; status: string }): MetaKind {
  if (isGcPackage(r)) return "gc";
  if (r.sourceType === "public_buyer_direct") return "town";
  if (r.sourceType === "public_source") {
    const s = publicTenderSource(r.slug);
    if (s.past) return "award";
    if (s.closedArchive || r.status !== "open") return "closedTender";
    return "public";
  }
  return "pm";
}

const ARTICLE = /^(?:(?:the|le|la|les|el|los|las)\s+|l['’])/i;

/** "the City of Toronto" → "City of Toronto"; "a Quebec public body" → null (no one buyer to name). */
export function specificIssuer(issuer: string | null | undefined): string | null {
  const s = issuer?.trim();
  if (!s || !ARTICLE.test(s)) return null;
  const name = s.replace(ARTICLE, "").trim();
  return name || null;
}

/** Feeds whose "issuer" is only the portal's owner, not who is buying (CanadaBuys carries other governments' notices too). */
const PORTAL_ONLY_FEEDS = new Set(["canadabuys", "canadabuys-closed", "awards"]);

/**
 * The buyer a listing names: from its own summary (open tender or award
 * notice), else the feed's issuer when that is one specific body, else null.
 */
export function metaBuyer(r: { summary: string | null }, issuer: string | null | undefined, feedKey?: string | null): string | null {
  const fromFeed = feedKey && PORTAL_ONLY_FEEDS.has(feedKey) ? null : specificIssuer(issuer);
  // "the City of Toronto (Facilities)" → "City of Toronto": the article and the division are not part of the name.
  const tidy = (s: string | null) => s?.replace(/^the\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim() || null;
  return tidy(buyerFromSummary(r.summary)) ?? tidy(awardBuyerFromSummary(r.summary)) ?? fromFeed;
}

export interface MetaInput {
  t: MetaCopy;
  kind: MetaKind;
  title: string;
  buyer: string | null;
  city: string | null;
  /** Already in the page's language. */
  province: string | null;
  /** Closing (or award) date, already formatted, or null. */
  date: string | null;
}

/** Longest tender name kept in a <title>; Google shows about 60 characters and searchers type the name. */
const TITLE_NAME_MAX = 88;

export function buildRfpMeta(i: MetaInput): { title: string; description: string } {
  const { t, kind } = i;
  const name = cleanTenderTitle(i.title);
  const place = placeLabel(i.city, i.province);
  // Don't repeat the city when the tender's own name already says it.
  const named = place && !name.toLowerCase().includes((i.city ?? place).toLowerCase());
  const cut = cutAtWord(name, TITLE_NAME_MAX);
  const title = named ? fmt(t.titlePlace, { title: cut, place }) : cut;

  const where = place ? fmt(t.where, { place }) : "";
  const lead = i.buyer ? fmt(t.lead[kind], { buyer: i.buyer, where }) : fmt(t.leadNoBuyer[kind], { where });
  const when = i.date ? fmt(t.date[kind], { date: i.date }) : "";
  const body = cutAtWord(name, 120).replace(/[.…]+$/, "");
  const description = cutAtWord(`${lead}${when} ${body}.${t.tail[kind]}`, 300);
  return { title, description };
}
