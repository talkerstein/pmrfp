import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicReadFetch, PUBLIC_DATA_TAG, TAXONOMY_DATA_TAG } from "@/lib/supabase/public-cache";
import { createWriteFetch } from "@/lib/supabase/write-fetch";
import { isPublicPageRead } from "@/lib/public-read-policy";
import { revalidateTag } from "next/cache";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
const base = "https://fixture.supabase.co";
const key = "fixture-anon-key";
const headers = { apikey: key, Authorization: `Bearer ${key}` };

describe("public Supabase read caching", () => {
  it("invokes the transport for every concurrent consumer so render dependencies are registered", async () => {
    const transport = vi.fn(async () => new Response("[]"));
    const read = createPublicReadFetch(base, key, transport);
    await Promise.all([read(`${base}/rest/v1/rfp_public`, { headers }), read(`${base}/rest/v1/rfp_public`, { headers })]);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("keeps taxonomy on its own hour-long tag", async () => {
    const transport = vi.fn(async () => new Response("[]"));
    await createPublicReadFetch(base, key, transport)(`${base}/rest/v1/regions`, { headers });
    expect(transport).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ next: { revalidate: 3600, tags: [TAXONOMY_DATA_TAG] } }));
  });
  it("caches real SDK reads with distinct filters and page offsets", async () => {
    const transport = vi.fn(async () => new Response("[]", { status: 200 }));
    const client = createClient(base, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: createPublicReadFetch(base, key, transport) },
    });
    await client.from("rfp_public").select("id,slug").order("id").range(0, 249);
    await client.from("rfp_public").select("id,slug").order("id").range(250, 499);
    const calls = transport.mock.calls as unknown as [string, RequestInit & { next: { revalidate: number; tags: string[] } }][];
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).not.toBe(calls[1][0]);
    expect(new URL(calls[1][0]).searchParams.get("offset")).toBe("250");
    expect(calls[0][1]).toMatchObject({ cache: "force-cache", next: { revalidate: 300, tags: [PUBLIC_DATA_TAG] } });
  });

  it.each([
    ["/rest/v1/rfp_posts", "GET", { ...headers, Authorization: "Bearer user-session" }],
    ["/rest/v1/rfp_posts", "GET", { ...headers, Cookie: "session=private" }],
    ["/rest/v1/rfp_posts", "PATCH", headers],
    ["/rest/v1/rpc/has_active_trade_access", "GET", headers],
    ["/auth/v1/user", "GET", headers],
    ["/storage/v1/object/logos/a.png", "GET", headers],
  ])("never caches private, auth, storage or mutation requests: %s %s", async (path, method, requestHeaders) => {
    const transport = vi.fn(async () => new Response("[]"));
    await createPublicReadFetch(base, key, transport)(`${base}${path}`, { method, headers: requestHeaders });
    expect(transport).toHaveBeenCalledWith(`${base}${path}`, expect.objectContaining({ cache: "no-store", next: { revalidate: 0 } }));
  });

  it("rejects a Request carrying a user token and a different origin", async () => {
    const transport = vi.fn(async () => new Response("[]"));
    const read = createPublicReadFetch(base, key, transport);
    await read(new Request(`${base}/rest/v1/rfp_posts`, { headers: { ...headers, Authorization: "Bearer private-user" } }));
    await read("https://other.supabase.co/rest/v1/rfp_public", { headers });
    for (const call of transport.mock.calls as unknown as [unknown, RequestInit][]) expect(call[1].cache).toBe("no-store");
  });
});

describe("public cache invalidation", () => {
  beforeEach(() => vi.mocked(revalidateTag).mockClear());
  it("invalidates after successful moderation writes without caching authenticated reads", async () => {
    const transport = vi.fn(async () => new Response(null, { status: 204 }));
    const write = createWriteFetch(base, transport);
    await write(`${base}/rest/v1/rfp_posts?id=eq.example`, { method: "PATCH" });
    expect(revalidateTag).toHaveBeenCalledWith(PUBLIC_DATA_TAG, { expire: 0 });
    expect(transport).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: "no-store" }));
  });
  it("does not flush public caches on reads, failed writes or rate-limit counters", async () => {
    const write = createWriteFetch(base, vi.fn(async () => new Response(null, { status: 403 })));
    await write(`${base}/rest/v1/organizations`, { method: "PATCH" });
    const successful = createWriteFetch(base, vi.fn(async () => new Response(null, { status: 204 })));
    await successful(`${base}/rest/v1/organizations`, { method: "GET" });
    await successful(`${base}/rest/v1/rpc/rate_limit_hit`, { method: "POST" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it("invalidates both taxonomy and derived public content after a taxonomy write", async () => {
    const write = createWriteFetch(base, vi.fn(async () => new Response(null, { status: 204 })));
    await write(`${base}/rest/v1/regions`, { method: "PATCH" });
    expect(revalidateTag).toHaveBeenCalledWith(TAXONOMY_DATA_TAG, { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith(PUBLIC_DATA_TAG, { expire: 0 });
  });
});

describe("public browsing limiter scope", () => {
  it.each(["/rfps", "/fr/rfps", "/es/directory/acme", "/regions/ontario", "/embed/vendors"])("limits public reads of %s", (path) => {
    expect(isPublicPageRead("GET", path)).toBe(true);
  });
  it.each(["/api/cron/bid-checks", "/api/stripe/webhook", "/auth/callback", "/fr/admin", "/dashboard", "/es/sign-in", "/onboarding", "/sitemap.xml", "/fr/opengraph-image"])("excludes auth, jobs, assets and private routes: %s", (path) => {
    expect(isPublicPageRead("GET", path)).toBe(false);
  });
  it("does not throttle POST server actions in the public browsing bucket", () => {
    expect(isPublicPageRead("POST", "/rfps")).toBe(false);
  });
});
