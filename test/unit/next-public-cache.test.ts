import { AsyncLocalStorage } from "node:async_hooks";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicReadFetch, RFPS_TAG, TAXONOMY_DATA_TAG } from "@/lib/supabase/public-cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFakePostgrest, uuidFor } from "./fixtures/fake-postgrest";

const fixture = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/lib/supabase/read", () => ({ createReadClient: () => fixture.client }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));

// Execute Next 16.2.6's real unstable_cache and patched fetch/async contexts.
// Only the upstream and incremental-cache backing store are local fixtures.
class MemoryBackingStore {
  now = 0;
  entries = new Map<string, { value: { revalidate: number }; tags: string[]; expires: number }>();
  async generateCacheKey(url: unknown, init: RequestInit = {}) {
    // Match the inputs used by Next's IncrementalCache (no signal or tags).
    return JSON.stringify([url, init.method, Object.fromEntries(new Headers(init.headers)),
      init.mode, init.redirect, init.credentials, init.referrer, init.referrerPolicy,
      init.integrity, init.cache, init.body]);
  }
  async lock() { return () => {}; }
  async get(key: string) {
    const entry = this.entries.get(key);
    return entry && entry.expires > this.now ? { value: entry.value, isStale: false, lastModified: this.now } : null;
  }
  async set(key: string, value: { revalidate: number }, options: { tags?: string[] }) {
    this.entries.set(key, { value, tags: options.tags ?? [], expires: this.now + value.revalidate * 1000 });
  }
  expireTag(tag: string) {
    for (const [key, entry] of this.entries) if (entry.tags.includes(tag)) this.entries.delete(key);
  }
}
let work: typeof import("next/dist/server/app-render/work-async-storage.external").workAsyncStorage;
let unit: typeof import("next/dist/server/app-render/work-unit-async-storage.external").workUnitAsyncStorage;
let patched: typeof import("next/dist/server/lib/patch-fetch").createPatchedFetcher;
let counts: typeof import("@/lib/data/rfp-counts").getOpenRfpCounts;
let listRfps: typeof import("@/lib/data/rfps").listRfps;
let getTaxonomyRows: typeof import("@/lib/data/taxonomy").getTaxonomyRows;
let getVendor: typeof import("@/lib/data/directory").getVendor;
let CompanyWidget: typeof import("@/app/embed/company/[slug]/page").default;
let backing: MemoryBackingStore;

beforeAll(async () => {
  // Next's server bootstrap normally installs this global before module load.
  vi.stubGlobal("AsyncLocalStorage", AsyncLocalStorage);
  work = (await import("next/dist/server/app-render/work-async-storage.external")).workAsyncStorage;
  unit = (await import("next/dist/server/app-render/work-unit-async-storage.external")).workUnitAsyncStorage;
  patched = (await import("next/dist/server/lib/patch-fetch")).createPatchedFetcher;
  counts = (await import("@/lib/data/rfp-counts")).getOpenRfpCounts;
  listRfps = (await import("@/lib/data/rfps")).listRfps;
  getTaxonomyRows = (await import("@/lib/data/taxonomy")).getTaxonomyRows;
  getVendor = (await import("@/lib/data/directory")).getVendor;
  CompanyWidget = (await import("@/app/embed/company/[slug]/page")).default;
});
beforeEach(() => { backing = new MemoryBackingStore(); });

function render<T>(route: string, run: () => Promise<T>) {
  const renderUnit = { type: "prerender-legacy", phase: "render", revalidate: Infinity, tags: null as string[] | null, implicitTags: { tags: [] } };
  const renderWork = { route, isStaticGeneration: true, incrementalCache: backing, pendingRevalidates: {} as Record<string, Promise<unknown>>, dynamicUsageDescription: undefined as string | undefined };
  return work.run(renderWork as never, () => unit.run(renderUnit as never, async () => {
    const result = await run();
    await Promise.all(Object.values(renderWork.pendingRevalidates));
    return { result, renderUnit, renderWork };
  }));
}

function useCompanyFixture() {
  const company = {
    id: uuidFor(1), slug: "maple-electric-supply", name: "Maple Electric Supply", city: "Toronto", province: "Ontario",
    logo_url: null, verified: true, featured: false, years_in_business: 12, profile_status: "approved", is_demo: false,
    organization_categories: [{ trade_categories: { name: "Electrical", slug: "electrical" } }],
    organization_regions: [{ regions: { name: "Toronto", slug: "toronto", country: "Canada" } }],
    organization_property_types: [],
  };
  const db = createFakePostgrest({ organizations: [company, { ...company, slug: "pending-co", profile_status: "pending" }, { ...company, slug: "demo-co", is_demo: true }] });
  const nextFetch = patched(db.fetch, { workAsyncStorage: work, workUnitAsyncStorage: unit });
  fixture.client = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false },
    global: { fetch: createPublicReadFetch("https://fixture.supabase.co", "fixture-key", nextFetch) },
  });
}

const COMPANY_ROUTE = "/embed/company/[slug]";
const companyWidget = (slug: string) => render(COMPANY_ROUTE, () => CompanyWidget({ params: Promise.resolve({ slug }) }));

// Production, 2026-11-02: /embed/company/<real company> answered 500 with "Page
// changed from static to dynamic at runtime". Next records an uncached fetch on
// the render even when the caller catches the throw, then fails the ISR response.
describe("company widget stays one cacheable ISR page", () => {
  it("renders a real company without an uncached fetch", async () => {
    useCompanyFixture();
    const { result, renderUnit, renderWork } = await companyWidget("maple-electric-supply");
    expect(renderWork.dynamicUsageDescription).toBeUndefined();
    expect(renderUnit.revalidate).toBe(3600);
    expect(result.props).toMatchObject({ title: "Maple Electric Supply", subtitle: "Toronto, Ontario", eyebrow: "Verified on PMRFP" });
  });

  it("does not show unapproved or seeded companies", async () => {
    useCompanyFixture();
    for (const slug of ["pending-co", "demo-co", "no-such-company"]) {
      const { result, renderWork } = await companyWidget(slug);
      expect(renderWork.dynamicUsageDescription).toBeUndefined();
      expect(result.props.title).toBeUndefined();
    }
  });

  it("getVendor lists storage, so it must not be used on an ISR page", async () => {
    useCompanyFixture();
    const { result, renderUnit, renderWork } = await render(COMPANY_ROUTE, () => getVendor("maple-electric-supply"));
    // The read looks fine to the caller, which is why this reached production.
    expect(result?.name).toBe("Maple Electric Supply");
    expect(renderWork.dynamicUsageDescription).toContain("/storage/v1/object/list/logos");
    expect(renderUnit.revalidate).toBe(0);
  });
});

describe("Next framework cache regressions", () => {
  it("persists paginated HTTP 206 taxonomy reads, preserves inactive rows, and refreshes after invalidation", async () => {
    const rows = Array.from({ length: 251 }, (_, i) => ({
      id: String(i).padStart(4, "0"), slug: `region-${i}`, name: `Region ${i}`,
      active: i !== 0, province: "Ontario", country: "Canada", parent_id: null, sort_order: i,
    }));
    const db = createFakePostgrest({ regions: rows });
    const upstream: typeof fetch = async (input, init) => {
      const response = await db.fetch(input, init);
      return new Response(await response.text(), { status: 206, headers: response.headers });
    };
    const nextFetch = patched(upstream, { workAsyncStorage: work, workUnitAsyncStorage: unit });
    fixture.client = createClient("https://fixture.supabase.co", "fixture-key", {
      auth: { persistSession: false },
      global: { fetch: createPublicReadFetch("https://fixture.supabase.co", "fixture-key", nextFetch) },
    });
    const query = () => getTaxonomyRows("regions");
    const first = await render("/regions", query);
    expect(first.result).toHaveLength(251);
    expect(first.result[0].active).toBe(false);
    expect(db.count("regions")).toBe(2);
    const second = await render("/rfps", query);
    expect(second.result).toEqual(first.result);
    expect(db.count("regions")).toBe(2);
    for (const context of [first, second]) {
      expect(context.renderUnit.tags).toContain(TAXONOMY_DATA_TAG);
      expect(context.renderUnit.revalidate).toBe(21600);
    }
    rows[0].name = "Renamed region";
    backing.expireTag(TAXONOMY_DATA_TAG);
    expect((await render("/regions", query)).result[0].name).toBe("Renamed region");
    expect(db.count("regions")).toBe(4);
    backing.now += 21601000;
    await render("/regions", query);
    expect(db.count("regions")).toBe(6);
  });
  it("caches a recovered read and retains render tags and TTL", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = new TypeError("fetch failed", { cause: Object.assign(new Error("socket closed"), { code: "UND_ERR_SOCKET" }) });
    const upstream = vi.fn<typeof fetch>().mockRejectedValueOnce(error).mockResolvedValueOnce(new Response('[{"name":"Toronto"}]'));
    const nextFetch = patched(upstream, { workAsyncStorage: work, workUnitAsyncStorage: unit });
    const read = createPublicReadFetch("https://fixture.supabase.co", "fixture-key", nextFetch);
    const query = () => read("https://fixture.supabase.co/rest/v1/regions?select=name", { headers: { apikey: "fixture-key", authorization: "Bearer fixture-key" } }).then((r) => r.json());
    const first = await render("/regions", query);
    const second = await render("/trades", query);
    expect(first.result).toEqual([{ name: "Toronto" }]);
    expect(second.result).toEqual(first.result);
    expect(upstream).toHaveBeenCalledTimes(2);
    for (const context of [first, second]) {
      expect(context.renderUnit.tags).toContain(TAXONOMY_DATA_TAG);
      expect(context.renderUnit.revalidate).toBe(21600);
    }
    vi.restoreAllMocks();
  });
  it("loads the board snapshot once for every caller and render, honoring TTL and the rfps tag", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      id: uuidFor(i), slug: `s${i}`, title: "Roof", summary: null, region_id: null, property_type_id: null, city: null,
      province: i % 4 === 0 ? "Texas" : "Ontario", deadline: "2099-01-01", is_demo: false, source_type: "public_source",
      gc_project_name: null, awarded_rfp_id: null,
    }));
    const db = createFakePostgrest({ rfp_public: rows, rfp_categories: [], regions: [], property_types: [], trade_categories: [] });
    fixture.client = createClient("https://fixture.supabase.co", "fixture-key", { auth: { persistSession: false }, global: { fetch: db.fetch } });
    const boardReads = () => db.count("rfp_public") + db.count("rfp_categories");
    // Several callers in one render (board + whole-board list + counts), concurrently.
    const page = () => Promise.all([listRfps({ country: "US" }), listRfps(), counts(null, undefined, "CA")]);
    const first = await render("/rfps", page);
    expect(first.result[0]).toHaveLength(10);
    expect(first.result[1]).toHaveLength(40);
    expect(first.result[2].totalOpen).toBe(30);
    // 16 shards, each non-empty shard read once (rfp_public + rfp_categories).
    const cold = boardReads();
    expect(db.count("rfp_public")).toBe(16);
    expect(cold).toBeLessThanOrEqual(32);
    // Another page, another render: all from the data cache.
    const second = await render("/rfps/s1", page);
    expect(second.result[1]).toHaveLength(40);
    expect(boardReads()).toBe(cold);
    for (const context of [first, second]) {
      expect(context.renderUnit.tags).toContain(RFPS_TAG);
      expect(context.renderUnit.revalidate).toBe(21600);
    }
    backing.expireTag(RFPS_TAG);
    await render("/rfps", page);
    expect(db.count("rfp_public")).toBe(32);
    backing.now += 21601000;
    await render("/rfps", page);
    expect(db.count("rfp_public")).toBe(48);
  });

  it("registers taxonomy dependencies in each overlapping render and refreshes after tag expiry", async () => {
    let release!: () => void;
    const wait = new Promise<void>((done) => { release = done; });
    const transport = vi.fn(async () => { await wait; return new Response('[{"name":"Toronto"}]'); });
    const nextFetch = patched(transport as typeof fetch, { workAsyncStorage: work, workUnitAsyncStorage: unit });
    const read = createPublicReadFetch("https://fixture.supabase.co", "fixture-key", nextFetch);
    const query = () => read("https://fixture.supabase.co/rest/v1/regions?select=name", { headers: { apikey: "fixture-key", authorization: "Bearer fixture-key" } }).then((r) => r.json());
    const a = render("/regions", query);
    const b = render("/trades/roofing", query);
    release();
    const contexts = await Promise.all([a, b]);
    for (const context of contexts) {
      expect(context.result).toEqual([{ name: "Toronto" }]);
      expect(context.renderUnit.tags).toContain(TAXONOMY_DATA_TAG);
      expect(context.renderUnit.revalidate).toBe(21600);
    }
    const before = transport.mock.calls.length;
    const cached = await render("/regions", query);
    expect(cached.renderUnit.tags).toContain(TAXONOMY_DATA_TAG);
    expect(transport).toHaveBeenCalledTimes(before);
    backing.expireTag(TAXONOMY_DATA_TAG);
    await render("/regions", query);
    expect(transport).toHaveBeenCalledTimes(before + 1);
  });
});
