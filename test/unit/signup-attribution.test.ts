import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FT_COOKIE,
  MAX_COOKIE_LEN,
  MAX_PATH,
  MAX_UTM,
  buildFirstTouch,
  parseFirstTouch,
  referrerHost,
  remainingMaxAge,
  sanitizePath,
  sanitizeUtm,
  serializeFirstTouch,
  utmFrom,
  withLastTouch,
  type FirstTouch,
} from "@/lib/attribution/cookie";
import { classifyChannel } from "@/lib/attribution/channel";
import { signupAttributionRow } from "@/lib/attribution/signup";
import { byWeek, joinSignups, top, weekOf } from "@/lib/attribution/report";
import { emailUtmUrl, tagEmailLinks } from "@/lib/email/utm";

// ── Mocks for the server-side recorder (lib/attribution/record) ──
const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  host: "pmrfp.com",
  upserts: [] as { row: Record<string, unknown>; opts: unknown }[],
  updates: [] as { values: Record<string, unknown>; filters: [string, string, unknown][] }[],
  upsertError: null as { message: string } | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "pmrfp_ft" && state.cookie !== undefined ? { name, value: state.cookie } : undefined) }),
  headers: async () => new Headers({ host: state.host }),
}));
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true, isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("signup_attribution");
      return {
        upsert: async (row: Record<string, unknown>, opts: unknown) => {
          state.upserts.push({ row, opts });
          return { error: state.upsertError };
        },
        update: (values: Record<string, unknown>) => {
          const entry = { values, filters: [] as [string, string, unknown][] };
          state.updates.push(entry);
          const chain = {
            eq: (c: string, v: unknown) => (entry.filters.push(["eq", c, v]), chain),
            is: (c: string, v: unknown) => (entry.filters.push(["is", c, v]), Promise.resolve({ error: null })),
          };
          return chain;
        },
      };
    },
  }),
}));

const NOW = new Date("2026-10-15T15:00:00Z");
const q = (s: string) => new URLSearchParams(s);

describe("first-touch cookie: sanitizing", () => {
  it("keeps the landing path only: no query, no fragment, no email-looking segments, capped", () => {
    expect(sanitizePath("/rfps?category=roofing&email=a@b.com#top")).toBe("/rfps");
    expect(sanitizePath("/fr/trades/roofing/toronto")).toBe("/fr/trades/roofing/toronto");
    expect(sanitizePath("/check-email/jane@acme.com")).toBe("/check-email/-");
    expect(sanitizePath("/u/jane%40acme.com/x")).toBe("/u/-/x");
    expect(sanitizePath("/a<script>b\"c")).toBe("/ascriptbc");
    expect(sanitizePath("https://evil.com/x")).toBe("");
    expect(sanitizePath("/" + "a".repeat(500))).toHaveLength(MAX_PATH);
  });

  it("keeps only the referrer's host, never its path or query", () => {
    expect(referrerHost("https://www.google.com/search?q=roofing+toronto")).toBe("google.com");
    expect(referrerHost("https://l.facebook.com/l.php?u=https%3A%2F%2Fpmrfp.com&h=AT0")).toBe("l.facebook.com");
    expect(referrerHost("https://user:pass@mail.example.ca:8443/inbox/123?token=abc")).toBe("mail.example.ca");
    expect(referrerHost("android-app://com.google.android.googlequicksearchbox/")).toBe("com.google.android.googlequicksearchbox");
    expect(referrerHost("javascript:alert(1)")).toBe("");
    expect(referrerHost("")).toBe("");
    expect(referrerHost(null)).toBe("");
    expect(referrerHost("not a url/with path")).toBe("");
    expect(referrerHost(`https://${"a".repeat(120)}.com/`)).toBe("");
  });

  it("cleans utm values: lowercase, safe characters, capped, email addresses dropped", () => {
    expect(sanitizeUtm("  Fall Campaign 2026 ")).toBe("fall_campaign_2026");
    expect(sanitizeUtm("<b>x</b>")).toBe("bxb");
    expect(sanitizeUtm("jane@acme.com")).toBe("");
    expect(sanitizeUtm("jane%40acme.com")).toBe("");
    expect(sanitizeUtm("x".repeat(300))).toHaveLength(MAX_UTM);
    expect(utmFrom(q("utm_source=LinkedIn&utm_medium=social&utm_campaign=launch&utm_term=roof&fbclid=abc&email=a@b.c"))).toEqual({
      source: "linkedin",
      medium: "social",
      campaign: "launch",
    });
  });

  it("builds a first touch with host-only referrer, utm tags, Toronto day, language and a 2-letter country (no IP)", () => {
    const ft = buildFirstTouch({
      path: "/fr/rfps",
      referer: "https://www.google.ca/search?q=appels+d%27offres",
      params: q("utm_source=newsletter&utm_campaign=oct"),
      lang: "fr",
      country: "ca",
      now: NOW,
    });
    expect(ft).toEqual({ path: "/fr/rfps", ref: "google.ca", utm: { source: "newsletter", campaign: "oct" }, first: "2026-10-15", lang: "fr", country: "CA" });
    expect(JSON.stringify(ft)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(buildFirstTouch({ path: "/", lang: "de", country: "Canada", now: NOW })).toMatchObject({ lang: "", country: "", ref: "", utm: {} });
  });

  it("round-trips through the cookie value and re-sanitizes whatever the browser sends back", () => {
    const ft: FirstTouch = { path: "/rfps", ref: "google.com", utm: { source: "badge", medium: "referral", campaign: "acme" }, first: "2026-10-15", lang: "en", country: "US" };
    const value = serializeFirstTouch(ft);
    expect(value.length).toBeLessThanOrEqual(MAX_COOKIE_LEN);
    expect(parseFirstTouch(value)).toEqual(ft);
    // Tampered values are cleaned, not trusted.
    const evil = new URLSearchParams({ v: "1", p: "/x?y=1", r: "https://evil.com/path?q=1", us: "a@b.com", d: "2026-10-15", l: "xx", g: "1.2.3.4" }).toString();
    // A full URL slipped into the cookie is cut back to its host.
    expect(parseFirstTouch(evil)).toEqual({ path: "/x", ref: "evil.com", utm: {}, first: "2026-10-15", lang: "", country: "" });
    expect(parseFirstTouch("garbage")).toBeNull();
    expect(parseFirstTouch("v=2&d=2026-10-15")).toBeNull();
    expect(parseFirstTouch("v=1")).toBeNull();
    expect(parseFirstTouch(undefined)).toBeNull();
  });

  it("caps the serialized cookie even with every field at its maximum", () => {
    const long = "x".repeat(MAX_UTM);
    const ft: FirstTouch = {
      path: "/" + "%E2%9C%93".repeat(60),
      ref: "a".repeat(60) + ".example.com",
      utm: { source: long, medium: long, campaign: long, content: long },
      first: "2026-10-15",
      lang: "es",
      country: "CA",
      last: { source: long, medium: long, campaign: long, content: long, at: "2026-10-20" },
    };
    const value = serializeFirstTouch(ft);
    expect(value.length).toBeLessThanOrEqual(MAX_COOKIE_LEN);
    const back = parseFirstTouch(value);
    expect(back?.first).toBe("2026-10-15");
    expect(back?.utm.source).toBe(long);
  });

  it("never overwrites the first touch; records a different later campaign as last touch", () => {
    const ft = buildFirstTouch({ path: "/", referer: "https://www.bing.com/", now: NOW });
    expect(withLastTouch(ft, q(""))).toBeNull(); // no tags: nothing to do
    const later = withLastTouch(ft, q("utm_source=pmrfp&utm_medium=email&utm_campaign=weekly-digest"), new Date("2026-10-20T15:00:00Z"));
    expect(later).toMatchObject({ path: "/", ref: "bing.com", first: "2026-10-15", last: { source: "pmrfp", medium: "email", campaign: "weekly-digest", at: "2026-10-20" } });
    expect(withLastTouch(later!, q("utm_source=pmrfp&utm_medium=email&utm_campaign=weekly-digest"))).toBeNull(); // same again
    const tagged = buildFirstTouch({ path: "/", params: q("utm_source=badge&utm_medium=referral"), now: NOW });
    expect(withLastTouch(tagged, q("utm_source=badge&utm_medium=referral"))).toBeNull(); // same as first
  });

  it("expires 90 days after the first visit, not after the latest one", () => {
    expect(remainingMaxAge("2026-10-15", new Date("2026-10-15T12:00:00Z"))).toBe(90 * 86400);
    expect(remainingMaxAge("2026-10-15", new Date("2026-11-14T12:00:00Z"))).toBe(60 * 86400);
    expect(remainingMaxAge("2026-01-01", new Date("2026-10-15T12:00:00Z"))).toBe(86400);
  });
});

describe("channel classification", () => {
  const c = (ref: string, utm = "", own: string[] = []) => classifyChannel({ ref, utm: utmFrom(q(utm)) }, own);

  it("search engines by referrer host", () => {
    expect(c("google.com")).toBe("google_organic");
    expect(c("google.ca")).toBe("google_organic");
    expect(c("google.co.uk")).toBe("google_organic");
    expect(c("com.google.android.googlequicksearchbox")).toBe("google_organic");
    expect(c("bing.com")).toBe("bing_organic");
    expect(c("duckduckgo.com")).toBe("other_search");
    expect(c("docs.google.com")).toBe("referral");
    expect(c("chatgpt.com")).toBe("ai_assistant");
    expect(c("gemini.google.com")).toBe("ai_assistant");
  });

  it("email: utm_medium=email, our outreach and digest links, webmail referrers", () => {
    expect(c("", "utm_source=pmrfp&utm_medium=email&utm_campaign=weekly-digest")).toBe("email");
    expect(c("", "utm_source=founder_outreach")).toBe("email");
    expect(c("google.com", "utm_medium=newsletter")).toBe("email");
    expect(c("mail.google.com")).toBe("email");
    expect(c("outlook.live.com")).toBe("email");
  });

  it("social: facebook, linkedin, x by host or tag", () => {
    expect(c("l.facebook.com")).toBe("social");
    expect(c("m.facebook.com")).toBe("social");
    expect(c("linkedin.com")).toBe("social");
    expect(c("lnkd.in")).toBe("social");
    expect(c("t.co")).toBe("social");
    expect(c("x.com")).toBe("social");
    expect(c("", "utm_source=linkedin&utm_medium=post")).toBe("social");
    expect(c("", "utm_medium=social")).toBe("social");
  });

  it("paid, referral (badges, widgets, other sites), internal, direct, other", () => {
    expect(c("google.com", "utm_source=google&utm_medium=cpc")).toBe("paid");
    expect(c("acmepaving.ca", "utm_source=badge&utm_medium=referral&utm_campaign=acme-paving")).toBe("referral");
    expect(c("", "utm_source=widget&utm_medium=embed&utm_campaign=feed")).toBe("referral");
    expect(c("boma.org")).toBe("referral");
    expect(c("pmrfp.com")).toBe("internal");
    expect(c("pmrfp-git-x.vercel.app")).toBe("internal");
    expect(c("staging.example.dev", "", ["staging.example.dev"])).toBe("internal");
    expect(c("")).toBe("direct");
    expect(c("", "utm_source=podcast")).toBe("other");
    expect(c("boma.org", "utm_source=podcast")).toBe("referral");
  });
});

describe("signup_attribution row", () => {
  it("copies the cookie's first touch, classifies it, and keeps last touch only when different", () => {
    const ft: FirstTouch = {
      path: "/trades/roofing/toronto",
      ref: "google.com",
      utm: {},
      first: "2026-10-01",
      lang: "en",
      country: "CA",
      last: { source: "pmrfp", medium: "email", campaign: "tender-digest", at: "2026-10-10" },
    };
    const row = signupAttributionRow({ userId: "u1", orgId: "o1", ft, method: "email", now: NOW });
    expect(row).toEqual({
      user_id: "u1",
      org_id: "o1",
      channel: "google_organic",
      landing_path: "/trades/roofing/toronto",
      referrer_host: "google.com",
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      last_utm_source: "pmrfp",
      last_utm_medium: "email",
      last_utm_campaign: "tender-digest",
      last_utm_content: null,
      last_touch_at: "2026-10-10",
      first_seen: "2026-10-01",
      signed_up_at: NOW.toISOString(),
      lang: "en",
      country: "CA",
      method: "email",
      role: null,
      opted_out: false,
    });
    const same = signupAttributionRow({ userId: "u1", ft: { ...ft, utm: { source: "x" }, last: { source: "x", at: "2026-10-02" } }, now: NOW });
    expect(same.last_utm_source).toBeNull();
  });

  it("no cookie: channel unknown, nothing guessed", () => {
    const row = signupAttributionRow({ userId: "u2", ft: null, now: NOW });
    expect(row).toMatchObject({ user_id: "u2", org_id: null, channel: "unknown", landing_path: null, referrer_host: null, first_seen: null, method: null });
  });
});

describe("attribution saved at sign-up (lib/attribution/record)", () => {
  beforeEach(() => {
    state.upserts.length = 0;
    state.updates.length = 0;
    state.upsertError = null;
    state.cookie = undefined;
  });

  it("writes the cookie's values for the new user once (first write wins)", async () => {
    const { recordSignupAttribution } = await import("@/lib/attribution/record");
    state.cookie = serializeFirstTouch({ path: "/rfps", ref: "linkedin.com", utm: { source: "linkedin", campaign: "launch" }, first: "2026-10-14", lang: "en", country: "CA" });
    await recordSignupAttribution({ userId: "user-1", method: "email" });
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].opts).toEqual({ onConflict: "user_id", ignoreDuplicates: true });
    expect(state.upserts[0].row).toMatchObject({
      user_id: "user-1",
      org_id: null,
      channel: "social",
      landing_path: "/rfps",
      referrer_host: "linkedin.com",
      utm_source: "linkedin",
      utm_campaign: "launch",
      first_seen: "2026-10-14",
      country: "CA",
      method: "email",
    });
    expect(state.updates).toHaveLength(0); // no org yet
  });

  it("at onboarding, attaches the organization only where none is set", async () => {
    const { recordSignupAttribution } = await import("@/lib/attribution/record");
    await recordSignupAttribution({ userId: "user-1", orgId: "org-9" });
    expect(state.upserts[0].row).toMatchObject({ user_id: "user-1", org_id: "org-9", channel: "unknown" });
    expect(state.updates).toEqual([{ values: { org_id: "org-9" }, filters: [["eq", "user_id", "user-1"], ["is", "org_id", null]] }]);
  });

  it("never throws or blocks sign-up when the table is missing", async () => {
    const { recordSignupAttribution } = await import("@/lib/attribution/record");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.upsertError = { message: 'relation "signup_attribution" does not exist' };
    await expect(recordSignupAttribution({ userId: "user-2", orgId: "org-1" })).resolves.toBeUndefined();
    expect(state.updates).toHaveLength(0);
    warn.mockRestore();
  });

  it("treats a visit from our own host as internal", async () => {
    const { recordSignupAttribution } = await import("@/lib/attribution/record");
    state.host = "preview.pmrfp.test";
    state.cookie = serializeFirstTouch({ path: "/", ref: "preview.pmrfp.test", utm: {}, first: "2026-10-14", lang: "en", country: "" });
    await recordSignupAttribution({ userId: "user-3" });
    expect(state.upserts[0].row.channel).toBe("internal");
    state.host = "pmrfp.com";
  });
});

describe("our email links carry utm tags", () => {
  const BASE = "https://pmrfp.com";

  it("tags pmrfp.com links, keeps query strings and fragments", () => {
    expect(emailUtmUrl(`${BASE}/rfps/abc`, "daily-matches")).toBe(`${BASE}/rfps/abc?utm_source=pmrfp&utm_medium=email&utm_campaign=daily-matches`);
    expect(emailUtmUrl(`${BASE}/rfps?category=roofing#list`, "x")).toBe(`${BASE}/rfps?category=roofing&utm_source=pmrfp&utm_medium=email&utm_campaign=x#list`);
    const html = `<a href="${BASE}/rfps?category=roofing">a</a> <a href="${BASE}">home</a>`;
    expect(tagEmailLinks(html, "tender-digest", BASE)).toBe(
      `<a href="${BASE}/rfps?category=roofing&amp;utm_source=pmrfp&amp;utm_medium=email&amp;utm_campaign=tender-digest">a</a> <a href="${BASE}?utm_source=pmrfp&amp;utm_medium=email&amp;utm_campaign=tender-digest">home</a>`,
    );
  });

  it("leaves signed links, sponsor click-outs, other sites and already-tagged links alone", () => {
    const html = [
      `<a href="${BASE}/api/email/unsubscribe?u=1&t=abc">unsub</a>`,
      `<a href="${BASE}/api/digest/confirm?s=1&amp;t=x">confirm</a>`,
      `<a href="${BASE}/go/sponsor/maple?p=email">sponsor</a>`,
      `<a href="https://sponsor.example/?utm_source=pmrfp">ext</a>`,
      `<a href="${BASE}/rfps?utm_source=x">tagged</a>`,
      `<a href="mailto:info@pmrfp.com">mail</a>`,
      `<img src="${BASE}/brand/email-logo.png">`,
    ].join("");
    expect(tagEmailLinks(html, "weekly-digest", BASE)).toBe(html);
  });
});

describe("/admin/signups report", () => {
  it("weeks start on Monday (Toronto)", () => {
    expect(weekOf("2026-10-15T15:00:00Z")).toBe("2026-10-12"); // Thursday
    expect(weekOf("2026-10-12T05:00:00Z")).toBe("2026-10-12"); // Monday 1am Toronto
    expect(weekOf("2026-10-12T03:00:00Z")).toBe("2026-10-05"); // still Sunday in Toronto
  });

  it("accounts without a row are unknown; counts by week and channel", () => {
    const users = [
      { id: "a", created_at: "2026-10-15T15:00:00Z", primary_role: "trade" },
      { id: "b", created_at: "2026-10-14T15:00:00Z", primary_role: "property_manager" },
      { id: "c", created_at: "2026-10-06T15:00:00Z", primary_role: "trade" },
    ];
    const rows = [
      { user_id: "a", org_id: null, channel: "google_organic", landing_path: "/rfps", referrer_host: "google.com", utm_source: null, utm_medium: null, utm_campaign: null, last_utm_source: null, last_utm_campaign: null, country: "CA", lang: "en", method: "email" },
      { user_id: "b", org_id: null, channel: "google_organic", landing_path: "/rfps", referrer_host: "google.com", utm_source: null, utm_medium: null, utm_campaign: null, last_utm_source: null, last_utm_campaign: null, country: "CA", lang: "en", method: "google" },
    ];
    const lines = joinSignups(users, rows);
    expect(lines.map((l) => [l.userId, l.channel])).toEqual([["a", "google_organic"], ["b", "google_organic"], ["c", "unknown"]]);
    const { weeks, channels } = byWeek(lines);
    expect(channels).toEqual(["google_organic", "unknown"]);
    expect(weeks).toEqual([
      { week: "2026-10-12", total: 2, byChannel: { google_organic: 2 } },
      { week: "2026-10-05", total: 1, byChannel: { unknown: 1 } },
    ]);
    expect(top(lines, (l) => l.a?.landing_path)).toEqual([{ key: "/rfps", n: 2 }]);
  });
});

describe("landing counters: aggregate, batched, never per request", () => {
  afterEach(() => vi.resetModules());

  it("adds first visits up in memory by day, channel and page", async () => {
    vi.resetModules();
    const { countLanding, bufferedLandings, shouldFlushLandings } = await import("@/lib/attribution/landings");
    countLanding("google_organic", "/rfps", NOW);
    countLanding("google_organic", "/rfps", NOW);
    countLanding("direct", "/", NOW);
    expect(bufferedLandings()).toEqual([
      { day: "2026-10-15", channel: "google_organic", path: "/rfps", n: 2 },
      { day: "2026-10-15", channel: "direct", path: "/", n: 1 },
    ]);
    expect(shouldFlushLandings(NOW.getTime() + 1000)).toBe(false);
    expect(shouldFlushLandings(NOW.getTime() + 61_000)).toBe(true);
  });

  it("the cookie name is pmrfp_ft", () => {
    expect(FT_COOKIE).toBe("pmrfp_ft");
  });
});
