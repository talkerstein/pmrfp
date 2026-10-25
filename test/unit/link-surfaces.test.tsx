import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Rendered surfaces: the directory profile and the contract-winner claimed
 * page print a member's website with the rel the link policy gives it, and
 * the JSON-LD only carries the website when the link is earned.
 */
const h = vi.hoisted(() => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  return {
    daysAgo,
    vendor: null as null | Record<string, unknown>,
    winnerClaim: null as null | Record<string, unknown>,
    winnerOrg: null as null | Record<string, unknown>,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, permanentRedirect: () => { throw new Error("redirect"); }, redirect: () => { throw new Error("redirect"); } }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/v3-pages/directory.css", () => ({}));
vi.mock("@/lib/build/prebuild", () => ({ prebuildSlice: () => [] }));
vi.mock("@/components/public/request-intro-form", () => ({ RequestIntroForm: () => null }));
vi.mock("@/components/trusted/save-trade-button", () => ({ SaveTradeButton: () => null }));
vi.mock("@/components/home-v3/project-deck", () => ({ ProjectDeck: () => null }));
vi.mock("@/components/projects/add-project-tile", () => ({ AddProjectTile: () => null }));
vi.mock("@/components/home-v3/directory-list", () => ({ monogram: (n: string) => n.slice(0, 1) }));
vi.mock("@/components/karma/level-badge", () => ({ LevelBadge: () => null }));
vi.mock("@/components/projects/public", () => ({ oneDecimal: (n: number) => String(n) }));
vi.mock("@/lib/trusted/data", () => ({ getRecommendedBy: async () => [] }));
vi.mock("@/lib/data/taxonomy", () => ({ getCategories: async () => [], getRegions: async () => [], getPropertyTypes: async () => [] }));
vi.mock("@/lib/founding/server", () => ({ isOrgLifetime: async () => false }));
vi.mock("@/lib/data/projects", () => ({ listOrgProjects: async () => [], listPublishedReviews: async () => [] }));
vi.mock("@/lib/data/directory", () => ({
  getVendor: async () => h.vendor,
  listVendors: async () => [],
  retiredVendorRedirect: async () => null,
}));

import VendorProfilePage, { generateMetadata } from "@/app/[lang]/(v3)/directory/[slug]/page";
import { WebsiteAnchor } from "@/components/links/website-anchor";
import { websiteLink } from "@/lib/links/policy";

const vendor = (over: Record<string, unknown> = {}, link: Record<string, unknown> = {}) => ({
  id: "org-1",
  slug: "acme-paving",
  name: "Acme Paving",
  city: "Toronto",
  province: "Ontario",
  shortDescription: "Commercial paving and line painting across the GTA for property managers who need it done right.",
  fullDescription: null,
  logoUrl: "https://x.supabase.co/storage/v1/object/public/logos/a.png",
  verified: false,
  featured: false,
  platinum: false,
  level: null,
  categories: ["Paving"],
  regions: ["Toronto"],
  propertyTypes: [],
  yearsInBusiness: 10,
  employeeCountRange: null,
  insuranceStatus: null,
  wsibStatus: null,
  emergencyService: false,
  contactVisibility: "show_contact",
  website: "https://acmepaving.ca",
  email: "info@acmepaving.ca",
  phone: "416-555-0100",
  portfolioPhotos: [],
  googleRating: null,
  googleReviewCount: null,
  emailDomainVerified: true,
  link: { slug: "acme-paving", website: "https://acmepaving.ca", profileStatus: "approved", status: "active", approvedAt: h.daysAgo(40), linkTrusted: false, paid: false, badgeInstalled: false, riskFlagged: false, ...link },
  ...over,
});

const page = async () => renderToStaticMarkup(await VendorProfilePage({ params: Promise.resolve({ lang: "en", slug: "acme-paving" }) }));
const websiteAnchor = (html: string) => html.match(/<a [^>]*data-link="website"[^>]*>/)?.[0] ?? "";
const jsonLd = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => m[1]).join("\n");

beforeEach(() => {
  h.vendor = vendor();
});

describe("directory profile: the website link", () => {
  it("an ordinary profile: nofollow ugc through /out/<slug>", async () => {
    const a = websiteAnchor(await page());
    expect(a).toContain('href="/out/acme-paving"');
    expect(a).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(a).toContain('data-earned="0"');
  });

  it("a paying member 14+ days in: a direct, normal link", async () => {
    h.vendor = vendor({}, { paid: true });
    const a = websiteAnchor(await page());
    expect(a).toContain('href="https://acmepaving.ca/"');
    expect(a).toContain('rel="noopener noreferrer"');
    expect(a).not.toContain("nofollow");
  });

  it("badge installed but the profile is 5 days old: still nofollow", async () => {
    h.vendor = vendor({}, { badgeInstalled: true, approvedAt: h.daysAgo(5) });
    expect(websiteAnchor(await page())).toContain("nofollow ugc");
  });

  it("badge installed and 20 days old: followed", async () => {
    h.vendor = vendor({}, { badgeInstalled: true, approvedAt: h.daysAgo(20) });
    expect(websiteAnchor(await page())).not.toContain("nofollow");
  });

  it("paid but flagged by the spam check: nofollow", async () => {
    h.vendor = vendor({}, { paid: true, riskFlagged: true });
    expect(websiteAnchor(await page())).toContain("nofollow ugc");
  });

  it("trusted house company: followed from day one", async () => {
    h.vendor = vendor({}, { linkTrusted: true, approvedAt: h.daysAgo(0) });
    expect(websiteAnchor(await page())).toContain('rel="noopener noreferrer"');
  });

  it("contact hidden: no website link at all", async () => {
    h.vendor = vendor({ website: null, email: null, phone: null, contactVisibility: "request_intro" });
    expect(await page()).not.toContain('data-link="website"');
  });

  it("JSON-LD carries the member's website as sameAs only when earned", async () => {
    expect(jsonLd(await page())).not.toContain("acmepaving.ca");
    h.vendor = vendor({}, { paid: true });
    expect(jsonLd(await page())).toContain('"sameAs":["https://acmepaving.ca/"]');
  });
});

describe("directory profile: indexing", () => {
  const robots = async () => (await generateMetadata({ params: Promise.resolve({ lang: "en", slug: "acme-paving" }) })).robots;

  it("a profile with content is indexable (no robots override)", async () => {
    expect(await robots()).toBeUndefined();
  });

  it("a thin profile (no description, logo, project or verified email domain) is noindex,follow", async () => {
    h.vendor = vendor({ shortDescription: "Paving.", logoUrl: null, emailDomainVerified: false });
    expect(await robots()).toEqual({ index: false, follow: true });
  });

  it("a flagged profile is noindex,follow even with content", async () => {
    h.vendor = vendor({}, { riskFlagged: true });
    expect(await robots()).toEqual({ index: false, follow: true });
  });
});

describe("the anchor component", () => {
  it("prints exactly the policy's href and rel", () => {
    const org = { slug: "acme-paving", website: "https://acmepaving.ca", profileStatus: "approved", approvedAt: h.daysAgo(30), paid: false };
    const out = renderToStaticMarkup(<WebsiteAnchor link={websiteLink(org)!} />);
    expect(out).toContain('href="/out/acme-paving"');
    expect(out).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(out).toContain(">acmepaving.ca<");
    const earned = renderToStaticMarkup(<WebsiteAnchor link={websiteLink({ ...org, paid: true })!} />);
    expect(earned).toContain('href="https://acmepaving.ca/"');
    expect(earned).toContain('rel="noopener noreferrer"');
  });
});
