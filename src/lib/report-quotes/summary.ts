import { createHash, timingSafeEqual } from "node:crypto";
import { generateReviewToken, hashReviewToken, isWellFormedToken } from "@/lib/projects/tokens";
import { areaLine, groupItems, stripNames, type ReportCountry, type ReportItem, type ReportType, type Urgency } from "./rules";

/**
 * The Repair Cost Summary: one client-facing page per report with the
 * repair items grouped by trade, each group's status, and the REAL quotes
 * trades submitted (rfp_interests.quote_amount on the RFP the group became).
 * Pure, so every redaction rule is unit tested:
 *
 *   - No dollar figures except a quote a trade actually sent. Amounts the
 *     report (or the AI read of it) put in an item's text are removed.
 *   - People's names are stripped from every line, whoever typed them.
 *   - The street address and building only with the owner's opt-in; when it
 *     is off, they are also cut out of the report's title.
 *   - Never contact details, files or the trades' own notes.
 */

// ── Money: only real bids ────────────────────────────────────────────

const NUM = String.raw`\d[\d,]*(?:[.\s]\d+)*`;
const CUR_BEFORE = String.raw`(?:(?:CA|C|US|U\.S\.)?\$|\b(?:CAD|USD)\s?)`;
const CUR_AFTER = String.raw`(?:\s?\$|\s?(?:CAD|USD)\b)`;
const SUFFIX = String.raw`(?:\s?(?:k|K|M)\b)?`;
const ONE = String.raw`(?:${CUR_BEFORE}\s?${NUM}${SUFFIX}|${NUM}${SUFFIX}${CUR_AFTER})`;
/** "$1,500", "CA$800", "USD 300", "1 500 $", "$8k", and ranges "$8,000-$12,000" / "$800 to 1,200 $". */
const MONEY = new RegExp(String.raw`${ONE}(?:\s*(?:-|–|to|à|a)\s*(?:${ONE}|${NUM}${SUFFIX}))?`, "g");
/** Words a removed figure leaves hanging: "(est. )", "budget:", "approx." at the end of a clause. */
const DANGLING = /\b(?:est(?:imated?)?\.?|approx(?:imately|\.)?|environ|aprox(?:imadamente|\.)?|cost(?:s|o)?|co[uû]t|budget|presupuesto|price|prix|precio)\s*(?:of|de|:)?\s*(?:[-–~]|to)?\s*(?=[),;.]|$)/gi;

/** Removes dollar figures from text (cost estimates printed in a report or added by the AI). */
export function stripMoney(text: string): string {
  if (!text) return text;
  // A stray "$" with no figure goes too, so no dollar sign survives at all.
  const removed = text.replace(MONEY, " ").replace(/\$/g, " ");
  if (removed === text) return text;
  const out = removed.replace(DANGLING, " ");
  return out
    .replace(/\(\s*[-–~,;:]*\s*\)/g, "")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/[,;:]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** True when text still carries a currency figure (tests and a last-line guard). */
export function hasMoney(text: string): boolean {
  return /\$/.test(text) || new RegExp(MONEY.source).test(text);
}

// ── Place and title ──────────────────────────────────────────────────

export interface SummaryPlace {
  buildingName?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  region?: string | null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STREET_WORDS =
  "St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Cres|Crescent|Ct|Court|Way|Lane|Ln|Pl|Place|Terr|Terrace|Trail|Trl|Pkwy|Parkway|Hwy|Highway|Cir|Circle|Sq|Square|Gate|Grove";
/** "12 Elm St", "1405-88 Harbour Street", "221B Baker Street", "4500 rue Sherbrooke", "12 chemin du Lac". */
const STREET = new RegExp(
  String.raw`\b(?:(?:unit|suite|apt)\.?\s*\w+[,\s]+)?\d{1,6}(?:-\d{1,6})?[A-Za-z]?\s+(?:(?:(?:rue|chemin|boul(?:evard|\.)?|av(?:enue|\.)?|calle|avenida)\s+(?:(?:de|du|des|la|le|del)\s+)?[\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]*){0,3})|(?:(?:[\p{Lu}][\p{L}'’.-]*|\d{1,3}(?:st|nd|rd|th))\s+){1,3}(?:${STREET_WORDS})\b\.?(?:\s+(?:N|S|E|W|North|South|East|West))?)`,
  "gu",
);

function tidy(s: string): string {
  return s
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[-–—,:]\s*(?=[-–—,:]|$)/g, "")
    .replace(/^\s*[-–—,:]\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Remove the building and street (the typed ones, and anything shaped like a street address). */
export function stripAddress(text: string, place: SummaryPlace): string {
  let out = text;
  for (const part of [place.streetAddress, place.buildingName].map((x) => (x ?? "").trim()).filter((x) => x.length >= 3)) {
    out = out.replace(new RegExp(escapeRe(part), "gi"), " ");
  }
  out = out.replace(STREET, " ");
  return out === text ? text : tidy(out);
}

/**
 * The title as shared: names stripped, money stripped, and (unless the
 * owner opted in) the street address taken out. Falls back when nothing is left.
 */
export function summaryTitle(title: string, place: SummaryPlace, includeAddress: boolean, fallback: string): string {
  let out = stripMoney(stripNames(title.replace(/\s+/g, " ").trim()));
  if (!includeAddress) out = stripAddress(out, place);
  return out.replace(/^[\s\-–—,:]+|[\s\-–—,:]+$/g, "").trim() || fallback;
}

/** The address line, only with the opt-in. */
export function summaryAddress(place: SummaryPlace, includeAddress: boolean): string | null {
  if (!includeAddress) return null;
  const line = [place.buildingName, place.streetAddress].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
  return line || null;
}

// ── Building the summary ─────────────────────────────────────────────

export type QuoteKind = "estimate" | "firm";

/** The report row as stored (quote_reports columns). */
export interface SummaryReport {
  title: string;
  report_type: ReportType;
  country: ReportCountry;
  created_at: string;
  building_name: string | null;
  street_address: string | null;
  city: string | null;
  region: string | null;
}

export interface SummaryInput {
  report: SummaryReport;
  items: readonly Pick<ReportItem, "trade_slug" | "item" | "location" | "urgency">[];
  /** Trade group → RFP links (quote_report_rfps). */
  links: readonly { trade_slug: string; rfp_id: string }[];
  /** The linked RFPs (already checked to belong to the report's organization). */
  rfps: readonly { id: string; status: string; created_at: string; published_at: string | null }[];
  /** Responses to those RFPs (rfp_interests): what each trade actually sent. */
  responses: readonly {
    rfp_id: string;
    trade_organization_id: string;
    quote_amount: number | string | null;
    quote_kind: string | null;
    start_date: string | null;
    created_at: string;
  }[];
  /** Trade company id → name. */
  tradeNames: Readonly<Record<string, string>>;
  /** Trade company id → when a current insurance certificate was uploaded to the owner's tracker. */
  insurance: Readonly<Record<string, string>>;
  /** Quote requests sent to trusted trades (quote_report_sends). */
  sends: readonly { trade_slug: string; initiated_at: string }[];
  includeAddress: boolean;
  /** Title when redaction leaves nothing ("Inspection report"). */
  fallbackTitle: string;
}

export interface SummaryQuote {
  rfpId: string;
  tradeName: string;
  /** A bid a trade submitted. Null when the trade responded without a price. */
  amount: number | null;
  kind: QuoteKind | null;
  startDate: string | null;
  receivedAt: string;
  /** "Insurance certificate on file (uploaded …)": only when the owner's tracker has one. */
  insuranceUploadedAt: string | null;
}

export type GroupStatus =
  | { kind: "notRequested" }
  | { kind: "requested"; on: string }
  | { kind: "quotes"; count: number };

export interface SummaryGroup {
  tradeSlug: string | null;
  items: { item: string; location: string; urgency: Urgency }[];
  counts: Record<Urgency, number>;
  status: GroupStatus;
  quotes: SummaryQuote[];
  /** For the owner's own view only (links to the responses). */
  rfpIds: string[];
}

export interface Summary {
  title: string;
  reportType: ReportType;
  country: ReportCountry;
  reportDate: string;
  area: string;
  address: string | null;
  groups: SummaryGroup[];
  itemCount: number;
  quoteCount: number;
}

const MAX_AMOUNT = 1_000_000_000;

/** A trade's bid as stored, or null (bad or missing values never become a figure). */
export function bidAmount(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ? n : null;
}

function earliest(dates: readonly (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => Boolean(d) && !Number.isNaN(new Date(d as string).getTime()));
  if (!valid.length) return null;
  return valid.reduce((a, b) => (new Date(a).getTime() <= new Date(b).getTime() ? a : b));
}

/** RFPs that never reached trades don't count as a request. */
const NOT_REQUESTED = new Set(["rejected"]);

export function buildSummary(input: SummaryInput): Summary {
  const { report, includeAddress } = input;
  const place: SummaryPlace = { buildingName: report.building_name, streetAddress: report.street_address, city: report.city, region: report.region };
  const rfpById = new Map(input.rfps.map((r) => [r.id, r]));
  const linksBySlug = new Map<string, string[]>();
  for (const l of input.links) {
    if (!rfpById.has(l.rfp_id)) continue;
    const list = linksBySlug.get(l.trade_slug) ?? [];
    if (!list.includes(l.rfp_id)) list.push(l.rfp_id);
    linksBySlug.set(l.trade_slug, list);
  }

  const cleanItems = input.items
    .map((i) => ({
      trade_slug: i.trade_slug,
      item: stripMoney(stripNames(i.item ?? "")),
      location: stripMoney(stripNames(i.location ?? "")),
      urgency: i.urgency,
    }))
    .filter((i) => i.item.length > 0);

  const groups: SummaryGroup[] = groupItems(cleanItems).map((g) => {
    const rfpIds = g.tradeSlug ? linksBySlug.get(g.tradeSlug) ?? [] : [];
    const quotes: SummaryQuote[] = input.responses
      .filter((r) => rfpIds.includes(r.rfp_id))
      .map((r) => ({
        rfpId: r.rfp_id,
        tradeName: input.tradeNames[r.trade_organization_id] ?? "",
        amount: bidAmount(r.quote_amount),
        kind: r.quote_kind === "firm" || r.quote_kind === "estimate" ? (r.quote_kind as QuoteKind) : null,
        startDate: r.start_date,
        receivedAt: r.created_at,
        insuranceUploadedAt: input.insurance[r.trade_organization_id] ?? null,
      }))
      .filter((q) => q.tradeName)
      .sort((a, b) => (a.amount ?? Infinity) - (b.amount ?? Infinity) || new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

    const requestedOn = g.tradeSlug
      ? earliest([
          ...rfpIds.map((id) => rfpById.get(id)).filter((r) => r && !NOT_REQUESTED.has(r.status)).map((r) => r!.published_at ?? r!.created_at),
          ...input.sends.filter((s) => s.trade_slug === g.tradeSlug).map((s) => s.initiated_at),
        ])
      : null;
    const status: GroupStatus = quotes.length ? { kind: "quotes", count: quotes.length } : requestedOn ? { kind: "requested", on: requestedOn } : { kind: "notRequested" };
    return {
      tradeSlug: g.tradeSlug,
      items: g.items.map((i) => ({ item: i.item, location: i.location, urgency: i.urgency })),
      counts: g.counts,
      status,
      quotes,
      rfpIds,
    };
  });

  return {
    title: summaryTitle(report.title, place, includeAddress, input.fallbackTitle),
    reportType: report.report_type,
    country: report.country,
    reportDate: report.created_at,
    area: areaLine(place),
    address: summaryAddress(place, includeAddress),
    groups,
    itemCount: cleanItems.length,
    quoteCount: groups.reduce((n, g) => n + g.quotes.length, 0),
  };
}

/** The currency a report's bids are in: by the report's country, never mixed. */
export function summaryCurrency(country: ReportCountry): "CAD" | "USD" {
  return country === "US" ? "USD" : "CAD";
}

// ── The share link ───────────────────────────────────────────────────

/**
 * The read-only share link. The raw token exists only in the link the owner
 * copies (shown once); the table keeps its sha256. Replacing makes a new
 * token, turning off clears the hash: the old link opens nothing.
 */
export function newSummaryToken(): string {
  return generateReviewToken();
}

export function hashSummaryToken(token: string): string {
  return hashReviewToken(token);
}

export function isSummaryToken(token: string | null | undefined): token is string {
  return typeof token === "string" && isWellFormedToken(token);
}

/** May this token open this summary? Only a well-formed token whose hash is the current one. */
export function summaryTokenOpens(storedHash: string | null | undefined, token: string | null | undefined): boolean {
  if (!isSummaryToken(token) || !storedHash || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const a = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Where a share token opens the summary (the language prefix is added by the caller). */
export function summarySharePath(token: string): string {
  return `/repair-summary/${token}`;
}
