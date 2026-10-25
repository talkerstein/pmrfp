import { describe, expect, it } from "vitest";
import {
  HOLD_SCORE,
  REJECT_SCORE,
  gibberishName,
  isBlockedHost,
  keywordStuffedName,
  scoreOrgRisk,
  statusFromRisk,
  type OrgRiskInput,
} from "@/lib/spam/org-risk";
import { normalizeBlockedDomain } from "@/lib/spam/blocked";

const BLOCKED = ["bearseoservice.com", "marlinleads.com"];

/** Real approved companies on prod (2026-10-24), as the sign-up form would send them. Each has a business email on its own site and a phone, except where noted. */
const GOOD: { label: string; input: OrgRiskInput }[] = [
  { label: "Pesticon", input: { name: "Pesticon Pest Control", website: "https://www.pesticon.com", email: "info@pesticon.com", accountEmail: "owner@pesticon.com", phone: "416 555 0101", shortDescription: "Pest control for commercial properties.", city: "Toronto", province: "Ontario", country: "Canada", signupCountry: "CA" } },
  { label: "Mallet Tile", input: { name: "Mallet Tile Installation", website: "https://mallettile.ca/", email: "hello@mallettile.ca", accountEmail: "hello@mallettile.ca", phone: "905 555 0102", shortDescription: "Commercial tile installation across the GTA, floors, walls and lobbies.", city: "Burlington", province: "Ontario", country: "Canada", signupCountry: "CA" } },
  { label: "Kalpin Painting", input: { name: "Kalpin Painting Inc.", website: "https://www.kpainting.ca", email: "office@kpainting.ca", accountEmail: "office@kpainting.ca", phone: "519 555 0103", shortDescription: "Commercial and condo painting in Guelph and Waterloo Region.", city: "Guelph", province: "Ontario", country: "Canada", signupCountry: "CA" } },
  { label: "Integrity Masonry", input: { name: "Integrity Masonry Inc", website: "https://www.integritymasonry.ca", email: "info@integritymasonry.ca", accountEmail: "info@integritymasonry.ca", phone: "613 555 0104", shortDescription: "Brick, block and stone restoration for Ottawa property managers.", city: "Ottawa", province: "Ontario", country: "Canada", signupCountry: "CA" } },
  { label: "Damaco-Pro (org email on its site, login on hotmail)", input: { name: "Damaco-Pro inc", website: "https://damacopro.ca", email: "info@damacopro.ca", accountEmail: "someone@hotmail.com", phone: "514 555 0105", shortDescription: "Entretien et rénovation commerciale.", city: "Dorval", province: "Quebec", country: "Canada", signupCountry: "CA" } },
  { label: "Claritas", input: { name: "Entretien et Services Claritas", website: "https://entretienclaritas.ca/", email: "info@entretienclaritas.ca", accountEmail: "info@entretienclaritas.ca", phone: "514 555 0106", shortDescription: "Entretien ménager commercial à Montréal.", city: "Montréal", province: "Quebec", country: "Canada", signupCountry: "CA" } },
  { label: "Centrale de Nettoyage (gmail, phone, short description)", input: { name: "Centrale De Nettoyage", website: "https://www.centraledenettoyage.ca/", email: "centrale@gmail.com", accountEmail: "centrale@gmail.com", phone: "514 555 0107", shortDescription: "Nettoyage commercial et résidentiel à Montréal.", city: "Montreal", province: "Quebec", country: "Canada", signupCountry: "CA" } },
  { label: "SOLARTODO (long, keyword-heavy name)", input: { name: "SOLARTODO LIMITED – Sentinel Solar Security Poles for Commercial Projects (Ontario)", website: "https://sentinel.solartodo.com", email: "sales@solartodo.com", accountEmail: "sales@solartodo.com", phone: "416 555 0108", shortDescription: "Solar-powered security poles for commercial sites.", city: "Scarborough", province: "Ontario", country: "Canada", signupCountry: "CA" } },
];

describe("spam risk: real members still go live", () => {
  for (const g of GOOD) {
    it(`${g.label}: score below the hold line, never rejected`, () => {
      const r = scoreOrgRisk({ ...g.input, blockedDomains: BLOCKED });
      expect(r.reject, JSON.stringify(r.reasons)).toBe(false);
      expect(r.hold, JSON.stringify(r.reasons)).toBe(false);
      expect(r.score).toBeLessThan(HOLD_SCORE);
      expect(statusFromRisk(r, "approved")).toBe("approved");
    });
  }

  it("a plain contractor with a free email, a phone and a description is not held", () => {
    const r = scoreOrgRisk({ name: "DGP Painting Inc.", email: "dgp@gmail.com", accountEmail: "dgp@gmail.com", phone: "416 555 0199", shortDescription: "Painting.", province: "Ontario", country: "Canada", signupCountry: "CA", blockedDomains: BLOCKED });
    expect(r.score).toBe(0);
  });

  it("a company with no trade-sounding name but a thin free-mail profile scores 1, still approved", () => {
    const r = scoreOrgRisk({ name: "Gomezcore llc", email: "g@gmail.com", accountEmail: "g@gmail.com", blockedDomains: BLOCKED });
    expect(r.score).toBe(1);
    expect(r.hold).toBe(false);
  });
});

describe("spam risk: the SEO agency's satellites are held or rejected", () => {
  const seo: OrgRiskInput[] = [
    { name: "Fence Builder Boston", website: "https://fencebuilderboston.com/", email: "ops@bearseoservice.com", accountEmail: "ops@bearseoservice.com", phone: "617 555 0111", shortDescription: "Fence builder in Boston, MA with years of experience.", city: "Watertown", province: "Massachusetts", country: "United States", signupCountry: "US", othersOnEmailDomain: 2 },
    { name: "Louisville House Cleaning Pros", website: "https://louisvillehousecleaningpros.com/", email: "ops@bearseoservice.com", accountEmail: "ops@bearseoservice.com", phone: "502 555 0112", shortDescription: "House cleaning in Louisville, KY.", city: "Louisville", province: "Kentucky", country: "United States", signupCountry: "US", othersOnEmailDomain: 2 },
    { name: "Epoxy Installation Guys", website: "https://epoxyinstallguys.com/", email: "ops@bearseoservice.com", accountEmail: "ops@bearseoservice.com", phone: "508 555 0113", shortDescription: "Epoxy floor installation in Massachusetts.", city: "Westborough", province: "Massachusetts", country: "United States", signupCountry: "US", othersOnEmailDomain: 2 },
  ];

  for (const input of seo) {
    it(`${input.name}: blocked domain => rejected, with reasons`, () => {
      const r = scoreOrgRisk({ ...input, blockedDomains: BLOCKED });
      expect(r.blocked).toBe(true);
      expect(r.reject).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(REJECT_SCORE);
      expect(r.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(["blocked_domain", "multiple_orgs", "stuffed_name"]));
      expect(statusFromRisk(r, "approved")).toBe("rejected");
    });

    it(`${input.name}: even without the blocklist, held for review (3 orgs from one owner + satellite name)`, () => {
      const r = scoreOrgRisk({ ...input, blockedDomains: [] });
      expect(r.blocked).toBe(false);
      expect(r.hold).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(HOLD_SCORE);
      expect(statusFromRisk(r, "approved")).toBe("pending_review");
    });
  }

  it("Marlin Leads: blocked domain alone rejects, whatever the score", () => {
    const r = scoreOrgRisk({ name: "Marlin Leads", website: "https://marlinleads.com", email: "hi@marlinleads.com", accountEmail: "hi@marlinleads.com", phone: "512 555 0114", city: "Austin", province: "Texas", country: "United States", signupCountry: "US", blockedDomains: BLOCKED });
    expect(r.score).toBeLessThan(HOLD_SCORE + 1);
    expect(r.blocked).toBe(true);
    expect(r.reject).toBe(true);
    expect(statusFromRisk(r, "approved")).toBe("rejected");
  });

  it("Jgvvjbd: gibberish name + free email, no phone, no description => held, not rejected", () => {
    const r = scoreOrgRisk({ name: "Jgvvjbd", email: "x@icloud.com", accountEmail: "x@icloud.com", province: "Ontario", country: "Canada", signupCountry: "CA", blockedDomains: BLOCKED });
    expect(r.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(["gibberish_name", "thin_free_email"]));
    expect(r.hold).toBe(true);
    expect(r.reject).toBe(false);
    expect(statusFromRisk(r, "approved")).toBe("pending_review");
  });
});

describe("spam risk: individual rules", () => {
  it("blocked domain matches the email, the website and subdomains, not look-alikes", () => {
    expect(isBlockedHost("bearseoservice.com", BLOCKED)).toBe(true);
    expect(isBlockedHost("www.bearseoservice.com", BLOCKED)).toBe(true);
    expect(isBlockedHost("mail.bearseoservice.com", BLOCKED)).toBe(true);
    expect(isBlockedHost("notbearseoservice.com", BLOCKED)).toBe(false);
    expect(isBlockedHost("bearseoservice.com.evil.io", BLOCKED)).toBe(false);
    expect(isBlockedHost("", BLOCKED)).toBe(false);
    const viaSite = scoreOrgRisk({ name: "Acme Roofing", website: "https://www.marlinleads.com/acme", email: "a@gmail.com", blockedDomains: BLOCKED });
    expect(viaSite.blocked).toBe(true);
  });

  it("two organizations from one company email domain or one website owner: +3", () => {
    const a = scoreOrgRisk({ name: "Acme Roofing", email: "a@acme-group.ca", othersOnEmailDomain: 1, blockedDomains: [] });
    expect(a.reasons.find((r) => r.code === "multiple_orgs")?.points).toBe(3);
    const b = scoreOrgRisk({ name: "Acme Roofing", website: "https://acme-group.ca", email: "a@gmail.com", othersOnWebsiteDomain: 1, blockedDomains: [] });
    expect(b.reasons.find((r) => r.code === "multiple_orgs")?.points).toBe(3);
    // Free mail is not an owner.
    const c = scoreOrgRisk({ name: "Acme Roofing", email: "a@gmail.com", othersOnEmailDomain: 5, blockedDomains: [] });
    expect(c.reasons.find((r) => r.code === "multiple_orgs")).toBeUndefined();
  });

  it("keyword-stuffed satellite names", () => {
    for (const n of ["Louisville House Cleaning Pros", "Fence Builder Boston", "Best Roofing Near Me", "Austin Epoxy Floor Experts", "Texas Plumbing Guys", "Miami Junk Removal Pros"]) {
      expect(keywordStuffedName(n, null), n).toBe(true);
    }
    for (const n of ["Pesticon Pest Control", "Mallet Tile Installation", "Kalpin Painting Inc.", "Integrity Masonry Inc", "Damaco-Pro inc", "Orbit Landscaping", "Smart Choice Windows & Doors", "Crystal Ball Windows & Doors", "Dodds Garage Door Systems", "BSD Renovations", "Topography Landscape Construction & Property Management Inc."]) {
      expect(keywordStuffedName(n, "Toronto"), n).toBe(false);
    }
  });

  it("gibberish names", () => {
    expect(gibberishName("Jgvvjbd")).toBe(true);
    expect(gibberishName("Xkcdqwrt Ltd")).toBe(true);
    for (const n of ["Pesticon", "SOLARTODO LIMITED", "Kalpin Painting", "Centrale De Nettoyage", "Entretien et Services Claritas", "Archimat", "Neshmar Inc."]) {
      expect(gibberishName(n), n).toBe(false);
    }
  });

  it("country mismatch: +2 unless the email is on the company's own website", () => {
    const mismatch = scoreOrgRisk({ name: "Acme", email: "a@gmail.com", country: "United States", signupCountry: "CA", blockedDomains: [] });
    expect(mismatch.reasons.find((r) => r.code === "country_mismatch")?.points).toBe(2);
    const ownSite = scoreOrgRisk({ name: "Acme", website: "https://acme.com", email: "a@acme.com", country: "United States", signupCountry: "CA", blockedDomains: [] });
    expect(ownSite.reasons.find((r) => r.code === "country_mismatch")).toBeUndefined();
    const same = scoreOrgRisk({ name: "Acme", email: "a@gmail.com", country: "Canada", signupCountry: "CA", blockedDomains: [] });
    expect(same.reasons.find((r) => r.code === "country_mismatch")).toBeUndefined();
    const unknown = scoreOrgRisk({ name: "Acme", email: "a@gmail.com", country: "Canada", signupCountry: null, blockedDomains: [] });
    expect(unknown.reasons.find((r) => r.code === "country_mismatch")).toBeUndefined();
  });

  it("free email + no phone + no description: +1; a phone or a description removes it", () => {
    expect(scoreOrgRisk({ name: "Acme", email: "a@gmail.com", blockedDomains: [] }).score).toBe(1);
    expect(scoreOrgRisk({ name: "Acme", email: "a@gmail.com", phone: "416-555-0100", blockedDomains: [] }).score).toBe(0);
    expect(scoreOrgRisk({ name: "Acme", email: "a@gmail.com", shortDescription: "We do commercial painting in Toronto.", blockedDomains: [] }).score).toBe(0);
  });

  it("-2 when the email is on the company's own site and it has a phone; the score never goes below 0", () => {
    const r = scoreOrgRisk({ name: "Acme Roofing", website: "https://acme.ca", email: "a@acme.ca", phone: "416-555-0100", blockedDomains: [] });
    expect(r.reasons.map((x) => x.code)).toEqual(["own_domain_phone"]);
    expect(r.score).toBe(0);
  });

  it("a score of 3 holds, 6 rejects", () => {
    expect(statusFromRisk({ hold: true, reject: false }, "approved")).toBe("pending_review");
    expect(statusFromRisk({ hold: true, reject: true }, "approved")).toBe("rejected");
    expect(statusFromRisk({ hold: false, reject: false }, "pending_review")).toBe("pending_review");
    expect(statusFromRisk({ hold: false, reject: false }, "approved")).toBe("approved");
  });
});

describe("blocked domains: what an admin types", () => {
  it("normalizes to one registrable domain", () => {
    expect(normalizeBlockedDomain("BearSEOService.com")).toBe("bearseoservice.com");
    expect(normalizeBlockedDomain("https://www.bad-seo.com/pricing?x=1")).toBe("bad-seo.com");
    expect(normalizeBlockedDomain("ops@bad-seo.com")).toBe("bad-seo.com");
    expect(normalizeBlockedDomain("blog.bad-seo.com")).toBe("bad-seo.com");
    expect(normalizeBlockedDomain("bad-seo.co.uk")).toBe("bad-seo.co.uk");
    expect(normalizeBlockedDomain("spam.wixsite.com")).toBe("spam.wixsite.com");
  });

  it("rejects things that aren't domains", () => {
    for (const bad of ["", "   ", "localhost", "not a domain", "http://", "-.com", "@", "a b.com"]) {
      expect(normalizeBlockedDomain(bad), bad).toBeNull();
    }
  });
});
