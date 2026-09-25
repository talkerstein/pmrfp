import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { appStartPath, SIGNED_OUT_START, type AppStartProfile } from "@/lib/pwa/start";
import { dismissedRecently, INSTALL_DISMISS_DAYS, isAppArea, isIosSafari } from "@/lib/pwa/install";
import { activeHref, pickTabs, tabLabel } from "@/lib/pwa/tabs";
import { ADMIN_NAV, PM_NAV, TRADE_NAV } from "@/lib/site";
import manifest from "@/app/manifest";

const member = (over: Partial<AppStartProfile> = {}): AppStartProfile => ({
  primaryRole: "trade",
  status: "active",
  onboardingCompleted: true,
  ...over,
});

describe("appStartPath", () => {
  it("sends signed-out visitors to sign-in, returning to /app", () => {
    expect(appStartPath(null)).toBe("/sign-in?next=%2Fapp");
    expect(SIGNED_OUT_START).toBe("/sign-in?next=%2Fapp");
  });

  it("opens each role on its own dashboard", () => {
    expect(appStartPath(member({ primaryRole: "trade" }))).toBe("/dashboard");
    expect(appStartPath(member({ primaryRole: "supplier" }))).toBe("/dashboard");
    expect(appStartPath(member({ primaryRole: "property_manager" }))).toBe("/pm-dashboard");
    expect(appStartPath(member({ primaryRole: "real_estate_agent" }))).toBe("/pm-dashboard");
    expect(appStartPath(member({ primaryRole: "admin" }))).toBe("/admin");
    expect(appStartPath(member({ primaryRole: "super_admin" }))).toBe("/admin");
    expect(appStartPath(member({ primaryRole: "visitor" }))).toBe("/directory");
  });

  it("finishes onboarding before any dashboard", () => {
    expect(appStartPath(member({ onboardingCompleted: false }))).toBe("/onboarding");
    expect(appStartPath(member({ primaryRole: "property_manager", onboardingCompleted: false }))).toBe("/onboarding");
  });

  it("sends suspended accounts to /suspended, even mid-onboarding", () => {
    expect(appStartPath(member({ status: "suspended" }))).toBe("/suspended");
    expect(appStartPath(member({ status: "suspended", onboardingCompleted: false }))).toBe("/suspended");
  });
});

describe("web app manifest", () => {
  const m = manifest();

  it("installs as a standalone app that starts at /app", () => {
    expect(m.id).toBe("/app");
    expect(m.start_url).toBe("/app?source=pwa");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.short_name).toBe("PMRFP");
  });

  it("ships 192 + 512 icons and a maskable 512", () => {
    const icons = m.icons ?? [];
    const has = (sizes: string, purpose: string) =>
      icons.some((i) => i.sizes === sizes && i.purpose === purpose && i.src.startsWith("/icons/"));
    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
  });

  it("keeps shortcuts on same-origin relative paths", () => {
    const urls = (m.shortcuts ?? []).map((s) => s.url);
    expect(urls).toEqual(["/rfps", "/dashboard/rfps", "/pm-dashboard/rfps/new", "/jobs"]);
  });

  it("points every icon at a real PNG of the declared size", async () => {
    const all = [...(m.icons ?? []), ...(m.shortcuts ?? []).flatMap((s) => s.icons ?? [])];
    for (const icon of all) {
      const meta = await sharp(join(process.cwd(), "public", icon.src)).metadata();
      expect(meta.format).toBe("png");
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
    }
  });
});

describe("install card helpers", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 8, 25);

  it("hides the card for 30 days after 'Not now'", () => {
    expect(INSTALL_DISMISS_DAYS).toBe(30);
    expect(dismissedRecently(String(now - DAY), now)).toBe(true);
    expect(dismissedRecently(String(now - 29 * DAY), now)).toBe(true);
    expect(dismissedRecently(String(now - 30 * DAY), now)).toBe(false);
  });

  it("ignores missing, junk and future timestamps", () => {
    for (const stored of [null, "", "abc", "0", "-5", "NaN", String(now + DAY)]) {
      expect(dismissedRecently(stored, now)).toBe(false);
    }
  });

  it("recognises iPhone and iPad Safari, not other iOS browsers or webviews", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const ipadDesktopMode =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    expect(isIosSafari(iphone)).toBe(true);
    expect(isIosSafari(ipadDesktopMode, 5)).toBe(true);
    // Same UA with no touch = a real Mac.
    expect(isIosSafari(ipadDesktopMode, 0)).toBe(false);
    expect(isIosSafari(iphone.replace("Version/18.0", "CriOS/130.0"))).toBe(false);
    expect(isIosSafari(`${iphone} EdgiOS/130.0`)).toBe(false);
    expect(isIosSafari(`${iphone} [FBAN/FBIOS;FBAV/450.0]`)).toBe(false);
    // In-app webview: no Version/ or Safari/ token.
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toBe(false);
  });

  it("treats only the signed-in dashboards as the app area", () => {
    for (const path of ["/dashboard", "/dashboard/rfps", "/pm-dashboard", "/pm-dashboard/rfps/new", "/admin/users"]) {
      expect(isAppArea(path)).toBe(true);
    }
    for (const path of ["/", "/rfps", "/jobs", "/dashboards", "/pm-dashboard-tour", "/for-property-managers"]) {
      expect(isAppArea(path)).toBe(false);
    }
  });
});

describe("mobile tab bar", () => {
  const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

  it("gives trades Home, Feed, Saved and Interests", () => {
    const tabs = pickTabs(TRADE_NAV);
    expect(hrefs(tabs)).toEqual(["/dashboard", "/dashboard/rfps", "/dashboard/saved-rfps", "/dashboard/interests"]);
    expect(tabs.map(tabLabel)).toEqual(["Home", "Feed", "Saved", "Interests"]);
  });

  it("gives PMs Home, My RFPs, Post and Trades", () => {
    const tabs = pickTabs(PM_NAV);
    expect(hrefs(tabs)).toEqual(["/pm-dashboard", "/pm-dashboard/rfps", "/pm-dashboard/rfps/new", "/pm-dashboard/saved-vendors"]);
    expect(tabs.map(tabLabel)).toEqual(["Home", "My RFPs", "Post", "Trades"]);
  });

  it("tops up from nav order when a preferred page is missing", () => {
    const nav = [
      { href: "/dashboard", label: "Home" },
      { href: "/dashboard/company", label: "Company Profile" },
      { href: "/dashboard/rfps", label: "RFP Feed" },
      { href: "/dashboard/billing", label: "Billing" },
    ];
    expect(hrefs(pickTabs(nav))).toEqual(["/dashboard", "/dashboard/rfps", "/dashboard/company", "/dashboard/billing"]);
    expect(tabLabel(nav[1])).toBe("Company Profile");
    expect(hrefs(pickTabs(ADMIN_NAV))).toEqual(["/admin", "/admin/users", "/admin/organizations", "/admin/rfps"]);
    expect(pickTabs([{ href: "/dashboard", label: "Home" }])).toHaveLength(1);
  });

  it("lights up the most specific page, never Home for sub-pages", () => {
    const pm = hrefs([...PM_NAV]);
    expect(activeHref("/pm-dashboard", pm)).toBe("/pm-dashboard");
    expect(activeHref("/pm-dashboard/rfps/new", pm)).toBe("/pm-dashboard/rfps/new");
    expect(activeHref("/pm-dashboard/rfps/abc-123/edit", pm)).toBe("/pm-dashboard/rfps");
    const trade = hrefs([...TRADE_NAV]);
    expect(activeHref("/dashboard/rfps/42", trade)).toBe("/dashboard/rfps");
    expect(activeHref("/dashboard/company", trade)).toBe("/dashboard/company");
    expect(activeHref("/dashboard/rfps-archive", trade)).toBeNull();
    expect(activeHref("/dashboard/unknown", trade)).toBeNull();
  });
});
