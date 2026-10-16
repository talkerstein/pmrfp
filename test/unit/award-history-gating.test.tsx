import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Raw award history never reaches a viewer without Intel, and a dry run
 * never writes. Supabase, the session and the board snapshot are mocked.
 */
const h = vi.hoisted(() => ({
  session: null as null | { hasIntelAccess: boolean; profile: { primary_role: string; status: string } },
  service: true,
  rpc: vi.fn(),
  upsert: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => h.service }));
vi.mock("@/lib/access/access", () => ({ getSession: async () => h.session, isAdminRole: (r: string) => r === "admin" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: h.createServiceClient }));
vi.mock("@/lib/data/trade-city", () => ({ listAllRfpsCached: async () => [] }));
vi.mock("@/lib/data/taxonomy", () => ({ getRegions: async () => [], getCategories: async () => [{ name: "Cleaning & Janitorial", slug: "cleaning-janitorial" }] }));
vi.mock("@/lib/data/monthly-winners-load", () => ({ torontoToday: () => "2026-10-16" }));
vi.mock("@/lib/contract-history/registry", () => ({
  historySourcesFor: () => [
    {
      key: "test-source",
      licence: "Test licence",
      collect: async () => ({
        read: 1,
        skipped: {},
        awards: [
          {
            source: "test-source", source_key: "1", board_ref: null, title: "Janitorial services", description: null, buyer: "City", buyer_key: "city",
            winner_business_name: "Metro Clean Ltd", winner_key: "metro clean", winner_is_individual: false, value: 50000, currency: "CAD", country: "CA",
            province: "Ontario", city: null, award_date: "2025-01-01", award_date_precision: "day", start_date: null, end_date: "2027-01-01", end_date_source: "stated",
            potential_end_date: null, number_of_bids: 3, trade_slugs: ["cleaning-janitorial"], notice_url: null, licence: "l", attribution: "a", as_of: "2026-10-16",
          },
        ],
        bids: [],
      }),
    },
  ],
}));

import { renderToStaticMarkup } from "react-dom/server";
import { forgetHistorySlice, loadHistoryForIntel } from "@/lib/contract-history/load";
import { loadIntel } from "@/lib/intel/load";
import { companyIndex, renewalRadar, renewalCounts } from "@/lib/intel/model";
import { indexTeaser, intelView, renewalTeaser } from "@/lib/intel/view";
import { RenewalsBody, type IntelCtx } from "@/components/intel/views";
import { runAwardHistory } from "@/lib/contract-history/run";
import intelMessages from "@/i18n/messages/intel";

const HISTORY_ROW = {
  id: "00000000-0000-0000-0000-0000000000aa",
  source: "ca-federal-contracts",
  board_ref: null,
  title: "SECRET-HISTORY-TITLE janitorial services",
  buyer: "Public Services and Procurement Canada",
  winner_business_name: "Hidden Clean Ltd",
  winner_is_individual: false,
  value: 90_000,
  currency: "CAD",
  country: "CA",
  province: "Ontario",
  city: null,
  award_date: "2024-01-15",
  end_date: "2027-01-14",
  end_date_source: "stated",
  potential_end_date: null,
  number_of_bids: 3,
  trade_slugs: ["cleaning-janitorial"],
  notice_url: null,
  attribution: "OGL-Canada",
  has_bids: false,
};

const ctx = (intel: boolean): IntelCtx => ({
  lang: "en",
  t: intelMessages.en,
  cta: { signedIn: true, hasOrg: true, intel, country: "CA", monthly: { price: "$99", payable: false }, annual: { price: "$990", payable: false }, launch: true, next: "/intel/renewals" },
});

beforeEach(() => {
  forgetHistorySlice();
  h.rpc.mockReset();
  h.upsert.mockReset();
  h.createServiceClient.mockReset();
  h.rpc.mockImplementation(async (_fn: string, args: { p_country: string }) => ({ data: args.p_country === "CA" ? [HISTORY_ROW] : [], error: null }));
  h.upsert.mockImplementation(() => ({ select: async () => ({ data: [{ id: "id-1", source: "test-source", source_key: "1" }], error: null }) }));
  h.createServiceClient.mockImplementation(() => ({ rpc: h.rpc, from: () => ({ upsert: h.upsert }) }));
  h.service = true;
});

describe("award history is for Intel viewers only", () => {
  it("no Intel: the slice is never even read, and Intel pages have no history", async () => {
    h.session = { hasIntelAccess: false, profile: { primary_role: "trade", status: "active" } };
    expect(await loadHistoryForIntel()).toEqual([]);
    expect(h.rpc).not.toHaveBeenCalled();
    const { awards, today } = await loadIntel();
    expect(awards).toEqual([]);
    const items = renewalRadar(awards, { country: "CA", today, horizon: 24 });
    const html = renderToStaticMarkup(<RenewalsBody view={intelView(items, false, (x) => renewalTeaser("CA", x, renewalCounts(x)))} ctx={ctx(false)} csvHref="/x" />);
    expect(html).not.toContain("SECRET-HISTORY-TITLE");
    expect(html).not.toContain("Hidden Clean");
    expect(indexTeaser("CA", companyIndex(awards, "CA", 1), (r) => ("name" in r ? r.name : "")).total).toBe(0);
  });

  it("signed out: nothing", async () => {
    h.session = null;
    expect(await loadHistoryForIntel()).toEqual([]);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("with Intel: history merges in, with its stated end date on the radar", async () => {
    h.session = { hasIntelAccess: true, profile: { primary_role: "trade", status: "active" } };
    const rows = await loadHistoryForIntel();
    expect(rows).toHaveLength(1);
    expect(h.rpc).toHaveBeenCalledWith("award_history_intel_slice", expect.objectContaining({ p_country: "CA" }));
    const { awards, today } = await loadIntel();
    expect(awards.map((a) => a.title)).toEqual([HISTORY_ROW.title]);
    expect(awards[0].trades).toEqual(["Cleaning & Janitorial"]);
    const items = renewalRadar(awards, { country: "CA", today, horizon: 12 });
    expect(items.map((i) => [i.term.source, i.expectedRebid, i.windowStart])).toEqual([["stated-end-date", "2027-01-14", "2026-09-14"]]);
  });
});

describe("cron runner", () => {
  it("a dry run never writes, even with the service key", async () => {
    h.session = null;
    const res = await runAwardHistory(new Request("http://localhost/api/cron/award-history/weekly?dry=1"), "weekly");
    const json = (await res.json()) as { dry: boolean; sources: { kept: number; coverage: { CA: { endDates: { stated: number } } }; written?: unknown }[] };
    expect(json.dry).toBe(true);
    expect(json.sources[0].kept).toBe(1);
    expect(json.sources[0].coverage.CA.endDates.stated).toBe(1);
    expect(json.sources[0].written).toBeUndefined();
    expect(h.createServiceClient).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("a real run upserts on (source, source_key)", async () => {
    const res = await runAwardHistory(new Request("http://localhost/api/cron/award-history/weekly"), "weekly");
    const json = (await res.json()) as { sources: { written?: { upserted: number } }[] };
    expect(json.sources[0].written?.upserted).toBe(1);
    expect(h.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: "source,source_key" });
  });
});
