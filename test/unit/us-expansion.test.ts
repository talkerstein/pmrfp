import { describe, expect, it } from "vitest";
import { classifySam, dedupeSam, samToRfpInsert, streamCsv, type SamRow } from "@/lib/tenders/sam";
import { publicTenderSource } from "@/lib/tenders/sources";
import { expandRegionIds } from "@/lib/data/region-tree";
import { isUsState, usStateRegionSlug } from "@/lib/geo";
import { composeRfp, localize } from "@/lib/rfp-writer/compose";
import { wizardInputSchema } from "@/lib/rfp-writer/schema";

const TODAY = "2026-09-23";

function row(over: Partial<SamRow>): SamRow {
  return {
    NoticeId: "35b61ba2ddfe4e9cb9a84116122c3016",
    Title: "Z--Roof Replacement, Building 12",
    "Sol#": "W912DY26R0042",
    "Department/Ind.Agency": "DEPT OF DEFENSE",
    "Sub-Tier": "DEPT OF THE ARMY",
    Office: "W076 ENDIST HUNTSVILLE",
    PostedDate: "2026-09-10 10:00:00",
    Type: "Solicitation",
    ResponseDeadLine: "2026-10-15T14:00:00-05:00",
    ClassificationCode: "Z1AA",
    PopCity: "Huntsville",
    PopState: "AL",
    Active: "Yes",
    SetAside: "Small Business Set Aside - Total",
    PrimaryContactFullname: "Jane Officer",
    PrimaryContactEmail: "jane.officer@army.mil",
    PrimaryContactPhone: "",
    Link: "https://sam.gov/workspace/contract/opp/35b61ba2ddfe4e9cb9a84116122c3016/view",
    Description: "Remove and replace the built-up roof on Building 12, including insulation and flashing.",
    ...over,
  };
}

describe("SAM.gov feed", () => {
  it("keeps building work by trade words, then by PSC code", () => {
    expect(classifySam(row({}), TODAY)).toEqual(["roofing"]);
    expect(classifySam(row({ Title: "S218--Snow Removal Services Lebanon VAMC", ClassificationCode: "S218" }), TODAY)).toEqual(["snow-removal"]);
    expect(classifySam(row({ Title: "W912DY-26-R-0042", ClassificationCode: "J041" }), TODAY)).toEqual(["hvac"]);
    // VA medical centres are real building work — the Canadian EXCLUDE list dropped them.
    expect(classifySam(row({ Title: "J045--Boiler Tuning Services - VA Medical Center", ClassificationCode: "J045" }), TODAY)).toContain("hvac");
  });

  it("drops what a trade can't bid", () => {
    expect(classifySam(row({ Title: "Architect & Engineering Services IDIQ" }), TODAY)).toEqual([]);
    expect(classifySam(row({ ClassificationCode: "7030" }), TODAY)).toEqual([]); // goods
    expect(classifySam(row({ Type: "Award Notice" }), TODAY)).toEqual([]);
    expect(classifySam(row({ Type: "Sources Sought" }), TODAY)).toEqual([]);
    expect(classifySam(row({ ResponseDeadLine: "2026-09-01T12:00:00-05:00" }), TODAY)).toEqual([]);
    expect(classifySam(row({ PopState: "AP" }), TODAY)).toEqual([]); // overseas military post
    expect(classifySam(row({ Active: "No" }), TODAY)).toEqual([]);
  });

  it("maps to an rfp_posts row the importer can own", () => {
    const ins = samToRfpInsert(row({}), TODAY)!;
    expect(ins.slug).toBe("roof-replacement-building-12-us-35b61ba2ddfe4e9cb9a84116122c3016");
    expect(ins.province).toBe("Alabama");
    expect(ins.deadline).toBe("2026-10-15");
    expect(ins.summary.startsWith("Huntsville, Alabama.")).toBe(true);
    expect(ins.source_notes).toContain("public domain");
    expect(ins.published_at).toBe("2026-09-10T00:00:00Z"); // backlog keeps its real date — no alert flood
    expect(publicTenderSource(ins.slug).key).toBe("sam");
    expect(samToRfpInsert(row({ NoticeId: "" }), TODAY)).toBeNull();
  });

  it("never claims a Canadian slug that happens to contain -us-", () => {
    expect(publicTenderSource("cleaning-for-us-embassy-cb-pw-24-01234567").key).toBe("canadabuys");
  });

  it("keeps the newest notice per solicitation", () => {
    const a = row({ NoticeId: "a".repeat(32), PostedDate: "2026-09-01 00:00:00" });
    const b = row({ NoticeId: "b".repeat(32), PostedDate: "2026-09-12 00:00:00" });
    expect(dedupeSam([a, b]).map((r) => r.NoticeId)).toEqual(["b".repeat(32)]);
  });

  it("streams quoted CSV across chunk boundaries", async () => {
    const csv = 'NoticeId,Title,Description\r\n"1","Roof, flat","Line one\nline ""two"""\r\n"2","HVAC","x"\r\n';
    const bytes = new TextEncoder().encode(csv);
    // Split at every awkward spot: inside quotes, between "" escapes, mid-CRLF.
    for (const size of [1, 2, 3, 5, 7]) {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size));
          c.close();
        },
      });
      const rows = await streamCsv(body, () => true);
      expect(rows).toEqual([
        { NoticeId: "1", Title: "Roof, flat", Description: 'Line one\nline "two"' },
        { NoticeId: "2", Title: "HVAC", Description: "x" },
      ]);
    }
  });

  it("decodes Windows-1252 punctuation", async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode("Title\r\nTree Removal "), 0x96, ...new TextEncoder().encode(" USDA\r\n")]);
    const body = new ReadableStream<Uint8Array>({ start: (c) => (c.enqueue(bytes), c.close()) });
    expect((await streamCsv(body, () => true))[0].Title).toBe("Tree Removal – USDA");
  });
});

describe("regions", () => {
  const tree = [
    { id: "ca", parent_id: null },
    { id: "on", parent_id: "ca" },
    { id: "gta", parent_id: "on" },
    { id: "tor", parent_id: "gta" },
    { id: "us", parent_id: null },
    { id: "tx", parent_id: "us" },
  ];
  it("a region covers everything under it", () => {
    expect([...expandRegionIds(["on"], tree)].sort()).toEqual(["gta", "on", "tor"]);
    expect([...expandRegionIds(["us"], tree)].sort()).toEqual(["tx", "us"]);
    expect([...expandRegionIds(["tor"], tree)]).toEqual(["tor"]);
  });
  it("names U.S. state regions to match the migration", () => {
    expect(usStateRegionSlug("NY")).toBe("us-new-york");
    expect(usStateRegionSlug("District of Columbia")).toBe("us-district-of-columbia");
    expect(usStateRegionSlug("ON")).toBeNull();
    expect(isUsState("Texas")).toBe(true);
    expect(isUsState("TX")).toBe(true);
    expect(isUsState("Ontario")).toBe(false);
  });
});

describe("RFP Writer outside Canada", () => {
  it("swaps Canadian terms for a U.S. property only", () => {
    const text = "- WSIB clearance certificate in good standing (or provincial WCB equivalent).\n- TSSA or provincial equivalent for gas-fired equipment.";
    expect(localize(text, { province: "Ontario" })).toBe(text);
    const us = localize(text, { province: "Texas" });
    expect(us).not.toMatch(/WSIB|TSSA|provincial/);
    expect(us).toContain("workers' compensation coverage as required by state law");
  });

  it("writes a U.S. RFP with USD and no WSIB", () => {
    const input = wizardInputSchema.parse({
      tradeSlug: "roofing",
      tradeName: "Roofing",
      description: "Replace the flat roof on a 3-storey office building.",
      city: "Austin",
      province: "Texas",
      timing: "1-3-months",
      contractType: "project",
      bidDeadline: "2026-10-30",
      insurance: "2m",
      priority: "balanced",
      siteVisit: false,
      budgetMin: 100000,
      budgetMax: 150000,
    });
    const rfp = composeRfp(input);
    const all = [rfp.scope, rfp.requirements, rfp.submissionInstructions].join("\n");
    expect(all).not.toMatch(/WSIB|TSSA|\bESA\b|CAD/);
    expect(rfp.submissionInstructions).toContain("USD, before tax");
  });
});
