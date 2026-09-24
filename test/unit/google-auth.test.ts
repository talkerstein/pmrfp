import { afterEach, describe, expect, it, vi } from "vitest";
import {
  needsRolePick,
  oauthCallbackPath,
  onboardingPath,
  parseRoleChoice,
  postOAuthRedirect,
  resolveRolePick,
  type RolePickState,
} from "@/lib/auth/oauth";
import { isGoogleAuthEnabled } from "@/lib/auth/google";

// A Google sign-up as the DB trigger leaves it: default role, not onboarded, no metadata role.
const fresh: RolePickState = { primaryRole: "trade", onboardingCompleted: false, metadataRole: undefined };

describe("parseRoleChoice", () => {
  it("accepts only the self-serve choices", () => {
    expect(parseRoleChoice("trade")).toBe("trade");
    expect(parseRoleChoice("property_manager")).toBe("property_manager");
    expect(parseRoleChoice("supplier")).toBe("supplier");
    expect(parseRoleChoice("general_contractor")).toBe("general_contractor");
    expect(parseRoleChoice("property_manager", "gc")).toBe("general_contractor");
  });

  it("rejects admin, other roles and junk", () => {
    for (const bad of ["admin", "super_admin", "visitor", "real_estate_agent", "", "TRADE", " trade", null, undefined, 1, {}, ["trade"]]) {
      expect(parseRoleChoice(bad)).toBeNull();
    }
    expect(parseRoleChoice("admin", "gc")).toBeNull();
  });
});

describe("needsRolePick", () => {
  it("is true only for a fresh Google sign-up", () => {
    expect(needsRolePick(fresh)).toBe(true);
    expect(needsRolePick({ ...fresh, metadataRole: null })).toBe(true);
    expect(needsRolePick({ ...fresh, metadataRole: "" })).toBe(true); // trigger treats '' as missing too
  });

  it("is false for email sign-ups, finished onboarding and other roles", () => {
    expect(needsRolePick({ ...fresh, metadataRole: "trade" })).toBe(false); // email trade, mid-onboarding
    expect(needsRolePick({ ...fresh, onboardingCompleted: true })).toBe(false);
    expect(needsRolePick({ ...fresh, primaryRole: "property_manager" })).toBe(false);
    expect(needsRolePick({ ...fresh, primaryRole: "admin" })).toBe(false);
    expect(needsRolePick({ ...fresh, primaryRole: "visitor" })).toBe(false);
  });
});

describe("resolveRolePick (the server action's guard)", () => {
  it("allows a fresh Google sign-up to pick a self-serve role", () => {
    expect(resolveRolePick(fresh, "trade")).toEqual({ ok: true, role: "trade", builder: false });
    expect(resolveRolePick(fresh, "property_manager")).toEqual({ ok: true, role: "property_manager", builder: false });
    expect(resolveRolePick(fresh, "supplier")).toEqual({ ok: true, role: "supplier", builder: false });
    expect(resolveRolePick(fresh, "general_contractor")).toEqual({ ok: true, role: "property_manager", builder: true });
  });

  it("never allows admin or other roles", () => {
    for (const bad of ["admin", "super_admin", "visitor", "real_estate_agent", "", null, 42]) {
      expect(resolveRolePick(fresh, bad)).toEqual({ ok: false, reason: "invalid_role" });
    }
  });

  it("blocks anyone who already has a role", () => {
    const blocked: RolePickState[] = [
      { ...fresh, metadataRole: "trade" }, // email sign-up, or already picked
      { ...fresh, metadataRole: "property_manager" },
      { ...fresh, onboardingCompleted: true }, // finished onboarding
      { ...fresh, primaryRole: "property_manager" }, // already switched
      { ...fresh, primaryRole: "supplier" },
      { ...fresh, primaryRole: "admin" },
      { ...fresh, primaryRole: "super_admin" },
      { primaryRole: "trade", onboardingCompleted: true, metadataRole: "trade" },
    ];
    for (const s of blocked) {
      expect(resolveRolePick(s, "property_manager")).toEqual({ ok: false, reason: "already_set" });
      expect(resolveRolePick(s, "admin")).toMatchObject({ ok: false });
    }
  });
});

describe("oauthCallbackPath", () => {
  it("carries a safe next and drops an unsafe one", () => {
    expect(oauthCallbackPath(null)).toBe("/auth/callback");
    expect(oauthCallbackPath("/rfps/abc")).toBe("/auth/callback?next=%2Frfps%2Fabc");
    expect(oauthCallbackPath("/onboarding?role=trade")).toBe("/auth/callback?next=%2Fonboarding%3Frole%3Dtrade");
    expect(oauthCallbackPath("//evil.com")).toBe("/auth/callback");
    expect(oauthCallbackPath("https://evil.com")).toBe("/auth/callback");
  });
});

describe("onboardingPath", () => {
  it("pre-selects the role, keeps a GC's award, and nests a safe next", () => {
    expect(onboardingPath({})).toBe("/onboarding");
    expect(onboardingPath({ role: "trade" })).toBe("/onboarding?role=trade");
    expect(onboardingPath({ role: "general_contractor", award: "school-reno" })).toBe(
      "/onboarding?role=general_contractor&award=school-reno",
    );
    expect(onboardingPath({ role: "trade", award: "school-reno" })).toBe("/onboarding?role=trade");
    expect(onboardingPath({ role: "supplier", next: "/dashboard/billing?plan=pro" })).toBe(
      "/onboarding?role=supplier&next=%2Fdashboard%2Fbilling%3Fplan%3Dpro",
    );
    expect(onboardingPath({ role: "trade", next: "//evil.com" })).toBe("/onboarding?role=trade");
  });
});

describe("postOAuthRedirect", () => {
  const member = { onboardingCompleted: true, home: "/pm-dashboard" };
  const newbie = { onboardingCompleted: false, home: "/dashboard" };

  it("sends new people through onboarding, keeping next", () => {
    expect(postOAuthRedirect(null, newbie)).toBe("/onboarding");
    expect(postOAuthRedirect("/onboarding?role=trade", newbie)).toBe("/onboarding?role=trade");
    expect(postOAuthRedirect("/rfps/abc", newbie)).toBe("/onboarding?next=%2Frfps%2Fabc");
  });

  it("sends members to next or their home, never back through onboarding", () => {
    expect(postOAuthRedirect(null, member)).toBe("/pm-dashboard");
    expect(postOAuthRedirect("/rfps/abc", member)).toBe("/rfps/abc");
    expect(postOAuthRedirect("/onboarding?role=trade", member)).toBe("/pm-dashboard");
    expect(postOAuthRedirect("/onboarding?role=trade&next=%2Fpricing", member)).toBe("/pricing");
    expect(postOAuthRedirect("/onboarding?next=%2F%2Fevil.com", member)).toBe("/pm-dashboard");
    expect(postOAuthRedirect("/onboarding?next=%2Fonboarding", member)).toBe("/pm-dashboard");
    expect(postOAuthRedirect("/onboardingish", member)).toBe("/onboardingish");
  });

  it("ignores unsafe next values", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", " /x"]) {
      expect(postOAuthRedirect(bad, member)).toBe("/pm-dashboard");
      expect(postOAuthRedirect(bad, newbie)).toBe("/onboarding");
      expect(postOAuthRedirect(bad, null)).toBe("/onboarding");
    }
  });

  it("falls back to next, then onboarding, when the profile can't be read", () => {
    expect(postOAuthRedirect("/rfps/abc", null)).toBe("/onboarding?next=%2Frfps%2Fabc");
    expect(postOAuthRedirect(null, null)).toBe("/onboarding");
  });
});

describe("isGoogleAuthEnabled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function withSupabase() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  }
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("is true only when Supabase says Google is on", async () => {
    withSupabase();
    const fetchMock = reply({ external: { google: true, email: true } });
    vi.stubGlobal("fetch", fetchMock);
    expect(await isGoogleAuthEnabled()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/settings",
      expect.objectContaining({ headers: { apikey: "anon" }, next: { revalidate: 300 } }),
    );
  });

  it("is false when off, on errors, or without Supabase", async () => {
    withSupabase();
    vi.stubGlobal("fetch", reply({ external: { google: false } }));
    expect(await isGoogleAuthEnabled()).toBe(false);
    vi.stubGlobal("fetch", reply({ external: { google: "true" } }));
    expect(await isGoogleAuthEnabled()).toBe(false);
    vi.stubGlobal("fetch", reply({ external: { google: true } }, 500));
    expect(await isGoogleAuthEnabled()).toBe(false);
    vi.stubGlobal("fetch", reply(null));
    expect(await isGoogleAuthEnabled()).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await isGoogleAuthEnabled()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const untouched = reply({ external: { google: true } });
    vi.stubGlobal("fetch", untouched);
    expect(await isGoogleAuthEnabled()).toBe(false);
    expect(untouched).not.toHaveBeenCalled();
  });
});
