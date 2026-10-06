import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOpenRfpCounts } from "@/lib/data/rfp-counts";
import { listRfps, withPublicRfpPhotos } from "@/lib/data/rfps";
import { getRegions, getTaxonomyRows } from "@/lib/data/taxonomy";

const fixture = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/lib/supabase/read", () => ({ createReadClient: () => fixture.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fixture.client }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
// Business/query-shape tests only. Real Next data-cache behavior is exercised
// separately by next-public-cache.test.ts with realistic 206 responses.
vi.mock("next/cache", () => ({ unstable_cache: (callback: (...args: unknown[]) => unknown) => callback }));

const regions = [
  { id: "region-a", slug: "toronto", name: "Toronto", active: true, province: "ON", country: "Canada", sort_order: 1, parent_id: null },
  { id: "region-b", slug: "old-toronto", name: "Toronto", active: false, province: "ON", country: "Canada", sort_order: 2, parent_id: null },
];
const rows = [
  { id: "a", slug: "one", title: "Roof", summary: "One", region_id: "region-a", deadline: null },
  { id: "b", slug: "two", title: "Electrical", summary: "Two", region_id: "region-b", deadline: "2026-10-06" },
  { id: "c", slug: "three", title: "Roof", summary: "Three", region_id: "region-a", deadline: "2026-10-05" },
].map((r) => ({ ...r, property_type_id: "property", city: "Toronto", province: "Ontario", is_demo: false, source_type: "property_manager_direct", gc_project_name: null, awarded_rfp_id: null }));
let urls: URL[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
  urls = [];
  fixture.client = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      urls.push(url);
      const table = url.pathname.split("/").pop();
      let data: unknown[] = [];
      const responseHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (table === "regions") data = regions;
      if (table === "property_types") data = [{ id: "property", slug: "office", name: "Office", active: true }];
      if (table === "trade_categories") data = [{ id: "trade", slug: "roofing", name: "Roofing", active: true, sort_order: 0 }];
      if (table === "rfp_public") {
        let selected = [...rows];
        if (url.searchParams.has("or")) selected = selected.filter((r) => !r.deadline || r.deadline >= "2026-10-06");
        const ids = url.searchParams.get("region_id");
        if (ids) selected = selected.filter((r) => ids.includes(r.region_id));
        const excluded = url.searchParams.get("slug");
        if (excluded?.startsWith("neq.")) selected = selected.filter((r) => r.slug !== excluded.slice(4));
        if (excluded?.startsWith("in.")) selected = selected.filter((r) => excluded.includes(r.slug));
        if (url.searchParams.get("limit") === "0") {
          responseHeaders["Content-Range"] = `*/${selected.length}`;
        } else data = selected;
      }
      if (table === "rfp_categories") data = rows.map((r) => ({ rfp_id: r.id, trade_categories: { name: r.id === "b" ? "Electrical" : "Roofing" } }));
      if (table === "rfp_documents") data = [{ rfp_id: "a", file_url: "https://files.example/a.jpg" }];
      return new Response(JSON.stringify(data), { status: responseHeaders["Content-Range"] ? 206 : 200, headers: responseHeaders });
    } },
  });
});
afterEach(() => vi.useRealTimers());

describe("count-only RFP reads", () => {
  it("preserves null/today deadlines, excludes the current slug regionally and returns zero listing payload", async () => {
    expect(await getOpenRfpCounts("Toronto", "one")).toEqual({ totalOpen: 2, regionMatchCount: 1 });
    const counts = urls.filter((u) => u.pathname.endsWith("/rfp_public"));
    expect(counts).toHaveLength(2);
    expect(counts.every((u) => u.searchParams.get("limit") === "0" && u.searchParams.get("select") === "id")).toBe(true);
    expect(urls.some((u) => /rfp_categories|rfp_documents/.test(u.pathname))).toBe(false);
  });
  it("does not fetch taxonomy or relations for metadata's global count", async () => {
    expect(await getOpenRfpCounts()).toEqual({ totalOpen: 2, regionMatchCount: 0 });
    expect(urls).toHaveLength(1);
  });
});

describe("visible photo hydration and taxonomy", () => {
  it("preserves filters and complete listing counts while skipping off-page photos", async () => {
    const all = await listRfps({}, { photos: false });
    expect(all).toHaveLength(3);
    expect(all.map((r) => r.status)).toEqual(["open", "open", "closed"]);
    expect(urls.some((u) => u.pathname.endsWith("/rfp_documents"))).toBe(false);
    const filtered = await listRfps({ category: "roofing", region: "toronto", propertyType: "office", q: "Roof" }, { photos: false });
    expect(filtered.map((r) => r.slug).sort()).toEqual(["one", "three"]);
    const visible = await withPublicRfpPhotos([all.find((r) => r.slug === "one")!]);
    expect(visible[0].photoUrls).toEqual(["https://files.example/a.jpg"]);
    const photoUrl = urls.find((u) => u.pathname.endsWith("/rfp_documents"))!;
    expect(photoUrl.searchParams.get("rfp_id")).toBe("in.(a)");
    expect(all.every((r) => r.photoUrls.length === 0)).toBe(true);
  });
  it("keeps inactive historical names in lookup rows but excludes them from active dropdowns", async () => {
    expect((await getTaxonomyRows("regions")).map((r) => r.id)).toContain("region-b");
    expect((await getRegions()).map((r) => r.slug)).toEqual(["toronto"]);
    const lookups = urls.filter((u) => u.pathname.endsWith("/regions"));
    expect(new Set(lookups.map((u) => u.href)).size).toBe(1);
    expect(lookups.every((u) => !u.searchParams.has("active"))).toBe(true);
  });
});
