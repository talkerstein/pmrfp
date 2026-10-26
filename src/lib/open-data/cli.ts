/**
 * OPEN DATA: the local command line (bundled and run by scripts/run-open-data.mjs).
 *
 *   node scripts/run-open-data.mjs <command> [file] [--apply] [--city=key] [--limit=N] [--since=YYYY-MM-DD]
 *
 *   arcgis                   city permit leads (all pilot cities, or --city=surrey)
 *   calgary                  Calgary contractor activity (3 requests)
 *   toronto-pipeline         Toronto capital project pipeline (1 request)
 *   toronto-noncompetitive   Toronto sole-source contracts (3 requests)
 *   vancouver-awards <file>  Vancouver awarded contracts, from a file you downloaded in a browser
 *   vancouver-permits <file> Vancouver building permits, same
 *   load-federal-seed <file> the seed written by scripts/import-federal-contracts.mjs
 *   footprint                measured size of everything this batch added
 *
 * DRY RUN BY DEFAULT: nothing is written without --apply. --apply needs
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local or
 * the environment) and prints the database host before it writes.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyHistory, prepareAwards } from "@/lib/contract-history/sync";
import type { AwardHistoryInput, ParsedBatch } from "@/lib/contract-history/model";
import { coverageOf } from "@/lib/contract-history/coverage";
import { ARCGIS_CITIES } from "./arcgis-permits";
import { federalSeedToAward } from "./federal-load";
import { OPEN_DATA_JOBS, runJobs } from "./run";
import { allEstimates } from "./sources";
import { assertRunWithinEstimate, assertWithinBudget, megabytes, estimateBytes } from "./size-budget";
import { recordRun, writePermitLeads } from "./store";
import { collectTorontoNonCompetitive, TORONTO_NC_SOURCE } from "./toronto";
import { parseVancouverAwards, parseVancouverPermits, vancouverRecords, VANCOUVER_AWARDS_SOURCE, VANCOUVER_PERMITS_SOURCE } from "./vancouver";
import { FEDERAL_SOURCE } from "./federal-filter.mjs";
import { permitWindowStart } from "./permits";

function loadEnv(): void {
  for (const p of [".env.local", ".env"]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

function connect(): SupabaseClient {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("--apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  console.error(`Writing to database host: ${new URL(url).host}`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const flag = (argv: string[], name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const print = (v: unknown) => console.log(JSON.stringify(v, null, 2));

async function loadAwards(label: string, batch: ParsedBatch, apply: boolean, today: string, estimatedRows: number): Promise<void> {
  const { rows, invalid } = prepareAwards(batch.awards);
  assertRunWithinEstimate(label, "award_history", rows.length, estimatedRows);
  const out: Record<string, unknown> = {
    source: label,
    read: batch.read,
    kept: rows.length,
    bidRows: batch.bids.length,
    skipped: batch.skipped,
    invalid,
    estimatedDatabaseMB: megabytes(estimateBytes("award_history", rows.length) + estimateBytes("bid_results", batch.bids.length)),
    coverage: coverageOf(rows, batch.bids, today),
  };
  if (apply) {
    const db = connect();
    out.written = await applyHistory(db, rows, batch.bids);
    await recordRun(db, { source: label, status: "ok", read: batch.read, kept: rows.length, written: rows.length });
  } else {
    out.sample = rows.slice(0, 5).map((r) => ({ buyer: r.buyer, title: r.title, winner: r.winner_business_name ?? "(individual, not named)", value: r.value, date: r.award_date, bids: r.number_of_bids, trades: r.trade_slugs }));
    out.dryRun = "nothing written; add --apply to write";
  }
  print(out);
}

export async function main(argv: string[]): Promise<void> {
  const [command, file] = argv;
  const apply = argv.includes("--apply");
  const today = new Date().toISOString().slice(0, 10);
  const limit = Number(flag(argv, "limit")) || undefined;
  const need = (what: string) => {
    if (!file || file.startsWith("--")) throw new Error(`${command} needs ${what}`);
    return readFileSync(file, "utf8");
  };

  switch (command) {
    case "arcgis":
    case "calgary":
    case "toronto-pipeline": {
      const city = flag(argv, "city");
      const wanted = command === "calgary" ? "calgary-trade-permits" : "toronto-capital-pipeline";
      const jobs = OPEN_DATA_JOBS.filter((j) =>
        command === "arcgis" ? ARCGIS_CITIES.some((c) => c.source === j.key && (!city || c.key === city)) : j.key === wanted,
      );
      if (!jobs.length) throw new Error(`no such city: ${city}. Pilot cities: ${ARCGIS_CITIES.map((c) => c.key).join(", ")}`);
      const { reports, failed } = await runJobs(jobs, { today, db: apply ? connect() : null, limit });
      print({ today, apply, failed, reports });
      return;
    }
    case "toronto-noncompetitive": {
      await loadAwards(TORONTO_NC_SOURCE, await collectTorontoNonCompetitive({ asOf: today }), apply, today, 3_500);
      return;
    }
    case "vancouver-awards": {
      const records = await vancouverRecords(need("the CSV or JSON file downloaded from opendata.vancouver.ca (Export tab)"));
      await loadAwards(VANCOUVER_AWARDS_SOURCE, parseVancouverAwards(records, { asOf: today, since: flag(argv, "since") }), apply, today, 4_400);
      return;
    }
    case "vancouver-permits": {
      const records = await vancouverRecords(need("the CSV or JSON file downloaded from opendata.vancouver.ca (Export tab)"));
      const batch = parseVancouverPermits(records, today);
      assertRunWithinEstimate(VANCOUVER_PERMITS_SOURCE, "permit_leads", batch.leads.length, 4_000);
      const out: Record<string, unknown> = {
        source: VANCOUVER_PERMITS_SOURCE,
        window: `${permitWindowStart(today)} to ${today}, value >= $100,000, business contractor`,
        read: batch.read,
        kept: batch.leads.length,
        skipped: batch.skipped,
        estimatedDatabaseMB: megabytes(estimateBytes("permit_leads", batch.leads.length)),
      };
      if (apply) {
        const db = connect();
        out.written = await writePermitLeads(db, VANCOUVER_PERMITS_SOURCE, batch.leads, today);
        await recordRun(db, { source: VANCOUVER_PERMITS_SOURCE, status: "ok", read: batch.read, kept: batch.leads.length, written: batch.leads.length });
      } else {
        out.sample = batch.leads.slice(0, 5).map((l) => ({ issued: l.issued_on, value: l.value_cad, contractor: l.contractor, work: l.work_type }));
        out.dryRun = "nothing written; add --apply to write";
      }
      print(out);
      return;
    }
    case "load-federal-seed": {
      const rows: AwardHistoryInput[] = need("the seed .jsonl written by scripts/import-federal-contracts.mjs")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => federalSeedToAward(JSON.parse(l), today));
      await loadAwards(FEDERAL_SOURCE, { awards: rows, bids: [], read: rows.length, skipped: {} }, apply, today, 35_000);
      return;
    }
    case "footprint": {
      const db = connect();
      const { data, error } = await db.rpc("open_data_footprint");
      if (error) throw new Error(error.message);
      print({ measured: data, estimatedBatchMB: megabytes(assertWithinBudget(allEstimates())), budgetMB: 150 });
      return;
    }
    default:
      console.error("Commands: arcgis | calgary | toronto-pipeline | toronto-noncompetitive | vancouver-awards <file> | vancouver-permits <file> | load-federal-seed <file> | footprint   (add --apply to write)");
      process.exitCode = 1;
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
