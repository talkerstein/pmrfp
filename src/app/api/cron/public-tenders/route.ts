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
import { classifyToronto, fetchTorontoSolicitations, torontoToRfpInsert } from "@/lib/tenders/toronto";
import { publicTenderSource } from "@/lib/tenders/sources";
import { awardToRfpInsert, classifyAward, fetchAwards } from "@/lib/tenders/awards";
import {
  classifySeao,
  classifySeaoAward,
  fetchSeaoReleases,
  regionForSeao,
  seaoAwardToRfpInsert,
  seaoToRfpInsert,
} from "@/lib/tenders/seao";

interface Candidate {
  insert: TenderInsert;
  categories: string[];
  regionSlug: string;
}

interface Source {
  key: "canadabuys" | "toronto" | "awards" | "seao";
  /** Below this many matches, assume a bad download and don't archive. */
  minMatchesToArchive: number;
  collect: (today: string) => Promise<Candidate[]>;
}

const SOURCES: Source[] = [
  {
    key: "canadabuys",
    minMatchesToArchive: 10,
    collect: async (today) =>
      (await fetchOpenTenders()).flatMap((row) => {
        const categories = classifyTender(row, today);
        const insert = categories.length ? toRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: regionForTender(row).regionSlug }] : [];
      }),
  },
  {
    key: "toronto",
    minMatchesToArchive: 3,
    collect: async (today) =>
      (await fetchTorontoSolicitations()).flatMap((row) => {
        const categories = classifyToronto(row, today);
        const insert = categories.length ? torontoToRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: "toronto" }] : [];
      }),
  },
  {
    // Quebec: six weekly OCDS files, newest release per tender, open calls only.
    key: "seao",
    minMatchesToArchive: 25,
    // Same files, two outputs: open calls, and past contracts (who won,
    // for how much) from award releases.
    collect: async (today) =>
      (await fetchSeaoReleases()).flatMap((r) => {
        const open = classifySeao(r, today);
        if (open.length) {
          const insert = seaoToRfpInsert(r, today);
          return insert ? [{ insert, categories: open, regionSlug: regionForSeao(r) }] : [];
        }
        const past = classifySeaoAward(r, today);
        const insert = past.length ? seaoAwardToRfpInsert(r, today) : null;
        return insert ? [{ insert, categories: past, regionSlug: regionForSeao(r) }] : [];
      }),
  },
  {
    // Past contracts: the "feed" is every trade award in the last 180 days,
    // so anything that ages out of the window is archived by the same rule.
    key: "awards",
    minMatchesToArchive: 20,
    collect: async (today) =>
      (await fetchAwards(today)).flatMap((row) => {
        const categories = classifyAward(row, today);
        const insert = categories.length ? awardToRfpInsert(row, today) : null;
        return insert ? [{ insert, categories, regionSlug: regionForTender(row).regionSlug }] : [];
      }),
  },
];

export const maxDuration = 60;

/**
 * Daily public-tender import (Vercel cron, 12:00 UTC — an hour before the
 * rfp-alerts digest so today's new tenders alert the same day).
 *
 * Pulls open public tenders (CanadaBuys federal + City of Toronto open data),
 * keeps only the work PMRFP trades actually bid on, and publishes it to the
 * board as source_type='public_source' with the official notice link and the
 * matching Open Government Licence attribution. Each source is independent:
 * one failing download never archives another source's tenders.
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

  // Fetch every source; a failed one is skipped (and its tenders untouched).
  const results = await Promise.all(
    SOURCES.map(async (src) => {
      try {
        return { src, candidates: await src.collect(today), ok: true as const };
      } catch (err) {
        console.error(`[public-tenders] ${src.key} fetch failed:`, err);
        return { src, candidates: [] as Candidate[], ok: false as const };
      }
    }),
  );
  if (results.every((r) => !r.ok)) return NextResponse.json({ error: "all sources failed" }, { status: 502 });

  const [{ data: cats }, { data: regions }, { data: existing }] = await Promise.all([
    supabase.from("trade_categories").select("id,slug"),
    supabase.from("regions").select("id,slug"),
    supabase
      .from("rfp_posts")
      .select("id,slug,source_url,status,deadline")
      .eq("source_type", "public_source"),
  ]);
  const catId = new Map((cats ?? []).map((c: { id: string; slug: string }) => [c.slug, c.id]));
  const regionId = new Map((regions ?? []).map((r: { id: string; slug: string }) => [r.slug, r.id]));
  // Unknown slug (e.g. a province region not created yet) → national, not blank.
  const resolveRegion = (slug: string): string | null => regionId.get(slug) ?? regionId.get("canada") ?? null;
  const bySource = new Map(
    ((existing ?? []) as ExistingRow[]).filter((e) => e.source_url).map((e) => [e.source_url as string, e]),
  );

  const toInsert: (TenderInsert & { region_id: string | null })[] = [];
  const categoriesBySource = new Map<string, string[]>();
  const openSources = new Set<string>();
  let refreshed = 0;

  const matchedBySource = new Map<string, number>();
  for (const { src, candidates, ok } of results) {
    if (!ok) continue;
    let matched = 0;
    for (const { insert: ins, categories: slugs, regionSlug } of candidates) {
      // A feed can list one tender twice (amendment rows) — a duplicate in
      // the batch would trip the slug unique index and fail the whole insert.
      if (openSources.has(ins.source_url)) continue;
      openSources.add(ins.source_url);
      matched++;

      const prior = bySource.get(ins.source_url);
      if (prior) {
        // Amendments often move the closing date; keep live listings current.
        if (prior.status === "published" && !dry) {
          const { error } = await supabase
            .from("rfp_posts")
            .update({
              title: ins.title,
              summary: ins.summary,
              scope: ins.scope,
              deadline: ins.deadline,
              // Re-file existing rows when region mapping improves (e.g. new
              // province regions) — never blank a region we already had.
              ...(resolveRegion(regionSlug) ? { region_id: resolveRegion(regionSlug) } : {}),
            })
            .eq("id", prior.id)
            .eq("source_type", "public_source");
          if (!error) refreshed++;
        }
        continue;
      }
      toInsert.push({ ...ins, region_id: resolveRegion(regionSlug) });
      categoriesBySource.set(
        ins.source_url,
        slugs.map((s) => catId.get(s)).filter((id): id is string => !!id),
      );
    }
    matchedBySource.set(src.key, matched);
  }

  // Archive per source: only sources that downloaded fine AND matched a sane
  // number of tenders may archive their own rows that left the open feed.
  const archivable = new Set(
    results
      .filter((r) => r.ok && (matchedBySource.get(r.src.key) ?? 0) >= r.src.minMatchesToArchive)
      .map((r) => r.src.key),
  );
  const toArchive = ((existing ?? []) as ExistingRow[])
    .filter((e) => e.status === "published" && archivable.has(publicTenderSource(e.slug).key))
    .filter((e) => !e.source_url || !openSources.has(e.source_url))
    .map((e) => e.id);

  if (dry) {
    return NextResponse.json({
      dry: true,
      matched: Object.fromEntries(matchedBySource),
      failed: results.filter((r) => !r.ok).map((r) => r.src.key),
      wouldInsert: toInsert.length,
      wouldArchive: toArchive.length,
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

  let archived = 0;
  if (toArchive.length) {
    const { error } = await supabase
      .from("rfp_posts")
      .update({ status: "archived", closed_at: new Date().toISOString() })
      .in("id", toArchive)
      .eq("source_type", "public_source");
    if (!error) archived = toArchive.length;
  }

  return NextResponse.json({
    matched: Object.fromEntries(matchedBySource),
    failed: results.filter((r) => !r.ok).map((r) => r.src.key),
    inserted,
    refreshed,
    archived,
  });
}

interface ExistingRow {
  id: string;
  slug: string;
  source_url: string | null;
  status: string;
  deadline: string | null;
}
