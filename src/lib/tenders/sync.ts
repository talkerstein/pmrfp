/**
 * Shared write path for every public-tender cron: fetch each source, insert
 * new tenders, refresh changed ones, archive ones that left their feed.
 * Each cron route passes its own sources (Canada in /api/cron/public-tenders,
 * SAM.gov in /api/cron/us-tenders) so each gets its own time budget; a run
 * only ever archives rows of the sources it ran.
 *
 *   new tender            → insert + categories
 *   still open, amended   → refresh title/summary/scope/deadline
 *   gone from the feed    → archive (closed/cancelled/awarded; drops off the board)
 *
 * Never touches PM-posted RFPs — every query is scoped to public_source.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { publicTenderSource } from "./sources";
import type { TenderInsert } from "./canadabuys";

export interface Candidate {
  insert: TenderInsert;
  categories: string[];
  regionSlug: string;
}

export interface Source {
  key: string;
  /** Below this many matches, assume a bad download and don't archive. */
  minMatchesToArchive: number;
  /** Region used when a candidate's slug doesn't exist yet. */
  fallbackRegion?: string;
  collect: (today: string) => Promise<Candidate[]>;
}

type Service = ReturnType<typeof createServiceClient>;

export async function syncPublicSources(supabase: Service, sources: Source[], opts: { today: string; dry: boolean }) {
  const { today, dry } = opts;

  // Fetch every source; a failed one is skipped (and its tenders untouched).
  const results = await Promise.all(
    sources.map(async (src) => {
      try {
        return { src, candidates: await src.collect(today), ok: true as const };
      } catch (err) {
        console.error(`[public-tenders] ${src.key} fetch failed:`, err);
        return { src, candidates: [] as Candidate[], ok: false as const };
      }
    }),
  );
  if (results.every((r) => !r.ok)) return { status: 502, body: { error: "all sources failed" } };

  const [{ data: cats }, { data: regions }, existing] = await Promise.all([
    supabase.from("trade_categories").select("id,slug"),
    supabase.from("regions").select("id,slug"),
    allExistingPublic(supabase),
  ]);
  const catId = new Map((cats ?? []).map((c: { id: string; slug: string }) => [c.slug, c.id]));
  const regionId = new Map((regions ?? []).map((r: { id: string; slug: string }) => [r.slug, r.id]));
  // Unknown slug (e.g. a region not created yet) → the source's country, not blank.
  const resolveRegion = (slug: string, fallback = "canada"): string | null =>
    regionId.get(slug) ?? regionId.get(fallback) ?? null;
  const bySource = new Map(existing.filter((e) => e.source_url).map((e) => [e.source_url as string, e]));

  const toInsert: (TenderInsert & { region_id: string | null })[] = [];
  const categoriesBySource = new Map<string, string[]>();
  const openSources = new Set<string>();
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
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

      const region = resolveRegion(regionSlug, src.fallbackRegion);
      const prior = bySource.get(ins.source_url);
      if (prior) {
        // Amendments move closing dates; region mapping improves. Only write
        // rows that actually changed — one UPDATE per unchanged row blew the
        // 60 s limit once the feed passed ~600 listings.
        if (prior.status === "published") {
          const changed =
            prior.title !== ins.title ||
            (prior.deadline ?? null) !== (ins.deadline ?? null) ||
            (!!region && prior.region_id !== region);
          if (changed) {
            updates.push({
              id: prior.id,
              patch: {
                title: ins.title,
                summary: ins.summary,
                scope: ins.scope,
                deadline: ins.deadline,
                // never blank a region we already had
                ...(region ? { region_id: region } : {}),
              },
            });
          }
        }
        continue;
      }
      toInsert.push({ ...ins, region_id: region });
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
  const archiveRows = existing
    .filter((e) => e.status === "published" && archivable.has(publicTenderSource(e.slug).key))
    .filter((e) => !e.source_url || !openSources.has(e.source_url));
  const toArchive = archiveRows.map((e) => e.id);

  const matched = Object.fromEntries(matchedBySource);
  const failed = results.filter((r) => !r.ok).map((r) => r.src.key);

  if (dry) {
    return {
      status: 200,
      body: {
        dry: true,
        matched,
        failed,
        wouldInsert: toInsert.length,
        wouldRefresh: updates.length,
        wouldArchive: toArchive.length,
        sample: toInsert.slice(0, 8).map((t) => ({ title: t.title, deadline: t.deadline, slug: t.slug })),
        archiveSample: archiveRows.slice(0, 8).map((e) => ({ title: e.title, deadline: e.deadline, slug: e.slug })),
      },
    };
  }

  let refreshed = 0;
  for (let i = 0; i < updates.length; i += 25) {
    const res = await Promise.all(
      updates.slice(i, i + 25).map(({ id, patch }) =>
        supabase.from("rfp_posts").update(patch).eq("id", id).eq("source_type", "public_source"),
      ),
    );
    refreshed += res.filter((r) => !r.error).length;
  }

  // Chunked: a first import can be hundreds of rows with 8 KB scopes each.
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 200) {
    const { data: rows, error } = await supabase
      .from("rfp_posts")
      .insert(toInsert.slice(i, i + 200))
      .select("id,source_url");
    if (error) {
      console.error("[public-tenders] insert failed:", error.message);
      return { status: 500, body: { error: "insert failed", detail: error.message, inserted } };
    }
    const links = ((rows ?? []) as { id: string; source_url: string }[]).flatMap((r) =>
      (categoriesBySource.get(r.source_url) ?? []).map((category_id) => ({ rfp_id: r.id, category_id })),
    );
    if (links.length) {
      const { error: catErr } = await supabase.from("rfp_categories").insert(links);
      if (catErr) console.error("[public-tenders] category link failed:", catErr.message);
    }
    inserted += rows?.length ?? 0;
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

  return { status: 200, body: { matched, failed, inserted, refreshed, archived } };
}

interface ExistingRow {
  id: string;
  title: string;
  region_id: string | null;
  slug: string;
  source_url: string | null;
  status: string;
  deadline: string | null;
}

/**
 * Every public-source row, paged. PostgREST caps a response at 1,000 rows;
 * past that, rows beyond the cap looked "new", were re-inserted, and the
 * slug unique index failed the whole batch.
 */
async function allExistingPublic(supabase: Service): Promise<ExistingRow[]> {
  const PAGE = 1000;
  const out: ExistingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("rfp_posts")
      .select("id,slug,source_url,status,deadline,title,region_id")
      .eq("source_type", "public_source")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`existing rows lookup failed: ${error.message}`);
    out.push(...((data ?? []) as ExistingRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
