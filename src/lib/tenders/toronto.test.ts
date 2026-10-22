import { describe, expect, it } from "vitest";
import { classifyToronto, torontoLead, torontoTitle, torontoToRfpInsert, type TorontoRow } from "./toronto";

const TODAY = "2026-10-18";

// Shaped like rows of the CKAN dump (f676f46c…): real-looking boilerplate
// openings, U+FFFD where the feed lost curly quotes and bullets.
const row = (category: string, description: string, extra: Partial<TorontoRow> = {}): TorontoRow => ({
  "Document Number": "5800000001",
  "RFx (Solicitation) Type": "RFT",
  "Issue Date": "2026-10-01",
  "Submission Deadline": "2026-11-10",
  "High Level Category": category,
  "Solicitation Document Description": description,
  Division: "Corporate Real Estate Management",
  "Buyer Name": "Jane Buyer",
  "Buyer Email": "jane.buyer@toronto.ca",
  ...extra,
});

const C = "Construction Services";
const G = "Goods and Services";
const P = "Professional Services";

describe("Toronto open bids: construction services", () => {
  it("strips RFT boilerplate and reads a multi-trade SOGR job as general contracting first", () => {
    const r = row(
      C,
      "This Request for Tender (RFT) includes multiple State of Good Repair (SOGR) and capital construction projects at various City of Toronto facilities. The Work generally includes general construction, selective demolition, architectural renovations, structural and concrete rehabilitation, asphalt paving, mechanical and HVAC system upgrades, building automation system (BAS) upgrades, electrical modifications, accessibility improvements, site works, testing, commissioning, and all associated work.",
    );
    expect(torontoTitle(r["Solicitation Document Description"])).toBe(
      "Multiple State of Good Repair (SOGR) and capital construction projects at various City of Toronto facilities",
    );
    const trades = classifyToronto(r, TODAY);
    expect(trades[0]).toBe("general-contracting");
    expect(trades).toContain("hvac");
    // "testing, commissioning, training" in the body must not trip EXCLUDE.
    expect(trades).not.toContain("demolition");
  });

  it("keeps an invitation-to-prospective-suppliers park build as landscaping", () => {
    const r = row(
      C,
      "This Request for Tender is an invitation by the City of Toronto to prospective Landscape General Contractor Suppliers for the construction of two parks, Dunkip Park and Six Points Expansion.",
    );
    expect(torontoTitle(r["Solicitation Document Description"])).toBe("Construction of two parks, Dunkip Park and Six Points Expansion");
    expect(classifyToronto(r, TODAY)).toEqual(["landscaping", "general-contracting"]);
  });

  it("does not read a facility name as the trade", () => {
    const r = row(
      C,
      "This nRFP is an invitation by the City of Toronto (the �City�) to prospective Suppliers (the �Supplier�) to submit Bids for Construction Services for Dufferin Waste Management Facility Office Building at Dufferin Yard, as further described in Part 3 (the \"Deliverables\")",
    );
    expect(torontoTitle(r["Solicitation Document Description"])).toBe(
      "Construction Services for Dufferin Waste Management Facility Office Building at Dufferin Yard",
    );
    expect(classifyToronto(r, TODAY)).toEqual(["general-contracting"]);

    const hvac = row(
      C,
      "The project generally consists of the replacement and renewal of the existing rooftop HVAC systems at York Civic Centre. The work includes the removal of two existing make-up air units.",
    );
    expect(classifyToronto(hvac, TODAY)).toEqual(["hvac"]);
  });

  it("titles a park job from the location sentence plus the work", () => {
    const r = row(
      C,
      "Clarinda Park is located at 31 Clarinda Dr, North York, ON M2K 2W4. It is a small park near Sheppard Avenue East and Leslie Street, featuring a children�s playground. The existing stairway connecting Clarinda Park to the East Don River trail has reached the end of its service life.  The successful Bidder shall provide all labor, materials, equipment, and services required to:  �\tDemolish and safely dispose of the existing pressure treated timber staircase structure. �\tSupply and install a new hot-dipped galvanized steel staircase supported by helical piles.",
    );
    expect(torontoTitle(r["Solicitation Document Description"])).toMatch(/^Clarinda Park: demolish and safely dispose of the existing/);
    expect(classifyToronto(r, TODAY)[0]).toBe("general-contracting");
  });

  it("keeps an RFSQ prequalification for construction management", () => {
    const r = row(
      C,
      "This Request for Supplier Qualifications (\"RFSQ\") is an invitation by the City of Toronto (\"the City\") to prospective Respondents to qualify on a Single Use Roster List (Prequalified List) with second-stage competition for future Work Assignment. This Prequalified List will determine future eligibility to provide Construction Management Services for Queen�s Park North Revitalization as further described in Part 5, Section 2.",
      { "RFx (Solicitation) Type": "RFSQ" },
    );
    expect(torontoTitle(r["Solicitation Document Description"])).toBe("Construction Management Services for Queens Park North Revitalization");
    expect(classifyToronto(r, TODAY)).toEqual(["general-contracting"]);
  });

  it("files site work and road resurfacing under concrete & asphalt", () => {
    const site = row(
      C,
      "SITE WORK � including but not limited to concrete paving, asphalt paving, play equipment, splash pad equipment, shade shelter, tree planting, site drainage, and site electrical as per the DRAWINGS and SPECIFICATIONS.",
    );
    expect(torontoTitle(site["Solicitation Document Description"])).toMatch(/^Site work: concrete paving, asphalt paving/);
    expect(classifyToronto(site, TODAY).slice(0, 2)).toEqual(["concrete-and-asphalt", "landscaping"]);

    const road = row(
      C,
      "Request for Tender for Resurfacing and Guide Rail Repairs on the Don Valley Parkway (DVP) and F.G. Gardiner Expressway (FGGE) in the City of Toronto",
    );
    expect(torontoTitle(road["Solicitation Document Description"])).toMatch(/^Resurfacing and Guide Rail Repairs on the Don Valley Parkway/);
    expect(classifyToronto(road, TODAY)).toEqual(["concrete-and-asphalt"]);
  });

  it("keeps fire alarm work with a numbered scope", () => {
    const r = row(
      C,
      "Relocate fire alarm sub-panel from the Stage Door on ground level to the basement Electrical room. 2. Replace existing fire alarm notification devices from bell to strobe and speaker throughout the facility",
    );
    expect(classifyToronto(r, TODAY)[0]).toBe("fire-safety");
  });

  it("defaults clear building work with no named trade to general contracting", () => {
    const r = row(C, "This RFQ is an invitation by the City of Toronto to prospective Suppliers to submit Bids for the accessibility improvements at Etobicoke Civic Centre.");
    expect(classifyToronto(r, TODAY)).toEqual(["general-contracting"]);
  });

  it("drops hard civil: culverts, watermains, bridges", () => {
    for (const d of [
      "Culvert Replacement of Baylawn Drive over East Highland Creek (ID 913) and Midland Avenue over East Highland Creek (ID 923)",
      "Request for Tenders (RFT) for Watermain Replacement and TTC Track Replacement on King Street West between Portland Street and Spadina Avenue.  Please review all documentation pertaining to the tender in the SAP Ariba publication",
      "The City of Toronto�s Engineering & Construction Services division is bringing forward a Request for Tenders for Rehabilitation of Bridge ID147 Don Mills Road over Metrolinx as further explained in the RFT documents.",
    ]) {
      expect(classifyToronto(row(C, d), TODAY)).toEqual([]);
    }
  });

  it("drops design services filed as construction, and rows with no scope", () => {
    expect(
      classifyToronto(row(C, "For the provision of detailed professional and technical landscape design services for improvements to the TCH Parkette in front of 1525 Dundas St W"), TODAY),
    ).toEqual([]);
    expect(classifyToronto(row(C, "See Part 3 � Specifications and Requirements for Deliverables"), TODAY)).toEqual([]);
  });
});

describe("Toronto open bids: goods, professional services, dates", () => {
  it("drops plain goods and fleet/equipment services", () => {
    for (const d of [
      "The RFQ is an invitation by the City of Toronto to prospective Suppliers to submit Bids for the Non-Exclusive Supply and Delivery of Bleach and Other Chemicals. The term of the Contract is to be a period of one (1) year.",
      "This Request for Quotation (the �RFQ�) is an invitation by the City of Toronto (the �City�) to prospective Suppliers to submit bids for the non-exclusive supply of labour, materials, parts, and equipment necessary to provide original equipment manufacturer (OEM) warranty and non-warranty services including inspections, scheduled maintenance, service, repair and parts and training for Bobcat Tractors, Utility Carts, Mowers",
      "This Notice of Intended Procurement (NOIP) is to notify Suppliers of the upcoming negotiated Request for Proposal (nRFP) for the manufacture, supply, installation, repair, refurbishment, and removal of street litter bins in the public right-of-way.",
      "Request for Quotations for temporary tents for Jack Layton ferry terminal and Centre Island ferry dock, for details please see Ariba Event.",
      "Request for Quotations for Confined Space Entry and Rescue Awareness Training for City of Toronto",
    ]) {
      expect(classifyToronto(row(G, d), TODAY)).toEqual([]);
    }
  });

  it("keeps a goods-and-services row whose work names a trade", () => {
    const r = row(G, "This RFQ is an invitation by the City of Toronto to prospective Suppliers to submit Bids for Janitorial and Custodial Cleaning Services at various Toronto Paramedic Services stations.");
    expect(torontoTitle(r["Solicitation Document Description"])).toBe("Janitorial and Custodial Cleaning Services at various Toronto Paramedic Services stations");
    expect(classifyToronto(r, TODAY)).toEqual(["cleaning-janitorial"]);
  });

  it("never imports professional services, even with a building word", () => {
    const r = row(P, "This RFP is an invitation by the City of Toronto to prospective suppliers to submit Bids for the R.C Harris Water Treatment Plant Flat Roof Replacement and Solar PV Design");
    expect(classifyToronto(r, TODAY)).toEqual([]);
    const architect = row(P, "This RFP is issued to hire an Architect as a prime consultant for the Albion pool and Health club SOGR and Net zero emission project");
    expect(classifyToronto(architect, TODAY)).toEqual([]);
  });

  it("drops closed solicitations", () => {
    const r = row(C, "The project generally consists of the replacement of the roof at Scarborough Civic Centre.", { "Submission Deadline": "2026-10-17" });
    expect(classifyToronto(r, TODAY)).toEqual([]);
  });
});

describe("torontoToRfpInsert", () => {
  it("keeps the -tor-<doc> slug marker and the ?doc= source url", () => {
    const r = row(C, "The project generally consists of the replacement and renewal of the existing rooftop HVAC systems at York Civic Centre.", {
      "Document Number": "5830241025",
    });
    const ins = torontoToRfpInsert(r, TODAY)!;
    expect(ins.title).toBe("Replacement and renewal of the existing rooftop HVAC systems at York Civic Centre");
    expect(ins.slug).toBe("replacement-and-renewal-of-the-existing-rooftop-hvac-systems-at-york-c-tor-5830241025");
    expect(ins.source_url).toMatch(/\?doc=5830241025$/);
    expect(ins.contact_email).toBeNull();
  });

  it("caps titles near 120 characters on a word boundary, never ending on a connector", () => {
    const t = torontoTitle(
      "This RFQ is an invitation by the City of Toronto to prospective Suppliers to submit Bids for the replacement of the exterior envelope and windows at the North York Central Library and adjoining civic buildings, including the parking structure and related site works.",
    )!;
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t.endsWith("…")).toBe(true);
    expect(t).not.toMatch(/(?:and|at|of|for|the|to|in|on|with|various)…$/i);
    expect(torontoLead("Request for Tenders (RFT) for Roof Replacement at Station 12. Please review all documentation")).toBe("Roof Replacement at Station 12");
  });
});
