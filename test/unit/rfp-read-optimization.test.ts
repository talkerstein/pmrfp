import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOpenRfpCounts } from "@/lib/data/rfp-counts";
import { filterAndSort, getRfpTeaser, listRfps, withPublicRfpPhotos } from "@/lib/data/rfps";
import { getRegions, getTaxonomyRows } from "@/lib/data/taxonomy";
import { SNAPSHOT_SHARDS, fetchBoardShard, shardRange } from "@/lib/data/board-snapshot";
import { createFakePostgrest, uuidFor, type FakePostgrest, type Row } from "./fixtures/fake-postgrest";

const fixture = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/lib/supabase/read", () => ({ createReadClient: () => fixture.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fixture.client }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
// Business/query-shape tests: no cache here, so every call reads the database
// and counts are per cold snapshot. Real Next data-cache behaviour (one load
// shared across renders and callers) is exercised in next-public-cache.test.ts.
vi.mock("next/cache", () => ({ unstable_cache: (callback: (...args: unknown[]) => unknown) => callback }));

const regions = [
  { id: "region-a", slug: "toronto", name: "Toronto", active: true, province: "ON", country: "Canada", sort_order: 1, parent_id: null },
  { id: "region-b", slug: "old-toronto", name: "Toronto", active: false, province: "ON", country: "Canada", sort_order: 2, parent_id: null },
  { id: "region-us", slug: "us-texas", name: "Texas", active: true, province: "Texas", country: "USA", sort_order: 3, parent_id: null },
];
const trades = [
  { id: "trade-roof", slug: "roofing", name: "Roofing", active: true, sort_order: 0 },
  { id: "trade-elec", slug: "electrical", name: "Electrical", active: true, sort_order: 1 },
];
const base = { property_type_id: "property", city: "Toronto", province: "Ontario", is_demo: false, source_type: "property_manager_direct", gc_project_name: null, awarded_rfp_id: null, status: "published" };
const small: Row[] = [
  { id: uuidFor(1), slug: "one", title: "Roof", summary: "One", region_id: "region-a", deadline: null },
  { id: uuidFor(2), slug: "two", title: "Electrical", summary: "Two", region_id: "region-b", deadline: "2026-10-06" },
  { id: uuidFor(3), slug: "three", title: "Roof", summary: "Three", region_id: "region-a", deadline: "2026-10-05" },
  { id: uuidFor(4), slug: "tx", title: "Roof", summary: "Texas job", region_id: "region-us", deadline: "2026-12-01", province: "Texas", city: "Austin", source_type: "public_source" },
].map((r) => ({ ...base, ...r }));

let db: FakePostgrest;

function seed(rfps: Row[]) {
  db = createFakePostgrest({
    regions,
    property_types: [{ id: "property", slug: "office", name: "Office", active: true }],
    trade_categories: trades,
    rfp_public: rfps,
    rfp_categories: rfps.map((r, i) => ({ id: `link-${String(i).padStart(6, "0")}`, rfp_id: r.id, category_id: r.title === "Electrical" ? "trade-elec" : "trade-roof", trade_categories: { name: r.title === "Electrical" ? "Electrical" : "Roofing" } })),
    rfp_documents: [{ rfp_id: uuidFor(1), file_url: "https://files.example/a.jpg", visibility: "public", file_type: "image/jpeg", created_at: "2026-10-01" }],
  });
  fixture.client = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: db.fetch },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
  seed(small);
});
afterEach(() => vi.useRealTimers());

describe("shared board snapshot", () => {
  it("splits the UUID space into 16 contiguous shards", () => {
    expect(SNAPSHOT_SHARDS).toBe(16);
    expect(shardRange(0)).toEqual({ lo: null, hi: "10000000-0000-0000-0000-000000000000" });
    expect(shardRange(10)).toEqual({ lo: "a0000000-0000-0000-0000-000000000000", hi: "b0000000-0000-0000-0000-000000000000" });
    expect(shardRange(15)).toEqual({ lo: "f0000000-0000-0000-0000-000000000000", hi: null });
  });

  it("reads a shard with id-range filters and keyset pages, never OFFSET or id lists", async () => {
    // 2,500 listings in one shard → 3 rfp_public pages + 3 rfp_categories pages.
    const many = Array.from({ length: 2500 }, (_, i) => ({ ...base, id: `3${uuidFor(i * 16 + 3).slice(1)}`, slug: `s${i}`, title: "Roof", summary: null, region_id: "region-a", deadline: "2026-12-01" }));
    seed(many);
    const rows = await fetchBoardShard(3);
    expect(rows).toHaveLength(2500);
    expect(rows.every((r) => r.categoryIds.length === 1)).toBe(true);
    const pub = db.requests.filter((u) => u.pathname.endsWith("/rfp_public"));
    expect(pub).toHaveLength(3);
    expect(pub.every((u) => !u.searchParams.has("offset"))).toBe(true);
    expect(pub[0].searchParams.getAll("id")).toEqual(["gte.30000000-0000-0000-0000-000000000000", "lt.40000000-0000-0000-0000-000000000000"]);
    expect(pub[1].searchParams.getAll("id")).toContain(`gt.${rows[999].id}`);
    expect(db.count("rfp_categories")).toBe(3);
    expect(db.requests.some((u) => /in\./.test(u.search))).toBe(false);
    expect(db.count("rfp_documents")).toBe(0);
  });

  it("loads the whole board in ~2 reads per shard (was ~1 per 250 rows + 2 per 150 rows)", async () => {
    const n = 5000;
    const many = Array.from({ length: n }, (_, i) => ({ ...base, id: uuidFor(i), slug: `s${i}`, title: i % 3 ? "Roof" : "Electrical", summary: null, region_id: "region-a", deadline: "2026-12-01" }));
    seed(many);
    const all = await listRfps();
    expect(all).toHaveLength(n);
    const boardReads = db.count("rfp_public") + db.count("rfp_categories");
    // 16 shards × (1 rfp_public + 1 rfp_categories) for a 5,000-row board.
    expect(boardReads).toBe(32);
    expect(db.count("rfp_documents")).toBe(0);
    // Old listRfps(): ceil(n/250) pages + ceil(n/150) category chunks + ceil(n/150) photo chunks.
    const legacy = Math.ceil(n / 250) + 2 * Math.ceil(n / 150);
    expect(legacy).toBe(88);
    expect(boardReads).toBeLessThan(legacy / 2);
  });
});

describe("listRfps over the snapshot", () => {
  it("keeps statuses, filters, sorting and country scoping", async () => {
    const all = await listRfps();
    // Open first (closing soonest, no-deadline last), then closed.
    expect(all.map((r) => r.slug)).toEqual(["two", "tx", "one", "three"]);
    expect(all.find((r) => r.slug === "three")!.status).toBe("closed");
    expect(all.find((r) => r.slug === "two")!.categories).toEqual(["Electrical"]);
    expect(all.every((r) => r.photoUrls.length === 0)).toBe(true);

    const filtered = await listRfps({ category: "roofing", region: "toronto", propertyType: "office", q: "Roof" });
    expect(filtered.map((r) => r.slug).sort()).toEqual(["one", "three"]);
    const us = await listRfps({ country: "US" });
    expect(us.map((r) => r.slug)).toEqual(["tx"]);
    const ca = await listRfps({ country: "CA" });
    expect(ca.map((r) => r.slug).sort()).toEqual(["one", "three", "two"]);
    expect(ca.length + us.length).toBe(all.length);
  });

  it("filterAndSort is pure and sorts newest when asked", () => {
    const item = (slug: string, deadline: string | null, status: "open" | "closed" = "open") => ({ slug, title: slug, summary: null, categories: [], regionName: null, propertyTypeName: null, city: null, province: "Ontario", deadline, isDemo: false, photoUrls: [], status, sourceType: null });
    const maps = { regionBySlug: new Map(), propBySlug: new Map(), tradeBySlug: new Map() };
    const rows = [item("a", "2026-10-10"), item("b", "2026-11-01"), item("c", null), item("d", "2026-09-01", "closed")];
    expect(filterAndSort(rows, {}, maps).map((r) => r.slug)).toEqual(["a", "b", "c", "d"]);
    expect(filterAndSort(rows, { sort: "newest" }, maps).map((r) => r.slug)).toEqual(["b", "a", "c", "d"]);
  });
});

describe("counts and single listings read the snapshot, not their own queries", () => {
  it("counts open listings per country and region from the snapshot", async () => {
    expect(await getOpenRfpCounts("Toronto", "one")).toEqual({ totalOpen: 3, regionMatchCount: 1 });
    expect(await getOpenRfpCounts(null, undefined, "US")).toEqual({ totalOpen: 1, regionMatchCount: 0 });
    expect(await getOpenRfpCounts(null, undefined, "CA")).toEqual({ totalOpen: 2, regionMatchCount: 0 });
    // No exact-count queries (limit=0) any more.
    expect(db.requests.some((u) => u.searchParams.get("limit") === "0")).toBe(false);
  });

  it("builds a teaser from the snapshot plus one photo read", async () => {
    const teaser = await getRfpTeaser("one");
    expect(teaser?.photoUrls).toEqual(["https://files.example/a.jpg"]);
    expect(teaser?.categories).toEqual(["Roofing"]);
    expect(db.requests.filter((u) => u.pathname.endsWith("/rfp_public") && u.searchParams.get("slug"))).toHaveLength(0);
    expect(db.count("rfp_documents")).toBe(1);
  });

  it("falls back to a direct read for a listing published after the snapshot", async () => {
    seed(small);
    const fresh = { ...base, id: uuidFor(99), slug: "fresh", title: "Roof", summary: "New", region_id: "region-a", deadline: "2026-12-01" };
    // Present in the view, missing from the shard reads (simulates a stale snapshot).
    const real = db.fetch;
    db.tables.rfp_public.push(fresh);
    fixture.client = createClient("https://fixture.supabase.co", "fixture-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => (String(input).includes("id=") && String(input).includes("/rfp_public") ? real(String(input).replace(/rfp_public\?/, "rfp_public?slug=neq.fresh&"), init) : real(input, init)) },
    });
    const teaser = await getRfpTeaser("fresh");
    expect(teaser?.slug).toBe("fresh");
    expect(teaser?.status).toBe("open");
  });

  it("hydrates photos for rendered cards only, skipping imported tenders", async () => {
    const all = await listRfps();
    db.requests.length = 0;
    const cards = await withPublicRfpPhotos(all);
    expect(cards.find((r) => r.slug === "one")!.photoUrls).toEqual(["https://files.example/a.jpg"]);
    const photoReads = db.requests.filter((u) => u.pathname.endsWith("/rfp_documents"));
    expect(photoReads).toHaveLength(1);
    // tx is a public_source tender: never asked for.
    expect(photoReads[0].searchParams.get("rfp_id")).not.toContain(uuidFor(4));
    // Slugs resolved from the snapshot, no rfp_public lookup by slug.
    expect(db.requests.some((u) => u.pathname.endsWith("/rfp_public") && u.searchParams.has("slug"))).toBe(false);
    expect(await withPublicRfpPhotos(all.filter((r) => r.sourceType === "public_source"))).toHaveLength(1);
  });
});

describe("taxonomy", () => {
  it("keeps inactive historical names in lookup rows but excludes them from active dropdowns", async () => {
    expect((await getTaxonomyRows("regions")).map((r) => r.id)).toContain("region-b");
    expect((await getRegions()).map((r) => r.slug)).toEqual(["toronto", "us-texas"]);
    const lookups = db.requests.filter((u) => u.pathname.endsWith("/regions"));
    expect(lookups.every((u) => !u.searchParams.has("active"))).toBe(true);
  });
});
