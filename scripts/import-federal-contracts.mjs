/**
 * ONE-TIME / OCCASIONAL LOCAL SCRIPT (not a Vercel cron, not run in CI).
 *
 * Streams the Government of Canada "Contracts over $10,000" CSV
 * (CA-F06, ~642 MB, Open Government Licence - Canada v2.0) in chunks and
 * writes a compact SEED FILE of the building / property contracts worth
 * $50,000 or more. The file is never held in memory and nothing is written to
 * any database: a second step loads the seed (see below).
 *
 *   node scripts/import-federal-contracts.mjs                      # whole file
 *   node scripts/import-federal-contracts.mjs --range=120000000-123000000   # sample a slice (HTTP Range)
 *   node scripts/import-federal-contracts.mjs --file=C:\data\contracts.csv  # a copy you already have
 *   node scripts/import-federal-contracts.mjs --limit=5000         # stop after N CSV records
 *   node scripts/import-federal-contracts.mjs --out=out/federal-seed.jsonl
 *
 * Output: out/federal-contracts-seed.jsonl (one JSON object per line, the
 * newest reporting period per contract) and out/federal-contracts-sample.json
 * (20 rows), plus a report on screen: rows read, rows kept, kept per year,
 * why rows were skipped, seed size and the estimated database size.
 *
 * THE LOAD (dry run first; --apply writes to award_history, source
 * "ca-federal-contracts", the same stable ids the monthly cron uses):
 *   node scripts/run-open-data.mjs load-federal-seed out/federal-contracts-seed.jsonl
 *   node scripts/run-open-data.mjs load-federal-seed out/federal-contracts-seed.jsonl --apply
 *
 * The filter is in src/lib/open-data/federal-filter.mjs (documented there,
 * unit tested). The vendor is kept only when it looks like a business
 * (src/lib/open-data/business-name.mjs); otherwise it is counted, not named.
 *
 * Robots / terms: the file is the dataset's official resource link on
 * open.canada.ca (robots.txt Crawl-delay 20 s: this script makes at most two
 * requests, 20 s apart). Polite User-Agent: PMRFP-data (info@pmrfp.com).
 */
import { createReadStream, mkdirSync, statSync, writeFileSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";
import { csvRecords } from "../src/lib/open-data/csv-rows.mjs";
import { FEDERAL_CSV_URL, FEDERAL_MIN_VALUE, federalSeedRow, keepLatest } from "../src/lib/open-data/federal-filter.mjs";

const UA = "PMRFP-data (info@pmrfp.com)";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const range = arg("range");
const file = arg("file");
const limit = Number(arg("limit")) || 0;
const out = arg("out") || "out/federal-contracts-seed.jsonl";
const today = new Date().toISOString().slice(0, 10);

/** Estimated database bytes per award_history row: heap + 7 indexes (measured shape, see src/lib/open-data/size-budget.ts). */
const DB_BYTES_PER_ROW = 1_400;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (headers) => {
  const res = await fetch(FEDERAL_CSV_URL, { headers: { "User-Agent": UA, Accept: "text/csv", ...headers }, redirect: "follow" });
  if (!res.ok && res.status !== 206) throw new Error(`open.canada.ca HTTP ${res.status}`);
  return res;
};

/** The byte stream to read: header line first, then the requested bytes (ragged edges trimmed). */
async function* source() {
  if (file) {
    for await (const c of createReadStream(file)) yield c;
    return;
  }
  const [start, end] = range ? range.split("-").map(Number) : [0, null];
  if (start > 0) {
    // The header lives in the first bytes; a slice starts mid-row, so drop the partial first line.
    const head = Buffer.from(await (await get({ Range: "bytes=0-8191" })).arrayBuffer());
    yield head.subarray(0, head.indexOf(10) + 1);
    await wait(21_000); // robots.txt Crawl-delay 20 s
  }
  const res = await get(range ? { Range: `bytes=${start}-${end}` } : {});
  console.error(`HTTP ${res.status}, ${res.headers.get("content-range") ?? res.headers.get("content-length") ?? "?"} bytes`);
  let dropFirstLine = start > 0;
  for await (const chunk of res.body) {
    let buf = Buffer.from(chunk);
    if (dropFirstLine) {
      const nl = buf.indexOf(10);
      if (nl === -1) continue;
      buf = buf.subarray(nl + 1);
      dropFirstLine = false;
    }
    yield buf;
  }
}

mkdirSync(dirname(out), { recursive: true });
const latest = new Map();
const skips = {};
let read = 0;
for await (const r of csvRecords(source())) {
  read++;
  if (limit && read > limit) break;
  const row = federalSeedRow(r, { minValue: FEDERAL_MIN_VALUE, today });
  if (row.skip) {
    skips[row.skip] = (skips[row.skip] ?? 0) + 1;
    continue;
  }
  if (!keepLatest(latest, row)) skips["older-restatement"] = (skips["older-restatement"] ?? 0) + 1;
  if (read % 200_000 === 0) console.error(`  ${read.toLocaleString()} records read, ${latest.size.toLocaleString()} kept`);
}

const rows = [...latest.values()].sort((a, b) => a.award_date.localeCompare(b.award_date) || a.source_key.localeCompare(b.source_key));
const sink = createWriteStream(out);
for (const r of rows) sink.write(JSON.stringify(r) + "\n");
await new Promise((res) => sink.end(res));
const seedBytes = statSync(out).size;

const perYear = {};
for (const r of rows) perYear[r.award_date.slice(0, 4)] = (perYear[r.award_date.slice(0, 4)] ?? 0) + 1;
const named = rows.filter((r) => !r.vendor_is_individual).length;
const sample = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 20)) === 0).slice(0, 20);
writeFileSync(out.replace(/\.jsonl$/, "") + "-sample.json", JSON.stringify(sample, null, 2));

console.log(JSON.stringify({
  filter: { minValue: FEDERAL_MIN_VALUE, building: "commodity_type C (not civil/equipment) or building-work object codes; never goods/software/equipment/rentals/civil" },
  recordsRead: read,
  kept: rows.length,
  keptWithBusinessVendor: named,
  keptVendorWithheldAsIndividual: rows.length - named,
  keptPerYear: perYear,
  skipped: skips,
  seedFile: out,
  seedMB: +(seedBytes / 1e6).toFixed(2),
  estimatedDatabaseMB: +((rows.length * DB_BYTES_PER_ROW) / 1e6).toFixed(1),
  note: range || file || limit ? "PARTIAL read: scale by (642 MB / bytes read) for a whole-file estimate" : "whole file",
}, null, 2));
console.log("\nSample of 20 kept rows:");
for (const r of sample) {
  console.log(`${r.award_date} | ${(r.buyer ?? "").slice(0, 38).padEnd(38)} | ${(r.vendor ?? "(individual, withheld)").slice(0, 34).padEnd(34)} | $${String(Math.round(r.value)).padStart(10)} | bids ${r.number_of_bids ?? "-"} | ${r.procurement_method ?? "-"} | ${r.title.slice(0, 50)}`);
}
