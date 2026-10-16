/**
 * BC local governments that publish their bid list on their OWN website in
 * the same CMS "tenders-table" (District of Saanich, Fraser Valley Regional
 * District) → PMRFP public-tender feed.
 *
 * Each site lists every call with title (linking to its own notice page),
 * competition number, posted and closing dates, status and award. Both also
 * publish an RSS feed of the same list for subscribers. Neither has a
 * robots.txt; Saanich's disclaimer and FVRD's legal disclaimer are
 * warranty-only (no reuse restriction). Closed rows stay in the table and
 * some still say "Open" after closing, so the closing date decides.
 *
 * Documents and submission are on each buyer's own channel (Bonfire / BC
 * Bid); PMRFP links only to the buyer's notice page.
 */
import type { TenderInsert } from "./canadabuys";
import { cap, publishedAt, slugify } from "./shared";
import { classifyLocalTitle, getPage, htmlText, urlRef } from "./local-html";
import { FVRD_ATTRIBUTION, SAANICH_ATTRIBUTION } from "./canada-local-sources";

export interface BcTableSite {
  key: "saanich" | "fvrd";
  marker: "saan" | "fvrd";
  buyer: string;
  base: string;
  listUrl: string;
  /** Published procurement inbox, if the buyer lists one. */
  email: string | null;
  attribution: string;
}

export const SAANICH: BcTableSite = {
  key: "saanich",
  marker: "saan",
  buyer: "District of Saanich",
  base: "https://www.saanich.ca",
  listUrl: "https://www.saanich.ca/EN/main/business/selling-to-saanich/bid-opportunities.html",
  email: "purchase@saanich.ca",
  attribution: SAANICH_ATTRIBUTION,
};

export const FVRD: BcTableSite = {
  key: "fvrd",
  marker: "fvrd",
  buyer: "Fraser Valley Regional District",
  base: "https://www.fvrd.ca",
  listUrl: "https://www.fvrd.ca/EN/main/government/tenders-rfps.html",
  email: null,
  attribution: FVRD_ATTRIBUTION,
};

export interface BcTableRow {
  url: string;
  title: string;
  number: string;
  posted: string | null;
  closing: string | null;
  status: string;
}

/** data-sort-value "20261103030000" → "2026-11-03" (the date part is local). */
function sortDate(cell: string): string | null {
  const m = cell.match(/data-sort-value="(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseBcTenderTable(html: string, site: BcTableSite): BcTableRow[] {
  const table = html.match(/<table[^>]*tenders-table[^>]*>([\s\S]*?)<\/table>/)?.[1] ?? "";
  const out: BcTableRow[] = [];
  for (const [, row] of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cell = (name: string) => row.match(new RegExp(`<td class="[^"]*tenders-${name}[^"]*"([\\s\\S]*?)</td>`))?.[0] ?? "";
    const link = cell("title").match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const href = link[1].startsWith("http") ? link[1] : `${site.base}${link[1]}`;
    if (!href.startsWith(site.base)) continue;
    out.push({
      url: href,
      title: htmlText(link[2]).replace(/\s+/g, " "),
      number: htmlText(cell("number").replace(/^<td[^>]*>/, "")),
      posted: sortDate(cell("posted")),
      closing: sortDate(cell("closing")),
      status: htmlText(cell("status").replace(/^<td[^>]*>/, "")),
    });
  }
  return out;
}

export function classifyBcTableRow(r: BcTableRow, today: string): string[] {
  if (/award|cancel|closed/i.test(r.status)) return [];
  return classifyLocalTitle(r.title, r.closing, today);
}

export function bcTableToRfpInsert(r: BcTableRow, site: BcTableSite, today: string): TenderInsert | null {
  if (!r.title || !r.closing) return null;
  const ref = r.number ? ` (${r.number})` : "";
  return {
    title: cap(r.title, 180),
    slug: `${slugify(r.title).slice(0, 60)}-${site.marker}-${urlRef(r.url)}`.replace(/-+/g, "-"),
    summary: `British Columbia. ${site.buyer} is seeking bids: ${cap(r.title, 200)}${ref}.`,
    scope: `${r.title}${ref}.\n\nIssued by the ${site.buyer}. The full solicitation, addenda and submission instructions are on the official notice page.`,
    requirements: null,
    province: "British Columbia",
    deadline: r.closing,
    submission_instructions:
      `This is a public ${site.buyer} solicitation${ref}. Open the official notice on the ${site.buyer} website for the documents ` +
      "and how to submit; bids go to the issuing body, not PMRFP. PMRFP does not manage this bid.",
    contact_name: site.email ? `${site.buyer} Purchasing` : null,
    contact_email: site.email,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: r.url,
    source_notes: `${site.buyer}${ref}. ${site.attribution}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(r.posted, today),
  };
}

export async function fetchBcTenderTable(site: BcTableSite, signal?: AbortSignal): Promise<BcTableRow[]> {
  return parseBcTenderTable(await getPage(site.listUrl, signal), site);
}
