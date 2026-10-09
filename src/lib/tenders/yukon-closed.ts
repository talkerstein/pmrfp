/**
 * Yukon closed tenders → the "Closed" archive.
 *
 * Yukon publishes its closed tenders as open data ("Yukon Government Closed
 * Tenders", Open Government Licence – Yukon, open.yukon.ca / open.canada.ca
 * b793e4d5-294e-4c7e-84f2-ba44ae46adab) — the same official bids&tenders
 * OpenData report family the open importer already uses. Each row is a real
 * tender with its real closing date and the portal's own status ("Closed" or
 * "Awarded"). The file names no winner, so neither do we.
 */
import type { TenderInsert } from "./canadabuys";
import { fmtDate } from "./awards";
import { parseCsv } from "./csv";
import { CIVIL, EXCLUDE, RULES, clean, slugify } from "./shared";
import { OGL_YUKON_ATTRIBUTION } from "./sources";
import { YUKON_PORTAL_URL, yukonTitle, type YukonRow } from "./yukon";
import { CLOSED_SETTLE_DAYS, CLOSED_WINDOW_DAYS } from "./canadabuys-closed";

export const YUKON_CLOSED_URL =
  "https://yukon.bidsandtenders.ca/Module/Tenders/en/OpenData/GenerateReport?report=ClosedTenders";

/** Not bids a trade placed: information requests, interest calls, sole-source notices. */
const NOT_A_CALL = /request for information|expression of interest|advanced? contract award notice/i;
/** Wildfire fuel-break work ("fuel abatement blocks") reads as hazmat abatement to the trade rules. */
const FORESTRY = /fuel abatement|fuelbreak|fuel break|forested land|hectares|silvicultur|wildfire/;

function date10(s: string | undefined): string {
  return (s ?? "").trim().slice(0, 10);
}

function daysBefore(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

export function classifyYukonClosed(r: YukonRow, today: string): string[] {
  const status = (r["Project Status"] ?? "").trim();
  if (status !== "Closed" && status !== "Awarded") return [];
  if (NOT_A_CALL.test(r["Project Type"] ?? "")) return [];
  if (!/services|construction/i.test(r["Project Classification"] ?? "")) return [];
  const closing = date10(r["Closing Date"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closing)) return [];
  if (closing > daysBefore(today, CLOSED_SETTLE_DAYS) || closing < daysBefore(today, CLOSED_WINDOW_DAYS)) return [];
  const text = (r["Project Description"] ?? "").toLowerCase();
  if (!text || EXCLUDE.test(text.slice(0, 200)) || CIVIL.test(text.slice(0, 400)) || FORESTRY.test(text.slice(0, 400))) return [];
  return RULES.filter(([, p]) => p.test(text.slice(0, 400))).map(([slug]) => slug).slice(0, 3);
}

export function yukonClosedToRfpInsert(r: YukonRow): TenderInsert | null {
  const number = clean(r["Project Number"] ?? "");
  const description = clean(r["Project Description"] ?? "");
  const closing = date10(r["Closing Date"]);
  if (!number || !description || !/^\d{4}-\d{2}-\d{2}$/.test(closing)) return null;
  const title = yukonTitle(description);
  const department = clean(r["Department"] ?? "");
  const status = (r["Project Status"] ?? "").trim();
  const lead =
    `Public tender from the Government of Yukon${department ? ` (${department})` : ""}, closed ${fmtDate(closing)}. Project ${number}.` +
    (status === "Awarded" ? " Status on the Yukon portal: awarded." : "");
  const room = 420 - lead.length;
  const snippet = description.length > room ? `${description.slice(0, room - 2).trimEnd()}…` : description;
  const published = date10(r["Published Date"]);
  return {
    title,
    slug: `${slugify(title).slice(0, 60)}-ykc-${slugify(number)}`.replace(/-+/g, "-"),
    summary: `${lead} ${snippet}`,
    scope: `${lead}\n\n${description}`.slice(0, 8000),
    requirements: clean(r["Project Type"] ?? "") || null,
    province: "Yukon",
    deadline: closing,
    submission_instructions:
      `This Government of Yukon tender (${number}) has closed — bids are no longer accepted. Search the project ` +
      "number on Yukon's bids&tenders portal for its documents and results. It did not go through PMRFP.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: `${YUKON_PORTAL_URL}#${encodeURIComponent(number)}`,
    source_notes: `Yukon closed tender ${number} (status ${status})${department ? ` · ${department}` : ""}. ${OGL_YUKON_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: /^\d{4}-\d{2}-\d{2}$/.test(published) ? `${published}T00:00:00Z` : `${closing}T00:00:00Z`,
  };
}

export async function fetchYukonClosedTenders(): Promise<YukonRow[]> {
  const res = await fetch(YUKON_CLOSED_URL, {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
  if (!res.ok) throw new Error(`Yukon closed tenders fetch failed: HTTP ${res.status}`);
  return parseCsv(await res.text());
}
