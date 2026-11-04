import { describe, expect, it } from "vitest";
import { magicLinkRedirect } from "@/lib/auth/magic-link";
import { oauthCallbackPath } from "@/lib/auth/oauth";
import { listingApprovedEmail, welcomeEmail, type WelcomeInput } from "@/lib/email/welcome-copy";
import type { StepId } from "@/lib/lifecycle/config";
import { decide, type MemberState } from "@/lib/lifecycle/schedule";

const base: WelcomeInput = { base: "https://pmrfp.com", lang: "en", kind: "trade", companyName: "Acme Roofing", sameDayAlerts: true };

describe("the language survives the emailed link and Google", () => {
  it("adds nothing for English, so existing links don't change", () => {
    expect(oauthCallbackPath()).toBe("/auth/callback");
    expect(oauthCallbackPath("/dashboard", "en")).toBe("/auth/callback?next=%2Fdashboard");
    expect(magicLinkRedirect("https://pmrfp.com/", "/onboarding", "en")).toBe("https://pmrfp.com/auth/callback?next=%2Fonboarding&m=link");
  });

  it("carries French and Spanish through the callback", () => {
    expect(oauthCallbackPath(null, "fr")).toBe("/auth/callback?l=fr");
    expect(oauthCallbackPath("/dashboard", "es")).toBe("/auth/callback?next=%2Fdashboard&l=es");
    expect(magicLinkRedirect("https://pmrfp.com", "/onboarding", "fr")).toBe("https://pmrfp.com/auth/callback?next=%2Fonboarding&l=fr&m=link");
  });
});

describe("welcome email", () => {
  it("is in the member's language, with links in that language", () => {
    const e = welcomeEmail({ ...base, lang: "fr", name: "Marie Tremblay", live: true, profileSlug: "acme" });
    expect(e.bodyHtml).toContain("répertoire");
    expect(e.bodyHtml).toContain("https://pmrfp.com/fr/");
    expect(e.title).toContain("Marie");
  });

  it("tells a held company it's under review, and doesn't call it live", () => {
    const e = welcomeEmail({ ...base, pending: true });
    expect(e.bodyHtml).toContain("reviewing");
    expect(e.bodyHtml).not.toContain("now listed");
  });

  it("escapes what the member typed", () => {
    expect(welcomeEmail({ ...base, companyName: "<b>Acme</b>" }).bodyHtml).toContain("&lt;b&gt;Acme&lt;/b&gt;");
  });

  it("doesn't pitch Trade Pro to a supplier, who can't buy it", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      expect(welcomeEmail({ ...base, lang, kind: "supplier" }).bodyHtml).not.toContain("Trade Pro");
    }
  });

  it("lists the four free tools for a property manager, in every language", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      const html = welcomeEmail({ ...base, lang, kind: "property_manager" }).bodyHtml;
      for (const path of ["vendor-insurance", "bid-comparisons", "contracts", "roster"]) expect(html).toContain(`/pm-dashboard/${path}`);
    }
  });

  it("only promises same-day emails when they're switched on", () => {
    const on = welcomeEmail({ ...base, kind: "property_manager", sameDayAlerts: true }).bodyHtml;
    const off = welcomeEmail({ ...base, kind: "property_manager", sameDayAlerts: false }).bodyHtml;
    expect(on).toContain("same day");
    expect(off).not.toContain("same day");
  });
});

describe("while a listing is under review", () => {
  // Tuesday 2 pm in Toronto, day 5: the trial offer's day.
  const now = new Date("2026-10-20T18:00:00Z");
  const held: MemberState = {
    userId: "u1",
    joinedAt: new Date(now.getTime() - 5 * 24 * 3_600_000 - 3_600_000).toISOString(),
    province: "Ontario",
    active: true,
    paid: false,
    trial: null,
    optedOut: false,
    suppressed: false,
    pendingReview: true,
    recorded: new Set<StepId>(["welcome", "market", "get_found", "review_pending"]),
    lastSentAt: null,
    digestSentAt: null,
    facts: { hasTrades: true, hasAreas: true, projects: 0, badgeInstalled: false, leadTotal: 12, benchmarkReady: true, canPost: true, forumPosts: 0, foundingSoldOut: false },
  };

  it("holds the upgrade pitch, without skipping it for good", () => {
    expect(decide(held, now)).toEqual({ action: "wait", step: "trial_offer", reason: "not_due" });
  });

  it("sends it once the listing is approved", () => {
    expect(decide({ ...held, pendingReview: false }, now)).toEqual({ action: "send", step: "trial_offer" });
  });
});

describe("listing approved email", () => {
  it("says the listing is live and links the public page, in their language", () => {
    const en = listingApprovedEmail({ base: "https://pmrfp.com", lang: "en", companyName: "Acme", slug: "acme" });
    expect(en.subject).toBe("Your PMRFP listing is live");
    expect(en.bodyHtml).toContain("https://pmrfp.com/directory/acme");
    const fr = listingApprovedEmail({ base: "https://pmrfp.com", lang: "fr", companyName: "Acme", slug: "acme" });
    expect(fr.bodyHtml).toContain("https://pmrfp.com/fr/directory/acme");
    expect(fr.subject).not.toBe(en.subject);
  });
});
