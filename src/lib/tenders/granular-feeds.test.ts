import { describe, expect, it } from "vitest";
import { classifyNcEvp, gridConfig, ncAgency, ncDate, ncEvpBid, ncEvpToRfpInsert, type GridRecord } from "./nc-evp";
import { classifyScbo, parseScboPage, scboDate, scboEditionDate, scboToRfpInsert } from "./scbo";
import { classifyLaCity, laCityTitle, laCityToRfpInsert, type LaCityRow } from "./la-city";
import { publicTenderSource } from "./sources";
import { publishedAt, tradesFor } from "./shared";

const today = "2026-10-09";

describe("shared helpers", () => {
  it("falls back to general contracting when the title names the building, not the trade", () => {
    expect(tradesFor("fire station ii bathroom renovations")).toEqual(["general-contracting"]);
    expect(tradesFor("health care education building- new construction")).toEqual(["general-contracting"]);
    expect(tradesFor("cliffdale library boiler replacement")).toEqual(["hvac"]);
    expect(tradesFor("athletic insurance")).toEqual([]);
  });
  it("dates old notices by their own publish date, fresh ones as today", () => {
    expect(publishedAt("2026-09-01", today)).toBe("2026-09-01T00:00:00Z");
    expect(publishedAt("2026-10-08", today)).toBe("2026-10-09T00:00:00Z");
    expect(publishedAt(null, today)).toBe("2026-10-09T00:00:00Z");
  });
});

function gridRecord(attrs: Record<string, string>, id = "531901d7-55c3-f111-aaae-001dd80d92a5"): GridRecord {
  return { Id: id, Attributes: Object.entries(attrs).map(([Name, DisplayValue]) => ({ Name, DisplayValue })) };
}

describe("NC eVP", () => {
  const boiler = gridRecord({
    evp_solicitationnbr: "IFB 2026-068",
    evp_name: "IFB 2026-068 IFB Detention Center Boilers Replacement",
    evp_description: "Union County seeks bids to replace two boilers at the detention center.",
    evp_opendate: "10/20/2026 2:00 PM",
    evp_posteddate: "9/21/2026",
    statuscode: "Open",
    owningbusinessunit: "COUNTY OF UNION",
  });

  it("reads a grid record", () => {
    const b = ncEvpBid(boiler)!;
    expect(b.closing).toBe("2026-10-20");
    expect(b.posted).toBe("2026-09-21");
    expect(b.agency).toBe("COUNTY OF UNION");
    expect(ncDate("11/3/2026 2:00 PM")).toBe("2026-11-03");
    expect(ncEvpBid({ Id: "not-a-guid", Attributes: [] })).toBeNull();
  });

  it("keeps building work and drops plant, design and supply calls", () => {
    expect(classifyNcEvp(ncEvpBid(boiler)!, today)).toEqual(["hvac"]);
    const bid = (name: string, extra: Record<string, string> = {}) =>
      ncEvpBid(gridRecord({ evp_name: name, evp_opendate: "10/30/2026 2:00 PM", statuscode: "Open", ...extra }))!;
    expect(classifyNcEvp(bid("Janitorial Services - Waynesville"), today)).toEqual(["cleaning-janitorial"]);
    expect(classifyNcEvp(bid("RFQ Advertisement - Hal Marshall Center - HVAC Replacement-Engineering Design"), today)).toEqual([]);
    expect(classifyNcEvp(bid("HVAC Components, Parts & Supplies-27"), today)).toEqual([]);
    expect(classifyNcEvp(bid("Neuse River Resource Recovery Facility BNR Basins MCC Replacement"), today)).toEqual([]);
    expect(classifyNcEvp(bid("Roof Replacement", { statuscode: "Awarded" }), today)).toEqual([]);
    expect(classifyNcEvp(bid("Roof Replacement", { evp_opendate: "10/1/2026 2:00 PM" }), today)).toEqual([]);
  });

  it("maps to an rfp row that links to the official eVP notice", () => {
    const row = ncEvpToRfpInsert(ncEvpBid(boiler)!, today)!;
    expect(row.source_url).toBe("https://evp.nc.gov/solicitations/details/?id=531901d7-55c3-f111-aaae-001dd80d92a5");
    expect(row.slug).toMatch(/-ncevp-531901d755c3f111aaae001dd80d92a5$/);
    expect(row.province).toBe("North Carolina");
    expect(row.deadline).toBe("2026-10-20");
    expect(row.summary).toContain("County of Union");
    expect(publicTenderSource(row.slug).key).toBe("nc-evp");
  });

  it("title-cases capitalised agency names", () => {
    expect(ncAgency("UNC - SYSTEM OFFICE DESIGN/CONSTRUCTION")).toBe("UNC - System Office Design/Construction");
    expect(ncAgency("Wake County")).toBe("Wake County");
  });

  it("reads the grid configuration the list page embeds", () => {
    const b64 = Buffer.from(JSON.stringify([{ Base64SecureConfiguration: "abc123" }])).toString("base64");
    expect(gridConfig(`<div data-view-layouts="${b64.replace(/\+/g, "&#43;")}"></div>`)).toBe("abc123");
    expect(gridConfig("<div></div>")).toBeNull();
  });
});

const cell = (label: string, value: string) =>
  `<div class="adata_itm dta10 blu"><b>${label}:</b></div><div class="adata_itm dta25"><div style="margin-right:0.5%">${value}</div></div>`;

const constructionAd = (id: number, name: string, due: string) =>
  `<div class="adata"><div class="adata_rw"><div class="adata_itm dta10 dblu"><b>Project Name:</b></div><div class="adata_itm dta40"><div style="margin-right:0.5%">${name} </div></div>` +
  cell("Agency/Owner", "Rock Hill School District 3") +
  `<div class="adata_itm dta10 blu"><b>Ad Publish Date:</b></div><div class="adata_itm dta15" style="color:#FF0000;">September 23, 2026</div>` +
  `<div class="adata_itm dta10 blu"><b>Project Number:</b></div><div class="adata_itm dta25">R26CTL-069</div>` +
  `<div class="adata_itm dta13 blu"><b>Bid/Submittal Date & Time:</b></div><div class="adata_itm dta15" style="color:#FF0000;">${due}</div>` +
  cell("Project Location", "2503 W Main St, Rock Hill , SC 29732") +
  `<div class="adata_itm dta20 blu"><b>Agency Project Coordinator:</b></div><div class="adata_itm dta30">REI Engineers </div>` +
  `<div class="adata_itm dta8 blu"><b>Email:</b></div><div class="adata_itm dta22"><a href="mailto:&#97;&#119;">awarmuth@reiengineers.com</a></div>` +
  `<div class="adata_itm dta8 blu"><b>Telephone:</b></div><div class="adata_itm dta12">864-270-6140</div>` +
  `<div class="adata_itm mid3 dta10 blu"><div style="margin-right:0.5%"><b>Description:</b></div></div><div class="adata_itm mid3 dta90"><div style="margin-right:0.5%">Partial roof replacement &amp; flashing.</div></div>` +
  `<div class="adata_itm dta20 blu"><b>Project Details:</b></div><div class="adata_itm dta70">n/a</div><div class="adata_itm dta10 blu aprnt"><a href="/printad?a=${id}" target="_blank"> Print Ad</a></div></div></div>`;

const servicesAd = (id: number, title: string, due: string) =>
  `<div class="adata"><div class="adata_itm dta10 dblu"><b>Ad Title:</b></div><div class="adata_itm dta40"><div style="margin-right:0.5%">${title}</div></div>` +
  cell("Purchasing Agent/Entity", "Richland School District Two") +
  `<div class="adata_itm dta10 blu"><b>Ad Publish Date:</b></div><div class="adata_itm dta15">September 30, 2026</div>` +
  cell("Solicitation #", "RFP 26-114") +
  `<div class="adata_itm dta13 blu"><b>Bid/Submittal Due Date:</b></div><div class="adata_itm dta15">${due}</div>` +
  cell("Direct Inquiries To", "Jane Buyer") +
  cell("Buyer Email", "jbuyer@richland2.org") +
  cell("Buyer Phone#", "803-555-0100") +
  `<a href="/printad?a=${id}">Print Ad</a></div>`;

describe("SCBO", () => {
  const page =
    `<html><a href="/online-edition?c=3-2026-10-08">121 ads</a>` +
    constructionAd(69032, "Northwester High School Roof Replacement", "October 14, 2026 - 2:00pm") +
    constructionAd(69408, "13-26/27 Old Spring Road - Roadway Surface Treatment", "October 22, 2026 - 2:00pm") +
    constructionAd(68700, "Gym Roof Replacement", "October 1, 2026 - 2:00pm") +
    `</html>`;

  it("parses construction-layout ads", () => {
    const ads = parseScboPage(page, 3);
    expect(ads).toHaveLength(3);
    expect(ads[0]).toMatchObject({
      id: "69032",
      title: "Northwester High School Roof Replacement",
      agency: "Rock Hill School District 3",
      number: "R26CTL-069",
      closing: "2026-10-14",
      posted: "2026-09-23",
      contactEmail: "awarmuth@reiengineers.com",
      contactPhone: "864-270-6140",
      description: "Partial roof replacement & flashing.",
    });
    expect(scboEditionDate(page)).toBe("2026-10-08");
    expect(scboDate("December 29, 2026 - 2:00 PM")).toBe("2026-12-29");
  });

  it("parses services-layout ads", () => {
    const [ad] = parseScboPage(servicesAd(69310, "Pest Control Services", "October 30, 2026 - 11:00am"), 11);
    expect(ad).toMatchObject({ id: "69310", agency: "Richland School District Two", number: "RFP 26-114", closing: "2026-10-30", contactName: "Jane Buyer" });
    expect(classifyScbo(ad, today)).toEqual(["pest-control"]);
  });

  it("keeps building work, drops roads and closed ads", () => {
    const [roof, road, closed] = parseScboPage(page, 3);
    expect(classifyScbo(roof, today)).toEqual(["roofing"]);
    expect(classifyScbo(road, today)).toEqual([]);
    expect(classifyScbo(closed, today)).toEqual([]);
    const [rec] = parseScboPage(constructionAd(69349, "HVAC System Replacement for North Road Recreation Complex", "November 6, 2026 - 2:00pm"), 8);
    expect(classifyScbo(rec, today)).toEqual(["hvac"]);
  });

  it("maps to an rfp row that links to the SCBO ad", () => {
    const row = scboToRfpInsert(parseScboPage(page, 3)[0], today)!;
    expect(row.source_url).toBe("https://scbo.sc.gov/printad?a=69032");
    expect(row.slug).toMatch(/-scbo-69032$/);
    expect(row.province).toBe("South Carolina");
    expect(row.contact_email).toBe("awarmuth@reiengineers.com");
    expect(row.published_at).toBe("2026-09-23T00:00:00Z");
    expect(publicTenderSource(row.slug).key).toBe("scbo");
  });
});

describe("LA City RAMP", () => {
  const row = (title: string, extra: Partial<LaCityRow> = {}): LaCityRow => ({
    rampid: "53514",
    title,
    stagename: "Open",
    category: "Construction",
    type: "IFB - Invitation for Bid",
    bidpost: "2026-09-25T07:00:00.000",
    closedate: "2026-10-20T21:00:00.000",
    department: "LAUSD",
    url: { url: "https://www.rampla.org/s/opportunity-details?id=006Ql00000lhRDBIA2" },
    ...extra,
  });

  it("cleans RAMP title prefixes", () => {
    expect(laCityTitle("FORMAL - 2710056 Brockton ES - Roofing")).toBe("Brockton ES - Roofing");
    expect(laCityTitle("2027PS001 - Campus-Wide Fire Alarm System Replacement")).toBe("Campus-Wide Fire Alarm System Replacement");
  });

  it("keeps City building work and skips County duplicates, supplies and streets", () => {
    expect(classifyLaCity(row("FORMAL - 2710056 Brockton ES - Roofing"), today)).toEqual(["roofing"]);
    expect(classifyLaCity(row("Harbor Riviera Balcony Upgrades", { department: "Housing Authority, City of Los Angeles" }), today)).toEqual(["general-contracting"]);
    expect(classifyLaCity(row("RFB-IS-27200224 - ROOF REPAIR - FS 77", { department: "Los Angeles County" }), today)).toEqual([]);
    expect(classifyLaCity(row("146378 SYSTEMS, BUILDING", { category: "Commodity" }), today)).toEqual([]);
    expect(classifyLaCity(row("SIDEWALK REPAIR PROGRAM PACKAGE NO. 89"), today)).toEqual([]);
    expect(classifyLaCity(row("Online Bidding Practice", { closedate: "2037-06-30T20:00:00.000" }), today)).toEqual([]);
  });

  it("maps to an rfp row that links to RAMP", () => {
    const r = laCityToRfpInsert(row("FORMAL - 2710056 Brockton ES - Roofing"), today)!;
    expect(r.title).toBe("Brockton ES - Roofing");
    expect(r.slug).toMatch(/-lacr-53514$/);
    expect(r.source_url).toContain("rampla.org");
    expect(publicTenderSource(r.slug).key).toBe("la-city");
  });
});
