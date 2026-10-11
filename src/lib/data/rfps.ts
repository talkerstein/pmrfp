import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  DEMO_RFPS,
  categoryName,
  propertyTypeName,
  regionName,
  type DemoRfp,
} from "@/lib/demo-data";
import type { RfpDetail, RfpFilters, RfpListItem } from "@/lib/data/types";
import { displayTitle } from "@/lib/tenders/title";
import { getTaxonomyRows } from "./taxonomy";
import { countryOf } from "@/lib/visitor-geo";
import { getBoardIndex, getBoardRows, type BoardRow } from "./board-snapshot";

function demoToList(r: DemoRfp): RfpListItem {
  const today = new Date().toISOString().slice(0, 10);
  return {
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    categories: [categoryName(r.category)],
    regionName: regionName(r.region),
    propertyTypeName: propertyTypeName(r.propertyType),
    city: r.city,
    province: r.province,
    deadline: r.deadline,
    isDemo: true,
    photoUrls: [],
    status: r.deadline && r.deadline < today ? "closed" : "open",
    sourceType: null,
  };
}

function demoToDetail(r: DemoRfp): RfpDetail {
  return {
    ...demoToList(r),
    id: r.slug,
    scope: r.scope,
    requirements: r.requirements,
    budgetMin: r.budgetMin,
    budgetMax: r.budgetMax,
    budgetPublic: r.budgetPublic,
    desiredStartDate: null,
    siteVisitDate: null,
    submissionInstructions: "Submit your capability statement and proposal through PMRFP. The property manager will review interested vendors.",
    contactVisibility: r.contactVisibility,
    contactName: r.contactVisibility === "public_contact" ? "Property Manager" : null,
    contactEmail: r.contactVisibility === "public_contact" ? "rfp@example.com" : null,
    contactPhone: null,
    sourceUrl: null,
    sourceNotes: null,
  };
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** id → display-name lookups for the board, from the hour-cached taxonomy. */
const boardLookups = cache(async () => {
  const [regions, props, trades] = await Promise.all([
    getTaxonomyRows("regions"),
    getTaxonomyRows("property_types"),
    getTaxonomyRows("trade_categories"),
  ]);
  return {
    regionById: new Map(regions.map((r) => [r.id, r.name])),
    propById: new Map(props.map((r) => [r.id, r.name])),
    tradeById: new Map(trades.map((r) => [r.id, r.name])),
    regionBySlug: new Map(regions.map((r) => [r.slug, r.name])),
    propBySlug: new Map(props.map((r) => [r.slug, r.name])),
    tradeBySlug: new Map(trades.map((r) => [r.slug, r.name])),
  };
});
type Lookups = Awaited<ReturnType<typeof boardLookups>>;

function toListItem(r: BoardRow, m: Lookups, today: string): RfpListItem {
  return {
    slug: r.slug,
    ...displayTitle(r.title, r.sourceType),
    summary: r.summary,
    categories: r.categoryIds.map((id) => m.tradeById.get(id)).filter((n): n is string => Boolean(n)),
    regionName: r.regionId ? m.regionById.get(r.regionId) ?? null : null,
    propertyTypeName: r.propertyTypeId ? m.propById.get(r.propertyTypeId) ?? null : null,
    city: r.city,
    province: r.province,
    deadline: r.deadline,
    isDemo: r.isDemo,
    // Photos are attached to rendered cards only (withPublicRfpPhotos).
    photoUrls: [],
    // The view exposes only published RFPs. Past-deadline ones still show, but
    // as "closed" → the card grays them out as social proof of real activity.
    status: r.deadline && r.deadline < today ? "closed" : "open",
    sourceType: r.sourceType,
    gcProjectName: r.gcProjectName,
    awardedRfpId: r.awardedRfpId,
  };
}

/** The whole board as list items, built once per request from the shared snapshot. */
const boardItems = cache(async (): Promise<RfpListItem[]> => {
  const [rows, m] = await Promise.all([getBoardRows(), boardLookups()]);
  const today = todayUtc();
  return rows.map((r) => toListItem(r, m, today));
});

/**
 * The public board, filtered and sorted. Reads the shared snapshot (see
 * board-snapshot.ts): zero database queries when it's cached, and every
 * caller in the same request shares one copy. Includes past-deadline
 * listings (status "closed"); callers that only want open work filter on
 * status. photoUrls are always empty: hydrate the cards you render with
 * withPublicRfpPhotos().
 */
export async function listRfps(filters: RfpFilters = {}): Promise<RfpListItem[]> {
  if (!isSupabaseConfigured()) {
    let out = [...DEMO_RFPS];
    if (filters.country) out = out.filter((r) => countryOf(r) === filters.country);
    if (filters.category) out = out.filter((r) => r.category === filters.category);
    if (filters.region) out = out.filter((r) => r.region === filters.region);
    if (filters.propertyType) out = out.filter((r) => r.propertyType === filters.propertyType);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      out = out.filter((r) => r.title.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q));
    }
    if (filters.sort === "newest") out.sort((a, b) => b.slug.localeCompare(a.slug));
    else out.sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
    return out.map(demoToList);
  }

  const [all, m] = await Promise.all([boardItems(), boardLookups()]);
  return filterAndSort(all, filters, m);
}

/** Pure filter + sort over list items (exported for tests). */
export function filterAndSort(
  all: readonly RfpListItem[],
  filters: RfpFilters,
  m: Pick<Lookups, "regionBySlug" | "propBySlug" | "tradeBySlug">,
): RfpListItem[] {
  let mapped = [...all];
  if (filters.country) mapped = mapped.filter((r) => countryOf(r) === filters.country);
  if (filters.region) {
    const name = m.regionBySlug.get(filters.region);
    mapped = mapped.filter((r) => r.regionName === name);
  }
  if (filters.propertyType) {
    const name = m.propBySlug.get(filters.propertyType);
    mapped = mapped.filter((r) => r.propertyTypeName === name);
  }
  if (filters.category) {
    const name = m.tradeBySlug.get(filters.category);
    mapped = mapped.filter((r) => name != null && r.categories.includes(name));
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    mapped = mapped.filter((r) => r.title.toLowerCase().includes(q) || (r.summary ?? "").toLowerCase().includes(q));
  }
  // Active (open) listings always lead; grayed "closed" proof sits below them.
  mapped.sort((a, b) => {
    const ra = a.status === "open" ? 0 : 1;
    const rb = b.status === "open" ? 0 : 1;
    if (ra !== rb) return ra - rb;
    if (ra === 1) return (b.deadline ?? "").localeCompare(a.deadline ?? ""); // closed: most recent first
    // No-deadline listings (standing qualification lists) sort LAST under
    // "closing soon" — "" would otherwise sort before every real date.
    if (!a.deadline !== !b.deadline) return a.deadline ? -1 : 1;
    return filters.sort === "newest"
      ? (b.deadline ?? "").localeCompare(a.deadline ?? "")
      : (a.deadline ?? "").localeCompare(b.deadline ?? "");
  });
  return mapped;
}

/** Snapshot lookup that never throws (a failing snapshot falls back to a direct read). */
async function boardRowFor(slug: string): Promise<BoardRow | null> {
  try {
    return (await getBoardIndex()).get(slug) ?? null;
  } catch {
    return null;
  }
}

export async function getRfpTeaser(slug: string): Promise<RfpListItem | null> {
  if (!isSupabaseConfigured()) {
    const r = DEMO_RFPS.find((x) => x.slug === slug);
    return r ? demoToList(r) : null;
  }
  const supabase = createReadClient();
  // From the shared snapshot when it has the listing: one photo read, nothing else.
  const snap = await boardRowFor(slug);
  if (snap) {
    const [m, photos] = await Promise.all([
      boardLookups(),
      // Imported public tenders never carry uploaded photos.
      snap.sourceType === "public_source" ? new Map<string, string[]>() : publicPhotosByRfp(supabase, [snap.id]),
    ]);
    return { ...toListItem(snap, m, todayUtc()), photoUrls: photos.get(snap.id) ?? [] };
  }
  // Not in the snapshot yet (published in the last few minutes) or snapshot unavailable.
  const { data } = await supabase.from("rfp_public").select("*").eq("slug", slug).maybeSingle();
  const r = data as RfpPublicRow | null;
  if (!r) return null;
  const [regionMap, propMap, cats, photos] = await Promise.all([
    publicIdNameMap("regions"),
    publicIdNameMap("property_types"),
    categoriesByRfp(supabase, [r.id]),
    publicPhotosByRfp(supabase, [r.id]),
  ]);
  return {
    slug: r.slug,
    ...displayTitle(r.title, r.source_type),
    summary: r.summary,
    categories: cats.get(r.id) ?? [],
    regionName: r.region_id ? regionMap.get(r.region_id) ?? null : null,
    propertyTypeName: r.property_type_id ? propMap.get(r.property_type_id) ?? null : null,
    city: r.city,
    province: r.province,
    deadline: r.deadline,
    isDemo: r.is_demo,
    photoUrls: photos.get(r.id) ?? [],
    // Was hardcoded "open" regardless of deadline — every RFP detail page
    // reported itself as open even after closing. Compute it for real.
    status: r.deadline && r.deadline < todayUtc() ? ("closed" as const) : ("open" as const),
    sourceType: r.source_type ?? null,
    gcProjectName: r.gc_project_name ?? null,
    awardedRfpId: r.awarded_rfp_id ?? null,
  };
}

/**
 * Full RFP. Caller must verify access first. With Supabase, RLS additionally
 * guarantees only paid trades / owner PM / admin receive a row.
 */
export async function getFullRfp(slug: string): Promise<RfpDetail | null> {
  if (!isSupabaseConfigured()) {
    const r = DEMO_RFPS.find((x) => x.slug === slug);
    return r ? demoToDetail(r) : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.from("rfp_posts").select("*").eq("slug", slug).maybeSingle();
  const r = data as RfpFullRow | null;
  if (!r) return null;
  const [regionMap, propMap, cats, photos] = await Promise.all([
    idNameMap(supabase, "regions"),
    idNameMap(supabase, "property_types"),
    categoriesByRfp(supabase, [r.id]),
    publicPhotosByRfp(supabase, [r.id]),
  ]);
  return {
    id: r.id,
    slug: r.slug,
    ...displayTitle(r.title, r.source_type),
    summary: r.summary,
    categories: cats.get(r.id) ?? [],
    regionName: r.region_id ? regionMap.get(r.region_id) ?? null : null,
    propertyTypeName: r.property_type_id ? propMap.get(r.property_type_id) ?? null : null,
    city: r.city,
    province: r.province,
    deadline: r.deadline,
    isDemo: r.is_demo,
    photoUrls: photos.get(r.id) ?? [],
    scope: r.scope,
    requirements: r.requirements,
    budgetMin: r.budget_min,
    budgetMax: r.budget_max,
    budgetPublic: r.budget_public,
    desiredStartDate: r.desired_start_date,
    siteVisitDate: r.site_visit_date,
    submissionInstructions: r.submission_instructions,
    contactVisibility: r.contact_visibility,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    sourceType: r.source_type ?? null,
    gcProjectName: r.gc_project_name ?? null,
    awardedRfpId: r.awarded_rfp_id ?? null,
    sourceUrl: r.source_url,
    sourceNotes: r.source_notes,
    status:
      r.status === "awarded" || r.status === "closed" || r.status === "archived"
        ? r.status === "awarded"
          ? "awarded"
          : "closed"
        : "open",
  };
}

// ── helpers ──────────────────────────────────────────────────────────

interface RfpPublicRow {
  id: string; slug: string; title: string; summary: string | null;
  region_id: string | null; property_type_id: string | null;
  city: string | null; province: string | null; deadline: string | null; is_demo: boolean;
  source_type?: string | null;
  // GC package columns — undefined until migration 20260924000002 runs.
  gc_project_name?: string | null;
  awarded_rfp_id?: string | null;
}
interface RfpFullRow extends RfpPublicRow {
  scope: string | null; requirements: string | null;
  budget_min: number | null; budget_max: number | null; budget_public: boolean;
  desired_start_date: string | null; site_visit_date: string | null;
  submission_instructions: string | null;
  contact_visibility: RfpDetail["contactVisibility"];
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  source_url: string | null; source_notes: string | null;
  status: string;
}

async function idNameMap(
  supabase: SupabaseClient,
  table: "regions" | "property_types",
): Promise<Map<string, string>> {
  const { data } = await supabase.from(table).select("id,name");
  const map = new Map<string, string>();
  for (const row of (data as { id: string; name: string }[] | null) ?? []) map.set(row.id, row.name);
  return map;
}

async function publicIdNameMap(table: "regions" | "property_types"): Promise<Map<string, string>> {
  return new Map((await getTaxonomyRows(table)).map((r) => [r.id, r.name]));
}

/** Attach gallery URLs only to cards that will actually render on the page (one query). */
export async function withPublicRfpPhotos(items: RfpListItem[]): Promise<RfpListItem[]> {
  if (!items.length || !isSupabaseConfigured()) return items;
  const client = createReadClient();
  // Only listings posted on PMRFP carry uploaded photos (lib/dashboard/actions
  // is the sole writer of rfp_documents); imported public tenders never do.
  const slugs = [...new Set(items.filter((r) => r.sourceType !== "public_source").map((r) => r.slug))].sort();
  if (!slugs.length) return items;
  // Slug → id from the snapshot; only listings it doesn't have yet need a lookup.
  const idBySlug = new Map<string, string>();
  let index: Map<string, BoardRow> | null = null;
  try {
    index = await getBoardIndex();
  } catch {
    index = null;
  }
  for (const s of slugs) {
    const id = index?.get(s)?.id;
    if (id) idBySlug.set(s, id);
  }
  const missing = slugs.filter((s) => !idBySlug.has(s));
  if (missing.length) {
    const { data, error } = await client.from("rfp_public").select("id,slug").in("slug", missing).order("id");
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; slug: string }[]) idBySlug.set(row.slug, row.id);
  }
  const photos = await publicPhotosByRfp(client, [...new Set(idBySlug.values())].sort());
  return items.map((r) => {
    const id = idBySlug.get(r.slug);
    return { ...r, photoUrls: id ? photos.get(id) ?? [] : [] };
  });
}

/** Split an id list so `.in()` filters stay well under URL-length limits. */
function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Categories for a handful of RFPs (single listings). The board uses the snapshot. */
async function categoriesByRfp(
  supabase: SupabaseClient,
  rfpIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (rfpIds.length === 0) return map;
  // Sequential: callers pass one listing or one page of cards, never the board.
  for (const ids of chunks(rfpIds)) {
    const { data } = await supabase.from("rfp_categories").select("rfp_id, trade_categories(name)").in("rfp_id", ids);
    for (const row of (data as unknown as { rfp_id: string; trade_categories: { name: string } | null }[] | null) ?? []) {
      const arr = map.get(row.rfp_id) ?? [];
      if (row.trade_categories?.name) arr.push(row.trade_categories.name);
      map.set(row.rfp_id, arr);
    }
  }
  return map;
}

/** Maps each rfp_id → list of public photo URLs (from rfp_documents), for rendered cards only. */
async function publicPhotosByRfp(
  supabase: SupabaseClient,
  rfpIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (rfpIds.length === 0) return map;
  for (const ids of chunks(rfpIds)) {
    const { data } = await supabase
      .from("rfp_documents")
      .select("rfp_id, file_url, created_at")
      .in("rfp_id", ids)
      .eq("visibility", "public")
      .like("file_type", "image/%")
      .order("created_at", { ascending: true });
    for (const row of (data as { rfp_id: string; file_url: string | null }[] | null) ?? []) {
      if (!row.file_url) continue;
      const arr = map.get(row.rfp_id) ?? [];
      arr.push(row.file_url);
      map.set(row.rfp_id, arr);
    }
  }
  return map;
}
