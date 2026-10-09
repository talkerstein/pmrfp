/**
 * CanadaBuys closed tenders → a real "Closed" archive on the board.
 *
 * The Government of Canada publishes every tender notice it ever posted as
 * open data (CanadaBuys "Tender notices, <fiscal year>", Open Government
 * Licence – Canada, commercial reuse with attribution). Those yearly files
 * hold only notices that are no longer open — status "Expired" (closed on its
 * real closing date) or "Cancelled".
 *
 * We list the Expired building-trade ones from the last ~18 months exactly as
 * published: real title, real buyer, real closing date, a link to the
 * official CanadaBuys notice, and — when the award file has the contract for
 * the same solicitation — who won it and for how much, linked to the official
 * award notice. Nothing is invented; a notice without an award just says it
 * closed.
 *
 * They render as "Closed on <date>" (deadline = the real closing date, always
 * in the past), so every open count, alert, digest and "closing soon" list —
 * which all require a future deadline — skips them. Cancelled notices are
 * never imported.
 */
import { parseCsv } from "./csv";
import type { TenderInsert } from "./canadabuys";
import { classifyConstructionTitle, deliversInCanada, regionForTender } from "./canadabuys";
import { NOT_TRADE, fmtDate } from "./awards";
import { CIVIL, EXCLUDE, RULES, clean, slugify } from "./shared";
import { OGL_CANADA_ATTRIBUTION } from "./sources";

/** How far back the archive reaches: about 18 months of closed tenders. */
export const CLOSED_WINDOW_DAYS = 548;
/**
 * A tender drops out of the open file the day after it closes; waiting a few
 * days means the open feed has archived its row before the closed one lands,
 * so the same notice is never on the board twice.
 */
export const CLOSED_SETTLE_DAYS = 3;

export type ClosedRow = Record<string, string>;

const COL = {
  title: "title-titre-eng",
  ref: "referenceNumber-numeroReference",
  amendment: "amendmentNumber-numeroModification",
  solicitation: "solicitationNumber-numeroSollicitation",
  published: "publicationDate-datePublication",
  closing: "tenderClosingDate-appelOffresDateCloture",
  status: "tenderStatus-appelOffresStatut-eng",
  category: "procurementCategory-categorieApprovisionnement",
  noticeType: "noticeType-avisType-eng",
  entity: "contractingEntityName-nomEntitContractante-eng",
  delivery: "regionsOfDelivery-regionsLivraison-eng",
  description: "tenderDescription-descriptionAppelOffres-eng",
  // award file
  supplier: "supplierLegalName-nomLegalFournisseur-eng",
  supplierCity: "supplierAddressCity-fournisseurAdresseVille-eng",
  awarded: "contractAwardDate-dateAttributionContrat",
  amount: "contractAmount-montantContrat",
  total: "totalContractValue-valeurTotaleContrat",
  currency: "contractCurrency-contratMonnaie",
} as const;

const SKIP_NOTICE_TYPES = new Set([
  "",
  "Advance Contract Award Notice",
  "Directed Contract",
  "Not Applicable",
  "Request for Information",
]);

/**
 * Reference formats whose CanadaBuys notice page lives at
 * /tender-notice/<lowercase reference> (verified live 2026-10-09 for cb-…,
 * WS…-Doc… and MX-… references; SSC "…:T" references 404, so they're skipped).
 */
export const CLOSED_REF = /^(?:cb-\d+-\d+|ws\d+-doc\d+|mx-\d+)$/;

export function closedNoticeUrl(refSlug: string): string {
  return `https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/${refSlug}`;
}

function daysBefore(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** First calendar year of the federal fiscal year (April–March) holding `date`. */
export function fiscalYearStart(date: string): number {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 4 ? y : y - 1;
}

/** Fiscal years the archive window touches, oldest first. */
export function fiscalYearsInWindow(today: string): number[] {
  const out: number[] = [];
  for (let y = fiscalYearStart(daysBefore(today, CLOSED_WINDOW_DAYS)); y <= fiscalYearStart(today); y++) out.push(y);
  return out;
}

export function tenderFileUrl(fy: number): string {
  return `https://canadabuys.canada.ca/opendata/pub/${fy}-${fy + 1}-TenderNotice-AvisAppelOffres.csv`;
}

export function awardFileUrl(fy: number): string {
  return `https://canadabuys.canada.ca/opendata/pub/${fy}-${fy + 1}-awardNotice-avisAttribution.csv`;
}

/** Each notice appears once per amendment; keep the newest amendment per reference. */
export function latestAmendments(rows: ClosedRow[]): ClosedRow[] {
  const latest = new Map<string, ClosedRow>();
  for (const r of rows) {
    const ref = (r[COL.ref] ?? "").trim();
    if (!ref) continue;
    const prev = latest.get(ref);
    if (!prev || (r[COL.amendment] ?? "") > (prev[COL.amendment] ?? "")) latest.set(ref, r);
  }
  return [...latest.values()];
}

/** PMRFP trade slugs (max 3) for a closed notice, or [] to leave it out. */
export function classifyClosedTender(r: ClosedRow, today: string): string[] {
  // Expired = closed on schedule. Cancelled notices never ran; skip them.
  if ((r[COL.status] ?? "").trim() !== "Expired") return [];
  if (!/SRV|CNST/.test(r[COL.category] ?? "")) return [];
  if (SKIP_NOTICE_TYPES.has((r[COL.noticeType] ?? "").trim())) return [];
  const closing = (r[COL.closing] ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closing)) return [];
  if (closing > daysBefore(today, CLOSED_SETTLE_DAYS) || closing < daysBefore(today, CLOSED_WINDOW_DAYS)) return [];
  if (!CLOSED_REF.test(slugify(r[COL.ref] ?? ""))) return [];
  if (!deliversInCanada(r[COL.delivery] ?? "")) return [];

  const title = (r[COL.title] ?? "").toLowerCase();
  if (!title || EXCLUDE.test(title) || NOT_TRADE.test(title) || CIVIL.test(title)) return [];
  // Title only: a closed listing must *say* it's trade work.
  const matched = RULES.filter(([, p]) => p.test(title)).map(([slug]) => slug).slice(0, 3);
  if (matched.length) return matched;
  return /CNST/.test(r[COL.category] ?? "") ? classifyConstructionTitle(title) : [];
}

export interface ClosedAward {
  ref: string;
  supplier: string;
  city: string;
  date: string;
  value: string | null;
}

function awardKey(solicitation: string, entity: string): string {
  return `${solicitation.trim().toLowerCase()}|${entity.trim().toLowerCase()}`;
}

/**
 * Award notices by (solicitation number, buyer). Only original awards (not
 * amendments), with a named supplier, paid in CAD, dated by today. A
 * solicitation that produced several contracts (standing offers) is left
 * unlinked rather than picking one winner.
 */
export function indexAwards(rows: ClosedRow[], today: string): Map<string, ClosedAward> {
  const found = new Map<string, ClosedAward | null>();
  for (const a of rows) {
    if ((a[COL.amendment] ?? "000") !== "000") continue;
    const sol = (a[COL.solicitation] ?? "").trim();
    const supplier = clean(a[COL.supplier] ?? "");
    const date = (a[COL.awarded] ?? "").slice(0, 10);
    const ref = (a[COL.ref] ?? "").trim();
    if (!sol || !supplier || !ref || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) continue;
    if ((a[COL.currency] || "CAD").trim() !== "CAD") continue;
    const key = awardKey(sol, a[COL.entity] ?? "");
    if (found.has(key)) {
      const prev = found.get(key);
      if (prev && prev.ref !== ref) found.set(key, null); // several contracts → ambiguous
      continue;
    }
    const v = Math.max(Number(a[COL.amount]) || 0, Number(a[COL.total]) || 0);
    found.set(key, {
      ref,
      supplier,
      city: clean(a[COL.supplierCity] ?? ""),
      date,
      value: v ? `$${Math.round(v).toLocaleString("en-CA")} CAD` : null,
    });
  }
  const out = new Map<string, ClosedAward>();
  for (const [k, v] of found) if (v) out.set(k, v);
  return out;
}

export function awardForTender(r: ClosedRow, awards: Map<string, ClosedAward>): ClosedAward | null {
  const sol = (r[COL.solicitation] ?? "").trim();
  if (!sol) return null;
  const award = awards.get(awardKey(sol, r[COL.entity] ?? ""));
  // An award dated before the tender closed belongs to something else.
  return award && award.date >= (r[COL.closing] ?? "").slice(0, 10) ? award : null;
}

/**
 * "Contract awarded March 3, 2026 to Acme Roofing (Halifax) — $123,456 CAD
 * (CanadaBuys award CW2466670)." Deliberately NOT at the start of the summary
 * and NOT "Awarded …": the award notice itself is already its own listing, and
 * every win counter parses summaries that start with "Awarded".
 */
export function awardSentence(a: ClosedAward): string {
  return `Contract awarded ${fmtDate(a.date)} to ${a.supplier}${a.city ? ` (${a.city})` : ""} — ${a.value ?? "value not disclosed"} (CanadaBuys award ${a.ref}).`;
}

/** Reads the award back out of a closed listing's summary (for the page). */
export function parseClosedAward(summary: string | null | undefined): {
  date: string;
  winner: string;
  value: string | null;
  ref: string;
} | null {
  const m = summary?.match(/Contract awarded (.+?) to (.+?) — (\$[\d,]+ CAD|value not disclosed) \(CanadaBuys award ([A-Za-z0-9:-]+)\)\./);
  if (!m) return null;
  return {
    date: m[1],
    winner: m[2].replace(/\s*\([^)]*\)\s*$/, "").trim(),
    value: m[3].startsWith("$") ? m[3] : null,
    ref: m[4],
  };
}

export function closedTenderToRfpInsert(r: ClosedRow, award: ClosedAward | null): TenderInsert | null {
  const title = clean(r[COL.title] ?? "");
  const ref = (r[COL.ref] ?? "").trim();
  const refSlug = slugify(ref);
  const closing = (r[COL.closing] ?? "").slice(0, 10);
  if (!title || !CLOSED_REF.test(refSlug) || !/^\d{4}-\d{2}-\d{2}$/.test(closing)) return null;
  const entity = clean(r[COL.entity] ?? "") || "the Government of Canada";
  const description = clean((r[COL.description] ?? "").replace(/&nbsp;/g, " "));
  const firstPara = description.split(/\n\s*\n/)[0] ?? "";
  const lead = `Public tender from ${entity}, closed ${fmtDate(closing)}.`;
  const awardLine = award ? ` ${awardSentence(award)}` : "";
  const room = Math.max(0, 420 - lead.length - awardLine.length);
  const snippet = firstPara.length > 20 && room > 60 ? ` ${firstPara.length > room ? `${firstPara.slice(0, room - 1).trimEnd()}…` : firstPara}` : "";
  const published = (r[COL.published] ?? "").slice(0, 10);

  return {
    title: title.length > 180 ? `${title.slice(0, 177)}…` : title,
    slug: `${slugify(title).slice(0, 60)}-cbc-${refSlug}`.replace(/-+/g, "-"),
    summary: `${lead}${awardLine}${snippet}`,
    scope: [lead + awardLine, description].filter(Boolean).join("\n\n").slice(0, 8000) || title,
    requirements: null,
    province: regionForTender(r).province,
    // The real closing date — always in the past, so the board shows it as
    // closed and every open count, alert and digest skips it.
    deadline: closing,
    submission_instructions:
      "This tender has closed — bids are no longer accepted. It's listed so trades can see what this buyer " +
      "tenders and when. Open the official CanadaBuys notice for the documents and any award. It did not go through PMRFP.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: closedNoticeUrl(refSlug),
    source_notes: `CanadaBuys closed tender ${ref} (status Expired)${award ? ` · award ${award.ref}` : ""} · ${entity}. ${OGL_CANADA_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    // Its real publication date — never "today", so it can't trigger a new-tender alert.
    published_at: /^\d{4}-\d{2}-\d{2}$/.test(published) ? `${published}T00:00:00Z` : `${closing}T00:00:00Z`,
  };
}

async function fetchCsv(url: string): Promise<ClosedRow[]> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
  // A fiscal year that hasn't started its file yet is fine; anything else is a failed download.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`CanadaBuys closed-tender fetch failed: HTTP ${res.status} (${url})`);
  return parseCsv(await res.text());
}

/** Every tender and award file the window needs (2–3 fiscal years each). */
export async function fetchClosedTenderData(today: string): Promise<{ tenders: ClosedRow[]; awards: ClosedRow[] }> {
  const years = fiscalYearsInWindow(today);
  const [tenders, awards] = await Promise.all([
    Promise.all(years.map((y) => fetchCsv(tenderFileUrl(y)))),
    Promise.all(years.map((y) => fetchCsv(awardFileUrl(y)))),
  ]);
  return { tenders: tenders.flat(), awards: awards.flat() };
}
