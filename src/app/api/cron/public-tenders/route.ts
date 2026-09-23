import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import {
  classifyTender,
  fetchOpenTenders,
  regionForTender,
  toRfpInsert,
  type TenderInsert,
} from "@/lib/tenders/canadabuys";

export const maxDuration = 60;

/**
 * Daily public-tender import (Vercel cron, 12:00 UTC — an hour before the
 * rfp-alerts digest so today's new tenders alert the same day).
 *
 * Pulls every open federal tender from CanadaBuys open data, keeps only the
 * services/construction work PMRFP trades actually bid on, and publishes it
 * to the board as source_type='public_source' with the official notice link
 * and the Open Government Licence attribution.
 *
 *   new tender            → insert + categories
 *   still open, amended   → refresh title/summary/scope/deadline
 *   gone from the feed    → archive (closed/cancelled/awarded; drops off the board)
 *
 * Never touches PM-posted RFPs — every query is scoped to public_source.
 * `?dry=1` reports what would change without writing anything.
 * Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  let feed;
  try {
    feed = await fetchOpenTenders();
  } catch (err) {
    console.error("[public-tenders] fetch failed:", err);
    // Don't archive anything on a failed fetch — an empty feed would look
    // like every tender vanished.
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  const [{ data: cats }, { data: regions }, { data: existing }] = await Promise.all([
    supabase.from("trade_categories").select("id,slug"),
    supabase.from("regions").select("id,slug"),
    supabase
      .from("rfp_posts")
      .select("id,source_url,status,deadline")
      .eq("source_type", "public_source"),
  ]);
  const catId = new Map((cats ?? []).map((c: { id: string; slug: string }) => [c.slug, c.id]));
  const regionId = new Map((regions ?? []).map((r: { id: string; slug: string }) => [r.slug, r.id]));
  const bySource = new Map(
    ((existing ?? []) as ExistingRow[]).filter((e) => e.source_url).map((e) => [e.source_url as string, e]),
  );

  const toInsert: (TenderInsert & { region_id: string | null })[] = [];
  const categoriesBySource = new Map<string, string[]>();
  const openSources = new Set<string>();
  let refreshed = 0;

  for (const row of feed) {
    const slugs = classifyTender(row, today);
    if (!slugs.length) continue;
    const ins = toRfpInsert(row, today);
    // The feed can list one tender twice (amendment rows) — a duplicate in
    // the batch would trip the slug unique index and fail the whole insert.
    if (!ins || openSources.has(ins.source_url)) continue;
    openSources.add(ins.source_url);

    const prior = bySource.get(ins.source_url);
    if (prior) {
      // Amendments often move the closing date; keep live listings current.
      if (prior.status === "published" && !dry) {
        const { error } = await supabase
          .from("rfp_posts")
          .update({ title: ins.title, summary: ins.summary, scope: ins.scope, deadline: ins.deadline })
          .eq("id", prior.id)
          .eq("source_type", "public_source");
        if (!error) refreshed++;
      }
      continue;
    }
    toInsert.push({ ...ins, region_id: regionId.get(regionForTender(row).regionSlug) ?? null });
    categoriesBySource.set(
      ins.source_url,
      slugs.map((s) => catId.get(s)).filter((id): id is string => !!id),
    );
  }

  if (dry) {
    return NextResponse.json({
      dry: true,
      feed: feed.length,
      matched: openSources.size,
      wouldInsert: toInsert.length,
      wouldArchive: openSources.size < 10 ? 0 : ((existing ?? []) as ExistingRow[]).filter(
        (e) => e.status === "published" && (!e.source_url || !openSources.has(e.source_url)),
      ).length,
      sample: toInsert.slice(0, 8).map((t) => ({ title: t.title, deadline: t.deadline, slug: t.slug })),
    });
  }

  let inserted = 0;
  if (toInsert.length) {
    const { data: rows, error } = await supabase
      .from("rfp_posts")
      .insert(toInsert)
      .select("id,source_url");
    if (error) {
      console.error("[public-tenders] insert failed:", error.message);
      return NextResponse.json({ error: "insert failed", detail: error.message }, { status: 500 });
    }
    const links = ((rows ?? []) as { id: string; source_url: string }[]).flatMap((r) =>
      (categoriesBySource.get(r.source_url) ?? []).map((category_id) => ({ rfp_id: r.id, category_id })),
    );
    if (links.length) {
      const { error: catErr } = await supabase.from("rfp_categories").insert(links);
      if (catErr) console.error("[public-tenders] category link failed:", catErr.message);
    }
    inserted = rows?.length ?? 0;
  }

  // Archive anything no longer in the open feed — it closed, was cancelled,
  // or was awarded. The feed only lists open tenders, so absence is the
  // signal. Guard: if today's match count collapses (format change, partial
  // download), skip archiving rather than wipe the board.
  const toArchive =
    openSources.size < 10
      ? []
      : ((existing ?? []) as ExistingRow[])
          .filter((e) => e.status === "published" && (!e.source_url || !openSources.has(e.source_url)))
          .map((e) => e.id);
  let archived = 0;
  if (toArchive.length) {
    const { error } = await supabase
      .from("rfp_posts")
      .update({ status: "archived", closed_at: new Date().toISOString() })
      .in("id", toArchive)
      .eq("source_type", "public_source");
    if (!error) archived = toArchive.length;
  }

  return NextResponse.json({ feed: feed.length, matched: openSources.size, inserted, refreshed, archived });
}

interface ExistingRow {
  id: string;
  source_url: string | null;
  status: string;
  deadline: string | null;
}
