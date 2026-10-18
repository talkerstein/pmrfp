/**
 * Township of Guelph/Eramosa (Wellington County, Ontario) → PMRFP public-tender feed.
 *
 * The Township posts its bids on its own site (get.on.ca), in a two-column
 * HTML table ("Bid Documents" link, "Bidding Close Date") — not on a
 * commercial bid platform. Checked 2026-10-18: get.on.ca/robots.txt returns
 * 404 (no rules), and the footer "Disclaimer" link is dead; no page found has
 * a reuse restriction. The page cites MFIPPA s. 27: bid information is kept
 * "available to the general public". One list read a day, nothing else
 * fetched (the bid documents are PDFs we only link to).
 *
 * The Township posts few bids (one closed study on 2026-10-18), so most days
 * this adds nothing; the importer exists so new building bids appear the day
 * they're posted.
 */
import type { TenderInsert } from "./canadabuys";
import { cap, publishedAt, slugify } from "./shared";
import { classifyLocalTitle, getPage, htmlText, monthDayYear, urlRef } from "./local-html";
import { GUELPH_ERAMOSA_ATTRIBUTION } from "./canada-local-sources";

export const GETE_BASE = "https://www.get.on.ca";
export const GETE_LIST_URL = `${GETE_BASE}/doing-business-here/bids-and-tenders`;

export interface GeteBid {
  url: string;
  title: string;
  /** Closing date, YYYY-MM-DD, or null when the cell has none. */
  closing: string | null;
  /** The close cell as written ("July 27, 2026 at 4:00 p.m."). */
  closingText: string;
}

/** Rows of the "Bid Documents | Bidding Close Date" table. */
export function parseGeteBids(html: string): GeteBid[] {
  const table = html.match(/<table[\s\S]*?Bid Documents[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  const out: GeteBid[] = [];
  for (const [, row] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 2) continue;
    const a = cells[0].match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const title = htmlText(a?.[2] ?? cells[0]).replace(/\s+/g, " ").trim();
    if (!title) continue;
    const href = a?.[1]?.trim();
    const url = href ? new URL(href, `${GETE_BASE}/`).toString() : GETE_LIST_URL;
    const closingText = htmlText(cells[1]).replace(/\s+/g, " ").trim();
    out.push({ url, title, closing: monthDayYear(closingText), closingText });
  }
  return out;
}

export function classifyGete(b: GeteBid, today: string): string[] {
  return classifyLocalTitle(b.title, b.closing, today);
}

export function geteToRfpInsert(b: GeteBid, today: string): TenderInsert | null {
  if (!b.title || !b.closing) return null;
  return {
    title: cap(b.title, 180),
    // The list page is the notice: the slug ref is the bid-document URL, unique per bid.
    slug: `${slugify(b.title).slice(0, 60)}-gete-${urlRef(b.url)}`.replace(/-+/g, "-"),
    summary: `Ontario. Township of Guelph/Eramosa: ${cap(b.title, 240)}`,
    scope: `${b.title}. Bidding closes ${b.closingText}. The bid documents are on the Township's bids and tenders page.`,
    requirements: null,
    province: "Ontario",
    deadline: b.closing,
    submission_instructions:
      "This is a public Township of Guelph/Eramosa bid. Open the official bids and tenders page for the bid documents, addenda and how to submit; " +
      "bids go to the Township, not PMRFP. PMRFP does not manage this bid.",
    contact_name: "Township of Guelph/Eramosa",
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: GETE_LIST_URL,
    source_notes: `Township of Guelph/Eramosa. ${GUELPH_ERAMOSA_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(null, today),
  };
}

export async function fetchGeteBids(signal?: AbortSignal): Promise<GeteBid[]> {
  return parseGeteBids(await getPage(GETE_LIST_URL, signal));
}
