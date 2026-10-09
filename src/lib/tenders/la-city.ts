/**
 * City of Los Angeles RAMP open bids (LA Open Data, Socrata dataset
 * hf3r-utnq, CC0 1.0 public domain) → PMRFP public-tender feed.
 *
 * RAMP LA is the City's bid portal; the open-data mirror lists every open
 * opportunity from City departments plus partner agencies that post there
 * (LAUSD, the Housing Authority, LAWA, the Port, Ontario Airport). Refreshed
 * daily. One SoQL request a day.
 *
 * Kept: Construction and Personal Services opportunities whose title names
 * building or facility work. Commodity (supply) buys are dropped, and so are
 * rows tagged "Los Angeles County" — those already arrive from the County's
 * own feed (la-county.ts), and importing them twice would duplicate cards.
 */
import type { TenderInsert } from "./canadabuys";
import { CIVIL, EXCLUDE, cap, clean, publishedAt, slugify, tradesFor } from "./shared";
import { TENDER_UA } from "./florida-vbs";
import { LA_CITY_ATTRIBUTION } from "./us-state-sources";

export const LA_CITY_DATASET_URL = "https://data.lacity.org/resource/hf3r-utnq.json";

export interface LaCityRow {
  rampid?: string;
  title?: string;
  stagename?: string;
  category?: string;
  type?: string;
  bidpost?: string;
  closedate?: string;
  department?: string;
  url?: { url?: string } | string;
}

export function laCityUrl(r: LaCityRow): string {
  return (typeof r.url === "string" ? r.url : r.url?.url ?? "").trim();
}

/** "FORMAL - 2710056 Brockton ES - Roofing" → "Brockton ES - Roofing"; "2027PS001 - Campus-Wide …" → "Campus-Wide …". */
export function laCityTitle(raw: string): string {
  let t = clean(raw).replace(/\s+/g, " ");
  t = t.replace(/^(?:formal|informal)\s*(?:ifb|rfp|rfq)?\s*[-–:]?\s*/i, "");
  t = t.replace(/^(?:bid\s*#?\s*)?[A-Z0-9]*\d[A-Z0-9-]*\s*[-–:]\s*/, "");
  t = t.replace(/^\d{5,}\s+/, "");
  t = t.replace(/\s*\((?:PSA|commodity|personal services)\)\s*$/i, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : clean(raw);
}

const LA_CITY_SKIP =
  /boulevard|avenue|\bstreet\b|sidewalk|pipeline|pipe and board|bulkhead|reclamation|digester|street light|generating station|\bgs\.|hydrogen|modernization|vision zero|feasibility|construction management|construction phase|towing|turf|outdoor classroom|seeds\b|request for qualifications|pre-?qualification|lease opportunity|exhibition/;

/** PMRFP trade slugs (max 3), or [] to skip. */
export function classifyLaCity(r: LaCityRow, today: string): string[] {
  const closing = (r.closedate ?? "").slice(0, 10);
  // Standing benches carry far-future placeholder dates.
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 400 * 86_400_000).toISOString().slice(0, 10);
  if (!closing || closing < today || closing > horizon) return [];
  if (!/^(open|amended)$/i.test(r.stagename ?? "")) return [];
  if (!/^(construction|personal services)$/i.test(r.category ?? "")) return [];
  if (/los angeles county/i.test(r.department ?? "")) return [];
  if (!/^https:\/\/www\.rampla\.org\//.test(laCityUrl(r)) || !/^\d+$/.test((r.rampid ?? "").trim())) return [];
  const title = laCityTitle(r.title ?? "").toLowerCase();
  if (title.length < 6 || EXCLUDE.test(title) || CIVIL.test(title) || LA_CITY_SKIP.test(title)) return [];
  return tradesFor(title);
}

export function laCityToRfpInsert(r: LaCityRow, today: string): TenderInsert | null {
  const id = (r.rampid ?? "").trim();
  const url = laCityUrl(r);
  const title = cap(laCityTitle(r.title ?? ""), 180);
  if (!/^\d+$/.test(id) || !url || !title) return null;
  const dept = clean(r.department ?? "") || "the City of Los Angeles";
  const kind = clean(r.type ?? "") || "Solicitation";
  return {
    title,
    slug: `${slugify(title).slice(0, 60)}-lacr-${id}`.replace(/-+/g, "-"),
    summary: `Los Angeles, California. ${kind} from ${dept}: ${title}.`,
    scope: `${kind} (RAMP ${id}) — ${clean(r.title ?? "")}. Issued by ${dept}. Open the RAMP LA notice for documents, addenda and job-walk dates.`,
    requirements: null,
    province: "California",
    deadline: (r.closedate ?? "").slice(0, 10) || null,
    submission_instructions:
      `This is a public solicitation (RAMP ${id}) issued by ${dept} on RAMP LA, the City of Los Angeles bid portal. ` +
      "Responses go through RAMP as the notice specifies. PMRFP does not manage this bid.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: url,
    source_notes: `RAMP ${id} · ${dept}. ${LA_CITY_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(r.bidpost, today),
  };
}

export async function fetchLaCityOpenBids(today: string, signal?: AbortSignal): Promise<LaCityRow[]> {
  const q = new URLSearchParams({ $where: `closedate >= '${today}'`, $limit: "2000" });
  const res = await fetch(`${LA_CITY_DATASET_URL}?${q}`, {
    cache: "no-store",
    signal,
    headers: { "User-Agent": TENDER_UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`LA City RAMP fetch failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("LA City RAMP: not a list");
  return rows as LaCityRow[];
}
