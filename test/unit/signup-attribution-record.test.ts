import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./fake-supabase";

/**
 * lib/attribution/record for real (the database faked): the magic-link
 * lookup by email, the fallback for a database without the new columns,
 * Do-Not-Track / GPC; and lib/tracking/server's first-party events
 * honouring the same signals.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  headers: new Headers(),
  cookies: [] as { name: string; value: string }[],
  upsertErrors: [] as ({ code?: string; message: string } | null)[],
  rpc: vi.fn<(name: string, args: unknown) => Promise<{ error: null }>>(async () => ({ error: null })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => h.headers,
  cookies: async () => ({ get: (n: string) => h.cookies.find((c) => c.name === n), getAll: () => h.cookies }),
}));
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true, isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    const from = (t: string) => {
      const b = h.db.from(t) as unknown as { upsert: (...a: unknown[]) => unknown };
      if (t !== "signup_attribution") return b;
      const realUpsert = b.upsert.bind(b);
      b.upsert = (...a: unknown[]) => {
        const err = h.upsertErrors.shift();
        if (err) return Promise.resolve({ data: null, error: err });
        return realUpsert(...a);
      };
      return b;
    };
    return { from, rpc: h.rpc };
  },
}));

import { recordSignupAttribution, recordSignupAttributionForEmail } from "@/lib/attribution/record";
import { serializeFirstTouch } from "@/lib/attribution/cookie";
import { recordSiteEvent } from "@/lib/tracking/server";
import { bufferListingView, pendingBatch, resetTrackingBuffer, scheduleFlush } from "@/lib/tracking/buffer";
import { trackEvent } from "@/lib/analytics";

const FRESH = "22222222-2222-4222-8222-222222222222";
const OLD = "33333333-3333-4333-8333-333333333333";
const ft = serializeFirstTouch({ path: "/rfps", ref: "linkedin.com", utm: { source: "linkedin" }, first: "2026-10-20", lang: "en", country: "CA" });

beforeEach(() => {
  h.db = fakeDb(
    {
      users_profile: [
        { id: FRESH, email: "fresh@example.com", created_at: new Date(Date.now() - 30_000).toISOString() },
        { id: OLD, email: "old@example.com", created_at: "2026-01-01T00:00:00Z" },
      ],
      signup_attribution: [],
    },
    { unique: { signup_attribution: (a, b) => a.user_id === b.user_id } },
  );
  h.headers = new Headers({ host: "pmrfp.com", "x-vercel-ip-country": "CA", "user-agent": "Mozilla/5.0 Safari" });
  h.cookies = [{ name: "pmrfp_ft", value: ft }];
  h.upsertErrors = [];
  resetTrackingBuffer();
});

describe("magic-link sign-up: found by email", () => {
  it("records the account created moments ago, with the cookie's source", async () => {
    await recordSignupAttributionForEmail({ email: " Fresh@Example.com ", method: "magic_link", role: "trade", lang: "en" });
    expect(h.db.tables.signup_attribution).toEqual([
      expect.objectContaining({ user_id: FRESH, method: "magic_link", role: "trade", channel: "social", referrer_host: "linkedin.com", country: "CA", opted_out: false }),
    ]);
  });

  it("never re-attributes an older account that just asked for a link", async () => {
    await recordSignupAttributionForEmail({ email: "old@example.com", method: "magic_link", role: "trade" });
    await recordSignupAttributionForEmail({ email: "nobody@example.com", method: "magic_link", role: "trade" });
    expect(h.db.tables.signup_attribution).toEqual([]);
  });

  it("first write wins; a later call only fills in the role", async () => {
    await recordSignupAttribution({ userId: FRESH, method: "google" });
    h.cookies = [];
    await recordSignupAttribution({ userId: FRESH, method: "google", role: "property_manager" });
    expect(h.db.tables.signup_attribution).toEqual([expect.objectContaining({ user_id: FRESH, channel: "social", method: "google", role: "property_manager" })]);
  });
});

describe("every sign-up gets a row with whatever is known", () => {
  it("no cookie: channel unknown, but the language and the host's country are kept", async () => {
    h.cookies = [];
    await recordSignupAttribution({ userId: FRESH, method: "password", role: "trade", lang: "fr" });
    expect(h.db.tables.signup_attribution[0]).toMatchObject({ channel: "unknown", landing_path: null, lang: "fr", country: "CA", method: "password" });
  });

  it("Do-Not-Track / GPC: only the method and role, flagged opted_out", async () => {
    h.headers = new Headers({ host: "pmrfp.com", "x-vercel-ip-country": "CA", "sec-gpc": "1" });
    await recordSignupAttribution({ userId: FRESH, method: "password", role: "trade", lang: "en" });
    expect(h.db.tables.signup_attribution[0]).toMatchObject({ channel: "unknown", landing_path: null, referrer_host: null, utm_source: null, country: null, method: "password", role: "trade", opted_out: true });
  });

  it("a database without migration 20261021000200 still gets the row (old method names, no role)", async () => {
    h.upsertErrors = [{ code: "PGRST204", message: "Could not find the 'opted_out' column of 'signup_attribution' in the schema cache" }];
    await recordSignupAttribution({ userId: FRESH, method: "magic_link", role: "trade" });
    const row = h.db.tables.signup_attribution[0];
    expect(row).toMatchObject({ user_id: FRESH, method: "email", channel: "social" });
    expect(row).not.toHaveProperty("role");
    expect(row).not.toHaveProperty("opted_out");
  });

  it("a failed write is logged and never thrown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.upsertErrors = [{ code: "42501", message: "permission denied" }];
    await expect(recordSignupAttribution({ userId: FRESH, method: "password" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("first-party funnel events from the server", () => {
  it("buffers the event with the request's country, campaign and visitor hash", async () => {
    await recordSiteEvent("signup_completed", { method: "password", email: "x@y.z" }, { userId: FRESH, role: "trade" });
    expect(pendingBatch().events).toEqual([
      expect.objectContaining({ event: "signup_completed", user_id: FRESH, role: "trade", country: "CA", utm_source: "linkedin", props: { method: "password" } }),
    ]);
    expect(pendingBatch().events[0].anon_hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("records nothing for Do-Not-Track, Global Privacy Control or bots", async () => {
    const signals: Record<string, string>[] = [{ dnt: "1" }, { "sec-gpc": "1" }, { "user-agent": "Googlebot/2.1" }];
    for (const extra of signals) {
      h.headers = new Headers({ host: "pmrfp.com", ...extra });
      await recordSiteEvent("pricing_viewed");
    }
    expect(pendingBatch().events).toEqual([]);
  });

  it("the webhook (not the person's request) keeps only what it's given", async () => {
    h.headers = new Headers({ host: "pmrfp.com", "x-vercel-ip-country": "US", "user-agent": "Stripe/1.0" });
    await recordSiteEvent("checkout_completed", { plan: "pro" }, { userId: FRESH, fromRequest: false });
    expect(pendingBatch().events[0]).toMatchObject({ event: "checkout_completed", user_id: FRESH, country: null, anon_hash: null, utm_source: null });
  });

  it("writes everything waiting in ONE batched RPC, after the response", async () => {
    h.rpc.mockClear();
    await recordSiteEvent("signup_started");
    await recordSiteEvent("pricing_viewed");
    bufferListingView({ day: "2026-10-21", slug: "roof-ab12", h: "d".repeat(32), user_id: null, country: "CA", lang: "en" });
    await Promise.all([scheduleFlush(1), scheduleFlush(1), scheduleFlush(1)]);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = h.rpc.mock.calls[0] as [string, { p: { events: unknown[]; views: unknown[] } }];
    expect(name).toBe("record_site_beacon");
    expect(args.p.events).toHaveLength(2);
    expect(args.p.views).toHaveLength(1);
    expect(pendingBatch().events).toEqual([]);
  });

  it("trackEvent records site events first-party; interest in a listing is respond_to_job", async () => {
    await trackEvent("rfp_interest_submitted", { rfpId: "r1", role: "trade" }, { userId: FRESH });
    await trackEvent("signin_completed", { method: "google" });
    expect(pendingBatch().events).toEqual([expect.objectContaining({ event: "respond_to_job", role: "trade", props: { rfpId: "r1" } })]);
  });
});
