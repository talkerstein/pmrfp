import { describe, expect, it } from "vitest";
import {
  LINK_MIN_AGE_DAYS,
  REL_EARNED,
  REL_UNEARNED,
  linkEarned,
  linkStatus,
  normalizeWebsiteUrl,
  outPath,
  structuredDataUrl,
  websiteLink,
  websiteRel,
  withUtm,
  type LinkOrg,
} from "@/lib/links/policy";

const NOW = new Date("2026-10-24T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const base: LinkOrg = {
  slug: "acme-paving",
  website: "https://acmepaving.ca",
  profileStatus: "approved",
  status: "active",
  approvedAt: daysAgo(30),
  linkTrusted: false,
  paid: false,
  badgeInstalled: false,
  riskFlagged: false,
};

describe("earn the link: the policy", () => {
  it("the rel strings are exactly what the brief says", () => {
    expect(REL_UNEARNED).toBe("noopener noreferrer nofollow ugc");
    expect(REL_EARNED).toBe("noopener noreferrer");
  });

  it("a free, brand-new, badge-less listing is nofollow", () => {
    expect(websiteRel({ ...base, approvedAt: daysAgo(0) }, NOW)).toBe(REL_UNEARNED);
    expect(websiteRel({}, NOW)).toBe(REL_UNEARNED);
  });

  it("an old free listing with no badge and no plan is still nofollow", () => {
    expect(linkEarned(base, NOW)).toBe(false);
    expect(linkStatus(base, NOW).missing).toEqual(["signal"]);
  });

  it("paid + 14 days is followed; 13 days is not", () => {
    expect(linkEarned({ ...base, paid: true, approvedAt: daysAgo(LINK_MIN_AGE_DAYS) }, NOW)).toBe(true);
    const day13 = { ...base, paid: true, approvedAt: daysAgo(LINK_MIN_AGE_DAYS - 1) };
    expect(linkEarned(day13, NOW)).toBe(false);
    expect(linkStatus(day13, NOW)).toMatchObject({ earned: false, missing: ["age"], daysToGo: 1 });
  });

  it("badge installed + 14 days is followed", () => {
    const s = linkStatus({ ...base, badgeInstalled: true }, NOW);
    expect(s).toMatchObject({ earned: true, reason: "badge" });
    expect(websiteRel({ ...base, badgeInstalled: true }, NOW)).toBe(REL_EARNED);
  });

  it("paid wins over badge as the stated reason", () => {
    expect(linkStatus({ ...base, paid: true, badgeInstalled: true }, NOW).reason).toBe("paid");
  });

  it("a past-due or trial subscription is not 'paid' (the sync only sets paid for active / comped / lifetime)", () => {
    // `paid` is the sync's answer: false for past_due, canceled and trials, so the policy stays nofollow.
    expect(linkEarned({ ...base, paid: false }, NOW)).toBe(false);
  });

  it("a badge or plan on a young profile waits out the 14 days", () => {
    expect(linkEarned({ ...base, badgeInstalled: true, approvedAt: daysAgo(3) }, NOW)).toBe(false);
    expect(linkEarned({ ...base, paid: true, approvedAt: null }, NOW)).toBe(false);
  });

  it("not approved, suspended or rejected is never followed, even paid or trusted", () => {
    for (const profileStatus of ["pending_review", "draft", "suspended", "rejected"]) {
      expect(linkEarned({ ...base, profileStatus, paid: true, linkTrusted: true }, NOW), profileStatus).toBe(false);
    }
    expect(linkEarned({ ...base, status: "suspended", paid: true, linkTrusted: true }, NOW)).toBe(false);
    expect(linkEarned({ ...base, status: "deleted", paid: true }, NOW)).toBe(false);
  });

  it("flagged by the spam check: not followed until an admin clears it", () => {
    const flagged = { ...base, paid: true, riskFlagged: true };
    expect(linkEarned(flagged, NOW)).toBe(false);
    expect(linkStatus(flagged, NOW).missing).toContain("review");
    expect(linkEarned({ ...flagged, riskFlagged: false }, NOW)).toBe(true);
  });

  it("trusted skips the age and the 'gave back' tests (house companies)", () => {
    const house = { ...base, linkTrusted: true, approvedAt: daysAgo(0) };
    expect(linkStatus(house, NOW)).toMatchObject({ earned: true, reason: "trusted" });
    expect(websiteRel(house, NOW)).toBe(REL_EARNED);
  });
});

describe("the link a page prints", () => {
  it("earned: the site itself, normal rel", () => {
    const l = websiteLink({ ...base, paid: true }, NOW)!;
    expect(l).toMatchObject({ href: "https://acmepaving.ca/", rel: REL_EARNED, earned: true, label: "acmepaving.ca" });
  });

  it("not earned: the counting redirect with nofollow ugc", () => {
    const l = websiteLink(base, NOW)!;
    expect(l).toMatchObject({ href: "/out/acme-paving", rel: REL_UNEARNED, earned: false, label: "acmepaving.ca" });
    expect(outPath("a b")).toBe("/out/a%20b");
  });

  it("no usable website: no link", () => {
    expect(websiteLink({ ...base, website: null }, NOW)).toBeNull();
    expect(websiteLink({ ...base, website: "javascript:alert(1)" }, NOW)).toBeNull();
    expect(websiteLink({ ...base, website: "not a url" }, NOW)).toBeNull();
  });

  it("normalizes what members type", () => {
    expect(normalizeWebsiteUrl("acme.ca")).toBe("https://acme.ca/");
    expect(normalizeWebsiteUrl("HTTP://Acme.ca/about")).toBe("http://acme.ca/about");
    expect(normalizeWebsiteUrl("ftp://acme.ca")).toBeNull();
    expect(normalizeWebsiteUrl("mailto:a@b.ca")).toBeNull();
    expect(normalizeWebsiteUrl("localhost")).toBeNull();
  });

  it("structured data gets the member's site only when the link is earned", () => {
    expect(structuredDataUrl(base, NOW)).toBeUndefined();
    expect(structuredDataUrl({ ...base, paid: true }, NOW)).toBe("https://acmepaving.ca/");
    expect(structuredDataUrl({ ...base, paid: true, riskFlagged: true }, NOW)).toBeUndefined();
  });

  it("the click-out adds utm_source and keeps everything else", () => {
    expect(withUtm("https://acme.ca/a?x=1")).toBe("https://acme.ca/a?x=1&utm_source=pmrfp.com&utm_medium=referral");
    expect(withUtm("https://acme.ca/?utm_source=x")).toBe("https://acme.ca/?utm_source=x");
  });
});
