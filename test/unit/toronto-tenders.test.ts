import { describe, expect, it } from "vitest";
import { classifyToronto, titleFromDescription, torontoToRfpInsert, type TorontoRow } from "@/lib/tenders/toronto";
import { publicTenderSource } from "@/lib/tenders/sources";

const TODAY = "2026-09-23";
const row = (description: string, over: Partial<Record<string, string>> = {}): TorontoRow =>
  ({
    "Document Number": "5864262590",
    "RFx (Solicitation) Type": "RFT",
    "Issue Date": "2026-09-10",
    "Submission Deadline": "2026-10-07",
    "High Level Category": "Construction Services",
    "Solicitation Document Description": description,
    Division: "Corporate Real Estate Management",
    "Buyer Name": "A Buyer",
    "Buyer Email": "buyer@toronto.ca",
    "Buyer Phone Number": "416-000-0000",
    ...over,
  }) as TorontoRow;

describe("titleFromDescription", () => {
  it("strips procurement boilerplate down to the actual work", () => {
    expect(titleFromDescription("The project generally consists of the replacement and renewal of the existing rooftop HVAC systems at York Civic Centre. More text.")).toBe(
      "Replacement and renewal of the existing rooftop HVAC systems at York Civic Centre",
    );
    expect(titleFromDescription('This nRFP is an invitation by the City of Toronto (the “City”) to prospective Suppliers (the “Supplier”) to submit Bids for Construction Services for Dufferin Waste Management Facility Office Building at Dufferin Yard.')).toBe(
      "Construction Services for Dufferin Waste Management Facility Office Building at Dufferin Yard",
    );
  });
});

describe("classifyToronto", () => {
  it("keeps building-trade work", () => {
    expect(classifyToronto(row("The project generally consists of the replacement and renewal of the existing rooftop HVAC systems at York Civic Centre."), TODAY)).toContain("hvac");
    expect(classifyToronto(row("Fabrication and Installation of Interior Wayfinding Signage", { "High Level Category": "Goods and Services" }), TODAY)).toEqual(["signage"]);
  });
  it("drops civil infrastructure, pure supply orders, professional services and closed calls", () => {
    expect(classifyToronto(row("Culvert Replacement of Baylawn Drive over East Highland Creek"), TODAY)).toEqual([]);
    expect(classifyToronto(row("Non-exclusive supply and delivery of Rock, Salt and De-Icer Products for the City", { "High Level Category": "Goods and Services" }), TODAY)).toEqual([]);
    expect(classifyToronto(row("Rooftop HVAC replacement", { "High Level Category": "Professional Services" }), TODAY)).toEqual([]);
    expect(classifyToronto(row("Rooftop HVAC replacement", { "Submission Deadline": "2026-09-01" }), TODAY)).toEqual([]);
  });
  it("keeps a 'supply of … maintenance services' contract", () => {
    expect(classifyToronto(row("Non-exclusive supply of landscape horticulture and green infrastructure maintenance services at medians", { "High Level Category": "Goods and Services" }), TODAY)).toContain("landscaping");
  });
});

describe("toronto rows", () => {
  it("builds an attributed, uniquely-sourced row the source helper recognises", () => {
    const ins = torontoToRfpInsert(row("Relocate fire alarm sub-panel from the Stage Door to the basement Electrical room."), TODAY)!;
    expect(ins.slug).toMatch(/-tor-5864262590$/);
    expect(ins.source_url).toContain("?doc=5864262590");
    expect(ins.source_notes).toContain("Open Government Licence – Toronto");
    expect(publicTenderSource(ins.slug).key).toBe("toronto");
    expect(publicTenderSource("roof-repairs-standing-offer-cb-ws123").key).toBe("canadabuys");
  });
});
