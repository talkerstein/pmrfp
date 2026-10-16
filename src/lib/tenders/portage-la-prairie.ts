/**
 * City of Portage la Prairie (Manitoba) → PMRFP public-tender feed.
 *
 * The City posts each tender as a news post in its own "Tenders and
 * Proposals" feed (Govstack CMS) — not on a commercial bid platform; tender
 * documents are issued by email on request. robots.txt only disallows CMS
 * system folders; the site has no terms page (footer "Disclaimer" link is
 * empty) and its privacy policy has no reuse clause.
 *
 * The list gives title, link and post date; the closing date is only in the
 * post body ("on or before 2:00 p.m. local time on Thursday, October 29,
 * 2026"), so we read each listed post — usually 2–5 a day, 2 s apart.
 */
import type { TenderInsert } from "./canadabuys";
import { cap, clean, publishedAt, slugify } from "./shared";
import { classifyLocalTitle, getPage, htmlText, monthDayYear, sleep, urlRef } from "./local-html";
import { PORTAGE_ATTRIBUTION } from "./canada-local-sources";

export const PLAP_BASE = "https://www.city-plap.com";
export const PLAP_LIST_URL = `${PLAP_BASE}/council-administration/tenders-and-proposals/`;
export const PLAP_EMAIL = "tenders@city-plap.com";
const MAX_POSTS = 12;
const POST_DELAY_MS = 2_000;

export interface PlapListItem {
  url: string;
  title: string;
  description: string;
  posted: string | null;
}

export interface PlapTender extends PlapListItem {
  closing: string | null;
  body: string;
}

export function parsePlapList(html: string): PlapListItem[] {
  const out: PlapListItem[] = [];
  for (const [, item] of html.matchAll(/<li class="gs-feed-list-item[^"]*">([\s\S]*?)<\/li>/g)) {
    const a = item.match(/<a href="(\/news\/posts\/[a-z0-9-]+\/)"[^>]*class="gs-feed-list-title[^"]*">([\s\S]*?)<\/a>/);
    if (!a) continue;
    out.push({
      url: `${PLAP_BASE}${a[1]}`,
      title: htmlText(a[2]).replace(/\s+/g, " "),
      description: htmlText(item.match(/<span class="gs-feed-list-description">([\s\S]*?)<\/span>/)?.[1] ?? ""),
      posted: monthDayYear(htmlText(item.match(/<span class="gs-feed-list-date">([\s\S]*?)<\/span>/)?.[1] ?? "")),
    });
  }
  return out;
}

const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";

/** The closing date written in the post body, or null. */
export function plapClosingDate(bodyText: string): string | null {
  const t = bodyText.replace(/\s+/g, " ");
  const m =
    // "p.m." has periods, so allow them; the date follows within a line or so.
    t.match(new RegExp(`on or before.{0,120}?(${MONTH} \\d{1,2},? \\d{4})`, "i")) ??
    t.match(new RegExp(`(?:clos\\w*|deadline|due)[^.]{0,80}?(${MONTH} \\d{1,2},? \\d{4})`, "i"));
  return m ? monthDayYear(m[1]) : null;
}

/** The post's main text block. */
export function plapPostBody(html: string): string {
  return clean(htmlText(html.match(/<div class="text base-text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ""));
}

export function classifyPlap(t: PlapTender, today: string): string[] {
  return classifyLocalTitle(t.title.replace(/^(?:tender|rfp|rfq|request for \w+) for (?:the )?/i, ""), t.closing, today);
}

export function plapToRfpInsert(t: PlapTender, today: string): TenderInsert | null {
  if (!t.title || !t.closing) return null;
  const ref = t.description.match(/\b(?:Tender|RFP|RFQ) \d{2} [A-Z]+ \d{3}\b/)?.[0] ?? "";
  const refText = ref ? ` (${ref})` : "";
  const about = t.body.length > 20 ? t.body : t.title;
  return {
    title: cap(t.title, 180),
    slug: `${slugify(t.title).slice(0, 60)}-plap-${urlRef(t.url)}`.replace(/-+/g, "-"),
    summary: `Manitoba. City of Portage la Prairie: ${cap((t.description || t.title).replace(/\s+/g, " "), 240)}`,
    scope: [`${t.title}${refText}.`, about !== t.title ? about : ""].filter(Boolean).join("\n\n").slice(0, 8000),
    requirements: null,
    province: "Manitoba",
    deadline: t.closing,
    submission_instructions:
      `This is a public City of Portage la Prairie tender${refText}. Tender documents are issued by the City on request — ` +
      "open the official notice for how to get them and where to submit; bids go to the City, not PMRFP. PMRFP does not manage this bid.",
    contact_name: "City of Portage la Prairie Operations Department",
    contact_email: PLAP_EMAIL,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: t.url,
    source_notes: `City of Portage la Prairie${refText}. ${PORTAGE_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(t.posted, today),
  };
}

/** The list, then each listed post (2 s apart) for its closing date. */
export async function fetchPlapTenders(signal?: AbortSignal): Promise<PlapTender[]> {
  const items = parsePlapList(await getPage(PLAP_LIST_URL, signal)).slice(0, MAX_POSTS);
  const out: PlapTender[] = [];
  for (const item of items) {
    await sleep(POST_DELAY_MS, signal);
    const body = plapPostBody(await getPage(item.url, signal));
    out.push({ ...item, body, closing: plapClosingDate(body) });
  }
  return out;
}
