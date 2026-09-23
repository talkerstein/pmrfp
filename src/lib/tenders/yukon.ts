/**
 * Yukon Government open tenders → PMRFP public-tender feed.
 *
 * The only jurisdiction found that publishes *open, biddable* tenders as
 * open data: its bids&tenders portal's OpenData report, listed in the Yukon
 * open-data catalogue under the Open Government Licence – Yukon. Importing
 * that official export is not scraping. Small volume (~20 open, a handful
 * of trade calls) but live.
 */
import type { TenderInsert } from "./canadabuys";
import { CIVIL, EXCLUDE, RULES, clean, slugify } from "./shared";
import { parseCsv } from "./csv";
import { OGL_YUKON_ATTRIBUTION } from "./sources";

export const YUKON_OPEN_URL =
  "https://yukon.bidsandtenders.ca/Module/Tenders/en/OpenData/GenerateReport?report=OpenTenders";
export const YUKON_PORTAL_URL = "https://yukon.bidsandtenders.ca/Module/Tenders/en";

export type YukonRow = Record<string, string>;

function date10(s: string | undefined): string {
  return (s ?? "").trim().slice(0, 10);
}

export function classifyYukon(r: YukonRow, today: string): string[] {
  if ((r["Project Status"] ?? "").trim() !== "Open") return [];
  if (!/services|construction/i.test(r["Project Classification"] ?? "")) return [];
  const closing = date10(r["Closing Date"]);
  if (!closing || closing < today) return [];
  const text = (r["Project Description"] ?? "").toLowerCase();
  if (!text || EXCLUDE.test(text.slice(0, 200)) || CIVIL.test(text.slice(0, 200))) return [];
  return RULES.filter(([, p]) => p.test(text.slice(0, 400))).map(([slug]) => slug).slice(0, 3);
}

export function yukonToRfpInsert(r: YukonRow, today: string): TenderInsert | null {
  const number = clean(r["Project Number"] ?? "");
  const description = clean(r["Project Description"] ?? "");
  if (!number || !description) return null;
  // "The Facilities Management Branch intends to form a Standing Offer
  // Arrangement with qualified contractors for generator repair services,
  // including …" → "Standing offer: Generator repair services".
  const so = description.match(/standing offer arrangement with qualified\s+contractors\s+(?:for|to provide)\s+(.+)/i);
  const work = (so ? so[1] : description)
    .split(/,\s*including|(?<=[a-z0-9)])\.\s|\s+community:/i)[0]
    .replace(/^the government of yukon is (seeking|looking for) /i, "")
    .trim();
  const core = work.charAt(0).toUpperCase() + work.slice(1);
  const full = so ? `Standing offer: ${core}` : core;
  const title = full.length > 140 ? `${full.slice(0, 137).trimEnd()}…` : full;
  const department = clean(r["Department"] ?? "") || "Government of Yukon";
  const published = date10(r["Published Date"]);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return {
    title,
    slug: `${slugify(title).slice(0, 60)}-yk-${slugify(number)}`.replace(/-+/g, "-"),
    summary: description.length > 280 ? `${description.slice(0, 277).trimEnd()}…` : description,
    scope: description.slice(0, 8000),
    requirements: clean(r["Project Type"] ?? "") || null,
    province: "Yukon",
    deadline: date10(r["Closing Date"]) || null,
    submission_instructions:
      `This is a public Government of Yukon tender (${number}, ${department}). Bids are submitted on Yukon's ` +
      "bids&tenders portal — search the project number there for documents and addenda. PMRFP does not manage this bid.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: `${YUKON_PORTAL_URL}#${encodeURIComponent(number)}`,
    source_notes: `Yukon ${number} · ${department}. ${OGL_YUKON_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: !published || published >= yesterday ? `${today}T00:00:00Z` : `${published}T00:00:00Z`,
  };
}

export async function fetchYukonOpenTenders(): Promise<YukonRow[]> {
  const res = await fetch(YUKON_OPEN_URL, {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
  if (!res.ok) throw new Error(`Yukon open tenders fetch failed: HTTP ${res.status}`);
  return parseCsv(await res.text());
}
