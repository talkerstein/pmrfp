/**
 * Ontario Northland (provincial Crown agency: rail, coach, refurbishment,
 * stations across Northern Ontario) → PMRFP public-tender feed.
 *
 * Ontario Northland posts its open competitive opportunities on its own
 * website ("Doing Business with Ontario Northland"), one Drupal teaser per
 * call with reference #, posting date and closing date. robots.txt allows
 * /en/company/; the site has no website reuse terms (its "Terms of Service"
 * is the passenger tariff). One page read a day. Each listing links to the
 * notice's own page on ontarionorthland.ca.
 */
import type { TenderInsert } from "./canadabuys";
import { cap, publishedAt, slugify } from "./shared";
import { classifyLocalTitle, getPage, htmlText, urlRef } from "./local-html";
import { ONTARIO_NORTHLAND_ATTRIBUTION } from "./canada-local-sources";

export const ONTN_BASE = "https://www.ontarionorthland.ca";
export const ONTN_LIST_URL = `${ONTN_BASE}/en/company/doing-business-ontc`;
export const ONTN_EMAIL = "vendorservices@ontarionorthland.ca";

export interface OntnNotice {
  url: string;
  title: string;
  reference: string;
  /** YYYY-MM-DD, Toronto time. */
  posted: string | null;
  closing: string | null;
}

/** ISO instant → its calendar date in Toronto ("2026-11-05T19:00:00Z" → "2026-11-05"). */
export function torontoDate(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

function fieldTime(block: string, name: string): string | null {
  const m = block.match(new RegExp(`field--name-field-${name}[\\s\\S]*?<time datetime="([^"]+)"`));
  return m ? torontoDate(m[1]) : null;
}

/** Every teaser on the list page. */
export function parseOntnList(html: string): OntnNotice[] {
  const out: OntnNotice[] = [];
  const re = /<a class="sales-tenders-requests[^"]*" href="(\/en\/company\/[a-z0-9-]+)">([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const block = m[2];
    const title = htmlText(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "").replace(/\s+/g, " ");
    if (!title) continue;
    const reference = htmlText(block.match(/field--name-field-reference[\s\S]*?field--item">([\s\S]*?)<\/div>/)?.[1] ?? "");
    out.push({ url: `${ONTN_BASE}${m[1]}`, title, reference, posted: fieldTime(block, "posting-date"), closing: fieldTime(block, "closing-date") });
  }
  return out;
}

export function classifyOntn(n: OntnNotice, today: string): string[] {
  return classifyLocalTitle(n.title, n.closing, today);
}

export function ontnToRfpInsert(n: OntnNotice, today: string): TenderInsert | null {
  if (!n.title || !n.closing) return null;
  const ref = n.reference ? ` (${n.reference})` : "";
  return {
    title: cap(n.title, 180),
    slug: `${slugify(n.title).slice(0, 60)}-ontn-${urlRef(n.url)}`.replace(/-+/g, "-"),
    summary: `Northern Ontario. Ontario Northland is seeking bids: ${cap(n.title, 200)}${ref}.`,
    scope: `${n.title}${ref}.\n\nIssued by Ontario Northland Transportation Commission. The full solicitation, addenda and submission instructions are on the official notice page.`,
    requirements: null,
    province: "Ontario",
    deadline: n.closing,
    submission_instructions:
      `This is a public Ontario Northland solicitation${ref}. Open the official notice on ontarionorthland.ca for the documents ` +
      "and how to submit; bids go to Ontario Northland, not PMRFP. PMRFP does not manage this bid.",
    contact_name: "Ontario Northland Vendor Services",
    contact_email: ONTN_EMAIL,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: n.url,
    source_notes: `Ontario Northland${ref}. ${ONTARIO_NORTHLAND_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(n.posted, today),
  };
}

export async function fetchOntnNotices(signal?: AbortSignal): Promise<OntnNotice[]> {
  return parseOntnList(await getPage(ONTN_LIST_URL, signal));
}
