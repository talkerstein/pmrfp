import { describe, expect, it } from "vitest";
import { INSTALL_MIN_DAYS, detectBadgeInstall, groupBySlug, isOwnOrTestDomain, registrableDomain, websiteDomain, type BadgeHitRow } from "@/lib/badge/install";
import { referrerDomain } from "@/lib/badge/referrer";

const hit = (day: string, referrer: string, over: Partial<BadgeHitRow> = {}): BadgeHitRow => ({ day, kind: "listed", slug: "acme-paving", referrer, ...over });

describe("registrable domain", () => {
  it.each([
    ["acme.ca", "acme.ca"],
    ["www.acme.ca", "acme.ca"],
    ["shop.blog.acme.ca", "acme.ca"],
    ["ACME.CA.", "acme.ca"],
    ["acme.com", "acme.com"],
    ["acme.co.uk", "acme.co.uk"],
    ["www.acme.co.uk", "acme.co.uk"],
    ["acme.on.ca", "acme.on.ca"],
    ["school.k12.ny.us", "school.k12.ny.us"],
    // a site-builder subdomain IS the site: one customer must not match another
    ["acme.wixsite.com", "acme.wixsite.com"],
    ["www.acme.wixsite.com", "acme.wixsite.com"],
    ["crystalcare.wordpress.com", "crystalcare.wordpress.com"],
    ["acme.myshopify.com", "acme.myshopify.com"],
    ["203.0.113.7", "203.0.113.7"],
  ])("%s → %s", (host, want) => {
    expect(registrableDomain(host)).toBe(want);
  });

  it.each(["", "localhost", "co.uk", "wixsite.com", "not a host", "a..b", "-bad.com", null, undefined])("%s → null", (host) => {
    expect(registrableDomain(host as string | null | undefined)).toBeNull();
  });
});

describe("a company's own website domain", () => {
  it.each([
    ["https://www.acmepaving.ca/", "acmepaving.ca"],
    ["http://acmepaving.ca/about?x=1", "acmepaving.ca"],
    ["acmepaving.ca", "acmepaving.ca"],
    ["WWW.AcmePaving.CA/contact", "acmepaving.ca"],
    ["https://valetprestige.com/fr/", "valetprestige.com"],
    ["https://crystalcarecleaners.wordpress.com/", "crystalcarecleaners.wordpress.com"],
  ])("%s → %s", (site, want) => {
    expect(websiteDomain(site)).toBe(want);
  });

  it.each([null, undefined, "", "   ", "not a website", "mailto:a@b.ca"])("%s → no website", (site) => {
    expect(websiteDomain(site as string | null | undefined)).toBeNull();
  });
});

describe("badge install detection", () => {
  it("needs the badge to load from the company's own site on at least 2 different days", () => {
    expect(INSTALL_MIN_DAYS).toBe(2);
    const one = detectBadgeInstall("https://acmepaving.ca", [hit("2026-10-20", "acmepaving.ca")]);
    expect(one).toMatchObject({ detected: false, days: 1, detectedOn: null, domain: "acmepaving.ca" });
    const two = detectBadgeInstall("https://acmepaving.ca", [hit("2026-10-20", "acmepaving.ca"), hit("2026-10-22", "acmepaving.ca")]);
    expect(two).toMatchObject({ detected: true, days: 2, firstDay: "2026-10-20", detectedOn: "2026-10-22", lastDay: "2026-10-22" });
  });

  it("counts different days, not different rows: the same day twice is one day", () => {
    const rows = [hit("2026-10-20", "acmepaving.ca"), hit("2026-10-20", "acmepaving.ca", { kind: "karma" })];
    expect(detectBadgeInstall("acmepaving.ca", rows)).toMatchObject({ detected: false, days: 1 });
  });

  it("matches www, subdomains and either spelling of the website", () => {
    const rows = [hit("2026-10-20", "acmepaving.ca"), hit("2026-10-21", "blog.acmepaving.ca")];
    expect(detectBadgeInstall("https://www.acmepaving.ca/", rows).detected).toBe(true);
    expect(detectBadgeInstall("acmepaving.ca", rows).detected).toBe(true);
  });

  it("ignores unknown referrers: no referrer, junk, and other people's sites", () => {
    const rows = [
      hit("2026-10-20", ""),
      hit("2026-10-21", ""),
      hit("2026-10-22", "not a host!"),
      hit("2026-10-20", "competitor.com"),
      hit("2026-10-21", "competitor.com"),
      hit("2026-10-22", "somedirectory.ca"),
    ];
    const r = detectBadgeInstall("https://acmepaving.ca", rows);
    expect(r).toMatchObject({ detected: false, days: 0, firstDay: null });
    // ...but the admin can still see where it IS showing.
    expect(r.otherSites).toEqual(["competitor.com", "somedirectory.ca"]);
  });

  it("does not match a lookalike domain or a different site on the same builder", () => {
    const rows = [hit("2026-10-20", "acmepaving.ca.evil.com"), hit("2026-10-21", "acmepaving.ca.evil.com"), hit("2026-10-22", "notacmepaving.ca"), hit("2026-10-23", "notacmepaving.ca")];
    expect(detectBadgeInstall("acmepaving.ca", rows).detected).toBe(false);
    const wix = [hit("2026-10-20", "other.wixsite.com"), hit("2026-10-21", "other.wixsite.com")];
    expect(detectBadgeInstall("https://acme.wixsite.com", wix).detected).toBe(false);
    expect(detectBadgeInstall("https://other.wixsite.com", wix).detected).toBe(true);
  });

  it("a company with no usable website can never be detected", () => {
    const rows = [hit("2026-10-20", "acmepaving.ca"), hit("2026-10-21", "acmepaving.ca")];
    for (const site of [null, undefined, "", "nope"]) expect(detectBadgeInstall(site, rows)).toMatchObject({ detected: false, domain: null, days: 0 });
  });

  it("only the badges that link to the company's own profile count (listed, reputation), and only its own slug", () => {
    const rows = [
      hit("2026-10-20", "acmepaving.ca", { kind: "winner" }),
      hit("2026-10-21", "acmepaving.ca", { kind: "winner" }),
      hit("2026-10-20", "acmepaving.ca", { slug: "someone-else" }),
      hit("2026-10-21", "acmepaving.ca", { slug: "someone-else" }),
    ];
    expect(detectBadgeInstall("acmepaving.ca", rows, "acme-paving").days).toBe(0);
    const mixed = [hit("2026-10-20", "acmepaving.ca"), hit("2026-10-21", "acmepaving.ca", { kind: "karma" })];
    expect(detectBadgeInstall("acmepaving.ca", mixed, "acme-paving").detected).toBe(true);
  });

  it("PMRFP's own pages and preview hosts never reach detection (referrerDomain drops them)", () => {
    for (const ref of ["https://pmrfp.com/badge", "https://www.pmrfp.com/dashboard", "https://pmrfp-git-x.vercel.app/", "http://localhost:3000/badge"]) {
      expect(referrerDomain(ref)).toBeNull();
    }
    expect(referrerDomain("https://www.acmepaving.ca/about")).toBe("acmepaving.ca");
    expect(referrerDomain(null)).toBe("");
  });

  it("flags a website that is one of ours or a test host", () => {
    expect(detectBadgeInstall("https://talkerstein.com", []).ownDomain).toBe(true);
    expect(detectBadgeInstall("https://pmrfp.com", []).ownDomain).toBe(true);
    expect(detectBadgeInstall("https://example.com", []).ownDomain).toBe(true);
    expect(detectBadgeInstall("https://acmepaving.ca", []).ownDomain).toBe(false);
    expect(isOwnOrTestDomain("shop.talkerstein.ca")).toBe(true);
    expect(isOwnOrTestDomain("acmepaving.ca")).toBe(false);
  });

  it("groups rows by slug", () => {
    const g = groupBySlug([hit("2026-10-20", "a.ca"), hit("2026-10-20", "b.ca", { slug: "b" })]);
    expect([...g.keys()].sort()).toEqual(["acme-paving", "b"]);
  });
});
