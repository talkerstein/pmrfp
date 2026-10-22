import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadClient } from "@/lib/supabase/read";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MAJOR_PROJECTS_TAG } from "@/lib/supabase/public-cache";
import { createLimiter, createSingleFlight } from "@/lib/concurrency";
import type { MajorProjectCategory, MajorProjectStatus, ProjectSourceLink } from "./model";

/**
 * ONE shared, server-cached copy of the public major-projects list (the
 * major_projects_public view), same pattern as lib/data/board-snapshot:
 * 16 shards by the first hex digit of the id (wave 2 brought the list to
 * several thousand rows; each shard stays well under the data cache's
 * per-entry size limit), each its own Next data-cache entry (tag
 * "major-projects", 1 hour), keyset-paged, at most 2 shard loads
 * at once and one load per shard in flight per server instance. Every page
 * (index, detail, related lists) reads this snapshot — never the table per
 * request. Imports mark the tag stale (lib/supabase/write-fetch).
 *
 * The Trade Pro fields (general contractor, bid-list link, bid route) are not
 * in the view: getProjectProFields() reads them for one project through the
 * visitor's own session, so RLS decides (Trade Pro members and admins only).
 */

export const MP_SHARDS = 16;
export const MP_REVALIDATE = 21600;
const PAGE = 1000;
const READ_TIMEOUT_MS = 10_000;

export interface MajorProject {
  id: string;
  slug: string;
  source: string;
  name: string;
  description: string | null;
  category: MajorProjectCategory;
  owner: string | null;
  city: string | null;
  province: string | null;
  regionId: string | null;
  estValueCad: number | null;
  size: string | null;
  status: MajorProjectStatus;
  statusRaw: string | null;
  statusDate: string | null;
  timeline: string | null;
  tradesNeeded: string[];
  sources: ProjectSourceLink[];
  license: string;
  evidence: "F" | "S" | "A" | null;
  caveats: string | null;
  firstSeen: string;
  lastSeen: string;
  stale: boolean;
  staleSince: string | null;
  statusChangedAt: string | null;
  updatedAt: string;
  hasGc: boolean;
  hasBidRoute: boolean;
  /** When the publisher last updated the record, if it says (BC: 2024-12-01). */
  sourceUpdated: string | null;
  /** Same project in another source (the id of one member of the group). */
  linkGroup: string | null;
}

interface ViewRow {
  id: string; slug: string; source: string; name: string; description: string | null;
  category: MajorProjectCategory; owner: string | null; city: string | null; province: string | null;
  region_id: string | null; est_value_cad: number | string | null; size: string | null;
  status: MajorProjectStatus; status_raw: string | null; status_date: string | null; timeline: string | null;
  trades_needed: string[] | null; sources: ProjectSourceLink[] | null; license: string;
  evidence: "F" | "S" | "A" | null; caveats: string | null; first_seen: string; last_seen: string;
  stale: boolean; stale_since: string | null; status_changed_at: string | null; updated_at: string;
  has_gc: boolean; has_bid_route: boolean;
  source_updated?: string | null; link_group?: string | null;
}

const BASE_COLUMNS =
  "id,slug,source,name,description,category,owner,city,province,region_id,est_value_cad,size,status,status_raw,status_date,timeline,trades_needed,sources,license,evidence,caveats,first_seen,last_seen,stale,stale_since,status_changed_at,updated_at,has_gc,has_bid_route";
/** Wave-2 columns (migration 20261012000003). */
const COLUMNS = `${BASE_COLUMNS},source_updated,link_group`;

export function fromViewRow(r: ViewRow): MajorProject {
  const value = r.est_value_cad == null ? null : Number(r.est_value_cad);
  return {
    id: r.id,
    slug: r.slug,
    source: r.source,
    name: r.name,
    description: r.description,
    category: r.category,
    owner: r.owner,
    city: r.city,
    province: r.province,
    regionId: r.region_id,
    estValueCad: value != null && Number.isFinite(value) ? value : null,
    size: r.size,
    status: r.status,
    statusRaw: r.status_raw,
    statusDate: r.status_date,
    timeline: r.timeline,
    tradesNeeded: r.trades_needed ?? [],
    sources: Array.isArray(r.sources) ? r.sources.filter((s) => s && typeof s.url === "string") : [],
    license: r.license,
    evidence: r.evidence,
    caveats: r.caveats,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    stale: r.stale,
    staleSince: r.stale_since,
    statusChangedAt: r.status_changed_at,
    updatedAt: r.updated_at,
    hasGc: r.has_gc,
    hasBidRoute: r.has_bid_route,
    sourceUpdated: r.source_updated ?? null,
    linkGroup: r.link_group ?? null,
  };
}

/** Inclusive lower / exclusive upper UUID bound of a shard (null = open end). */
export function mpShardRange(shard: number): { lo: string | null; hi: string | null } {
  const step = 16 / MP_SHARDS;
  const bound = (digit: number) => `${digit.toString(16)}0000000-0000-0000-0000-000000000000`;
  return {
    lo: shard === 0 ? null : bound(shard * step),
    hi: shard === MP_SHARDS - 1 ? null : bound((shard + 1) * step),
  };
}

type Builder = {
  gte(column: string, value: string): Builder;
  gt(column: string, value: string): Builder;
  lt(column: string, value: string): Builder;
  abortSignal(signal: AbortSignal): Builder;
  retry?(enabled: boolean): Builder;
} & PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Reads one shard straight from Supabase (no cache). Exported for tests. */
export async function fetchProjectShard(shard: number): Promise<MajorProject[]> {
  try {
    return await readShard(shard, COLUMNS);
  } catch (e) {
    // Deployed before migration 20261012000003 ran: the view has no wave-2
    // columns yet. Keep the list up rather than empty.
    if (e instanceof Error && /source_updated|link_group/.test(e.message)) return readShard(shard, BASE_COLUMNS);
    throw e;
  }
}

async function readShard(shard: number, columns: string): Promise<MajorProject[]> {
  const { lo, hi } = mpShardRange(shard);
  const client = createReadClient();
  const out: MajorProject[] = [];
  let after: string | null = null;
  for (;;) {
    let q = client.from("major_projects_public").select(columns).order("id").limit(PAGE) as unknown as Builder;
    if (lo) q = q.gte("id", lo);
    if (hi) q = q.lt("id", hi);
    if (after) q = q.gt("id", after);
    q = q.abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
    if (typeof q.retry === "function") q = q.retry(false);
    const { data, error } = await q;
    if (error) throw new Error(`major_projects_public: ${error.message}`);
    const page = (data ?? []) as ViewRow[];
    out.push(...page.map(fromViewRow));
    if (page.length < PAGE) return out;
    after = page[page.length - 1].id;
  }
}

const limit = createLimiter(2);
const singleFlight = createSingleFlight();

const cachedShard = unstable_cache(
  async (shard: number, _projectUrl: string): Promise<MajorProject[]> =>
    singleFlight(`major-projects-shard:${shard}`, () => limit(() => fetchProjectShard(shard))),
  ["major-projects-shard-v2"],
  { tags: [MAJOR_PROJECTS_TAG], revalidate: MP_REVALIDATE },
);

/**
 * Every public major project, once per request (React cache) and from the
 * data cache across requests. Empty without Supabase (demo / build without
 * env) or before the migration runs.
 */
export const getMajorProjects = cache(async (): Promise<MajorProject[]> => {
  if (!isSupabaseConfigured()) return [];
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try {
    const shards = await Promise.all(Array.from({ length: MP_SHARDS }, (_, i) => cachedShard(i, projectUrl)));
    return shards.flat();
  } catch (e) {
    console.warn("[major-projects] snapshot unavailable", e instanceof Error ? e.message : e);
    return [];
  }
});

export const getMajorProject = cache(async (slug: string): Promise<MajorProject | null> => {
  return (await getMajorProjects()).find((p) => p.slug === slug) ?? null;
});

export interface ProjectProFields {
  generalContractor: string | null;
  bidListUrl: string | null;
  bidRoute: string | null;
}

/**
 * The Trade Pro fields for one project, read with the visitor's session:
 * RLS returns the row only to Trade Pro members and admins. Null otherwise.
 */
export async function getProjectProFields(id: string): Promise<ProjectProFields | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("major_projects")
    .select("general_contractor,bid_list_url,bid_route")
    .eq("id", id)
    .maybeSingle<{ general_contractor: string | null; bid_list_url: string | null; bid_route: string | null }>();
  if (error || !data) return null;
  return { generalContractor: data.general_contractor, bidListUrl: data.bid_list_url, bidRoute: data.bid_route };
}
