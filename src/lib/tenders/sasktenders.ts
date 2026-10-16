/**
 * SaskTenders (sasktenders.ca, Government of Saskatchewan — SaskBuilds and
 * Procurement) → PMRFP public-tender feed.
 *
 * The province's own tender site: ministries, Sask Housing, school
 * divisions, health, cities (Regina, Saskatoon), towns and RMs all post
 * there. The search page is public (login only to bookmark/download), is
 * server-rendered, and defaults to Open competitions. robots.txt is absent
 * (404) and the Disclaimer is warranty-only ("provided strictly 'as is'"),
 * with no reuse clause. We read the Open list, 100 per page (~3 pages), 3 s
 * apart, once a day. Each listing links to the competition's public print
 * page (/Competitions/Print?id=<GUID>).
 *
 * A permission/feed request went to SaskBuilds on 2026-10-09
 * (briefs/outbound-queue/2026-10-09-portal-permission-sent.json); if they
 * ask us to stop, drop the source from /api/cron/canada-local-tenders.
 */
import type { TenderInsert } from "./canadabuys";
import { cap, clean, publishedAt, slugify } from "./shared";
import { classifyLocalTitle, getPage, htmlText, monthDayYear, sleep } from "./local-html";
import { SASKTENDERS_ATTRIBUTION } from "./canada-local-sources";

export const SK_BASE = "https://www.sasktenders.ca";
/** The Search page's own default status filter: Open. */
export const SK_OPEN_STATUS = "54c953b7-cbe6-4e0d-a828-5df0d39e784d";
export const SK_PAGE_SIZE = 100;
const SK_MAX_PAGES = 6;
const PAGE_DELAY_MS = 3_000;

export const skSearchUrl = (page: number) =>
  `${SK_BASE}/Search?statusId=${SK_OPEN_STATUS}&sortField=opendate&sortDirection=desc&pageNumber=${page}&pageSize=${SK_PAGE_SIZE}`;
export const skNoticeUrl = (id: string) => `${SK_BASE}/Competitions/Print?id=${id}`;

export interface SkCompetition {
  id: string;
  title: string;
  organization: string;
  number: string;
  opens: string | null;
  closes: string | null;
  status: string;
  synopsis: string;
  type: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** "Your search returned 242 results" → 242. */
export function skResultCount(html: string): number | null {
  const m = html.match(/Your search returned (\d+) results?/);
  return m ? Number(m[1]) : null;
}

/** The desktop table: one <tbody x-data="{ myId: '<GUID>' }"> per competition. */
export function parseSkSearch(html: string): SkCompetition[] {
  const out: SkCompetition[] = [];
  for (const [, id, body] of html.matchAll(/<tbody x-data="\{ myId: '([0-9a-f-]{36})' \}"[^>]*>([\s\S]*?)<\/tbody>/g)) {
    if (!GUID.test(id)) continue;
    const summary = body.match(/<tr[^>]*>([\s\S]*?)<\/tr>/)?.[1] ?? "";
    const tds = [...summary.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (tds.length < 7) continue;
    const firstDiv = (s: string) => htmlText(s.match(/<div[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? s);
    const title = htmlText(tds[1]).replace(/\s+/g, " ");
    if (!title) continue;
    const attr = (name: string) => htmlText(body.match(new RegExp(`data-${name}="([^"]*)"`))?.[1] ?? "");
    const dd = (label: string) => htmlText(body.match(new RegExp(`${label}:</dt>\\s*<dd>([\\s\\S]*?)</dd>`))?.[1] ?? "");
    out.push({
      id,
      title,
      organization: htmlText(tds[2]),
      number: htmlText(tds[3]),
      opens: monthDayYear(firstDiv(tds[4])),
      closes: monthDayYear(firstDiv(tds[5])),
      status: htmlText(tds[6]),
      synopsis: clean(htmlText(body.match(/<div class="prose[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "")),
      type: dd("Competition Type"),
      contactName: attr("contact-name"),
      contactEmail: /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(attr("contact-email")) ? attr("contact-email") : "",
      contactPhone: attr("contact-phone"),
    });
  }
  return out;
}

/** Sales of property/equipment and onboarding lists, besides the shared filter. */
const SK_SKIP = /\bsale\b|surplus|disposal of|request for supplier qualification|\brfsq\b|standing offer for (?:the )?supply/;

export function classifySk(c: SkCompetition, today: string): string[] {
  if (!/^open$/i.test(c.status)) return [];
  if (SK_SKIP.test(c.title.toLowerCase())) return [];
  return classifyLocalTitle(c.title, c.closes, today);
}

export function skToRfpInsert(c: SkCompetition, today: string): TenderInsert | null {
  if (!c.title || !c.closes || !GUID.test(c.id)) return null;
  const org = c.organization || "a Saskatchewan public body";
  const ref = c.number ? ` (${c.number})` : "";
  const about = c.synopsis.length > 20 ? c.synopsis : c.title;
  return {
    title: cap(c.title, 180),
    slug: `${slugify(c.title).slice(0, 60)}-sktn-${c.id.replace(/-/g, "")}`.replace(/-+/g, "-"),
    summary: `Saskatchewan. ${org}: ${cap(about.replace(/\s+/g, " "), 240)}`,
    scope: [`${c.type ? `${c.type} — ` : ""}${c.title}${ref}.`, about !== c.title ? about : ""].filter(Boolean).join("\n\n").slice(0, 8000),
    requirements: null,
    province: "Saskatchewan",
    deadline: c.closes,
    submission_instructions:
      `This is a public Saskatchewan competition${ref} issued by ${org}, posted on SaskTenders. Open the official notice for ` +
      "where to get documents and how to submit; bids go to the issuing body, not PMRFP. PMRFP does not manage this bid.",
    contact_name: c.contactName || null,
    contact_email: c.contactEmail || null,
    contact_phone: c.contactPhone || null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: skNoticeUrl(c.id),
    source_notes: `SaskTenders competition${ref} · ${org}. ${SASKTENDERS_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(c.opens, today),
  };
}

/** Every Open competition: page 1, then as many pages as the result count needs (3 s apart). */
export async function fetchSkOpen(signal?: AbortSignal): Promise<SkCompetition[]> {
  const first = await getPage(skSearchUrl(1), signal);
  const total = skResultCount(first);
  if (total === null) throw new Error("SaskTenders: result count not found on the search page");
  const out = new Map<string, SkCompetition>();
  for (const c of parseSkSearch(first)) out.set(c.id, c);
  const pages = Math.min(SK_MAX_PAGES, Math.ceil(total / SK_PAGE_SIZE));
  for (let p = 2; p <= pages; p++) {
    await sleep(PAGE_DELAY_MS, signal);
    for (const c of parseSkSearch(await getPage(skSearchUrl(p), signal))) if (!out.has(c.id)) out.set(c.id, c);
  }
  return [...out.values()];
}
