import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { renderToStaticMarkup } from "react-dom/server";
import { boardRefOf, whoElseBid, type BidResultRow } from "@/lib/bid-results/model";
import { parseTxdot, txdotQuery, txdotTrade } from "@/lib/bid-results/txdot";
import { WhoElseBidPanel } from "@/components/intel/who-else-bid";
import bidMessages from "@/i18n/messages/bidResults";
import { awardHref, historyAward, mergeHistory, type HistoryAwardRow } from "@/lib/intel/history";
import { renewalFor, termFor, type IntelAward } from "@/lib/intel/model";

const row = (o: Partial<BidResultRow>): BidResultRow => ({
  bidder_business_name: "A Ltd",
  bidder_is_individual: false,
  bid_amount: 100_000,
  currency: "CAD",
  rank: 1,
  status_label: "awarded",
  as_of: "2026-10-01",
  source: "ca-seao",
  ...o,
});

describe("who else bid", () => {
  const rows = [
    row({}),
    row({ bidder_business_name: "B Inc", bid_amount: 108_000, rank: 2, status_label: "not_awarded" }),
    row({ bidder_business_name: null, bidder_is_individual: true, bid_amount: 125_000, rank: 3, status_label: "not_awarded" }),
  ];
  it("gap to the winner in % and dollars, spread, individuals unnamed", () => {
    const p = whoElseBid(rows)!;
    expect(p.basis).toBe("awarded");
    expect(p.lines.map((l) => [l.rank, l.name, l.gapPct, l.gapAmount, l.reference])).toEqual([
      [1, "A Ltd", 0, 0, true],
      [2, "B Inc", 8, 8000, false],
      [3, null, 25, 25000, false],
    ]);
    expect(p.lines[2].individual).toBe(true);
    expect(p.spreadPct).toBe(25);
  });
  it("without a named winner the reference is the apparent low bid", () => {
    const p = whoElseBid([row({ status_label: "apparent_low", currency: "USD", source: "us-txdot-bids" }), row({ bidder_business_name: "B", status_label: "submitted", bid_amount: 90_000, currency: "USD", rank: 2 })])!;
    expect(p.basis).toBe("apparent_low");
    expect(p.lines.find((l) => l.reference)?.amount).toBe(90_000);
  });
  it("needs two bids", () => {
    expect(whoElseBid([row({})])).toBeNull();
  });
  it("renders unofficial, as-of, no reasons, no personal names", () => {
    const html = renderToStaticMarkup(<WhoElseBidPanel panel={whoElseBid(rows)!} t={bidMessages.en} lang="en" />);
    expect(html).toContain("Unofficial results, as of Oct 1, 2026");
    expect(html).toContain("Individual bidder (not named)");
    expect(html).toContain("+8%");
    expect(html).not.toMatch(/because|disqualif|non.?compliant|rejected/i);
    expect(html).toContain("don&#x27;t say, why a bid was or wasn&#x27;t chosen");
  });
  it("finds the history row of a board listing by its slug suffix", () => {
    expect(boardRefOf("deneigement-des-stationnements-qca-ao-2026-15")).toBe("qca-ao-2026-15");
    expect(boardRefOf("snow-cba-pw-24-01234")).toBe("cba-pw-24-01234");
    expect(boardRefOf("plain-listing")).toBeNull();
  });
});

describe("TxDOT bid tabulations", () => {
  it("per project and bidder only (never item level), maintenance services in scope", () => {
    const q = decodeURIComponent(txdotQuery(0, "2024-10-01"));
    expect(q).toContain("$group=project_id,vendor_name");
    expect(q).not.toContain("bid_item_unit_price");
    expect(txdotTrade("MOWING HIGHWAY RIGHT OF WAY", "Routine Maintenance Project")).toBe("landscaping");
    expect(txdotTrade("JANITORIAL MAINTENANCE", "Routine Maintenance Project - Sealed")).toBe("cleaning-janitorial");
    expect(txdotTrade("HOT MIX", "Material Maintenance Project")).toBeNull();
    expect(txdotTrade("BRIDGE REPAIR", "Bridge Maintenance")).toBeNull();
  });
  it("ranks bidders; the low bidder is 'apparent low', never 'awarded'", () => {
    const b = parseTxdot(
      [
        { project_id: "P1", project_name: "Rest areas", county: "Travis", district: "Austin", let_date: "2026-03-04T00:00:00.000", classification: "Routine Maintenance Project", short_description: "JANITORIAL MAINTENANCE", working_days: "250", vendor_name: "CLEAN TEXAS LLC", rank: "1", total: "410000" },
        { project_id: "P1", project_name: "Rest areas", county: "Travis", district: "Austin", let_date: "2026-03-04T00:00:00.000", classification: "Routine Maintenance Project", short_description: "JANITORIAL MAINTENANCE", working_days: "250", vendor_name: "JOHN SMITH", rank: "2", total: "450000" },
      ],
      { asOf: "2026-10-16", since: "2021-10-16" },
    );
    expect(b.awards[0]).toMatchObject({ country: "US", currency: "USD", province: "Texas", number_of_bids: 2, winner_business_name: "CLEAN TEXAS LLC", end_date_source: "derived_from_title", trade_slugs: ["cleaning-janitorial"] });
    expect(b.bids.map((x) => [x.rank, x.bidder_business_name, x.status_label])).toEqual([
      [1, "CLEAN TEXAS LLC", "apparent_low"],
      [2, null, "submitted"],
    ]);
  });
});

describe("Intel with award history", () => {
  const hist = (o: Partial<HistoryAwardRow> = {}): HistoryAwardRow => ({
    id: "00000000-0000-0000-0000-000000000001",
    source: "ca-federal-contracts",
    board_ref: null,
    title: "Janitorial services, federal building",
    buyer: "Public Services and Procurement Canada",
    winner_business_name: "Metro Clean Ltd",
    winner_is_individual: false,
    value: 250_000,
    currency: "CAD",
    country: "CA",
    province: null,
    city: null,
    award_date: "2023-04-01",
    end_date: "2027-03-31",
    end_date_source: "stated",
    potential_end_date: null,
    number_of_bids: 4,
    trade_slugs: ["cleaning-janitorial"],
    notice_url: "https://search.open.canada.ca/contracts/record/pwgsc-tpsgc,C-1",
    attribution: "Contains information licensed under the Open Government Licence – Canada.",
    ...o,
  });

  it("renewal radar: stated end date > term from the title > typical estimate", () => {
    const stated = historyAward(hist())!;
    expect(termFor(stated).source).toBe("stated-end-date");
    const r = renewalFor(stated, "2026-10-16")!;
    expect(r.expectedRebid).toBe("2027-03-31");
    expect(r.windowStart).toBe("2026-11-30");
    const derived = historyAward(hist({ end_date_source: "derived_from_title", end_date: "2026-04-01" }))!;
    expect(termFor(derived).source).toBe("derived-end-date");
    const estimated = historyAward(hist({ end_date_source: "estimated", end_date: "2026-04-01", title: "Janitorial services" }))!;
    expect(termFor(estimated).source).toBe("typical");
    const fromTitle = historyAward(hist({ end_date: null, end_date_source: null, title: "Janitorial services 2023-2026" }))!;
    expect(termFor(fromTitle).source).toBe("stated-years");
  });

  it("options keep the window open until the potential end", () => {
    const a = historyAward(hist({ potential_end_date: "2029-03-31" }))!;
    const r = renewalFor(a, "2026-10-16")!;
    expect(r.term.optionMonths).toBe(24);
    expect(r.windowEnd).toBe("2029-03-31");
  });

  it("a currency that isn't the country's is dropped, never converted", () => {
    expect(historyAward(hist({ currency: "USD" }))).toBeNull();
    expect(historyAward(hist({ country: "US", currency: "USD" }))?.currency).toBe("USD");
  });

  it("merges with the board: one award, history end date attached; history-only awards link to /intel/awards", () => {
    const board: IntelAward = {
      slug: "deneigement-qca-ao-1", title: "Déneigement", buyer: "Ville de Laval", buyerKey: "ville de laval", winner: "Déneigement Laval Inc.", winnerKey: "deneigement laval", winnerSlug: "deneigement-laval-inc",
      winnerPublic: true, amount: 240_000, date: "2026-08-20", country: "CA", currency: "CAD", province: "Quebec", city: "Laval", trades: ["Snow Removal"], tradeSlugs: ["snow-removal"],
      sourceKey: "seao-awards", attribution: "SEAO", noticeUrl: null, noticeExact: false,
    };
    const merged = mergeHistory([board], [
      hist({ id: "00000000-0000-0000-0000-000000000002", source: "ca-seao", board_ref: "qca-ao-1", end_date: "2029-04-30", has_bids: true }),
      hist(),
    ]);
    expect(merged).toHaveLength(2);
    const b = merged.find((a) => a.slug === board.slug)!;
    expect(b).toMatchObject({ endDate: "2029-04-30", endDateSource: "stated", hasBidList: true, historyOnly: false });
    expect(awardHref(b)).toBe("/rfps/deneigement-qca-ao-1");
    const h = merged.find((a) => a.historyOnly)!;
    expect(awardHref(h)).toBe("/intel/awards/00000000-0000-0000-0000-000000000001");
    expect(h.winnerSlug).toBe("metro-clean-ltd");
  });

  it("an individual holder is counted, never named", () => {
    const a = historyAward(hist({ winner_business_name: null, winner_is_individual: true }))!;
    expect(a.winner).toBeNull();
    expect(a.winnerKey).toBeNull();
  });
});
