/**
 * Import bookkeeping for major_projects: what to insert, update, touch and
 * mark stale for one source. planSync() is pure (unit tested);
 * applySync() runs the plan against Supabase with the service role in
 * small sequential batches — no fan-out (incident 2026-10-09).
 *
 * Rules:
 *  - A row the source no longer lists is marked stale (stale = true,
 *    stale_since = today), never deleted. It comes back to life if the
 *    source lists it again.
 *  - A feed that suddenly returns far fewer rows than we hold (broken
 *    endpoint, schema change) marks nothing stale: the run reports it.
 *  - Manual research rows are never marked stale (each file is partial),
 *    and any CONTENT change sends an approved/rejected manual row back to
 *    the admin queue (approved = false, review_status = 'pending').
 *  - Open-data rows never have approved / review_status touched after
 *    insert, so an admin's "reject" (hide) sticks.
 *  - A row whose imported content is unchanged only gets last_seen bumped,
 *    so admin edits survive until the source itself changes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { projectSlug, type MajorProjectInput, type MajorProjectStatus } from "./model";
import { MANUAL_SOURCE } from "./research-csv";

export interface ExistingProject {
  id: string;
  slug: string;
  source_key: string;
  status: MajorProjectStatus;
  stale: boolean;
  approved: boolean;
  review_status: "pending" | "approved" | "rejected";
  last_seen: string;
  import_fingerprint: string | null;
}

export type DbRow = Record<string, unknown>;

export interface SyncPlan {
  source: string;
  inserts: DbRow[];
  updates: DbRow[];
  /** source_keys seen again with no content change (last_seen bump / un-stale). */
  touch: string[];
  /** source_keys the source no longer lists. */
  stale: string[];
  statusChanges: { sourceKey: string; from: MajorProjectStatus; to: MajorProjectStatus }[];
  /** Manual rows sent back to the review queue by a content change. */
  requeued: number;
  /** Stale marking was skipped because the feed looks broken. */
  staleGuardTripped: boolean;
}

/** Below this share of the rows we already hold, a feed is treated as broken. */
export const MIN_FEED_RATIO = 0.5;

/** Stable content hash (FNV-1a over sorted JSON) — not crypto, just change detection. */
export function fingerprint(p: MajorProjectInput): string {
  const json = JSON.stringify(p, Object.keys(p).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${json.length.toString(36)}-${h.toString(36)}`;
}

/** Content columns for one project (no bookkeeping). */
export function contentColumns(p: MajorProjectInput, regionIdBySlug: ReadonlyMap<string, string>, provinceRegion: (province: string | null) => string | null): DbRow {
  return {
    source: p.source,
    source_key: p.sourceKey,
    country: "CA",
    name: p.name,
    description: p.description,
    category: p.category,
    owner: p.owner,
    city: p.city,
    province: p.province,
    region_id: (p.regionSlug ? regionIdBySlug.get(p.regionSlug) : undefined) ?? provinceRegion(p.province),
    est_value_cad: p.estValueCad,
    size: p.size,
    status: p.status,
    status_raw: p.statusRaw,
    status_date: p.statusDate,
    timeline: p.timeline,
    general_contractor: p.generalContractor,
    bid_list_url: p.bidListUrl,
    bid_route: p.bidRoute,
    trades_needed: p.tradesNeeded,
    sources: p.sources,
    license: p.license,
    evidence: p.evidence,
    caveats: p.caveats,
  };
}

export function planSync(input: {
  source: string;
  incoming: readonly MajorProjectInput[];
  existing: readonly ExistingProject[];
  today: string;
  now: string;
  regionIdBySlug: ReadonlyMap<string, string>;
  /** province full name → region id (the province's own region). */
  provinceRegionId?: (province: string | null) => string | null;
}): SyncPlan {
  const { source, today, now } = input;
  const manual = source === MANUAL_SOURCE;
  const provinceRegion = input.provinceRegionId ?? (() => null);
  const byKey = new Map(input.existing.map((e) => [e.source_key, e]));
  const plan: SyncPlan = { source, inserts: [], updates: [], touch: [], stale: [], statusChanges: [], requeued: 0, staleGuardTripped: false };
  const seen = new Set<string>();

  for (const p of input.incoming) {
    if (p.source !== source || seen.has(p.sourceKey)) continue;
    seen.add(p.sourceKey);
    const fp = fingerprint(p);
    const old = byKey.get(p.sourceKey);
    const content = contentColumns(p, input.regionIdBySlug, provinceRegion);
    if (!old) {
      plan.inserts.push({
        ...content,
        slug: projectSlug(p.name, p.sourceKey),
        approved: !manual,
        review_status: manual ? "pending" : "approved",
        first_seen: today,
        last_seen: today,
        stale: false,
        stale_since: null,
        import_fingerprint: fp,
      });
      continue;
    }
    if (old.import_fingerprint === fp) {
      if (old.last_seen !== today || old.stale) plan.touch.push(p.sourceKey);
      continue;
    }
    const row: DbRow = { ...content, slug: old.slug, last_seen: today, stale: false, stale_since: null, import_fingerprint: fp };
    if (old.status !== p.status) {
      row.previous_status = old.status;
      row.status_changed_at = now;
      plan.statusChanges.push({ sourceKey: p.sourceKey, from: old.status, to: p.status });
    }
    if (manual && (old.approved || old.review_status !== "pending")) {
      row.approved = false;
      row.review_status = "pending";
      plan.requeued++;
    }
    plan.updates.push(row);
  }

  if (!manual) {
    const active = input.existing.filter((e) => !e.stale);
    const missing = active.filter((e) => !seen.has(e.source_key));
    if (missing.length && seen.size < active.length * MIN_FEED_RATIO) plan.staleGuardTripped = true;
    else plan.stale = missing.map((e) => e.source_key);
  }
  return plan;
}

/* ------------------------------------------------------------------ apply */

const BATCH = 200;
/** Keys per `.in()` filter, so the URL stays short. */
const IN_BATCH = 100;
const PAGE = 1000;

/** Rows grouped by their exact column set. */
export function groupByShape(rows: readonly DbRow[]): DbRow[][] {
  const groups = new Map<string, DbRow[]>();
  for (const r of rows) {
    const k = Object.keys(r).sort().join(",");
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.values()];
}

function chunks<T>(items: readonly T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Every row we hold for one source (keyset-paged, bookkeeping columns only). */
export async function loadExisting(supabase: SupabaseClient, source: string): Promise<ExistingProject[]> {
  const out: ExistingProject[] = [];
  let after: string | null = null;
  for (;;) {
    let q = supabase
      .from("major_projects")
      .select("id,slug,source_key,status,stale,approved,review_status,last_seen,import_fingerprint")
      .eq("source", source)
      .order("id")
      .limit(PAGE);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw new Error(`major_projects read: ${error.message}`);
    const page = (data ?? []) as ExistingProject[];
    out.push(...page);
    if (page.length < PAGE) return out;
    after = page[page.length - 1].id;
  }
}

/** regions slug → id, and province name → that province's region id (one small read). */
export async function loadRegionLookup(supabase: SupabaseClient): Promise<{ bySlug: Map<string, string>; provinceRegionId: (p: string | null) => string | null }> {
  const { data } = await supabase.from("regions").select("id,slug,name,country");
  const rows = ((data ?? []) as { id: string; slug: string; name: string; country: string | null }[]).filter(
    (r) => (r.country ?? "Canada").toLowerCase() === "canada",
  );
  const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
  const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
  return { bySlug, provinceRegionId: (p) => (p ? byName.get(p.toLowerCase()) ?? null : null) };
}

/** Writes a plan: sequential batches of 200, one statement each. */
export async function applySync(supabase: SupabaseClient, plan: SyncPlan, today: string): Promise<void> {
  for (const batch of chunks(plan.inserts)) {
    const { error } = await supabase.from("major_projects").upsert(batch, { onConflict: "source_key", ignoreDuplicates: true });
    if (error) throw new Error(`major_projects insert: ${error.message}`);
  }
  // A bulk upsert writes the union of its rows' columns (missing ones as
  // NULL), so rows go out in groups with identical column sets.
  for (const group of groupByShape(plan.updates)) {
    for (const batch of chunks(group)) {
      const { error } = await supabase.from("major_projects").upsert(batch, { onConflict: "source_key" });
      if (error) throw new Error(`major_projects update: ${error.message}`);
    }
  }
  for (const keys of chunks(plan.touch, IN_BATCH)) {
    const { error } = await supabase
      .from("major_projects")
      .update({ last_seen: today, stale: false, stale_since: null })
      .in("source_key", keys);
    if (error) throw new Error(`major_projects touch: ${error.message}`);
  }
  for (const keys of chunks(plan.stale, IN_BATCH)) {
    const { error } = await supabase
      .from("major_projects")
      .update({ stale: true, stale_since: today })
      .in("source_key", keys)
      .eq("stale", false);
    if (error) throw new Error(`major_projects stale: ${error.message}`);
  }
}

export function planSummary(plan: SyncPlan) {
  return {
    inserts: plan.inserts.length,
    updates: plan.updates.length,
    touched: plan.touch.length,
    markedStale: plan.stale.length,
    statusChanges: plan.statusChanges.length,
    requeued: plan.requeued,
    staleGuardTripped: plan.staleGuardTripped,
  };
}
