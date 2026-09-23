/**
 * SAM.gov → PMRFP public-tender feed (United States, federal).
 *
 * SAM.gov publishes every active federal contract opportunity as one daily
 * CSV ("Contract Opportunities" data extract, public, no key or account).
 * U.S. federal government data is public domain. ~85,000 rows, ~240 MB,
 * Windows-1252 — so it's streamed and filtered row by row; only the ~1,000
 * building and property rows are ever held in memory.
 *
 * Kept: open solicitations whose Product Service Code is building work —
 *   Z1/Z2  maintenance, repair and alteration of real property
 *   Y1     construction of structures and facilities
 *   J041/J045  HVAC/refrigeration and plumbing/heating equipment service
 *   S201/S207/S208/S214/S216/S218  janitorial, pest, grounds, carpet,
 *          facilities operations support, snow removal
 * with a place of performance in a U.S. state, DC or Puerto Rico.
 *
 * Pure apart from fetchSamOpenTenders(); the cron route owns the writes.
 */
import { RULES, clean, slugify } from "./shared";
import type { TenderInsert } from "./canadabuys";
import { US_STATES, usStateRegionSlug } from "@/lib/geo";

export { usStateRegionSlug };

export const SAM_OPEN_URL =
  "https://sam.gov/api/prod/fileextractservices/v1/api/download/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv?privacy=Public";

export { SAM_ATTRIBUTION } from "./sources";
import { SAM_ATTRIBUTION } from "./sources";

export type SamRow = Record<string, string>;

const BUILDING_PSC = /^(Z1|Z2|Y1|J041|J045|S201|S207|S208|S214|S216|S218)/;
const BIDDABLE = new Set(["Solicitation", "Combined Synopsis/Solicitation"]);

function stateOf(r: SamRow): string | null {
  const s = (r.PopState || "").trim().toUpperCase();
  return US_STATES[s] ? s : null;
}

/** Cheap pre-filter on the raw row, before any string cleanup. */
export function isSamCandidate(r: SamRow, today: string): boolean {
  if (!BIDDABLE.has(r.Type) || r.Active !== "Yes") return false;
  if (!BUILDING_PSC.test((r.ClassificationCode || "").toUpperCase())) return false;
  const closing = (r.ResponseDeadLine || "").slice(0, 10);
  if (!closing || closing < today) return false;
  return !!stateOf(r);
}

// The PSC code already guarantees building work, so the shared EXCLUDE list
// (tuned for CanadaBuys' mixed feed) is too blunt here: it drops every job at
// a "VA Medical Center" or an "Agricultural Research Center". Only drop what a
// trade can't bid: design, engineering and studies.
const SAM_EXCLUDE = /architect|\ba-?&-?e\b|engineering services|design services|feasibility|\bstudy\b|\bsurvey\b/;

// PSC → trade, for rows whose title names no trade ("W912DY-26-R-0042").
const PSC_TRADE: [prefix: string, slug: string][] = [
  ["J041", "hvac"],
  ["J045", "plumbing"],
  ["S201", "cleaning-janitorial"],
  ["S207", "pest-control"],
  ["S208", "landscaping"],
  ["S214", "flooring"],
  ["S216", "property-maintenance"],
  ["S218", "snow-removal"],
  ["Z1", "property-maintenance"],
  ["Z2", "general-contracting"],
  ["Y1", "general-contracting"],
];

/** PMRFP trade-category slugs (max 3), or [] to skip. */
export function classifySam(r: SamRow, today: string): string[] {
  if (!isSamCandidate(r, today)) return [];
  // Titles carry a PSC prefix: "Z--Roof Replacement", "S218--Snow Removal".
  const title = titleOf(r).toLowerCase();
  if (SAM_EXCLUDE.test(title)) return [];
  const byWords = RULES.filter(([, p]) => p.test(title)).map(([slug]) => slug);
  const psc = (r.ClassificationCode || "").toUpperCase();
  const byCode = PSC_TRADE.find(([prefix]) => psc.startsWith(prefix))?.[1];
  const out = byWords.length ? byWords : byCode ? [byCode] : [];
  return [...new Set(out)].slice(0, 3);
}

function titleOf(r: SamRow): string {
  return clean(r.Title || "").replace(/^[A-Z0-9]{1,4}\s*--\s*/, "");
}

export function samToRfpInsert(r: SamRow, today: string): TenderInsert | null {
  const url = (r.Link || "").trim();
  const title = titleOf(r);
  const state = stateOf(r);
  // The slug suffix (and sources.ts) keys on the 32-hex NoticeId.
  const noticeId = (r.NoticeId || "").trim().toLowerCase();
  if (!url || !title || !state || !/^[a-f0-9]{32}$/.test(noticeId)) return null;

  const sol = (r["Sol#"] || "").trim();
  const agency = clean([r["Sub-Tier"], r["Department/Ind.Agency"]].filter(Boolean)[0] || "a U.S. federal agency");
  const office = clean(r.Office || "");
  const city = clean(r.PopCity || "");
  const where = [city, US_STATES[state]].filter(Boolean).join(", ");
  const description = clean(r.Description || "");
  const setAside = clean(r.SetAside || "");
  const summaryBase = description.length > 20 ? description : title;
  const summary =
    `${where ? `${where}. ` : ""}` +
    (summaryBase.length > 240 ? `${summaryBase.slice(0, 237).trimEnd()}…` : summaryBase);

  return {
    title: title.length > 180 ? `${title.slice(0, 177)}…` : title,
    slug: `${slugify(title).slice(0, 60)}-us-${noticeId}`.replace(/-+/g, "-"),
    summary,
    scope: [description, setAside ? `Set-aside: ${setAside}.` : ""].filter(Boolean).join("\n\n").slice(0, 8000) || title,
    requirements: setAside ? `Set-aside: ${setAside}. Registration in SAM.gov is required to be awarded a federal contract.` : "Registration in SAM.gov is required to be awarded a federal contract.",
    province: US_STATES[state],
    deadline: (r.ResponseDeadLine || "").slice(0, 10) || null,
    submission_instructions:
      `This is a U.S. federal solicitation issued by ${agency}${office ? ` (${office})` : ""}. Offers go to the ` +
      "contracting office as the notice specifies, through SAM.gov. Open the official notice for the " +
      "solicitation documents, amendments and site-visit dates. PMRFP does not manage this bid.",
    contact_name: clean(r.PrimaryContactFullname || "") || null,
    contact_email: clean(r.PrimaryContactEmail || "") || null,
    contact_phone: clean(r.PrimaryContactPhone || "") || null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: url,
    source_notes: `SAM.gov ${sol || r.NoticeId} · ${agency}. ${SAM_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(r.PostedDate, today),
  };
}

function publishedAt(raw: string | undefined, today: string): string {
  const d = (raw ?? "").slice(0, 10);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d >= yesterday) return `${today}T00:00:00Z`;
  return `${d}T00:00:00Z`;
}

/**
 * Streams the SAM.gov CSV and keeps only rows passing `keep`. RFC 4180 like
 * csv.ts (quoted fields, "" escapes, newlines inside quotes), but chunked so
 * the ~240 MB file is never held as one string.
 */
export async function streamCsv(
  body: ReadableStream<Uint8Array>,
  keep: (row: SamRow) => boolean,
): Promise<SamRow[]> {
  const decoder = new TextDecoder("windows-1252");
  const reader = body.getReader();
  const out: SamRow[] = [];
  let header: string[] | null = null;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let pendingQuote = false; // saw a quote inside quotes at a chunk's end
  let pendingCR = false;

  const endRow = () => {
    row.push(field);
    field = "";
    if (!header) {
      header = row.map((h, i) => (i === 0 ? h.replace(/^﻿/, "") : h));
    } else if (row.length > 1 || row[0] !== "") {
      const rec: SamRow = {};
      for (let i = 0; i < header.length; i++) rec[header[i]] = row[i] ?? "";
      if (keep(rec)) out.push(rec);
    }
    row = [];
  };

  const consume = (text: string) => {
    let i = 0;
    if (pendingCR) {
      pendingCR = false;
      if (text[0] === "\n") i = 1;
    }
    for (; i < text.length; i++) {
      const c = text[i];
      if (pendingQuote) {
        pendingQuote = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        inQuotes = false; // fall through: c is the char after a closing quote
      }
      if (inQuotes) {
        if (c === '"') {
          if (i + 1 < text.length) {
            if (text[i + 1] === '"') {
              field += '"';
              i++;
            } else inQuotes = false;
          } else pendingQuote = true;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") endRow();
      else if (c === "\r") {
        endRow();
        if (i + 1 < text.length) {
          if (text[i + 1] === "\n") i++;
        } else pendingCR = true;
      } else field += c;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    consume(decoder.decode(value, { stream: true }));
  }
  consume(decoder.decode());
  if (pendingQuote) inQuotes = false;
  if (field !== "" || row.length) endRow();
  return out;
}

/**
 * One solicitation can appear as several notices (a Solicitation and a later
 * Combined Synopsis, or re-posts after amendments) with different NoticeIds.
 * Keep the most recently posted notice per solicitation number.
 */
export function dedupeSam(rows: SamRow[]): SamRow[] {
  const best = new Map<string, SamRow>();
  for (const r of rows) {
    const key = (r["Sol#"] || "").trim().toUpperCase() || r.NoticeId;
    const prior = best.get(key);
    if (!prior || (r.PostedDate || "") > (prior.PostedDate || "")) best.set(key, r);
  }
  return [...best.values()];
}

export async function fetchSamOpenTenders(today: string): Promise<SamRow[]> {
  const res = await fetch(SAM_OPEN_URL, {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
  if (!res.ok || !res.body) throw new Error(`SAM.gov fetch failed: HTTP ${res.status}`);
  return dedupeSam(await streamCsv(res.body, (r) => isSamCandidate(r, today)));
}
