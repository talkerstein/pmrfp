import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /out/<slug>: the click-out redirect. The destination comes from the stored
 * website of a live company (getOutTarget), never from the request.
 */
const h = vi.hoisted(() => ({
  targets: {} as Record<string, string | null>,
  limited: null as null | { limit: number; remaining: number; reset: number },
  lookups: [] as string[],
}));

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => false }));
vi.mock("@/lib/links/data", () => ({
  getOutTarget: async (slug: string) => {
    h.lookups.push(slug);
    return h.targets[slug.toLowerCase()] ?? null;
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkOutLimit: async () => h.limited,
  requestIp: () => "203.0.113.9",
  rateLimitResponse: () => new Response("Too many", { status: 429 }),
}));

import { GET, HEAD } from "@/app/out/[slug]/route";
import { bufferedOutClicks, resetOutClicks } from "@/lib/links/clicks";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const call = (slug: string, opts: { ua?: string; query?: string; method?: "GET" | "HEAD" } = {}) => {
  const req = new Request(`https://pmrfp.com/out/${slug}${opts.query ?? ""}`, { headers: { "user-agent": opts.ua ?? BROWSER } });
  const ctx = { params: Promise.resolve({ slug }) };
  return opts.method === "HEAD" ? HEAD(req, ctx) : GET(req, ctx);
};

beforeEach(() => {
  h.targets = { "acme-paving": "https://acmepaving.ca/" };
  h.limited = null;
  h.lookups = [];
  resetOutClicks();
});

describe("/out/<slug>", () => {
  it("a known company: 302 to its stored website, noindex, counted", async () => {
    const res = await call("acme-paving");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://acmepaving.ca/?utm_source=pmrfp.com&utm_medium=referral");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(bufferedOutClicks()).toEqual([expect.objectContaining({ slug: "acme-paving", n: 1 })]);
  });

  it("an unknown company goes to the directory and is not counted", async () => {
    const res = await call("no-such-company");
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/directory");
    expect(new URL(res.headers.get("location")!).origin).toBe("https://pmrfp.com");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(bufferedOutClicks()).toEqual([]);
  });

  it("no open redirect: the request cannot choose the destination", async () => {
    for (const query of ["?url=https://evil.example/", "?to=//evil.example", "?redirect=https%3A%2F%2Fevil.example", "?next=javascript:alert(1)"]) {
      const res = await call("acme-paving", { query });
      expect(res.headers.get("location"), query).toBe("https://acmepaving.ca/?utm_source=pmrfp.com&utm_medium=referral");
    }
    // The slug is only a lookup key. Something that isn't a company's slug goes to the directory, never to itself.
    for (const slug of ["https:%2F%2Fevil.example", "%2F%2Fevil.example", "..%2F..%2Fevil", "javascript:alert(1)"]) {
      const res = await call(slug);
      expect(res.status, slug).toBe(302);
      const to = new URL(res.headers.get("location")!);
      expect(to.origin, slug).toBe("https://pmrfp.com");
      expect(to.pathname, slug).toBe("/directory");
    }
  });

  it("bots and crawlers get a bare 404 and are never counted", async () => {
    for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0)", "facebookexternalhit/1.1", "", "python-requests/2.31"]) {
      const res = await call("acme-paving", { ua });
      expect(res.status, ua).toBe(404);
      expect(res.headers.get("location"), ua).toBeNull();
    }
    expect(bufferedOutClicks()).toEqual([]);
    expect(h.lookups).toEqual([]);
  });

  it("rate limited visitors get 429 without a lookup", async () => {
    h.limited = { limit: 30, remaining: 0, reset: Date.now() + 1000 };
    const res = await call("acme-paving");
    expect(res.status).toBe(429);
    expect(h.lookups).toEqual([]);
  });

  it("a HEAD request redirects but is not a visit", async () => {
    const res = await call("acme-paving", { method: "HEAD" });
    expect(res.status).toBe(302);
    expect(bufferedOutClicks()).toEqual([]);
  });

  it("several clicks add up in memory in one row per company and day", async () => {
    await call("acme-paving");
    await call("acme-paving");
    await call("acme-paving");
    expect(bufferedOutClicks()).toEqual([expect.objectContaining({ slug: "acme-paving", n: 3 })]);
  });
});
