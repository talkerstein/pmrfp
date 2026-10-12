import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { fundingMinValue, permitMinValue, type MajorProjectInput } from "./model";
import { sourcesFor } from "./registry";
import type { SourceGroup } from "./sources";
import { refreshLinkGroups } from "./links";
import { applySync, loadExisting, loadRegionLookup, planSummary, planSync } from "./sync";

/**
 * One weekly major-projects import run (Vercel cron), shared by
 * /api/cron/major-projects (core) and /api/cron/major-projects/<group>
 * (funding, local). Canada only. Each source is fetched once, filtered
 * (permits >= MAJOR_PROJECT_PERMIT_MIN, default C$5M; funding lists and
 * capital plans >= MAJOR_PROJECT_FUNDING_MIN, default C$1M), then upserted
 * in small sequential batches. Rows a source stops listing are marked
 * stale, never deleted; a feed that suddenly shrinks by half marks nothing
 * stale. After a real run, cross-source link groups are recomputed.
 *
 *   ?dry=1          fetch + parse + plan, write nothing (works without the
 *                   service key too: then it only reports parsed counts)
 *   ?source=<key>   one source only, from any group (e.g. apps-toronto)
 * Protect with CRON_SECRET if set.
 */
export async function runMajorProjectImport(request: Request, group: SourceGroup): Promise<NextResponse> {
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
  const fundingMin = fundingMinValue();
  const supabase = service ? createServiceClient() : null;
  const regions = supabase ? await loadRegionLookup(supabase) : null;
  const sources = sourcesFor(group, only);
  const report: Record<string, unknown>[] = [];
  let failed = 0;

  for (const source of sources) {
    const started = Date.now();
    let rows: MajorProjectInput[];
    try {
      rows = await source.collect({ today, minValue, fundingMin });
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
      withValue: rows.filter((r) => r.estValueCad != null).length,
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

  let links: Record<string, unknown> | null = null;
  if (supabase && !dry && failed < sources.length) {
    try {
      links = await refreshLinkGroups(supabase);
    } catch (e) {
      links = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ dry, group: only ? null : group, today, minValue, fundingMin, sources: report, links }, { status: failed && failed === sources.length ? 500 : 200 });
}

function countBy<T>(rows: readonly T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return out;
}
