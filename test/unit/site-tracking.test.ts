import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkBeaconRequest, MAX_BEACON_BYTES, parseBeacon, sameOrigin } from "@/lib/tracking/beacon";
import { bufferListingView, flushNow, pendingBatch, resetTrackingBuffer } from "@/lib/tracking/buffer";
import { ingestBeacon } from "@/lib/tracking/ingest";
import { dailySalt, visitorHash } from "@/lib/tracking/hash";
import { browserOptedOut, isBotUserAgent, optedOut, trackablePath } from "@/lib/tracking/privacy";
import { requestFacts } from "@/lib/tracking/request";
import { userIdFromAuthCookies } from "@/lib/tracking/session-cookie";
import { isClientEvent, langOfPath, marketOf, sanitizeProps } from "@/lib/tracking/events";
import { upgradeIntent } from "@/lib/tracking/intent";
import { DEFAULT_GA_ID, clarityId, gaMeasurementId, validGaId } from "@/lib/tracking/ga";
import { checkBeaconLimit, resetBeaconLimit } from "@/lib/rate-limit";
import { serializeFirstTouch } from "@/lib/attribution/cookie";
import { POST } from "@/app/api/t/route";

/**
 * First-party tracking: the /api/t beacon (bots, size, CSRF, rate limit,
 * DNT/GPC), per-visitor-per-day listing view dedupe, visitor hashes, the
 * session-cookie reader and the GA4 id rules.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const SECRET = "test-secret";

function hdrs(o: Record<string, string>) {
  return new Headers(o);
}

function beaconRequest(body: unknown, headers: Record<string, string> = {}, ip = "203.0.113.7") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("https://pmrfp.com/api/t", {
    method: "POST",
    body: text,
    headers: {
      "content-type": "text/plain",
      "sec-fetch-site": "same-origin",
      "user-agent": UA,
      "x-forwarded-for": ip,
      "x-vercel-ip-country": "CA",
      "x-vercel-ip-country-region": "ON",
      host: "pmrfp.com",
      ...headers,
    },
  });
}

const PV = { v: 1, items: [{ t: "pv", p: "/rfps", r: "www.google.com" }, { t: "lv", s: "roof-repair-ab12", p: "/rfps/roof-repair-ab12" }] };

beforeEach(() => {
  resetTrackingBuffer();
  resetBeaconLimit();
});

describe("beacon request rules", () => {
  const base = { method: "POST", url: "https://pmrfp.com/api/t" };

  it("accepts a same-origin browser POST", () => {
    expect(checkBeaconRequest({ ...base, headers: hdrs({ "sec-fetch-site": "same-origin", "user-agent": UA }) })).toEqual({ ok: true });
  });

  it("rejects bots and requests without a user agent", () => {
    for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "Mozilla/5.0 HeadlessChrome/120", "facebookexternalhit/1.1", ""]) {
      expect(checkBeaconRequest({ ...base, headers: hdrs({ "sec-fetch-site": "same-origin", "user-agent": ua }) })).toEqual({ ok: false, status: 403, reason: "bot" });
    }
    expect(isBotUserAgent(UA)).toBe(false);
  });

  it("rejects oversized payloads by Content-Length", () => {
    const r = checkBeaconRequest({ ...base, headers: hdrs({ "sec-fetch-site": "same-origin", "user-agent": UA, "content-length": String(MAX_BEACON_BYTES + 1) }) });
    expect(r).toEqual({ ok: false, status: 413, reason: "size" });
  });

  it("is CSRF-safe: cross-site and header-less requests are refused", () => {
    expect(checkBeaconRequest({ ...base, headers: hdrs({ "sec-fetch-site": "cross-site", "user-agent": UA }) })).toMatchObject({ status: 403, reason: "cross_site" });
    expect(checkBeaconRequest({ ...base, headers: hdrs({ "user-agent": UA }) })).toMatchObject({ status: 403, reason: "cross_site" });
    expect(sameOrigin({ url: base.url, headers: hdrs({ origin: "https://evil.example" }) })).toBe(false);
    expect(sameOrigin({ url: base.url, headers: hdrs({ origin: "https://pmrfp.com" }) })).toBe(true);
    expect(checkBeaconRequest({ ...base, method: "GET", headers: hdrs({}) })).toMatchObject({ status: 405 });
  });

  it("honours Do-Not-Track and Global Privacy Control (204, nothing kept)", () => {
    const signals: Record<string, string>[] = [{ dnt: "1" }, { "sec-gpc": "1" }];
    for (const h of signals) {
      expect(checkBeaconRequest({ ...base, headers: hdrs({ "sec-fetch-site": "same-origin", "user-agent": UA, ...h }) })).toEqual({ ok: false, status: 204, reason: "opted_out" });
    }
    expect(optedOut(hdrs({ dnt: "0" }))).toBe(false);
  });
});

describe("beacon payload", () => {
  it("refuses oversized bodies and malformed JSON", () => {
    expect(parseBeacon(JSON.stringify({ v: 1, items: [{ t: "pv", p: `/${"a".repeat(MAX_BEACON_BYTES)}` }] }))).toMatchObject({ ok: false, status: 413 });
    expect(parseBeacon("{nope")).toMatchObject({ ok: false, status: 400, reason: "json" });
    expect(parseBeacon(JSON.stringify({ v: 2, items: [] }))).toMatchObject({ ok: false, reason: "shape" });
    expect(parseBeacon(JSON.stringify({ v: 1, items: Array.from({ length: 21 }, () => ({ t: "pv", p: "/" })) }))).toMatchObject({ ok: false, reason: "shape" });
  });

  it("keeps clean items only: paths without queries, referrer hosts, client events, safe props", () => {
    const r = parseBeacon(
      JSON.stringify({
        v: 1,
        items: [
          { t: "pv", p: "/rfps?email=a@b.com", r: "https://www.google.com/search?q=x" },
          { t: "pv", p: "/embed/board" },
          { t: "pv", p: "/fr/admin/analytics" },
          { t: "lv", s: "bad slug!" },
          { t: "lv", s: "roof-ab12" },
          { t: "ev", e: "signup_completed", p: "/sign-up" },
          { t: "ev", e: "upgrade_clicked", p: "/pricing", x: { plan: "pro", email: "jane@acme.com", nested: { a: 1 }, n: 3 } },
          { t: "zz" },
        ],
      }),
    );
    expect(r).toEqual({
      ok: true,
      items: [
        { t: "pv", path: "/rfps", ref: "google.com" },
        { t: "lv", slug: "roof-ab12", path: "/rfps/roof-ab12" },
        { t: "ev", event: "upgrade_clicked", path: "/pricing", props: { plan: "pro", n: 3 } },
      ],
    });
    expect(isClientEvent("checkout_completed")).toBe(false);
    expect(sanitizeProps({ a: "x".repeat(200), "bad key": 1, b: Infinity })).toEqual({ a: "x".repeat(80) });
  });

  it("only counts real pages", () => {
    expect(trackablePath("/rfps/x")).toBe(true);
    for (const p of ["/embed/board", "/api/t", "/auth/callback", "/admin", "/es/admin/users", "rfps"]) expect(trackablePath(p)).toBe(false);
  });
});

describe("POST /api/t", () => {
  afterEach(() => vi.restoreAllMocks());

  it("buffers a page view, a referrer and a listing view, never touching the database on the request", async () => {
    const res = await POST(beaconRequest(PV));
    expect(res.status).toBe(204);
    const b = pendingBatch();
    expect(b.pages).toEqual([expect.objectContaining({ path: "/rfps", country: "CA", n: 1 })]);
    expect(b.referrers).toEqual([expect.objectContaining({ host: "google.com", country: "CA", n: 1 })]);
    expect(b.views).toEqual([expect.objectContaining({ slug: "roof-repair-ab12", country: "CA", user_id: null })]);
    expect(b.visitors).toHaveLength(1);
    expect(b.visitors[0].h).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(b)).not.toContain("203.0.113.7");
  });

  it("rejects bots", async () => {
    const res = await POST(beaconRequest(PV, { "user-agent": "Mozilla/5.0 (compatible; bingbot/2.0)" }));
    expect(res.status).toBe(403);
    expect(pendingBatch().pages).toHaveLength(0);
  });

  it("rejects oversized payloads", async () => {
    const big = JSON.stringify({ v: 1, items: [{ t: "pv", p: `/${"x".repeat(5000)}` }] });
    const res = await POST(beaconRequest(big));
    expect(res.status).toBe(413);
    expect(pendingBatch().pages).toHaveLength(0);
  });

  it("rejects cross-site posts", async () => {
    const res = await POST(beaconRequest(PV, { "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
  });

  it("records nothing for Do-Not-Track or Global Privacy Control", async () => {
    expect((await POST(beaconRequest(PV, { dnt: "1" }))).status).toBe(204);
    expect((await POST(beaconRequest(PV, { "sec-gpc": "1" }))).status).toBe(204);
    const b = pendingBatch();
    expect(b.pages.length + b.views.length + b.visitors.length).toBe(0);
  });

  it("is rate-limited per IP (60 a minute), other IPs unaffected", async () => {
    for (let i = 0; i < 60; i++) expect((await POST(beaconRequest(PV, {}, "198.51.100.1"))).status).toBe(204);
    const blocked = await POST(beaconRequest(PV, {}, "198.51.100.1"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect((await POST(beaconRequest(PV, {}, "198.51.100.2"))).status).toBe(204);
  });

  it("the limiter window resets", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 60; i++) expect(await checkBeaconLimit("192.0.2.9", t0)).toBeNull();
    expect(await checkBeaconLimit("192.0.2.9", t0 + 1)).not.toBeNull();
    expect(await checkBeaconLimit("192.0.2.9", t0 + 61_000)).toBeNull();
  });
});

describe("listing views: one per visitor per listing per day", () => {
  const facts = (over: Partial<Parameters<typeof ingestBeacon>[1]> = {}) => ({
    day: "2026-10-21",
    hash: "a".repeat(32),
    country: "CA",
    userId: null,
    host: "pmrfp.com",
    ft: null,
    ...over,
  });
  const lv = [{ t: "lv" as const, slug: "roof-ab12", path: "/rfps/roof-ab12" }];

  it("dedupes the same visitor on the same day, counts a new day and another visitor", () => {
    expect(ingestBeacon(lv, facts()).listingViews).toBe(1);
    expect(ingestBeacon(lv, facts()).listingViews).toBe(0);
    expect(ingestBeacon(lv, facts({ hash: "b".repeat(32) })).listingViews).toBe(1);
    expect(ingestBeacon(lv, facts({ day: "2026-10-22" })).listingViews).toBe(1);
    expect(pendingBatch().views.map((v) => [v.day, v.h[0]])).toEqual([
      ["2026-10-21", "a"],
      ["2026-10-21", "b"],
      ["2026-10-22", "a"],
    ]);
  });

  it("still dedupes after the buffer was written out (same instance, same day)", async () => {
    const row = { day: "2026-10-21", slug: "x", h: "c".repeat(32), user_id: null, country: null, lang: "en" };
    expect(bufferListingView(row)).toBe(true);
    await flushNow(); // no database in tests: the buffer just empties
    expect(pendingBatch().views).toHaveLength(0);
    expect(bufferListingView(row)).toBe(false);
    expect(bufferListingView({ ...row, day: "2026-10-22" })).toBe(true);
  });

  it("a visitor's hash is stable within a day, different the next day, and never contains the IP", () => {
    const f = { day: "2026-10-21", browserKey: "v=1&p=%2F", userAgent: UA, acceptLanguage: "en-CA", geo: "CA-ON" };
    const a = visitorHash(f, SECRET);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorHash(f, SECRET)).toBe(a);
    expect(visitorHash({ ...f, day: "2026-10-22" }, SECRET)).not.toBe(a);
    expect(visitorHash({ ...f, userAgent: "other" }, SECRET)).not.toBe(a);
    expect(visitorHash({ ...f, userId: "11111111-1111-4111-8111-111111111111" }, SECRET)).not.toBe(a);
    expect(dailySalt("2026-10-21", SECRET)).not.toBe(dailySalt("2026-10-22", SECRET));
  });

  it("request facts read the session cookie and first-touch cookie, never the IP", () => {
    const ft = serializeFirstTouch({ path: "/rfps", ref: "google.com", utm: { source: "news" }, first: "2026-10-20", lang: "en", country: "CA" });
    const f = requestFacts(hdrs({ "user-agent": UA, "x-forwarded-for": "203.0.113.7", "x-vercel-ip-country": "us", host: "pmrfp.com" }), [{ name: "pmrfp_ft", value: ft }], { secret: SECRET, now: new Date("2026-10-21T15:00:00Z") });
    expect(f).toMatchObject({ day: "2026-10-21", country: "US", userId: null, host: "pmrfp.com" });
    expect(f.ft?.utm).toEqual({ source: "news" });
    expect(JSON.stringify(f)).not.toContain("203.0.113.7");
  });
});

describe("session cookie (analytics only)", () => {
  const uid = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
  const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
  const session = (exp: number) => JSON.stringify({ access_token: jwt({ sub: uid, exp }), refresh_token: "r" });
  const NOW = Date.parse("2026-10-21T12:00:00Z");

  it("reads the user id from plain, base64 and chunked cookies", () => {
    const value = session(NOW / 1000 + 3600);
    expect(userIdFromAuthCookies([{ name: "sb-abc-auth-token", value }], NOW)).toBe(uid);
    const b64 = `base64-${Buffer.from(value).toString("base64url")}`;
    expect(userIdFromAuthCookies([{ name: "sb-abc-auth-token", value: b64 }], NOW)).toBe(uid);
    const half = Math.floor(b64.length / 2);
    expect(userIdFromAuthCookies([{ name: "sb-abc-auth-token.1", value: b64.slice(half) }, { name: "sb-abc-auth-token.0", value: b64.slice(0, half) }], NOW)).toBe(uid);
  });

  it("ignores junk, other cookies and long-expired sessions", () => {
    expect(userIdFromAuthCookies([{ name: "pmrfp_ft", value: "x" }], NOW)).toBeNull();
    expect(userIdFromAuthCookies([{ name: "sb-abc-auth-token", value: "not json" }], NOW)).toBeNull();
    expect(userIdFromAuthCookies([{ name: "sb-abc-auth-token", value: session(NOW / 1000 - 30 * 86400) }], NOW)).toBeNull();
    expect(userIdFromAuthCookies([{ name: "sb-abc-auth-token", value: JSON.stringify({ access_token: jwt({ sub: "admin' or 1=1" }) }) }], NOW)).toBeNull();
  });
});

describe("Do-Not-Track / GPC in the browser, upgrade clicks, markets", () => {
  it("reads the browser's signals", () => {
    expect(browserOptedOut({ globalPrivacyControl: true })).toBe(true);
    expect(browserOptedOut({ doNotTrack: "1" })).toBe(true);
    expect(browserOptedOut({ doNotTrack: null }, { doNotTrack: "1" })).toBe(true);
    expect(browserOptedOut({ doNotTrack: "unspecified" })).toBe(false);
  });

  it("knows an upgrade link when it sees one", () => {
    expect(upgradeIntent("/sign-up?role=trade&plan=pro&interval=annual")).toBe("pro");
    expect(upgradeIntent("/fr/sign-up?plan=featured")).toBe("featured");
    expect(upgradeIntent("/sign-up?role=trade")).toBeNull();
    expect(upgradeIntent("/dashboard/billing?plan=pro")).toBe("pro");
    expect(upgradeIntent("/dashboard/trial")).toBe("trial");
    expect(upgradeIntent("/founding-500")).toBe("founding");
    expect(upgradeIntent("https://evil.example/dashboard/billing")).toBeNull();
    expect(upgradeIntent("/rfps")).toBeNull();
  });

  it("keeps Canada and the U.S. apart", () => {
    expect([marketOf("CA"), marketOf("us"), marketOf("GB"), marketOf(null)]).toEqual(["CA", "US", "other", "other"]);
    expect([langOfPath("/fr/rfps"), langOfPath("/es"), langOfPath("/rfps")]).toEqual(["fr", "es", "en"]);
  });
});

describe("proxy: Do-Not-Track / GPC and the beacon path", () => {
  const page = (extra: Record<string, string> = {}) =>
    new NextRequest("https://pmrfp.com/rfps", { headers: { "sec-fetch-dest": "document", "user-agent": UA, ...extra } });

  it("sets the first-touch cookie for a person, but not when they ask not to be tracked", async () => {
    const { proxy } = await import("@/proxy");
    expect((await proxy(page())).cookies.get("pmrfp_ft")).toBeTruthy();
    expect((await proxy(page({ dnt: "1" }))).cookies.get("pmrfp_ft")).toBeUndefined();
    expect((await proxy(page({ "sec-gpc": "1" }))).cookies.get("pmrfp_ft")).toBeUndefined();
  });

  it("skips /api/t entirely (no session refresh per page view), but not other /api/t* routes", async () => {
    const { config } = await import("@/proxy");
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/api/t")).toBe(false);
    expect(re.test("/api/talent")).toBe(true);
    expect(re.test("/api/trusted/quote")).toBe(true);
    expect(re.test("/rfps")).toBe(true);
  });
});

describe("GA4 and Clarity configuration", () => {
  it("NEXT_PUBLIC_GA_ID wins; 'off' disables; the built-in id only in production", () => {
    expect(gaMeasurementId({ NEXT_PUBLIC_GA_ID: "g-abc123xyz9" })).toBe("G-ABC123XYZ9");
    expect(gaMeasurementId({ NEXT_PUBLIC_GA_ID: "off", VERCEL_ENV: "production" })).toBeNull();
    expect(gaMeasurementId({ VERCEL_ENV: "production" })).toBe(DEFAULT_GA_ID);
    expect(gaMeasurementId({ VERCEL_ENV: "preview" })).toBeNull();
    expect(gaMeasurementId({ NEXT_PUBLIC_GA4_ID: "G-ALIAS1234" })).toBe("G-ALIAS1234");
    expect(gaMeasurementId({ NEXT_PUBLIC_GA_ID: "');alert(1)//" })).toBeNull();
    expect(validGaId("G-FEC0QRSEFE")).toBe("G-FEC0QRSEFE");
  });

  it("Clarity ids are alphanumeric only", () => {
    expect(clarityId({ NEXT_PUBLIC_CLARITY_ID: "abc123" })).toBe("abc123");
    expect(clarityId({ NEXT_PUBLIC_CLARITY_ID: "a\");x(" })).toBeNull();
    expect(clarityId({})).toBeNull();
  });
});
