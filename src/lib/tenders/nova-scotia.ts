/**
 * Nova Scotia "Awarded Public Tenders" → past public contracts.
 *
 * The whole NS public sector (province, Halifax, Cape Breton, the housing
 * agency, school regions, health) — 2,000+ awards a year, published monthly
 * under the Open Government Licence – Nova Scotia (commercial reuse with
 * attribution). Awards only: there is no NS open-tender feed.
 *
 * The dataset has no per-notice link, so listings point at the provincial
 * procurement portal. Some "amounts" are unit rates ($1, $20 per hour); a
 * value under $1,000 is shown as "value not disclosed" rather than printed
 * as if it were the contract total.
 */
import type { TenderInsert } from "./canadabuys";
import { CIVIL, EXCLUDE, RULES, clean, slugify } from "./shared";
import { parseCsv } from "./csv";
import { OGL_NS_ATTRIBUTION } from "./sources";

export const NS_AWARDS_URL = "https://data.novascotia.ca/api/views/m6ps-8j6u/rows.csv?accessType=DOWNLOAD";
export const NS_PORTAL_URL = "https://procurement-portal.novascotia.ca/";
export const NS_AWARD_WINDOW_DAYS = 365;

export type NsRow = Record<string, string>;

/** "2026/09/11" → "2026-09-11" */
function iso(s: string | undefined): string {
  return (s ?? "").trim().replace(/\//g, "-").slice(0, 10);
}

export function classifyNsAward(r: NsRow, today: string): string[] {
  if (r.SERVICE !== "Y" && r.CONSTRUCTION !== "Y") return [];
  const awarded = iso(r.AWARDED_DATE);
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - NS_AWARD_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(awarded) || awarded > today || awarded < cutoff) return [];
  if (!(r.VENDOR ?? "").trim()) return [];
  const title = (r.TENDER_DESCRIPTION ?? "").toLowerCase();
  if (!title || EXCLUDE.test(title) || CIVIL.test(title)) return [];
  return RULES.filter(([, p]) => p.test(title)).map(([slug]) => slug).slice(0, 3);
}

export function nsAwardToRfpInsert(r: NsRow, _today?: string): TenderInsert | null {
  const id = (r.TENDER_ID ?? "").trim();
  const title = clean(r.TENDER_DESCRIPTION ?? "");
  const vendor = clean(r.VENDOR ?? "");
  const awarded = iso(r.AWARDED_DATE);
  if (!id || !title || !vendor || !awarded) return null;
  const amount = Number(r.AWARDED_AMOUNT) || 0;
  const value = amount >= 1000 ? `$${Math.round(amount).toLocaleString("en-CA")} CAD` : null;
  const entity = clean(r.ENTITY ?? "") || "a Nova Scotia public body";
  const when = new Date(`${awarded}T00:00:00Z`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const headline = `Awarded ${when} to ${vendor}${value ? ` — ${value}` : " — value not disclosed"}.`;
  return {
    title: title.length > 180 ? `${title.slice(0, 177)}…` : title,
    slug: `${slugify(title).slice(0, 60)}-nsa-${slugify(id)}`.replace(/-+/g, "-"),
    summary: `${headline} Past public contract from ${entity}.`,
    scope: [headline, `Tender ${id} · ${entity}`].join("\n\n"),
    requirements: null,
    province: "Nova Scotia",
    deadline: awarded,
    submission_instructions:
      "This contract has already been awarded — it's listed so trades can see who wins this kind of work and " +
      "what it sells for. It did not go through PMRFP.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    // No per-tender link in the data; the portal is the official place, and
    // the fragment keeps each row's source_url unique.
    source_url: `${NS_PORTAL_URL}#tender-${encodeURIComponent(id)}`,
    source_notes: `Nova Scotia tender ${id} · ${entity} · ${vendor}. ${OGL_NS_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: `${awarded}T00:00:00Z`,
  };
}

export async function fetchNsAwards(): Promise<NsRow[]> {
  const res = await fetch(NS_AWARDS_URL, {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
  if (!res.ok) throw new Error(`Nova Scotia awards fetch failed: HTTP ${res.status}`);
  return parseCsv(await res.text());
}
