import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { permitMinValue, type MajorProjectInput } from "@/lib/major-projects/model";
import { PROJECT_SOURCES } from "@/lib/major-projects/sources";
import { applySync, loadExisting, loadRegionLookup, planSummary, planSync } from "@/lib/major-projects/sync";

// Six feeds, fetched one after another (Toronto's filtered permit set is the big one).
export const maxDuration = 300;

/**
 * Weekly major-projects import (Vercel cron, Sundays 09:26 UTC — no other
 * cron uses that slot). Canada only. Each open-data source is fetched once,
 * filtered (permits: >= MAJOR_PROJECT_PERMIT_MIN, default C$5M, commercial /
 * institutional / industrial / multi-residential), then upserted in small
 * sequential batches. Rows a source stops listing are marked stale, never
 * deleted; a feed that suddenly shrinks by half marks nothing stale.
 *
 *   ?dry=1          fetch + parse + plan, write nothing (works without the
 *                   service key too: then it only reports parsed counts)
 *   ?source=<key>   one source only (e.g. permits-toronto)
 * Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const dry = params.get("dry") === "1";
  const only = params.get("source");
  const service = isServiceConfigured();
  if (!service && !dry) return NextResponse.json({ skipped: "no service client" });

  const today = new Date().toISOString().slice(0, 10);
  const minValue = permitMinValue();
  const supabase = service ? createServiceClient() : null;
  const regions = supabase ? await loadRegionLookup(supabase) : null;
  const sources = PROJECT_SOURCES.filter((s) => !only || s.key === only);
  const report: Record<string, unknown>[] = [];
  let failed = 0;

  for (const source of sources) {
    const started = Date.now();
    let rows: MajorProjectInput[];
    try {
      rows = await source.collect({ today, minValue });
    } catch (e) {
      failed++;
      report.push({ source: source.key, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const entry: Record<string, unknown> = {
      source: source.key,
      parsed: rows.length,
      byStatus: countBy(rows, (r) => r.status),
      byProvince: countBy(rows, (r) => r.province ?? "?"),
      ms: Date.now() - started,
    };
    if (supabase && regions) {
      try {
        const existing = await loadExisting(supabase, source.key);
        const plan = planSync({
          source: source.key,
          incoming: rows,
          existing,
          today,
          now: new Date().toISOString(),
          regionIdBySlug: regions.bySlug,
          provinceRegionId: regions.provinceRegionId,
        });
        Object.assign(entry, planSummary(plan));
        if (!dry) await applySync(supabase, plan, today);
      } catch (e) {
        failed++;
        entry.error = e instanceof Error ? e.message : String(e);
      }
    }
    if (dry) entry.sample = rows.slice(0, 2).map((r) => ({ name: r.name, city: r.city, value: r.estValueCad, status: r.status, category: r.category }));
    report.push(entry);
  }

  return NextResponse.json({ dry, today, minValue, sources: report }, { status: failed && failed === sources.length ? 500 : 200 });
}

function countBy<T>(rows: readonly T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return out;
}
