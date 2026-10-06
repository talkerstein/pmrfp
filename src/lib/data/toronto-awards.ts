import { unstable_cache } from "next/cache";
import { isPublishableWinner, winnerKey } from "@/lib/data/winners";
import { slugify } from "@/lib/tenders/shared";

/**
 * City of Toronto awarded contracts (TOBids), from Toronto Open Data:
 * https://open.toronto.ca/dataset/tobids-awarded-contracts/ — a CSV of ~7,700
 * award rows since 2012, refreshed daily, under the Open Government Licence –
 * Toronto. Every page that shows it must carry TORONTO_ATTRIBUTION.
 *
 * No database: the CSV is fetched and aggregated by supplier, then cached for a
 * day. The raw file is ~2 MB (over the data-cache item limit), so the cache
 * holds a compact supplier index plus ~27 detail shards (by slug initial).
 * If the fetch fails every caller gets empty data and pages degrade to 404 /
 * an empty section — never an error.
 *
 * Buyer names, emails and phone numbers in the file are City staff contacts:
 * deliberately dropped. Supplier names that look like a private individual are
 * skipped (same rule as the contract-winner pages).
 */

export const TORONTO_DATASET_URL = "https://open.toronto.ca/dataset/tobids-awarded-contracts/";
export const TORONTO_LICENCE_URL = "https://open.toronto.ca/open-data-licence/";
export const TORONTO_ATTRIBUTION = "Contains information licensed under the Open Government Licence – Toronto.";
const CSV_URL =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/e211f003-5909-4bea-bd96-d75899d8e612";

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

/** One download serves every shard/index miss within ten minutes. */
async function loadAll(): Promise<{ rows: TorontoRow[]; suppliers: TorontoSupplier[] }> {
  if (!memo || Date.now() - memo.at > 10 * 60_000) {
    memo = {
      at: Date.now(),
      promise: (async () => {
        try {
          const res = await fetch(CSV_URL, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          rowsMemo = rowsFromCsv(await res.text());
          return aggregateSuppliers(rowsMemo);
        } catch (e) {
          console.error("[toronto-awards] fetch failed:", e);
          memo = null;
          rowsMemo = [];
          return [];
        }
      })(),
    };
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
  ["toronto-awards-index-v1"],
  { revalidate: DAY, tags: ["toronto-awards"] },
);

const getShard = unstable_cache(
  async (shard: string): Promise<TorontoSupplier[]> => (await loadAll()).suppliers.filter((s) => shardOf(s.slug) === shard),
  ["toronto-awards-shard-v1"],
  { revalidate: DAY, tags: ["toronto-awards"] },
);

export async function getTorontoSupplier(slug: string): Promise<TorontoSupplier | null> {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  try {
    return (await getShard(shardOf(slug))).find((s) => s.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export async function getTorontoIndexSafe(): Promise<TorontoIndex> {
  try {
    return await getTorontoIndex();
  } catch {
    return { suppliers: [], recent: [], rows: 0, total: 0, divisions: [] };
  }
}
