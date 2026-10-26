import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/** The contract-winner claimed page prints the claimed company's website with the link policy's rel. */
const h = vi.hoisted(() => ({
  daysAgo: (n: number) => new Date(Date.now() - n * 86_400_000).toISOString(),
  org: null as null | Record<string, unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/components/public/record-footer", () => ({ RecordFooter: () => null }));
vi.mock("@/components/v3/simple", () => ({
  SH2: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  SimplePage: ({ children }: { children?: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/karma/level-badge", () => ({ LevelBadge: () => null }));
vi.mock("@/components/benchmarks/price-benchmark-card", () => ({ PriceBenchmarkCard: () => null }));
vi.mock("@/components/growth/digest-signup-block", () => ({ DigestSignupBlock: () => null }));
vi.mock("@/components/growth/bid-alert-box", () => ({ BidAlertBox: () => null }));
vi.mock("@/lib/data/rfps", () => ({ listRfps: async () => [] }));
vi.mock("@/lib/data/winners", () => ({
  isWinnerIndexable: () => true,
  winnerProfiles: () => [{ slug: "acme-paving", name: "Acme Paving", awards: [], categories: [], totalValue: 0, latest: "2026-01-01" }],
}));
vi.mock("@/lib/gc/data", () => ({ listPackagesForAwardSlugs: async () => [] }));
vi.mock("@/lib/gc/official", () => ({ officialNotices: async () => new Map() }));
vi.mock("@/lib/karma/data", () => ({ packageLevels: async () => new Map() }));
vi.mock("@/lib/data/price-benchmarks-load", () => ({ benchmarkForWinner: async () => null, benchmarkPath: () => "/benchmarks" }));
vi.mock("@/lib/data/taxonomy", () => ({ getRegions: async () => [] }));
vi.mock("@/lib/claims/data", () => ({
  getWinnerClaim: async () => ({
    winnerSlug: "acme-paving",
    name: "Acme Paving Ltd",
    orgSlug: "acme-paving-ab12",
    logoUrl: null,
    description: "We pave.",
    website: "acmepaving.ca",
    phone: null,
    email: null,
    city: "Toronto",
    province: "Ontario",
    verified: false,
    claimedAt: "2026-10-01T00:00:00Z",
  }),
}));
vi.mock("@/lib/links/data", () => ({ getOrgLinkOrg: async () => h.org }));

import WinnerPage from "@/app/[lang]/(v3)/contract-winners/[slug]/page";

const render = async () => renderToStaticMarkup(await WinnerPage({ params: Promise.resolve({ lang: "en", slug: "acme-paving" }) }));
const anchor = (html: string) => html.match(/<a [^>]*data-link="website"[^>]*>/)?.[0] ?? "";
const signals = (over: Record<string, unknown> = {}) => ({ slug: "acme-paving-ab12", website: "acmepaving.ca", profileStatus: "approved", status: "active", approvedAt: h.daysAgo(40), linkTrusted: false, paid: false, badgeInstalled: false, riskFlagged: false, ...over });

beforeEach(() => {
  h.org = signals();
});

describe("contract-winner claimed page: the company's website", () => {
  it("an ordinary claim: nofollow ugc through /out/<org slug>", async () => {
    const a = anchor(await render());
    expect(a).toContain('href="/out/acme-paving-ab12"');
    expect(a).toContain('rel="noopener noreferrer nofollow ugc"');
  });

  it("a paying member: the site itself, normal rel", async () => {
    h.org = signals({ paid: true });
    const a = anchor(await render());
    expect(a).toContain('href="https://acmepaving.ca/"');
    expect(a).toContain('rel="noopener noreferrer"');
  });

  it("the company's signals can't be read: nofollow (the safe answer)", async () => {
    h.org = null;
    expect(anchor(await render())).toContain("nofollow ugc");
  });
});
