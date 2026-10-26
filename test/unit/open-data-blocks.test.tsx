import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/i18n/link", () => ({ default: ({ children }: { children: unknown }) => children }));

const load = vi.hoisted(() => ({
  permits: { rows: [] as unknown[], credits: [] as string[] },
  active: { rows: [] as unknown[], windowStart: null as string | null, windowEnd: null as string | null },
}));
vi.mock("@/lib/open-data/load", () => ({
  loadRecentPermits: async () => load.permits,
  loadContractorActivity: async () => load.active,
  loadPlannedProcurements: async () => [],
  loadCalgaryTop: async () => [],
}));

import { CalgaryActiveSummary, ComingUp, DataSourcesCredit, OpenDataTradeBlocks } from "@/components/public/open-data-blocks";

const html = async (el: Promise<React.ReactElement | null> | React.ReactElement | null) => renderToStaticMarkup((await el) as React.ReactElement);

describe("open-data blocks", () => {
  it("render nothing when a city has no data (a page without data is unchanged)", async () => {
    load.permits = { rows: [], credits: [] };
    load.active = { rows: [], windowStart: null, windowEnd: null };
    expect(await html(OpenDataTradeBlocks({ city: "Toronto", tradeSlug: "hvac", tradeLabel: "HVAC" }))).toBe("");
    expect(await html(<ComingUp rows={[]} no={3} />)).toBe("");
    expect(await html(<CalgaryActiveSummary lists={[{ trade: "hvac", label: "HVAC", list: { rows: [], windowStart: null, windowEnd: null } }]} no={4} />)).toBe("");
  });

  it("recent permits show contractor, value and work type with the city's credit; no address or applicant column", async () => {
    load.permits = {
      rows: [{ issued_on: "2026-10-15", contractor: "Natt Star Homes Ltd", value_cad: 685965, work_type: "Duplex · New", source: "permits-lead-surrey" }],
      credits: ["Contains information licensed under the Open Government License – City of Surrey."],
    };
    const out = await html(OpenDataTradeBlocks({ city: "Surrey", tradeSlug: "roofing", tradeLabel: "Roofing" }));
    expect(out).toContain("Recent building permits in Surrey");
    expect(out).toContain("Natt Star Homes Ltd");
    expect(out).toContain("Duplex · New");
    expect(out).toContain("Open Government License – City of Surrey");
    expect(out).toContain('data-credit="data-sources"');
    expect(out).not.toMatch(/<th[^>]*>(Address|Applicant|Owner)/i);
  });

  it("Calgary's most active contractors list names, ranks and permit counts, with the OGL-Calgary credit", async () => {
    load.permits = { rows: [], credits: [] };
    load.active = { rows: [{ rank: 1, contractor: "Drive Mechanical", permits: 628 }, { rank: 2, contractor: "Modern HVAC", permits: 562 }], windowStart: "2025-10-23", windowEnd: "2026-10-23" };
    const out = await html(OpenDataTradeBlocks({ city: "Calgary", tradeSlug: "hvac", tradeLabel: "HVAC" }));
    expect(out).toContain("Most active HVAC contractors in Calgary");
    expect(out).toContain("Drive Mechanical");
    expect(out).toContain("628 permits");
    expect(out).toContain("Open Government Licence – City of Calgary");
    expect(out).toContain("publishes no project value");
  });

  it("the planned-procurement list carries the Toronto credit and says it is a plan, not a notice", async () => {
    const out = await html(
      <ComingUp
        no={5}
        rows={[{ title: "Dufferin Transfer Station - Paving", type_of_work: "Construction", scope: null, division: "SWMS", sourcing_year: 2026, sourcing_type: "RFT", estimated_range: "Up to $5M" }]}
      />,
    );
    expect(out).toContain("Coming up: planned City of Toronto procurements");
    expect(out).toContain("Sourcing 2026");
    expect(out).toContain("Estimate Up to $5M");
    expect(out).toContain("A plan, not a notice");
    expect(out).toContain("Open Government Licence – Toronto");
  });

  it("a credit keeps the licence's own wording", async () => {
    const out = await html(<DataSourcesCredit credits={["Contains information licensed under the Open Government Licence – Canada."]} />);
    expect(out).toContain("Contains information licensed under the Open Government Licence – Canada.");
  });
});
