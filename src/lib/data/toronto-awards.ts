import { unstable_cache } from "next/cache";
import { isPublishableWinner, winnerKey } from "@/lib/data/winners";
import { slugify } from "@/lib/tenders/shared";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";

/**
 * City of Toronto awarded contracts (TOBids), from Toronto Open Data:
 * https://open.toronto.ca/dataset/tobids-awarded-contracts/ — a CSV of ~7,700
 * award rows since 2012, refreshed daily, under the Open Government Licence –
 * Toronto. Every page that shows it must carry TORONTO_ATTRIBUTION.
 *
 * The CSV is fetched and aggregated by supplier. The City's TOBids API
 * supplies names if the CSV omits them. On production, D1 holds previously
 * imported awards for use when neither source is available.
 * Cache the compact index and detail shards rather than the raw download.
 *
 * Buyer names, emails and phone numbers in the file are City staff contacts:
 * deliberately dropped. Supplier names that look like a private individual are
 * skipped (same rule as the contract-winner pages).
 */

export const TORONTO_DATASET_URL = "https://open.toronto.ca/dataset/tobids-awarded-contracts/";
export const TORONTO_NONCOMPETITIVE_DATASET_URL = "https://open.toronto.ca/dataset/tobids-non-competitive-contracts/";
export const TORONTO_LICENCE_URL = "https://open.toronto.ca/open-data-licence/";
export const TORONTO_ATTRIBUTION = "Contains information licensed under the Open Government Licence – Toronto.";
const CSV_URL =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/e211f003-5909-4bea-bd96-d75899d8e612";
const TOBIDS_URL =
  "https://secure.toronto.ca/c3api_data/v2/DataAccess.svc/pmmd_solicitations/feis_solicitation_published";

/** A supplier page is indexable with 2+ awards, or one award at least this big. */
export const INDEX_MIN_SINGLE_AWARD = 250_000;
const DESC_MAX = 260;
const AWARDS_PER_SUPPLIER = 25;

export interface TorontoAward {
  doc: string;
  type: string;
  category: string;
  amount: number | null;
  date: string | null;
  division: string;
  description: string;
  /** Number of wards named, 25 = city-wide. */
  wards: number;
}

export interface TorontoSupplierSummary {
  slug: string;
  name: string;
  count: number;
  total: number;
  latest: string | null;
  first: string | null;
  topDivision: string | null;
  indexable: boolean;
}

export interface TorontoSupplier extends TorontoSupplierSummary {
  divisions: { name: string; count: number; total: number }[];
  categories: { name: string; count: number }[];
  awards: TorontoAward[];
}

export interface TorontoRecentAward extends TorontoAward {
  supplier: string;
  slug: string;
}

export interface TorontoIndex {
  suppliers: TorontoSupplierSummary[];
  recent: TorontoRecentAward[];
  rows: number;
  total: number;
  divisions: { name: string; count: number; total: number }[];
}

/* ------------------------------------------------------------------ parsing */

/** RFC 4180 CSV → rows of strings (quoted fields, "" escapes, CRLF, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

/** "771,931.57" → 771931.57; blanks and junk → null. */
export function parseAmount(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  // A few rows carry a phone number in the Award column (4163927134 = 416-392-7134);
  // no single City award is anywhere near $1B, so treat those as undisclosed.
  if (n >= 1_000_000_000) return null;
  return Math.round(n * 100) / 100;
}

export interface TorontoRow extends TorontoAward {
  supplier: string;
}

/** Header-mapped rows. Unknown/missing columns read as "". */
export function rowsFromCsv(text: string): TorontoRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const c = {
    doc: col("Document Number"),
    type: col("RFx (Solicitation) Type"),
    category: col("High Level Category"),
    supplier: col("Successful Supplier"),
    amount: col("Award"),
    date: col("Award Authority Obtained Date"),
    division: col("Division"),
    description: col("Solicitation Document Description"),
    wards: col("Wards"),
  };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const out: TorontoRow[] = [];
  for (const r of body) {
    const supplier = get(r, c.supplier).replace(/\s+/g, " ");
    if (!supplier) continue;
    const date = get(r, c.date);
    const wards = get(r, c.wards);
    out.push({
      supplier,
      doc: get(r, c.doc),
      type: get(r, c.type),
      category: get(r, c.category).replace(/&/g, "and").replace(/\s+/g, " "),
      amount: parseAmount(get(r, c.amount)),
      date: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null,
      division: get(r, c.division),
      description: get(r, c.description).replace(/\s+/g, " "),
      wards: wards ? wards.split(",").filter((w) => /ward/i.test(w)).length : 0,
    });
  }
  return out;
}

interface PublicSolicitation {
  id: string;
  Status?: string;
  Solicitation_Document_Number?: string;
  Solicitation_Document_Type?: string;
  High_Level_Category?: string;
  Client_Division?: string[];
  Posting_Title?: string;
  Solicitation_Document_Description?: string;
  Date_Awarded?: string;
  Wards?: string[];
  Awarded_Suppliers?: {
    Successful_Bidder?: string;
    Award_Amount?: string | number;
    Date_Awarded?: string;
    AwardedDate?: string;
  }[];
}

export function rowsFromPublicSolicitations(solicitations: PublicSolicitation[]): TorontoRow[] {
  const rows: TorontoRow[] = [];
  for (const record of solicitations) {
    const doc = record.Solicitation_Document_Number?.trim();
    if (record.Status !== "Awarded" || !doc || !Array.isArray(record.Awarded_Suppliers)) continue;
    for (const award of record.Awarded_Suppliers) {
      const supplier = award.Successful_Bidder?.trim().replace(/\s+/g, " ");
      if (!supplier || !isPublishableSupplier(supplier)) continue;
      const date = [award.Date_Awarded, award.AwardedDate, record.Date_Awarded]
        .find(value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value));
      rows.push({
        supplier,
        doc,
        type: record.Solicitation_Document_Type ?? "",
        category: (record.High_Level_Category ?? "").replace(/&/g, "and").replace(/\s+/g, " "),
        amount: parseAmount(award.Award_Amount == null ? undefined : String(award.Award_Amount).replace(/\s*CAD\s*$/i, "")),
        date: date?.slice(0, 10) ?? null,
        division: record.Client_Division?.[0] ?? "",
        description: trim((record.Posting_Title || record.Solicitation_Document_Description || "").replace(/\s+/g, " ").trim()),
        wards: record.Wards?.filter(ward => /ward/i.test(ward)).length ?? 0,
      });
    }
  }
  return rows;
}

/* ------------------------------------------------------------ normalisation */

/** Merge key: "GUILD ELECTRIC LTD." ≡ "Guild Electric Limited"; "A and B" ≡ "A & B"; leading "The" dropped. */
export function supplierKey(name: string): string {
  return winnerKey(name.replace(/\band\b/gi, "&"))
    .replace(/^the\s+/, "")
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
}

const SUFFIX_CASE: Record<string, string> = {
  inc: "Inc.", ltd: "Ltd.", limited: "Limited", corp: "Corp.", corporation: "Corporation",
  co: "Co.", company: "Company", llc: "LLC", lp: "LP", ulc: "ULC", incorporated: "Incorporated", ltee: "Ltée", "ltée": "Ltée",
};
const SMALL = new Set(["of", "and", "the", "for", "in", "on", "at", "to", "de", "du", "des", "la", "le", "et"]);

/** "SANSCON CONSTRUCTION LIMITED" → "Sanscon Construction Limited"; mixed case is left alone. */
export function tidySupplierName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (/[a-z]/.test(n)) return n;
  return n
    .split(" ")
    .map((w, i) => {
      const bare = w.toLowerCase().replace(/[.,]/g, "");
      if (SUFFIX_CASE[bare]) return SUFFIX_CASE[bare] + (w.endsWith(",") ? "," : "");
      if (i > 0 && SMALL.has(bare)) return w.toLowerCase();
      // Short letter-only tokens with no vowel, or ≤3 letters, read as acronyms (GFL, ABC, HVAC kept).
      const letters = w.replace(/[^A-Z]/g, "");
      if (letters.length > 0 && (letters.length <= 3 || !/[AEIOUY]/.test(letters)) && !/^(CO|MC)$/.test(letters)) return w;
      return w
        .toLowerCase()
        .replace(/(^|[-'’(/&.])([a-z])/g, (_m, p: string, ch: string) => p + ch.toUpperCase())
        .replace(/^Mc([a-z])/, (_m, ch: string) => "Mc" + ch.toUpperCase());
    })
    .join(" ");
}

/** Mixed case first, then the most common spelling. */
function pickName(variants: Map<string, number>): string {
  const best = [...variants.entries()].sort(
    (a, b) => Number(/[a-z]/.test(b[0])) - Number(/[a-z]/.test(a[0])) || b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];
  return tidySupplierName(best);
}

function tally<T extends string>(items: { key: T; amount: number | null }[]) {
  const m = new Map<T, { count: number; total: number }>();
  for (const { key, amount } of items) {
    if (!key) continue;
    const e = m.get(key) ?? { count: 0, total: 0 };
    e.count++;
    e.total += amount ?? 0;
    m.set(key, e);
  }
  return [...m.entries()]
    .map(([name, v]) => ({ name, count: v.count, total: Math.round(v.total) }))
    .sort((a, b) => b.count - a.count || b.total - a.total);
}

/** Company names only: honorifics ("Mr. Ron Weaver") mark a person. */
export function isPublishableSupplier(name: string): boolean {
  return isPublishableWinner(name) && !/^(mr|mrs|ms|miss|dr)\.?\s/i.test(name.trim());
}

const trim = (s: string) => (s.length > DESC_MAX ? `${s.slice(0, DESC_MAX - 1).trimEnd()}…` : s);

/** Group rows by normalised supplier. Pure — exported for tests. Sorted by total value. */
export function aggregateSuppliers(rows: TorontoRow[]): TorontoSupplier[] {
  const groups = new Map<string, { variants: Map<string, number>; rows: TorontoRow[] }>();
  for (const r of rows) {
    if (!isPublishableSupplier(r.supplier)) continue;
    const key = supplierKey(r.supplier);
    if (!key) continue;
    const g = groups.get(key) ?? { variants: new Map<string, number>(), rows: [] as TorontoRow[] };
    g.variants.set(r.supplier, (g.variants.get(r.supplier) ?? 0) + 1);
    g.rows.push(r);
    groups.set(key, g);
  }

  const built = [...groups.entries()].map(([key, g]) => {
    const awards = [...g.rows].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.doc.localeCompare(a.doc));
    const total = Math.round(awards.reduce((s, a) => s + (a.amount ?? 0), 0));
    const dates = awards.map((a) => a.date).filter((d): d is string => Boolean(d)).sort();
    const divisions = tally(awards.map((a) => ({ key: a.division, amount: a.amount })));
    return {
      key,
      name: pickName(g.variants),
      count: awards.length,
      total,
      latest: dates.at(-1) ?? null,
      first: dates[0] ?? null,
      topDivision: divisions[0]?.name ?? null,
      indexable: awards.length >= 2 || total >= INDEX_MIN_SINGLE_AWARD,
      divisions: divisions.slice(0, 8),
      categories: tally(awards.map((a) => ({ key: a.category, amount: a.amount }))).map(({ name, count }) => ({ name, count })),
      awards: awards.slice(0, AWARDS_PER_SUPPLIER).map(({ supplier: _s, ...a }) => ({ ...a, description: trim(a.description) })),
    };
  });

  // Deterministic slugs: biggest supplier keeps the bare slug on a clash.
  built.sort((a, b) => b.total - a.total || b.count - a.count || a.key.localeCompare(b.key));
  const used = new Set<string>();
  const out: TorontoSupplier[] = [];
  for (const { key: _k, ...s } of built) {
    const base = slugify(s.name).slice(0, 80);
    if (!base) continue;
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    out.push({ ...s, slug });
  }
  return out;
}

export function buildIndex(rows: TorontoRow[], suppliers: TorontoSupplier[]): TorontoIndex {
  const slugByKey = new Map(suppliers.map((s) => [supplierKey(s.name), s.slug]));
  const recent: TorontoRecentAward[] = [];
  for (const r of [...rows].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
    if (recent.length >= 15) break;
    const slug = isPublishableSupplier(r.supplier) ? slugByKey.get(supplierKey(r.supplier)) : undefined;
    if (!slug || !r.amount) continue;
    const { supplier, ...a } = r;
    recent.push({ ...a, description: trim(a.description), supplier: tidySupplierName(supplier), slug });
  }
  return {
    suppliers: suppliers.map(({ divisions: _d, categories: _c, awards: _a, ...s }) => s),
    recent,
    rows: rows.length,
    total: Math.round(rows.reduce((s, r) => s + (r.amount ?? 0), 0)),
    divisions: tally(rows.map((r) => ({ key: r.division, amount: r.amount }))).slice(0, 12),
  };
}

export const shardOf = (slug: string) => (/^[a-z]/.test(slug) ? slug[0] : "0");

/* ------------------------------------------------------------------ loading */

let memo: { at: number; promise: Promise<TorontoSupplier[]> } | null = null;
let rowsMemo: TorontoRow[] = [];

async function readPublicSolicitations(): Promise<TorontoRow[]> {
  const pageSize = 1_000;
  const fields = [
    "id", "Status", "Awarded_Suppliers", "Date_Awarded", "Client_Division", "High_Level_Category",
    "Posting_Title", "Solicitation_Document_Description", "Solicitation_Document_Number", "Solicitation_Document_Type", "Wards",
  ].join(",");
  const signal = AbortSignal.timeout(22_000);
  async function readPage(skip: number, count = false) {
    const url = new URL(TOBIDS_URL);
    url.search = new URLSearchParams({
      $format: "application/json;odata.metadata=none", $select: fields, $orderby: "id",
      $top: String(pageSize), $skip: String(skip), ...(count && { $count: "true" }),
    }).toString();
    const res = await fetch(url, { cache: "no-store", signal });
    if (!res.ok) throw new Error(`Toronto Bids API: HTTP ${res.status}`);
    const page = await res.json() as { value: PublicSolicitation[]; "@odata.count"?: number };
    if (!Array.isArray(page.value)) throw new Error("Toronto Bids API: unexpected response");
    return page;
  }

  const first = await readPage(0, true);
  const count = first["@odata.count"];
  if (!Number.isSafeInteger(count) || !count || count < 1 || count > 20_000) {
    throw new Error("Toronto Bids API: invalid record count");
  }
  const records = [...first.value];
  // Read in small groups to keep concurrent requests to the City's API bounded.
  for (let skip = pageSize; skip < count; skip += 4 * pageSize) {
    const offsets = [skip, skip + pageSize, skip + 2 * pageSize, skip + 3 * pageSize]
      .filter(offset => offset < count);
    const pages = await Promise.all(offsets.map(offset => readPage(offset)));
    for (const page of pages) records.push(...page.value);
  }
  if (records.length !== count || records.some(record => !record.id) ||
      new Set(records.map(record => record.id)).size !== count) {
    throw new Error("Toronto Bids API: incomplete snapshot");
  }
  const rows = rowsFromPublicSolicitations(records);
  if (!rows.length) throw new Error("Toronto Bids API: no publishable supplier records");
  return rows;
}

async function readArchivedAwards(nonCompetitiveOnly = false): Promise<TorontoRow[]> {
  const { results } = await vpsAppDatabase().prepare(`SELECT source, source_key, board_ref,
    winner_business_name, value, award_date, title, buyer
    FROM award_history
    WHERE source IN (?, 'ca-toronto-noncompetitive')
      AND winner_is_individual=0 AND winner_business_name IS NOT NULL
      AND ${customerAppAuthority}
    ORDER BY award_date DESC, id`).bind(nonCompetitiveOnly ? 'ca-toronto-noncompetitive' : 'ca-toronto-awards').all<{
    source: string; source_key: string; board_ref: string | null; winner_business_name: string;
    value: string | null; award_date: string; title: string; buyer: string | null;
  }>();
  return results.map(row => ({
    supplier: row.winner_business_name,
    doc: row.board_ref ?? (row.source === "ca-toronto-awards" ? row.source_key.split("|")[0] : ""),
    type: row.source === "ca-toronto-noncompetitive" ? "Non-competitive" : "Competitive",
    category: "",
    amount: parseAmount(row.value ?? undefined),
    date: row.award_date,
    division: row.buyer ?? "City of Toronto",
    description: row.title,
    wards: 0,
  }));
}

/**
 * One download serves every shard/index miss within ten minutes.
 *
 * A failed download THROWS (it used to return []). The callers below are
 * unstable_cache entries kept for a day: an empty result was cached as if the
 * City had no suppliers, so every supplier page in that shard rendered
 * notFound(), and the ISR cache kept serving those 404s (sitemap URLs sampled
 * 2026-10-18: cached 404s up to two days old). A throw is never cached: the
 * page keeps its last good copy and the next request retries.
 */
async function loadAll(): Promise<{ rows: TorontoRow[]; suppliers: TorontoSupplier[] }> {
  if (!memo || Date.now() - memo.at > 10 * 60_000) {
    const promise = (async () => {
      let rows: TorontoRow[];
      try {
        const res = await fetch(CSV_URL, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        rows = rowsFromCsv(await res.text());
        if (!rows.length) throw new Error("Toronto award feed has no named supplier records");
      } catch (error) {
        if (!isVpsLiveCustomerAuth()) throw error;
        try {
          rows = await readPublicSolicitations();
          // The archive currently also powers non-competitive supplier URLs.
          // Keep those awards without double-counting competitive records.
          const nonCompetitive = await readArchivedAwards(true).catch(() => []);
          rows.push(...nonCompetitive);
        } catch (upstreamError) {
          console.warn("[toronto-awards] City Bids API unavailable:", upstreamError);
          rows = rowsMemo.length ? rowsMemo : await readArchivedAwards();
        }
      }
      const suppliers = aggregateSuppliers(rows);
      if (!suppliers.length) throw new Error("no suppliers parsed (empty or changed file)");
      rowsMemo = rows;
      return suppliers;
    })();
    memo = { at: Date.now(), promise };
    promise.catch((e) => {
      console.error("[toronto-awards] fetch failed:", e);
      if (memo?.promise === promise) memo = null;
    });
  }
  const suppliers = await memo!.promise;
  return { rows: rowsMemo, suppliers };
}

const DAY = 86_400;

export const getTorontoIndex = unstable_cache(
  async (): Promise<TorontoIndex> => {
    const { rows, suppliers } = await loadAll();
    return buildIndex(rows, suppliers);
  },
  ["toronto-awards-index-v4"],
  { revalidate: DAY, tags: ["toronto-awards"] },
);

const getShard = unstable_cache(
  async (shard: string): Promise<TorontoSupplier[]> => (await loadAll()).suppliers.filter((s) => shardOf(s.slug) === shard),
  ["toronto-awards-shard-v4"],
  { revalidate: DAY, tags: ["toronto-awards"] },
);

/** The slugs a supplier page accepts (anything else is notFound() without a lookup). */
export const TORONTO_SLUG_RE = /^[a-z0-9-]{1,90}$/;

/**
 * THE rule for "this supplier page renders and is indexable": the slug passes
 * the page's own slug check and the supplier clears the thin-content bar
 * (2+ awards, or one award of INDEX_MIN_SINGLE_AWARD+). The page sets
 * noindex when this is false; the sitemap lists only suppliers where it's true.
 */
export function isTorontoSupplierIndexable(s: Pick<TorontoSupplierSummary, "slug" | "indexable">): boolean {
  return TORONTO_SLUG_RE.test(s.slug) && s.indexable;
}

/** Sitemap list: indexable suppliers from the same index the pages resolve against, biggest first. Pure. */
export function torontoContractSlugsForSitemap(index: Pick<TorontoIndex, "suppliers">, limit: number): TorontoSupplierSummary[] {
  return index.suppliers.filter(isTorontoSupplierIndexable).slice(0, limit);
}

/**
 * One supplier, or null when the data loaded and there is no such supplier
 * (the page's notFound()). THROWS when the data can't be loaded, so a failed
 * download is an error (not cached) instead of a cached 404.
 */
export async function getTorontoSupplier(slug: string): Promise<TorontoSupplier | null> {
  if (!TORONTO_SLUG_RE.test(slug)) return null;
  const hit = (await getShard(shardOf(slug))).find((s) => s.slug === slug);
  if (hit) return hit;
  // The index (sitemap, list page) and the shards are cached separately, so a
  // day's data change can leave a listed slug missing from an older shard.
  // When the index lists it, re-check against a fresh load before a 404.
  const listed = (await getTorontoIndexSafe()).suppliers.some((s) => s.slug === slug);
  if (!listed) return null;
  return (await loadAll()).suppliers.find((s) => s.slug === slug) ?? null;
}

export async function getTorontoIndexSafe(): Promise<TorontoIndex> {
  try {
    return await getTorontoIndex();
  } catch {
    return { suppliers: [], recent: [], rows: 0, total: 0, divisions: [] };
  }
}
