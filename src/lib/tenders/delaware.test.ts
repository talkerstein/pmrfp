import { describe, expect, it } from "vitest";
import { classifyDelaware, delawareToRfpInsert, fetchDelawareOpenBids, type DelawareBid } from "./delaware";

const TODAY = "2026-10-08";

const bid = (title: string, extra: Partial<DelawareBid> = {}): DelawareBid => ({
  contractnumber: "OMB-1234",
  contracttitle: title,
  opendate: "2026-09-22T00:00:00.000",
  deadlinedate: "2026-11-10T00:00:00.000",
  agencycode: "OMB",
  bidurl: { url: "https://mmp.delaware.gov/Bids/Details/9327" },
  ...extra,
});

describe("Delaware Open Bids", () => {
  it("drops timber sales, past deadlines and rows without a notice link", () => {
    expect(classifyDelaware(bid("Commercial Timber Sale Taber State Forest"), TODAY)).toEqual([]);
    expect(classifyDelaware(bid("HVAC Maintenance", { deadlinedate: "2026-10-01" }), TODAY)).toEqual([]);
    expect(classifyDelaware(bid("HVAC Maintenance", { bidurl: null }), TODAY)).toEqual([]);
  });

  it("builds an attributed insert that links back to the official notice", () => {
    const row = delawareToRfpInsert(bid("Roof Replacement"), TODAY)!;
    expect(row.slug).toMatch(/-debid-9327$/);
    expect(row.source_url).toBe("https://mmp.delaware.gov/Bids/Details/9327");
    expect(row.source_notes).toContain("State of Delaware Open Data");
    expect(row.deadline).toBe("2026-11-10");
    expect(row.province).toBe("Delaware");
  });

  // Dry run against the live dataset: DE_DRY_RUN=1 npx vitest run delaware
  it.runIf(process.env.DE_DRY_RUN === "1")("reports how many live rows would import", async () => {
    const rows = await fetchDelawareOpenBids();
    const kept = rows.filter((r) => classifyDelaware(r, TODAY).length && delawareToRfpInsert(r, TODAY));
    console.log(`Delaware Open Bids: ${rows.length} open, ${kept.length} would import`);
    for (const r of kept) console.log(` - ${r.contracttitle} → ${classifyDelaware(r, TODAY).join(", ")}`);
    expect(rows.length).toBeGreaterThan(0);
  }, 30_000);
});
