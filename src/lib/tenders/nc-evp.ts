/**
 * North Carolina electronic Vendor Portal (eVP) → PMRFP public-tender feed.
 *
 * evp.nc.gov/solicitations is the State's public bid board: state agencies,
 * the UNC system, community colleges, school boards, counties and towns all
 * post there. The list is public (no login); the page fills its grid from the
 * portal's own unauthenticated JSON call, filtered to "Open" — ~6 requests a
 * day. robots.txt has no rules (404) and the eVP Terms of Use (July 2023,
 * read in full) carry no clause on reuse or automated access; notices are
 * public records under N.C.G.S. ch. 132.
 *
 * Kept: open solicitations whose title names building or facility work.
 * Each listing links to its official eVP detail page; bids go through eVP.
 *
 * Pure apart from fetchNcEvpOpen(); the cron route owns the writes.
 */
import type { TenderInsert } from "./canadabuys";
import { CIVIL, EXCLUDE, cap, clean, publishedAt, slugify, tradesFor } from "./shared";
import { TENDER_UA } from "./florida-vbs";
import { NC_EVP_ATTRIBUTION } from "./us-state-sources";

export const NC_EVP_LIST_URL = "https://evp.nc.gov/solicitations/";
export const NC_EVP_DETAIL_URL = "https://evp.nc.gov/solicitations/details/?id=";
const GRID_URL = "https://evp.nc.gov/_services/entity-grid-data.json/863ea987-6d3e-ed11-9daf-001dd805ec0b";
const TOKEN_URL = "https://evp.nc.gov/_layout/tokenhtml";
/** The page's own "Solicitation Status: Open" filter checkbox. */
const OPEN_FILTER = "3=0";

export interface NcEvpBid {
  id: string;
  number: string;
  title: string;
  description: string;
  /** Bid opening date, YYYY-MM-DD (eVP's closing moment). */
  closing: string | null;
  posted: string | null;
  status: string;
  agency: string;
}

interface GridAttribute {
  Name: string;
  DisplayValue?: unknown;
}
export interface GridRecord {
  Id: string;
  Attributes: GridAttribute[];
}

/** "11/3/2026 2:00 PM" → "2026-11-03". */
export function ncDate(s: unknown): string | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

export function ncEvpBid(r: GridRecord): NcEvpBid | null {
  const a = new Map(r.Attributes.map((x) => [x.Name, x.DisplayValue == null ? "" : String(x.DisplayValue)]));
  const id = (r.Id ?? "").toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) return null;
  return {
    id,
    number: clean(a.get("evp_solicitationnbr") ?? ""),
    title: clean(a.get("evp_name") ?? "").replace(/\s+/g, " "),
    description: clean(a.get("evp_description") ?? ""),
    closing: ncDate(a.get("evp_opendate")),
    posted: ncDate(a.get("evp_posteddate")),
    status: a.get("statuscode") ?? "",
    agency: clean(a.get("owningbusinessunit") ?? ""),
  };
}

// Plant, utility and design work that shared EXCLUDE/CIVIL miss, plus
// product buys and services no building trade bids on.
const NC_SKIP =
  /wastewater|water reclamation|water tank|elevated tank|ball ?field|resource recovery|\bwrrf\b|\bwwtp\b|water treatment|digester|\bdam\b|wetland|\bbrt\b|bus rapid|stream|greenway|\bcxa\b|commissioning|master plan|rerating|engineering design|\bdesign\b(?!-build)|pesticide|components|parts|supplies|educational equipment|fleet|vehicle|instrumentation|scoreboard|video display|evidence storage|meat processing|insurance|\bproducts?\b|\bpurchase of\b/;

/** PMRFP trade slugs (max 3), or [] to skip. */
export function classifyNcEvp(b: NcEvpBid, today: string): string[] {
  if (b.status !== "Open" || !b.closing || b.closing < today) return [];
  const title = b.title.toLowerCase();
  if (title.length < 6 || EXCLUDE.test(title) || CIVIL.test(title) || NC_SKIP.test(title)) return [];
  return tradesFor(title);
}

/** Agencies post in capitals: "COUNTY OF MECKLENBURG" → "County of Mecklenburg". */
export function ncAgency(s: string): string {
  if (!s) return "a North Carolina public body";
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Of|And|For|The)\b/g, (w) => w.toLowerCase())
    .replace(/\b(Nc|Unc|Dhhs|Bd|Ncsu|Ecu|Uncg|Unca|Uncw|Dot|Dps)\b/g, (w) => w.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());
}

export function ncEvpToRfpInsert(b: NcEvpBid, today: string): TenderInsert | null {
  if (!b.title || !b.closing) return null;
  const title = cap(b.title, 180);
  const agency = ncAgency(b.agency);
  const about = b.description.length > 20 ? b.description : title;
  return {
    title,
    slug: `${slugify(b.title).slice(0, 60)}-ncevp-${b.id.replace(/-/g, "")}`.replace(/-+/g, "-"),
    summary: `North Carolina. ${agency}: ${cap(about, 240)}`,
    scope: `${b.number ? `Solicitation ${b.number} — ` : ""}${about}`.slice(0, 8000),
    requirements: null,
    province: "North Carolina",
    deadline: b.closing,
    submission_instructions:
      `This is a public North Carolina solicitation${b.number ? ` (${b.number})` : ""} issued by ${agency} on the ` +
      "NC electronic Vendor Portal (eVP). Open the official notice for documents, addenda and pre-bid dates; " +
      "responses go to the issuing agency as the notice specifies. PMRFP does not manage this bid.",
    // Buyer contacts stay on the official notice.
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: `${NC_EVP_DETAIL_URL}${b.id}`,
    source_notes: `NC eVP ${b.number || b.id} · ${agency}. ${NC_EVP_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: publishedAt(b.posted, today),
  };
}

const PAGE_SIZE = 50;
const MAX_PAGES = 20;

/** Cookie header from a response's Set-Cookie lines (anonymous portal session). */
function cookiesOf(res: Response, jar: Map<string, string>) {
  const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const line of lines) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookieHeader = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

/** The base64 grid configuration the list page hands its own grid script. */
export function gridConfig(html: string): string | null {
  const m = html.match(/data-view-layouts="([^"]+)"/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
    const layouts = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return typeof layouts?.[0]?.Base64SecureConfiguration === "string" ? layouts[0].Base64SecureConfiguration : null;
  } catch {
    return null;
  }
}

export async function fetchNcEvpOpen(signal?: AbortSignal): Promise<NcEvpBid[]> {
  const jar = new Map<string, string>();
  const page = await fetch(NC_EVP_LIST_URL, { cache: "no-store", signal, headers: { "User-Agent": TENDER_UA } });
  if (!page.ok) throw new Error(`NC eVP list page failed: HTTP ${page.status}`);
  cookiesOf(page, jar);
  const config = gridConfig(await page.text());
  if (!config) throw new Error("NC eVP: grid configuration not found on the list page");

  const tok = await fetch(TOKEN_URL, { cache: "no-store", signal, headers: { "User-Agent": TENDER_UA, Cookie: cookieHeader(jar) } });
  cookiesOf(tok, jar);
  const token = (await tok.text()).match(/value="([^"]+)"/)?.[1];
  if (!token) throw new Error("NC eVP: no request token");

  const out = new Map<string, NcEvpBid>();
  for (let p = 1; p <= MAX_PAGES; p++) {
    const res = await fetch(GRID_URL, {
      method: "POST",
      cache: "no-store",
      signal,
      headers: {
        "User-Agent": TENDER_UA,
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        __RequestVerificationToken: token,
        Cookie: cookieHeader(jar),
      },
      body: JSON.stringify({
        base64SecureConfiguration: config,
        sortExpression: "evp_posteddate DESC",
        search: "",
        page: p,
        pageSize: PAGE_SIZE,
        filter: null,
        metaFilter: OPEN_FILTER,
        timezoneOffset: 300,
        customParameters: [],
      }),
    });
    if (!res.ok) throw new Error(`NC eVP grid page ${p} failed: HTTP ${res.status}`);
    const data = (await res.json()) as { Records?: GridRecord[]; MoreRecords?: boolean };
    for (const r of data.Records ?? []) {
      const b = ncEvpBid(r);
      if (b) out.set(b.id, b);
    }
    if (!data.MoreRecords) break;
  }
  return [...out.values()];
}
