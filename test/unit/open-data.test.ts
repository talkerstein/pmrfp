import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TORONTO_ATTRIBUTION } from "@/lib/data/toronto-awards";
import { OGL_CANADA_ATTRIBUTION } from "@/lib/tenders/sources";
import { prepareAwards, applyHistory } from "@/lib/contract-history/sync";
import { validateAward } from "@/lib/contract-history/model";
import { businessKey, businessOnly } from "@/lib/open-data/business-name.mjs";
import { csvRecords, parseCsvText } from "@/lib/open-data/csv-rows.mjs";
import { FEDERAL_MIN_VALUE, classifyFederal, federalSeedRow, keepLatest, type FederalSeedRow } from "@/lib/open-data/federal-filter.mjs";
import { federalSeedToAward } from "@/lib/open-data/federal-load";
import { OGL_CALGARY, OGL_CANADA, OGL_TORONTO, OGL_VANCOUVER } from "@/lib/open-data/attribution";
import { PERMIT_MIN_VALUE_CAD, foldPermits, permitDate, permitValue, permitWindowStart, toPermitLead } from "@/lib/open-data/permits";
import { ARCGIS_CITIES, arcgisCity, queryUrl, rawPermits, whereClause } from "@/lib/open-data/arcgis-permits";
import { CALGARY_ASK, CALGARY_TOP_N, CALGARY_TRADES, calgaryUrl, parseCalgaryTop } from "@/lib/open-data/calgary";
import { parseTorontoNonCompetitive, parseTorontoPipeline } from "@/lib/open-data/toronto";
import { parseVancouverAwards, parseVancouverPermits, vancouverRecords, VANCOUVER_ATTRIBUTION } from "@/lib/open-data/vancouver";
import { OPEN_DATA_SOURCES, allEstimates } from "@/lib/open-data/sources";
import { DB_BUDGET_BYTES, ROW_BYTES, assertRunWithinEstimate, assertWithinBudget, estimateBytes, measureRowBytes, totalEstimateBytes } from "@/lib/open-data/size-budget";
import { writeContractorActivity, writePermitLeads, writePlannedProcurements } from "@/lib/open-data/store";
import { creditFor } from "@/lib/data-credits";
import { fakeDb } from "./fake-supabase";

const FIX = join(process.cwd(), "test/unit/fixtures/open-data");
const json = <T = unknown>(f: string) => JSON.parse(readFileSync(join(FIX, f), "utf8")) as T;
const TODAY = "2026-10-23";

describe("business names only (the licence excludes personal information)", () => {
  it("keeps businesses, with the suffix or business word that proves it", () => {
    expect(businessOnly("GUILD ELECTRIC LTD.")).toBe("Guild Electric Ltd.");
    expect(businessOnly("1234567 ALBERTA LTD")).toBe("1234567 Alberta Ltd");
    expect(businessOnly("KS PLUMBING & RENOVATION")).toBe("KS Plumbing & Renovation");
    expect(businessOnly("CUSTOM MECHANICAL HEATING AB")).toBe("Custom Mechanical Heating AB");
    expect(businessOnly("Studio Homes 2021 Inc.")).toBe("Studio Homes 2021 Inc.");
    expect(businessOnly("K D S CONSTRUCTION LTD")).toBe("K D S Construction Ltd");
  });

  it("drops people, placeholders and contact details", () => {
    for (const x of ["JOHN SMITH", "Smith, John A.", "Marie-Ève Tremblay", "Homeowner", "owner", "N/A", "Pomerleau", "info@acme.ca", "604-555-1234", "123 Main St Contracting", "", null, undefined]) {
      expect(businessOnly(x), String(x)).toBeNull();
    }
  });

  it("uses the first line only (a feed that appends the street address) and the trading name after dba", () => {
    expect(businessOnly("Natt Star Homes Ltd\n9328 127 St\nSurrey, British Columbia, Canada, V3V 6C5")).toBe("Natt Star Homes Ltd");
    expect(businessOnly("John Smith dba Smith Roofing")).toBe("Smith Roofing");
    expect(businessOnly("John Smith o/a Jane Doe")).toBeNull();
  });

  it("documents the known false positive: a person's trade name with a business word passes", () => {
    // Counsel item: "Bob Plumbing" is a published business name that identifies a person.
    expect(businessOnly("Bob Plumbing")).toBe("Bob Plumbing");
  });

  it("groups spelling variants", () => {
    expect(businessKey("GUILD ELECTRIC LTD.")).toBe(businessKey("Guild Electric Limited"));
  });
});

describe("streaming CSV reader", () => {
  it("handles quotes, embedded newlines, a BOM and chunk boundaries", async () => {
    const text = '﻿a,b,c\r\n1,"x, ""y""",3\r\n"multi\nline",5,\r\n';
    const bytes = new TextEncoder().encode(text);
    const chunks = [bytes.slice(0, 7), bytes.slice(7, 19), bytes.slice(19)];
    const out: Record<string, string>[] = [];
    for await (const r of csvRecords(chunks)) out.push(r);
    expect(out).toEqual([
      { a: "1", b: 'x, "y"', c: "3" },
      { a: "multi\nline", b: "5", c: "" },
    ]);
    expect(await parseCsvText("a;b\n1;2\n", { delimiter: ";" })).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("federal contracts over $10,000 (CA-F06): the filter", () => {
  const rows = async () => await parseCsvText(readFileSync(join(FIX, "federal-contracts.csv"), "utf8"));

  it("keeps only building / property work of $50,000 or more", async () => {
    const all = await rows();
    expect(all.length).toBe(13);
    const results = all.map((r) => ({ r, out: federalSeedRow(r, { today: TODAY }) }));
    const kept = results.filter((x) => !("skip" in x.out));
    const skipped = results.filter((x) => "skip" in x.out);
    expect(kept.length).toBe(8);
    for (const { r, out } of kept) {
      expect(Number(r.contract_value)).toBeGreaterThanOrEqual(FEDERAL_MIN_VALUE);
      expect(r.commodity_type).not.toBe("G");
      const row = out as FederalSeedRow;
      expect(row.source_key).toMatch(/^[^|]+\|.+/);
      expect(row.value).toBeGreaterThanOrEqual(FEDERAL_MIN_VALUE);
    }
    const why = Object.fromEntries(skipped.map((x) => [`${x.r.commodity_type}|${(x.r.description_en ?? "").replace(/^\d+\s+/, "").slice(0, 28)}`, (x.out as { skip: string }).skip]));
    // The traps: lab EQUIPMENT, software licences, goods, civil works and a small building contract.
    expect(Object.values(why)).toEqual(expect.arrayContaining(["equipment-software-or-civil", "goods", "below-50k", "not-building-work"]));
    expect(skipped.some((x) => /Measuring, controlling, laboratory/i.test(x.r.description_en))).toBe(true);
    expect(skipped.some((x) => /License\/Maintenance fees/i.test(x.r.description_en))).toBe(true);
    expect(skipped.some((x) => /Civil/i.test(x.r.description_en))).toBe(true);
  });

  it("classifies the object-code families", () => {
    const base = { contract_value: "120000", commodity_type: "S" };
    expect(classifyFederal({ ...base, description_en: "0811 Contracted building cleaning" })).toMatchObject({ trades: ["cleaning-janitorial"] });
    expect(classifyFederal({ ...base, description_en: "Construction Works - Buildings" })).toMatchObject({ trades: ["general-contracting"] });
    expect(classifyFederal({ ...base, economic_object_code: "1364", commodity_type: "C", description_en: "Laboratories" })).toMatchObject({ trades: ["general-contracting"] });
    expect(classifyFederal({ ...base, description_en: "0656 Heating, air-conditioning and refrigeration equipment" })).toMatchObject({ trades: ["hvac"] });
    expect(classifyFederal({ ...base, description_en: "0859 Other business services, not elsewhere specified", comments_en: "Snow removal for the winter season" })).toMatchObject({ trades: ["snow-removal"] });
    // Not building work:
    expect(classifyFederal({ ...base, description_en: "0859 Other business services, not elsewhere specified", comments_en: "Management consulting" })).toEqual({ skip: "not-building-work" });
    expect(classifyFederal({ ...base, description_en: "0583 License/Maintenance fees for application software" })).toMatchObject({ skip: expect.any(String) });
    expect(classifyFederal({ ...base, commodity_type: "G", description_en: "Construction Works - Buildings" })).toEqual({ skip: "goods" });
    expect(classifyFederal({ ...base, commodity_type: "C", description_en: "Highways, roads and streets" })).toMatchObject({ skip: "equipment-software-or-civil" });
    expect(classifyFederal({ ...base, contract_value: "49999.99", description_en: "Construction Works - Buildings" })).toEqual({ skip: "below-50k" });
    expect(classifyFederal({ ...base, description_en: "Rental of other buildings" })).toMatchObject({ skip: expect.any(String) });
  });

  it("flags sole-source rows and withholds an individual vendor", () => {
    const r = { contract_value: "90000", commodity_type: "C", description_en: "Other Institutional buildings", contract_date: "2025-03-01", owner_org: "dnd-mdn", procurement_id: "P1", vendor_name: "JOHN SMITH", solicitation_procedure: "TN", reporting_period: "2024-2025-Q4" };
    const out = federalSeedRow(r, { today: TODAY }) as FederalSeedRow;
    expect(out.vendor).toBeNull();
    expect(out.vendor_is_individual).toBe(true);
    expect(out.non_competitive).toBe(true);
    expect(out.procurement_method).toBe("non-competitive");
    expect(JSON.stringify(out)).not.toMatch(/SMITH/i);
  });

  it("keeps the newest reporting period per contract (idempotent with the monthly cron)", () => {
    const map = new Map<string, FederalSeedRow>();
    const mk = (period: string, value: number) => ({ source_key: "dnd|P1", period, value }) as FederalSeedRow;
    expect(keepLatest(map, mk("2024-2025-Q2", 60000))).toBe(true);
    expect(keepLatest(map, mk("2024-2025-Q4", 80000))).toBe(true);
    expect(keepLatest(map, mk("2024-2025-Q3", 70000))).toBe(false);
    expect(map.get("dnd|P1")?.value).toBe(80000);
  });

  it("loads into award_history rows that validate, with the OGL-Canada credit", async () => {
    const all = await rows();
    const seeds = all.map((r) => federalSeedRow(r, { today: TODAY })).filter((x): x is FederalSeedRow => !("skip" in x));
    const awards = seeds.map((s) => federalSeedToAward(s, TODAY));
    for (const a of awards) {
      expect(validateAward(a), a.title).toBeNull();
      expect(a.source).toBe("ca-federal-contracts");
      expect(a.attribution).toBe(OGL_CANADA_ATTRIBUTION);
      expect(a.currency).toBe("CAD");
    }
    const { rows: prepared } = prepareAwards(awards);
    expect(prepared.length).toBe(new Set(awards.map((a) => a.source_key)).size);
  });
});

describe("permit leads: 24 months, >= $100K, business contractor", () => {
  const raw = (over: Record<string, unknown> = {}) => ({ source: "permits-lead-test", id: "P-1", city: "Testville", province: "Ontario", issued: "2026-05-01", value: 250_000, contractor: "Acme Roofing Ltd", workType: "New", ...over });

  it("accepts a good row", () => {
    expect(toPermitLead(raw(), TODAY)).toMatchObject({ source_key: "P-1", issued_on: "2026-05-01", value_cad: 250000, contractor: "Acme Roofing Ltd", as_of: TODAY });
  });

  it("applies each filter", () => {
    expect(toPermitLead(raw({ value: 99_999 }), TODAY)).toBe("below-min-value");
    expect(toPermitLead(raw({ value: PERMIT_MIN_VALUE_CAD }), TODAY)).toMatchObject({ value_cad: 100000 });
    expect(toPermitLead(raw({ value: null }), TODAY)).toBe("no-value");
    expect(toPermitLead(raw({ issued: "2024-10-22" }), TODAY)).toBe("too-old");
    expect(toPermitLead(raw({ issued: "2024-10-23" }), TODAY)).toMatchObject({ issued_on: "2024-10-23" });
    expect(toPermitLead(raw({ issued: "2027-01-01" }), TODAY)).toBe("future-date");
    expect(toPermitLead(raw({ issued: "garbage" }), TODAY)).toBe("no-date");
    expect(toPermitLead(raw({ contractor: "JOHN SMITH" }), TODAY)).toBe("not-a-business");
    expect(toPermitLead(raw({ contractor: "Homeowner" }), TODAY)).toBe("not-a-business");
    expect(toPermitLead(raw({ id: "" }), TODAY)).toBe("no-id");
  });

  it("window start is exactly 24 months back", () => {
    expect(permitWindowStart(TODAY)).toBe("2024-10-23");
    expect(permitWindowStart(TODAY, 12)).toBe("2025-10-23");
  });

  it("reads every date and money format the feeds use", () => {
    expect(permitDate("20261015")).toBe("2026-10-15");
    expect(permitDate("2026-10-15T00:00:00")).toBe("2026-10-15");
    expect(permitDate(1760486400000)).toBe("2025-10-15");
    expect(permitDate("Oct 15, 2026")).toBe("2026-10-15");
    expect(permitDate("")).toBeNull();
    expect(permitValue("$1,234,500")).toBe(1234500);
    expect(permitValue(0)).toBeNull();
    expect(permitValue("n/a")).toBeNull();
  });

  it("keeps one lead per permit and counts why the rest were dropped", () => {
    const b = foldPermits([raw(), raw({ value: 300_000 }), raw({ id: "P-2", contractor: "JANE DOE" }), raw({ id: "P-3", value: 5 })], TODAY);
    expect(b.read).toBe(4);
    expect(b.leads).toHaveLength(1);
    expect(b.leads[0].value_cad).toBe(300000);
    expect(b.skipped).toEqual({ "not-a-business": 1, "below-min-value": 1 });
  });
});

describe("ArcGIS permit connector (5 pilot cities)", () => {
  const features = json<Record<string, { attributes: Record<string, unknown> }[]>>("arcgis-features.json");

  it("has exactly the five pilot cities, each with the fields it needs and a credit", () => {
    expect(ARCGIS_CITIES.map((c) => c.key)).toEqual(["surrey", "maple-ridge", "airdrie", "grande-prairie", "kitchener"]);
    for (const c of ARCGIS_CITIES) {
      expect(c.layerUrl).toMatch(/^https:\/\/.+\/(FeatureServer|MapServer)\/\d+$/);
      expect(c.attribution).toMatch(/^Contains information licensed under the Open Government Licen[cs]e/);
      expect(c.fields.value && c.fields.contractor && c.fields.issued && c.fields.id).toBeTruthy();
      expect(c.fields.workType.length).toBeGreaterThan(0);
    }
  });

  it("builds the server-side filter in each layer's own date type", () => {
    expect(whereClause(arcgisCity("surrey")!, TODAY, 100_000)).toBe("ValueOfConstruction >= 100000 AND IssuedDate >= '20241023'");
    expect(whereClause(arcgisCity("airdrie")!, TODAY, 100_000)).toBe("ConstructionValue >= 100000 AND DateIssued >= '2024-10-23'");
    expect(whereClause(arcgisCity("kitchener")!, TODAY, 100_000)).toBe("CONSTRUCTION_VALUE >= 100000 AND ISSUE_DATE >= timestamp '2024-10-23 00:00:00'");
    const url = queryUrl(arcgisCity("surrey")!, TODAY, 100_000, { offset: 1000 });
    expect(url).toContain("/query?");
    expect(url).toContain("resultOffset=1000");
    expect(url).toContain("returnGeometry=false");
    // Never reads an owner, applicant, address or description column.
    expect(decodeURIComponent(url)).not.toMatch(/outFields=[^&]*(Applicant|Owner|Address|ADDRESS|Description_)/i);
  });

  for (const c of ARCGIS_CITIES) {
    it(`${c.city}: real rows become leads with a business contractor, a value, a date and a work type`, () => {
      const f = features[c.key];
      expect(f.length).toBeGreaterThan(0);
      const raws = rawPermits(c, f);
      const batch = foldPermits(raws, TODAY);
      expect(batch.read).toBe(f.length);
      for (const l of batch.leads) {
        expect(l.city).toBe(c.city);
        expect(l.province).toBe(c.province);
        expect(l.value_cad).toBeGreaterThanOrEqual(100000);
        expect(l.issued_on >= permitWindowStart(TODAY) && l.issued_on <= TODAY).toBe(true);
        expect(l.contractor).not.toMatch(/\n/);
        expect(businessOnly(l.contractor)).not.toBeNull();
        expect(Object.keys(l).sort()).toEqual(["as_of", "city", "contractor", "contractor_key", "issued_on", "province", "source", "source_key", "value_cad", "work_type"]);
      }
    });
  }

  it("Surrey: the contractor field's address lines are never kept", () => {
    const l = foldPermits(rawPermits(arcgisCity("surrey")!, features.surrey), TODAY).leads;
    expect(l.length).toBeGreaterThan(0);
    for (const x of l) expect(x.contractor).not.toMatch(/Surrey|British Columbia|\d{2,}/);
  });
});

describe("Calgary trade permits: aggregates only", () => {
  const top = json<Record<string, { contractor?: string; permits: string }[]>>("calgary-top.json");

  it("asks Socrata for a per-trade group-by, with each dataset's own date column", () => {
    const dec = (u: string) => decodeURIComponent(u.replace(/\+/g, " "));
    const hvac = dec(calgaryUrl(CALGARY_TRADES[0], TODAY));
    expect(hvac).toContain("cdrc-r4u8.json");
    expect(hvac).toContain("count(distinct permitnum) AS permits");
    expect(hvac).toContain("permitissueddate >= '2025-10-23'");
    expect(hvac).toContain("$group=contractor");
    expect(hvac).toContain(`$limit=${CALGARY_ASK}`);
    expect(dec(calgaryUrl(CALGARY_TRADES[1], TODAY))).toContain("issueddate >= '2025-10-23'");
  });

  it("keeps the top businesses in order, drops blanks and individuals, never stores a value", () => {
    for (const t of CALGARY_TRADES) {
      const p = parseCalgaryTop(top[t.trade], t, TODAY);
      expect(p.rows.length).toBeGreaterThan(5);
      p.rows.forEach((r, i) => {
        expect(r.rank).toBe(i + 1);
        expect(r.trade_slug).toBe(t.trade);
        expect(r.declared_value_cad).toBeNull();
        expect(businessOnly(r.contractor)).not.toBeNull();
        expect(r.window_start).toBe("2025-10-23");
      });
      const counts = p.rows.map((r) => r.permits);
      expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    }
    // The blank contractor (homeowner permits) leads electrical and plumbing in the real data and is dropped.
    expect(top.electrical.some((r) => r.contractor === undefined)).toBe(true);
    expect(parseCalgaryTop(top.electrical, CALGARY_TRADES[1], TODAY).rows.every((r) => r.contractor.length > 2)).toBe(true);
  });

  it("caps at 50 per trade and merges spellings of one firm", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ contractor: `Firm ${i} Plumbing Ltd`, permits: String(500 - i) }));
    const p = parseCalgaryTop([...many, { contractor: "FIRM 0 PLUMBING LIMITED", permits: "3" }], CALGARY_TRADES[2], TODAY);
    expect(p.rows).toHaveLength(CALGARY_TOP_N);
    expect(p.rows.filter((r) => r.contractor_key === businessKey("Firm 0 Plumbing Ltd"))).toHaveLength(1);
  });
});

describe("Toronto (ON-T03 non-competitive, ON-T04 pipeline)", () => {
  it("flags every non-competitive award, keeps business suppliers and counts individuals unnamed", () => {
    const records = json<{ result: { records: Record<string, unknown>[] } }>("toronto-noncompetitive.json").result.records;
    const b = parseTorontoNonCompetitive([...records, { "Workspace Number": "9", Reason: "Sole source", "Contract Date": "2020-01-05", "Supplier Name": "JANE ROE", "Contract Amount": "60000", Division: "Parks" }], { asOf: TODAY });
    expect(b.awards.length).toBe(records.length + 1);
    for (const a of b.awards) {
      expect(a.non_competitive).toBe(true);
      expect(a.source).toBe("ca-toronto-noncompetitive");
      expect(a.attribution).toBe(TORONTO_ATTRIBUTION);
      expect(a.licence).toBe("Open Government Licence – Toronto");
      expect(a.procurement_method).toMatch(/^non-competitive/);
      expect(validateAward(a)).toBeNull();
    }
    const jane = b.awards.find((a) => a.source_key.startsWith("9|"))!;
    expect(jane.winner_business_name).toBeNull();
    expect(jane.winner_is_individual).toBe(true);
    expect(JSON.stringify(b.awards)).not.toMatch(/JANE ROE|Jane Roe/);
    expect(b.awards.find((a) => a.winner_business_name === "Accuworx Inc")?.value).toBeCloseTo(67896.4);
  });

  it("skips contracts dated in the future and undated rows", () => {
    const b = parseTorontoNonCompetitive(
      [
        { "Workspace Number": "1", "Contract Date": "2030-01-01", "Supplier Name": "Acme Roofing Ltd", "Contract Amount": "1000" },
        { "Workspace Number": "2", "Contract Date": "", "Supplier Name": "Acme Roofing Ltd", "Contract Amount": "1000" },
      ],
      { asOf: TODAY },
    );
    expect(b.awards).toHaveLength(0);
    expect(b.skipped).toEqual({ "future-date": 1, "no-date": 1 });
  });

  it("reads the capital project pipeline into planned procurements for the City of Toronto buyer page", () => {
    const records = json<{ result: { records: Record<string, unknown>[] } }>("toronto-pipeline.json").result.records;
    const p = parseTorontoPipeline(records, TODAY);
    expect(p.rows).toHaveLength(records.length);
    expect(p.rows[0]).toMatchObject({ buyer_key: "city of toronto", city: "Toronto", province: "Ontario", sourcing_year: 2026, sourcing_type: "RFP", estimated_range: "Up to $5M", term_months: 24, licence: TORONTO_ATTRIBUTION });
    expect(new Set(p.rows.map((r) => r.source_key)).size).toBe(p.rows.length);
  });
});

describe("Vancouver (BC-V01 awards, BC-V02 permits): local files, never fetched", () => {
  // Shaped from the catalogue's field list (opendata.vancouver.ca bars bots from /api/, so no live sample).
  const awardsCsv = [
    "bid_number;bid_type;bid_description;award_date;vendor_name;bid_amount;awarded",
    "ITT-2025-101;Construction;Roof replacement at Britannia Community Centre;2025-09-12;Apex Roofing Ltd;412000.00;true",
    "ITT-2025-101;Construction;Roof replacement at Britannia Community Centre;2025-09-12;Summit Roofing Inc.;455500.50;false",
    "ITT-2025-101;Construction;Roof replacement at Britannia Community Centre;2025-09-12;JOHN SMITH;470000;false",
    "ITT-2025-102;Services;HVAC maintenance for City facilities;2025-08-01;Northern Mechanical Ltd.;98000;true",
    "ITT-2025-103;Services;Janitorial services;2025-07-01;JANE ROE;50000;true",
    "ITT-2025-104;Goods;Office chairs;2025-07-01;Chairs Inc.;9000;false",
  ].join("\n");

  it("groups bidders into one award per solicitation: winner, amount, number of bidders, trade", async () => {
    const b = parseVancouverAwards(await vancouverRecords(awardsCsv), { asOf: TODAY });
    expect(b.read).toBe(6);
    expect(b.skipped).toEqual({ "not-awarded": 1 });
    const roof = b.awards.find((a) => a.source_key.startsWith("ITT-2025-101"))!;
    expect(roof).toMatchObject({ winner_business_name: "Apex Roofing Ltd", value: 412000, number_of_bids: 3, award_date: "2025-09-12", city: "Vancouver", province: "British Columbia", buyer: "City of Vancouver", attribution: VANCOUVER_ATTRIBUTION });
    expect(roof.trade_slugs).toContain("roofing");
    const hvac = b.awards.find((a) => a.source_key.startsWith("ITT-2025-102"))!;
    expect(hvac.trade_slugs).toContain("hvac");
    for (const a of b.awards) expect(validateAward(a), a.title).toBeNull();
  });

  it("stores every bidder's amount in rank order, and never names an individual bidder or winner", async () => {
    const b = parseVancouverAwards(await vancouverRecords(awardsCsv), { asOf: TODAY });
    const bids = b.bids.filter((x) => x.award_source_key.startsWith("ITT-2025-101"));
    expect(bids.map((x) => [x.rank, x.bid_amount, x.status_label])).toEqual([
      [1, 412000, "awarded"],
      [2, 455500.5, "not_awarded"],
      [3, 470000, "not_awarded"],
    ]);
    expect(bids[2].bidder_is_individual).toBe(true);
    expect(bids[2].bidder_business_name).toBeNull();
    const jane = b.awards.find((a) => a.source_key.startsWith("ITT-2025-103"))!;
    expect(jane.winner_is_individual).toBe(true);
    expect(JSON.stringify(b)).not.toMatch(/JOHN SMITH|JANE ROE/i);
  });

  it("accepts the API's JSON shape too and fails loudly on a missing column", async () => {
    const records = await vancouverRecords(JSON.stringify({ results: [{ bid_number: "X1", award_date: "2025-01-01", vendor_name: "Acme Roofing Ltd", bid_amount: 1000, awarded: "true", bid_description: "Roofing" }] }));
    expect(parseVancouverAwards(records, { asOf: TODAY }).awards).toHaveLength(1);
    expect(() => parseVancouverAwards([{ foo: "1" }], { asOf: TODAY })).toThrow(/missing column/);
  });

  const permitsCsv = [
    "permitnumber;issuedate;projectvalue;typeofwork;propertyuse;buildingcontractor;applicant;address",
    "BP-2026-1;2026-09-01;1250000;New Building;Multiple Dwelling;Concord Pacific Builders Ltd;Some Owner;100 Main St",
    "BP-2026-2;2026-09-02;50000;Addition / Alteration;Office;Acme Construction Ltd;X;1 Y St",
    "BP-2026-3;2026-09-03;300000;New Building;Dwelling Uses;JOHN SMITH;X;1 Y St",
    "BP-2022-4;2022-01-03;900000;New Building;Office;Old Builders Ltd;X;1 Y St",
  ].join("\n");

  it("keeps the last 24 months, >= $100K, business contractors only, and no address or applicant", async () => {
    const b = parseVancouverPermits(await vancouverRecords(permitsCsv), TODAY);
    expect(b.read).toBe(4);
    expect(b.leads).toHaveLength(1);
    expect(b.leads[0]).toMatchObject({ source_key: "BP-2026-1", city: "Vancouver", value_cad: 1250000, contractor: "Concord Pacific Builders Ltd", work_type: "New Building · Multiple Dwelling" });
    expect(b.skipped).toEqual({ "below-min-value": 1, "not-a-business": 1, "too-old": 1 });
    expect(JSON.stringify(b.leads)).not.toMatch(/Main St|Some Owner/);
  });
});

describe("idempotent writes", () => {
  const unique = { permit_leads: (e: Record<string, unknown>, i: Record<string, unknown>) => e.source === i.source && e.source_key === i.source_key };
  const lead = (id: string, issued: string, value = 200000) => ({ source: "permits-lead-test", source_key: id, city: "Testville", province: "Ontario", issued_on: issued, value_cad: value, contractor: "Acme Roofing Ltd", contractor_key: "acme roofing", work_type: null, as_of: TODAY });

  it("loading the same permits twice leaves one row each, and updates in place", async () => {
    const db = fakeDb({ permit_leads: [] }, { unique });
    await writePermitLeads(db as never, "permits-lead-test", [lead("A", "2026-01-01"), lead("B", "2026-02-01")], TODAY);
    await writePermitLeads(db as never, "permits-lead-test", [lead("A", "2026-01-01", 300000), lead("B", "2026-02-01")], TODAY);
    expect(db.tables.permit_leads).toHaveLength(2);
    expect(db.tables.permit_leads.find((r) => r.source_key === "A")?.value_cad).toBe(300000);
  });

  it("prunes permits that left the 24-month window, only for that source", async () => {
    const db = fakeDb({ permit_leads: [{ ...lead("OLD", "2024-01-01"), id: "1" }, { ...lead("OTHER", "2024-01-01"), source: "permits-lead-other", id: "2" }] }, { unique });
    await writePermitLeads(db as never, "permits-lead-test", [lead("NEW", "2026-06-01")], TODAY);
    expect(db.tables.permit_leads.map((r) => r.source_key).sort()).toEqual(["NEW", "OTHER"]);
  });

  it("replaces a trade's contractor list on refresh and the pipeline likewise", async () => {
    const act = (name: string, asOf: string) => ({ source: "calgary-trade-permits", city: "Calgary", province: "Alberta", trade_slug: "hvac", rank: 1, contractor: name, contractor_key: name.toLowerCase(), permits: 5, declared_value_cad: null, window_start: "2025-10-23", window_end: asOf, as_of: asOf });
    const db = fakeDb({ contractor_activity: [{ ...act("Gone Mechanical", "2026-09-23"), id: "g" }], planned_procurements: [{ source: "toronto-capital-pipeline", source_key: "old", as_of: "2026-09-23", id: "p" }] });
    await writeContractorActivity(db as never, [act("Drive Mechanical", TODAY)], TODAY);
    expect(db.tables.contractor_activity.map((r) => r.contractor)).toEqual(["Drive Mechanical"]);
    await writePlannedProcurements(db as never, [{ source: "toronto-capital-pipeline", source_key: "new", as_of: TODAY } as never], TODAY);
    expect(db.tables.planned_procurements.map((r) => r.source_key)).toEqual(["new"]);
  });

  it("award history upserts on (source, source_key): a re-run does not duplicate", async () => {
    const records = json<{ result: { records: Record<string, unknown>[] } }>("toronto-noncompetitive.json").result.records;
    const awards = parseTorontoNonCompetitive(records, { asOf: TODAY }).awards;
    const calls: unknown[][] = [];
    const store = new Map<string, unknown>();
    const db = {
      from: () => ({
        upsert: (rows: { source: string; source_key: string }[]) => {
          calls.push(rows);
          for (const r of rows) store.set(`${r.source}|${r.source_key}`, r);
          return { select: () => Promise.resolve({ data: rows.map((r, i) => ({ id: `id${i}`, source: r.source, source_key: r.source_key })), error: null }) };
        },
      }),
    };
    await applyHistory(db as never, awards, []);
    const first = store.size;
    await applyHistory(db as never, awards, []);
    expect(store.size).toBe(first);
    expect(first).toBe(prepareAwards(awards).rows.length);
  });
});

describe("attribution strings (each licence's own wording)", () => {
  it("match the credits the rest of the site already shows", () => {
    expect(OGL_CANADA).toBe(OGL_CANADA_ATTRIBUTION);
    expect(OGL_TORONTO).toBe(TORONTO_ATTRIBUTION);
    expect(OGL_VANCOUVER).toBe("Contains information licensed under the Open Government Licence – Vancouver.");
    expect(OGL_CALGARY).toBe("Contains information licensed under the Open Government Licence – City of Calgary.");
  });

  it("every source carries a credit and a licence, and the unread clauses are listed for counsel", () => {
    for (const s of OPEN_DATA_SOURCES) {
      expect(s.attribution.length, s.key).toBeGreaterThan(20);
      expect(s.licence.length, s.key).toBeGreaterThan(5);
      expect(s.url, s.key).toMatch(/^https:\/\//);
    }
    const unchecked = OPEN_DATA_SOURCES.filter((s) => !s.licenceChecked).map((s) => s.key);
    expect(unchecked).toEqual(expect.arrayContaining(["ca-vancouver-awards", "permits-lead-vancouver", "ca-toronto-noncompetitive", "toronto-capital-pipeline", "calgary-trade-permits"]));
    expect(OPEN_DATA_SOURCES.find((s) => s.key === "ca-federal-contracts")?.licenceChecked).toBe(true);
  });

  it("every credit has an English, French and Spanish version in the site's credit registry", () => {
    for (const s of OPEN_DATA_SOURCES) {
      const c = creditFor(s.attribution);
      expect(c, `no CREDITS entry for ${s.key}: ${s.attribution}`).not.toBeNull();
      expect(c!.fr).not.toBe(c!.en);
      expect(c!.es).not.toBe(c!.en);
    }
  });

  it("source keys are unique and match the database's key rule", () => {
    const keys = OPEN_DATA_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]{2,40}$/);
  });
});

describe("database size budget", () => {
  it("the whole batch is estimated well under 150 MB", () => {
    const total = assertWithinBudget(allEstimates());
    expect(total).toBe(totalEstimateBytes(allEstimates()));
    expect(total).toBeLessThan(DB_BUDGET_BYTES);
    expect(total).toBeLessThan(75_000_000);
  });

  it("the federal load is the biggest line and stays under 50 MB", () => {
    const fed = OPEN_DATA_SOURCES.find((s) => s.key === "ca-federal-contracts")!;
    expect(estimateBytes("award_history", fed.estimates[0].rows)).toBeLessThan(50_000_000);
  });

  it("refuses a batch that is over budget and a run far over its own estimate", () => {
    expect(() => assertWithinBudget([{ key: "huge", table: "award_history", rows: 200_000 }])).toThrow(/over its size budget/);
    expect(() => assertRunWithinEstimate("x", "permit_leads", 5_000, 1_000)).toThrow(/Tighten the filter/);
    expect(() => assertRunWithinEstimate("x", "permit_leads", 1_500, 1_000)).not.toThrow();
  });

  it("per-row byte figures cover real rows (heap + indexes) with room to spare", () => {
    const records = json<{ result: { records: Record<string, unknown>[] } }>("toronto-noncompetitive.json").result.records;
    const awards = parseTorontoNonCompetitive(records, { asOf: TODAY }).awards;
    for (const a of awards) expect(measureRowBytes(a as unknown as Record<string, unknown>, 450)).toBeLessThan(ROW_BYTES.award_history);
    const leads = foldPermits(rawPermits(arcgisCity("airdrie")!, json<Record<string, { attributes: Record<string, unknown> }[]>>("arcgis-features.json").airdrie), TODAY).leads;
    for (const l of leads) expect(measureRowBytes(l as unknown as Record<string, unknown>, 110)).toBeLessThan(ROW_BYTES.permit_leads);
  });

  it("each source's estimate matches what the pilot dry runs measured (24-month filtered)", () => {
    // Dry runs on 2026-10-23: Surrey 792, Maple Ridge 257, Airdrie 1,252, Grande Prairie 280, Kitchener 824 leads.
    const measured: Record<string, number> = { surrey: 792, "maple-ridge": 257, airdrie: 1252, "grande-prairie": 280, kitchener: 824 };
    for (const c of ARCGIS_CITIES) {
      expect(c.estimatedRows, c.key).toBeGreaterThanOrEqual(measured[c.key]);
      expect(c.estimatedRows, c.key).toBeLessThanOrEqual(measured[c.key] * 1.8);
    }
  });
});

describe("open-data awards in 'what similar work sold for'", () => {
  const vancouver = (amount: number, i: number) => ({
    categories: ["Roofing"],
    regionName: "Vancouver",
    province: "British Columbia",
    market: "CA" as const,
    amount,
    winner: i % 2 ? "Apex Roofing Ltd" : "Summit Roofing Inc.",
    winnerSlug: null,
    date: "2026-03-01",
    credit: VANCOUVER_ATTRIBUTION as string | undefined,
  });
  const rfp = { categories: ["Roofing"], regionName: "Vancouver", province: "British Columbia" };

  it("the median and count are free, the band and winners are Trade Pro, the credit shows for both", async () => {
    const { similarWorkFor, similarWorkView } = await import("@/lib/rfp-detail/similar-work");
    const rows = [100_000, 150_000, 200_000, 250_000, 300_000, 350_000].map(vancouver);
    const sw = similarWorkFor(rfp, rows, TODAY)!;
    expect(sw).toMatchObject({ scope: "Vancouver", valued: 6, median: 225000, credits: [VANCOUVER_ATTRIBUTION] });
    expect(sw.winners.length).toBeGreaterThan(0);
    const free = similarWorkView(sw, false);
    expect(free.pro).toBe(false);
    expect(free.data).toMatchObject({ median: 225000, valued: 6, credits: [VANCOUVER_ATTRIBUTION] });
    expect(JSON.stringify(free.data)).not.toMatch(/Apex|Summit|"low"|"high"|winners/);
    expect(similarWorkView(sw, true).data).toMatchObject({ low: expect.any(Number), high: expect.any(Number) });
  });

  it("rows without a credit leave the result exactly as before (no credits key)", async () => {
    const { similarWorkFor } = await import("@/lib/rfp-detail/similar-work");
    const rows = [100_000, 150_000, 200_000].map((n, i) => ({ ...vancouver(n, i), credit: undefined }));
    expect(similarWorkFor(rfp, rows, TODAY)).not.toHaveProperty("credits");
  });
});
