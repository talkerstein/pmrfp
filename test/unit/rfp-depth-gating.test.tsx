import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

let LANG: "en" | "fr" | "es" = "en";
vi.mock("@/i18n/server", async () => {
  const { getDictionary } = await import("@/i18n/dictionaries");
  return {
    getLang: () => LANG,
    getT: (ns: string) => (getDictionary(LANG) as unknown as Record<string, unknown>)[ns],
    setLang: () => LANG,
    setLangFrom: async () => LANG,
  };
});
vi.mock("@/i18n/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
// The one-click trial is a server action; here it is only a marker in the markup.
vi.mock("@/components/leads/trial", () => ({
  TrialStartForm: ({ source, label }: { source: string; label: string }) => <form data-trial={source}>{label}</form>,
  canStartTrial: () => true,
}));

import { renderToStaticMarkup } from "react-dom/server";

/** Rendered markup with non-breaking spaces (between an amount and its currency) as plain spaces. */
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/ /g, " ");
import type { AwardRow } from "@/lib/data/award-intel";
import { WINDOW_MONTHS } from "@/lib/data/price-benchmarks";
import { similarWorkFor, similarWorkView } from "@/lib/rfp-detail/similar-work";
import { findRetender, retenderView } from "@/lib/rfp-detail/retender";
import { buyerOffice } from "@/lib/rfp-detail/buyer-profile";
import { prepareFor } from "@/lib/rfp-detail/prepare";
import { purchasingRulesFor } from "@/lib/rfp-detail/purchasing";
import { ProCta } from "@/components/rfp-detail/blocks";
import { SimilarWorkCard } from "@/components/rfp-detail/similar-work";
import { RetenderCard } from "@/components/rfp-detail/retender";
import { BuyerProfile } from "@/components/rfp-detail/buyer-profile";
import { PrepareChecklist } from "@/components/rfp-detail/prepare-checklist";
import { PurchasingRules } from "@/components/rfp-detail/purchasing-rules";
import { PlatformGuide } from "@/components/rfp-detail/platform-guide";
import { RelatedBlock } from "@/components/rfp-detail/related-block";
import { PlainSummary } from "@/components/rfp-detail/plain-summary";
import { KeyFacts } from "@/components/rfp-detail/key-facts";
import type { BenchmarkAward } from "@/lib/data/price-benchmarks";
import type { BuyerPage } from "@/lib/buyers/model";

/**
 * Who sees what, block by block. The rule: the gate is in the DATA each block
 * receives. A visitor and a free account get the same object (the free one);
 * Trade Pro gets the full one. Everything else on the page is free.
 */
beforeEach(() => {
  LANG = "en";
});

const rfp = { categories: ["Roofing"], regionName: "Toronto", province: "Ontario" };
const row = (amount: number | null, o: Partial<AwardRow> = {}): AwardRow => ({
  categories: ["Roofing"],
  regionName: "Toronto",
  province: "Ontario",
  market: "CA",
  amount,
  winner: "Apex Roofing Ltd",
  winnerSlug: "apex-roofing-ltd",
  date: "2026-03-01",
  ...o,
});
const index = [row(100_000), row(150_000), row(200_000, { winner: "Maple Roofing Inc", winnerSlug: null }), row(250_000), row(300_000), row(900_000, { winner: "Apex Roofing Ltd" })];
const cta = <span data-cta="cta">TRY</span>;
const TODAY = "2026-10-22";
const similar = (r: Parameters<typeof similarWorkFor>[0], idx: AwardRow[]) => similarWorkFor(r, idx, TODAY);

describe("what similar work sold for: choosing the numbers", () => {
  it("uses the narrowest place with at least 3 priced awards", () => {
    const sw = similar(rfp, index)!;
    expect(sw.scope).toBe("Toronto");
    expect(sw.valued).toBe(6);
    expect(sw.awards).toBe(6);
    expect(sw.median).toBe(225_000);
    expect(sw.middleHalf).toBe(true);
    expect([sw.low, sw.high]).toEqual([162_500, 287_500]);
    expect(sw.winners[0]).toMatchObject({ name: "Apex Roofing Ltd", wins: 5 });
    expect(sw.currency).toBe("CAD");
  });

  it("widens to the province, then the country, when the region has too few", () => {
    const few = [row(100_000), row(120_000), ...[1, 2, 3].map((n) => row(200_000 * n, { regionName: "Ottawa" }))];
    const sw = similar(rfp, few)!;
    expect(sw.scope).toBe("Ontario");
    expect(sw.valued).toBe(5);
    expect(sw.median).toBe(200_000);
    const wide = [row(100_000), row(120_000), ...[1, 2].map((n) => row(300_000 * n, { regionName: "Winnipeg", province: "Manitoba" }))];
    expect(similar(rfp, wide)!.scope).toBe("Canada");
  });

  it("with fewer than 3 priced awards anywhere, only the count, from the narrowest place that has any", () => {
    const sw = similar(rfp, [row(100_000), row(null), row(null, { regionName: "Ottawa" })])!;
    expect(sw.scope).toBe("Toronto");
    expect([sw.awards, sw.valued]).toEqual([2, 1]);
    expect([sw.median, sw.low, sw.high]).toEqual([null, null, null]);
    expect(sw.winners).toEqual([]);
    expect(similar(rfp, [])).toBeNull();
    expect(similar({ ...rfp, categories: [] }, index)).toBeNull();
    expect(similar(rfp, [row(100_000, { categories: ["HVAC"] })])).toBeNull();
  });

  it("never mixes Canada and the U.S. (one currency per country)", () => {
    const us = Array.from({ length: 4 }, (_, i) => row(500_000 + i, { market: "US", province: "Texas", regionName: "Texas" }));
    expect(similar(rfp, [...us])).toBeNull();
    const sw = similar({ categories: ["Roofing"], regionName: "Texas", province: "Texas" }, [...us, ...index])!;
    expect(sw.scope).toBe("Texas");
    expect(sw.currency).toBe("USD");
    expect(sw.valued).toBe(4);
  });

  it("only awards of the last 24 months count, the same window as the price benchmarks; undated ones can't be placed", () => {
    expect(WINDOW_MONTHS).toBe(24);
    const old = (n: number) => row(100_000 * n, { date: "2024-10-01" }); // 24 months and 3 weeks before TODAY
    const edge = row(500_000, { date: "2024-10-22" }); // exactly 24 months: in
    const fresh = [row(100_000), row(200_000), row(300_000)];
    expect(similar(rfp, [...fresh, old(1), old(2), old(3), old(4)])!.valued).toBe(3);
    expect(similar(rfp, [...fresh, edge])!.valued).toBe(4);
    expect(similar(rfp, [row(100_000, { date: null }), row(200_000, { date: undefined }), row(300_000, { date: "2026-01-01" })])!.median).toBeNull();
    // Too few recent ones: the old ones are not borrowed to reach a median.
    expect(similar(rfp, [row(100_000), row(200_000), old(1), old(2)])!.median).toBeNull();
  });

  it("amounts under the usable floor are unpriced awards, not prices", () => {
    expect(similar(rfp, [row(null), row(null), row(null)])!.median).toBeNull();
  });
});

describe("what similar work sold for: who sees what", () => {
  const sw = similar(rfp, index)!;
  const html = (pro: boolean) => render(<SimilarWorkCard view={similarWorkView(sw, pro)} cta={cta} benchmark={{ href: "/benchmarks/roofing/ontario", province: "Ontario" }} />);

  it("a visitor and a free account get the median and how many awards it rests on, free", () => {
    const free = html(false);
    expect(free).toContain("Median award: $225K");
    expect(free).toContain("CAD");
    expect(free).toContain("Based on 6 awards with a disclosed price");
    expect(free).toContain("Past public roofing contracts in Toronto, last 24 months");
  });

  it("…but not the band or the winners: they are not in the page, and the lock offers the 14-day trial", () => {
    const free = html(false);
    for (const secret of ["162", "287", "Apex", "Maple", "apex-roofing", "Middle half", "Who wins"]) expect(free).not.toContain(secret);
    expect(free).toContain('data-gate="similar-work"');
    expect(free).toContain('data-cta="cta"');
    // The free object itself has no band, no winners.
    const view = similarWorkView(sw, false);
    expect(Object.keys(view.data).sort()).toEqual(["awards", "currency", "median", "scope", "trade", "valued"]);
  });

  it("Trade Pro gets the band and the winners, and no lock", () => {
    const pro = html(true);
    expect(pro).toContain("Median award: $225K");
    expect(pro).toContain("Middle half of awards: $163K CAD to $288K CAD");
    expect(pro).toContain("Apex Roofing Ltd");
    expect(pro).toContain("Maple Roofing Inc");
    expect(pro).toContain("/contract-winners/apex-roofing-ltd");
    expect(pro).not.toContain('data-gate="similar-work"');
    expect(pro).not.toContain('data-cta="cta"');
  });

  it("a trade with too few priced awards shows the count to everyone, with no median and no lock", () => {
    const few = similar(rfp, [row(100_000), row(null)])!;
    for (const pro of [false, true]) {
      const h = render(<SimilarWorkCard view={similarWorkView(few, pro)} cta={cta} />);
      expect(h).toContain("2 past awards on record in Toronto, 1 with a disclosed price. We need at least 3 priced awards before showing a median.");
      expect(h).not.toContain("Median award");
      expect(h).not.toContain('data-gate="similar-work"');
    }
  });

  it("links to the full benchmark for everyone (the benchmark page gates its own numbers)", () => {
    expect(html(false)).toContain("/benchmarks/roofing/ontario");
    expect(html(true)).toContain("/benchmarks/roofing/ontario");
  });

  it("speaks French and Spanish", () => {
    LANG = "fr";
    const fr = html(false);
    expect(fr).toContain("Octroi médian");
    expect(fr).toContain("Trade Pro ajoute la fourchette de prix");
    LANG = "es";
    expect(html(false)).toContain("Adjudicación mediana");
  });
});

describe("the 14-day trial control", () => {
  it("is a one-click trial when trials are open and the viewer can start one", () => {
    const h = render(<ProCta trial plansHref="/dashboard/billing?plan=pro&interval=monthly" />);
    expect(h).toContain('data-trial="listing"');
    expect(h).toContain("Try Trade Pro free for 14 days");
    expect(h).toContain("No card. One trial per company.");
  });
  it("is a link to the plans otherwise (a property manager, a used trial, trials not open)", () => {
    const h = render(<ProCta trial={false} plansHref="/pricing" />);
    expect(h).not.toContain("data-trial");
    expect(h).toContain('href="/pricing"');
    expect(h).toContain("See Trade Pro plans");
  });
});

describe("looks like a re-tender: who sees what", () => {
  const award: BenchmarkAward = {
    slug: "roof-fire-station-3-tora-9",
    title: "Roof replacement, Fire Station 3",
    buyer: "City of Oshawa",
    winner: "Apex Roofing Ltd",
    winnerSlug: "apex-roofing-ltd",
    amount: 412_500,
    date: "2024-09-10",
    country: "CA",
    currency: "CAD",
    province: "Ontario",
    city: "Oshawa",
    trades: ["Roofing"],
    sourceKey: "toronto-awards",
    attribution: "x",
    noticeUrl: null,
    noticeExact: false,
  };
  const match = findRetender(
    { slug: "me-cb-1-1", title: "Fire Station 3 roof replacement 2026", categories: ["Roofing"], province: "Ontario", deadline: "2026-11-20", buyer: "City of Oshawa", country: "CA" },
    [award],
    "2026-10-22",
  )!;

  it("Trade Pro sees the previous contract, the winner, the amount, the timing, and that it only looks similar", () => {
    const h = render(<RetenderCard view={retenderView(match, true)} cta={cta} />);
    expect(h).toContain("Looks like a re-tender");
    expect(h).toContain("Roof replacement, Fire Station 3");
    expect(h).toContain("Apex Roofing Ltd");
    expect(h).toContain("$412,500 CAD");
    expect(h).toContain("about 2 years before this tender closes");
    expect(h).toContain("It may not be the same contract");
    expect(h).toContain("/rfps/roof-fire-station-3-tora-9");
    expect(h).not.toContain('data-gate="retender"');
  });

  it("a visitor or free account sees only that one exists, with the trial control, and no name, amount, date or link", () => {
    const h = render(<RetenderCard view={retenderView(match, false)} cta={cta} />);
    expect(h).toContain("A past contract with this buyer looks similar to this one.");
    expect(h).toContain('data-gate="retender"');
    expect(h).toContain('data-cta="cta"');
    for (const secret of ["Apex", "412", "2024", "September", "Fire Station", "/rfps/", "tora-9"]) expect(h).not.toContain(secret);
  });
});

describe("everything else is free for everyone", () => {
  const page = {
    buyer: { name: "Town of Smiths Falls", provinceCode: "ON", type: "municipality", group: "municipality", tendersUrl: "https://www.smithsfalls.ca/bids/", platforms: ["bids-and-tenders"], portalUrl: null, ownSiteList: true, email: "purchasing@smithsfalls.ca", emailSource: null, checkedOn: "2026-10-01", slug: "town-of-smiths-falls" },
  } as unknown as BuyerPage;

  it("the buyer profile shows counts, usual trades and the office details held, ungated", () => {
    const office = buyerOffice(page, { contactEmail: null, contactPhone: "613-283-4124", bidsUrl: null }, null);
    const h = render(
      <BuyerProfile name="Town of Smiths Falls" path="/buyers/ontario/town-of-smiths-falls" kindLabel="Public · municipal" openCount={2} awardCount={5} trades={["Roofing", "Paving"]} office={office} />,
    );
    expect(h).toContain("Town of Smiths Falls");
    expect(h).toContain("/buyers/ontario/town-of-smiths-falls");
    expect(h).toContain("Public · municipal");
    expect(h).toContain("2 open bids");
    expect(h).toContain("5 past awards");
    expect(h).toContain("Roofing, Paving");
    expect(h).toContain("tel:6132834124");
    expect(h).toContain("purchasing@smithsfalls.ca");
    expect(h).toContain("smithsfalls.ca/bids");
    expect(h).not.toContain("Trade Pro");
  });

  it("office details a directory row may carry later (address, phone, website) are shown as held", () => {
    const later = { buyer: { ...page.buyer, address: "77 Beckwith St N", phone: "613-283-4124", website: "https://www.smithsfalls.ca" } } as unknown as BuyerPage;
    const o = buyerOffice(later, null, null)!;
    expect([o.address, o.phone, o.website]).toEqual(["77 Beckwith St N", "613-283-4124", "https://www.smithsfalls.ca"]);
    const h = render(<BuyerProfile name="X" path="/b" kindLabel={null} openCount={0} awardCount={0} trades={[]} office={o} />);
    expect(h).toContain("77 Beckwith St N");
    expect(h).toContain("None yet");
    expect(buyerOffice(null, null, null)).toBeNull();
    expect(buyerOffice({ buyer: { ...page.buyer, email: null, tendersUrl: null } } as unknown as BuyerPage, null, null)).toBeNull();
  });

  it("the checklist, with the confirm line, in three languages", () => {
    const items = prepareFor({ province: "Ontario" }).items;
    const en = render(<PrepareChecklist items={items} place="Ontario" workType="construction" />);
    expect(en).toContain("What to prepare to bid");
    expect(en).toContain("It is not read from this notice.");
    expect(en).toContain("WSIB (Workplace Safety and Insurance Board)");
    expect(en).toContain("[confirm with the tender documents]");
    expect(en).toContain("Confirm every item against the tender documents.");
    LANG = "fr";
    expect(render(<PrepareChecklist items={items} place="Ontario" workType="construction" />)).toContain("[à confirmer dans les documents d&#x27;appel d&#x27;offres]");
    LANG = "es";
    expect(render(<PrepareChecklist items={items} place="Ontario" workType="construction" />)).toContain("Confirme cada punto con los documentos de la licitación.");
  });

  it("the bonding line changes for service work", () => {
    const items = prepareFor({ province: "Alberta" }).items;
    expect(render(<PrepareChecklist items={items} place="Alberta" workType="construction" />)).toContain("A bid bond or agreement to bond is common");
    expect(render(<PrepareChecklist items={items} place="Alberta" workType="service" />)).toContain("even for service work");
    // A private job makes no claim about municipal tenders.
    const privateJob = render(<PrepareChecklist items={prepareFor({ province: "Alberta", publicBuyer: false }).items} place="Alberta" workType="construction" publicBuyer={false} />);
    expect(privateJob).toContain("Some jobs ask for a bid deposit or bonding.");
    expect(privateJob).not.toContain("municipal tenders we reviewed");
    expect(privateJob).not.toContain("Mountain View County");
  });

  it("purchasing rules: the buyer's own policy with its link, or the derived range with how many towns", () => {
    const own = render(<PurchasingRules rules={purchasingRulesFor({ buyerName: "Town of Smiths Falls", province: "Ontario", kind: "municipal", construction: false })} buyerName="Town of Smiths Falls" province="Ontario" />);
    expect(own).toContain("Town of Smiths Falls&#x27;s purchasing policy (By-law 10644-2025 (procurement policy), 2025)");
    expect(own).toContain("Up to $10,000");
    expect(own).toContain("$130,000");
    expect(own).toContain("Read the policy");
    expect(own).not.toContain("Towns like this one");
    const derived = render(<PurchasingRules rules={purchasingRulesFor({ buyerName: "Town of Cobourg", province: "Ontario", kind: "municipal", construction: false, population: 19_000 })} buyerName="Town of Cobourg" province="Ontario" />);
    expect(derived).toContain("Towns like this one typically start a formal public tender between $25,000");
    expect(derived).toContain("across 8 Ontario towns we reviewed");
    expect(derived).toContain("this buyer&#x27;s own policy decides");
    expect(derived).toContain("Trade agreements (2026–2027)");
    expect(derived).toContain("Canadian Free Trade Agreement");
    // A buyer we hold nothing on: the block is not rendered.
    expect(render(<PurchasingRules rules={purchasingRulesFor({ buyerName: "Public Services and Procurement Canada", province: "Ontario", kind: "federal", construction: false })} buyerName="x" province="Ontario" />)).toBe("");
  });

  it("the platform guide says 'as of Oct 2026', links the platform's own pages, and says PMRFP hosts nothing", () => {
    const h = render(<PlatformGuide platform="bc-bid" />);
    expect(h).toContain("How to bid on BC Bid");
    expect(h).toContain("As of Oct 2026");
    expect(h).toContain("There is no charge to register as a supplier on BC Bid.");
    expect(h).toContain("https://www.bcbid.gov.bc.ca/");
    expect(h).toContain("PMRFP does not host tender documents or take bids.");
    LANG = "fr";
    expect(render(<PlatformGuide platform="bc-bid" />)).toContain("(en anglais)");
    expect(render(<PlatformGuide platform="seao" />)).not.toContain("(en anglais)");
  });

  it("related: the buyer's other bids with the follow control, and the same trade nearby", () => {
    const h = render(
      <RelatedBlock
        buyerName="Town of Smiths Falls"
        moreFromBuyer={[{ slug: "paving-2", title: "Paving 2", deadline: "2026-11-10" }]}
        nearby={[{ slug: "roof-9", title: "Roof 9", deadline: "2026-11-12", trade: "Roofing", place: "Ontario" }]}
        follow={<button data-follow>Follow</button>}
      />,
    );
    expect(h).toContain("More from Town of Smiths Falls");
    expect(h).toContain("/rfps/paving-2");
    expect(h).toContain("data-follow");
    expect(h).toContain("Same trade nearby");
    expect(h).toContain("/rfps/roof-9");
    expect(render(<RelatedBlock buyerName={null} moreFromBuyer={[]} nearby={[]} follow={null} />)).toBe("");
    expect(render(<RelatedBlock buyerName="X" moreFromBuyer={[]} nearby={[]} follow={null} />)).toContain("No other open bids from this buyer right now.");
  });

  it("summary and key facts hold only what they are given", () => {
    const s = render(<PlainSummary text="Replace the roof." fromNotice={false} />);
    expect(s).toContain("In plain language");
    expect(s).toContain("not from the full notice");
    expect(render(<PlainSummary text="Replace the roof." fromNotice />)).toContain("Summarized from the notice&#x27;s own text.");
    const f = render(<KeyFacts facts={[{ k: "Closes", v: "Nov 20, 2026", hi: true, sub: "in 29 days" }, { k: "Trade", v: "Roofing" }]} />);
    expect(f).toContain("in 29 days");
    expect(f).not.toContain("Not specified");
    expect(f.match(/<dt>/g)).toHaveLength(2);
  });
});
