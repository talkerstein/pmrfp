import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { deflateRawSync } from "node:zlib";
import { businessNameOrNull, endDateFor, money, preferEndDate, provinceFor, validateAward, winnerFields, type AwardHistoryInput } from "@/lib/contract-history/model";
import { CsvStream, readCsv } from "@/lib/contract-history/csv-stream";
import { federalRow, federalTrades, parseFederalStream } from "@/lib/contract-history/sources/federal";
import { canadabuysRow, parseCanadabuysCsv } from "@/lib/contract-history/sources/canadabuys";
import { parseSeaoFile, seaoFilesFromPage, savedSeaoFiles } from "@/lib/contract-history/sources/seao";
import { montrealCsvLinks, parseMontreal, parseOttawaFeatures, parseToronto } from "@/lib/contract-history/sources/municipal";
import { parseUsaCsv, usaCsvFromZip, usaRow, usaTrades } from "@/lib/contract-history/sources/usaspending";
import { coverageOf } from "@/lib/contract-history/coverage";
import { dedupeBids, prepareAwards } from "@/lib/contract-history/sync";
import { csvPieces } from "@/components/admin/award-history-upload";

const OPTS = { since: "2021-10-16", asOf: "2026-10-16" };
const csv = (rows: Record<string, string | number>[]) => {
  const head = Object.keys(rows[0]);
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [head.join(","), ...rows.map((r) => head.map((h) => q(r[h])).join(","))].join("\r\n") + "\r\n";
};

describe("business names only", () => {
  it("drops people, keeps businesses", () => {
    for (const person of ["John Smith", "SMITH, JOHN", "J. A. Smith", "Marie-Ève Tremblay", "JONATHAN DALTON", "Jean Paul Roy", "O'Neil McDonald"]) {
      expect(businessNameOrNull(person), person).toBeNull();
    }
    for (const biz of ["Dexter Construction Co. Ltd.", "B.K. LAWN MAINTENANCE", "9163-4436 QC INC.", "Smith & Jones", "LUMEN", "Jean Tremblay Excavation", "Les Entreprises G.L. Boutin inc.", "ALEX TURKEWITSCH P. ENG LTD.", "Hamilton Pacific Chamberlain LLC"]) {
      expect(businessNameOrNull(biz), biz).toBe(biz);
    }
  });

  it("keeps only the trading name after 'doing business as'", () => {
    expect(businessNameOrNull("John Smith dba Smith Roofing")).toBe("Smith Roofing");
    expect(businessNameOrNull("John Smith o/a Jane Doe")).toBeNull();
  });

  it("an individual winner is stored without a name", () => {
    expect(winnerFields("Jane Doe")).toEqual({ winner_business_name: null, winner_key: null, winner_is_individual: true });
    expect(winnerFields("Guild Electric Ltd.")).toMatchObject({ winner_business_name: "Guild Electric Ltd.", winner_is_individual: false });
    expect(winnerFields("Various")).toBeNull();
  });
});

describe("end dates", () => {
  it("stated beats a term in the text, which beats the estimate", () => {
    expect(endDateFor({ awardDate: "2025-05-01", stated: "2028-04-30", text: "Déneigement 3 ans" })).toEqual({ end_date: "2028-04-30", end_date_source: "stated" });
    expect(endDateFor({ awardDate: "2025-05-01", stated: null, text: "Déneigement, contrat de 3 ans" })).toEqual({ end_date: "2028-05-01", end_date_source: "derived_from_title" });
    expect(endDateFor({ awardDate: "2025-05-01", text: "Snow clearing", estimate: true })).toEqual({ end_date: "2028-05-01", end_date_source: "estimated" });
    expect(endDateFor({ awardDate: "2025-05-01", text: "Snow clearing" })).toEqual({ end_date: null, end_date_source: null });
  });

  it("ignores stated dates before the award or absurdly far out", () => {
    expect(endDateFor({ awardDate: "2025-05-01", stated: "2024-01-01" }).end_date_source).toBeNull();
    expect(endDateFor({ awardDate: "2025-05-01", stated: "2202-03-31" }).end_date_source).toBeNull();
  });

  it("preferEndDate keeps the better-sourced date", () => {
    const stated = { end_date: "2027-01-01", end_date_source: "stated" as const };
    const est = { end_date: "2028-01-01", end_date_source: "estimated" as const };
    expect(preferEndDate(est, stated)).toBe(stated);
    expect(preferEndDate(stated, est)).toBe(stated);
  });
});

describe("country and currency", () => {
  const base: AwardHistoryInput = {
    source: "x", source_key: "1", board_ref: null, title: "Snow", description: null, buyer: null, buyer_key: null,
    winner_business_name: "Acme Snow Ltd", winner_key: "acme snow", winner_is_individual: false, value: 1000, currency: "CAD", country: "CA",
    province: null, city: null, award_date: "2025-01-01", award_date_precision: "day", start_date: null, end_date: null, end_date_source: null,
    potential_end_date: null, number_of_bids: null, trade_slugs: ["snow-removal"], notice_url: null, licence: "l", attribution: "a", as_of: "2026-10-16",
  };
  it("never stores a CA row in USD or a US row in CAD", () => {
    expect(validateAward(base)).toBeNull();
    expect(validateAward({ ...base, currency: "USD" })).toBe("currency-mismatch");
    expect(validateAward({ ...base, country: "US" })).toBe("currency-mismatch");
    expect(validateAward({ ...base, country: "US", currency: "USD" })).toBeNull();
  });
  it("a province only belongs to its own country", () => {
    expect(provinceFor("US", "TX")).toBe("Texas");
    expect(provinceFor("US", "QC")).toBeNull();
    expect(provinceFor("CA", "QC")).toBe("Quebec");
  });
  it("coverage reports each country separately", () => {
    const us = { ...base, source_key: "2", country: "US" as const, currency: "USD" as const };
    const cov = coverageOf([base, us], [], "2026-10-16");
    expect(cov.CA?.rows).toBe(1);
    expect(cov.US?.rows).toBe(1);
  });
  it("money reads English and French formats", () => {
    expect(money("1,234.50")).toBe(1234.5);
    expect(money("1 234,50 $")).toBe(1234.5);
    expect(money("-5")).toBeNull();
  });
});

describe("streaming CSV", () => {
  it("handles quotes, escaped quotes and newlines across chunk boundaries", () => {
    const text = 'a,b\r\n"x, ""y""","line1\nline2"\r\nplain,2\r\n';
    const whole = readCsv(text);
    for (let size = 1; size <= 7; size++) {
      const out: Record<string, string>[] = [];
      const p = new CsvStream((r) => out.push(r));
      for (let i = 0; i < text.length; i += size) p.push(text.slice(i, i + size));
      p.end();
      expect(out, `chunk ${size}`).toEqual(whole);
    }
    expect(whole).toEqual([{ a: 'x, "y"', b: "line1\nline2" }, { a: "plain", b: "2" }]);
  });

  it("splits an upload into record-aligned pieces, each with the header", async () => {
    const text = 'h1,h2\n"a\nb",1\nc,2\nd,3\ne,"4\n5"\n';
    async function* chunks() {
      for (let i = 0; i < text.length; i += 3) yield text.slice(i, i + 3);
    }
    const pieces: string[] = [];
    for await (const p of csvPieces(chunks(), 8)) pieces.push(p);
    expect(pieces.length).toBeGreaterThan(1);
    const rows = pieces.flatMap((p) => {
      expect(p.startsWith("h1,h2\n")).toBe(true);
      return readCsv(p);
    });
    expect(rows).toEqual(readCsv(text));
  });
});

describe("federal contracts over $10,000", () => {
  const row = (o: Record<string, string>) => ({
    reference_number: "C-2025-2026-Q1-00001", procurement_id: "P1", vendor_name: "NEVE REFRIGERATION INC", vendor_postal_code: "K1A",
    contract_date: "2025-04-15", economic_object_code: "0656", description_en: "Repair and maintenance - Heating, air-conditioning and refrigeration equipment",
    contract_period_start: "2025-05-01", delivery_date: "2028-03-31", contract_value: "120000.00", original_value: "100000.00", comments_en: "",
    commodity_type: "S", number_of_bids: "3", reporting_period: "2025-2026-Q1", owner_org: "pwgsc-tpsgc", owner_org_title: "Public Services and Procurement Canada | Services publics",
    ...o,
  });
  it("keeps building services with the stated end date and bid count", () => {
    const r = federalRow(row({}), OPTS);
    expect(typeof r).toBe("object");
    const a = r as AwardHistoryInput;
    expect(a).toMatchObject({ trade_slugs: ["hvac"], end_date: "2028-03-31", end_date_source: "stated", number_of_bids: 3, value: 120000, currency: "CAD", country: "CA", province: null, buyer: "Public Services and Procurement Canada" });
    expect(a.notice_url).toContain("search.open.canada.ca/contracts/record/pwgsc-tpsgc,C-2025-2026-Q1-00001");
  });
  it("drops goods, civil works, consulting and people", () => {
    expect(federalTrades(row({ commodity_type: "G" }))).toEqual([]);
    expect(federalTrades(row({ description_en: "Repair and maintenance - Marine installations" }))).toEqual([]);
    expect(federalTrades(row({ description_en: "Engineering consultants - Construction", commodity_type: "C" }))).toEqual([]);
    expect(federalTrades(row({ description_en: "Other business services not elsewhere specified", comments_en: "Snow removal at the depot" }))).toEqual(["snow-removal"]);
    expect(federalTrades(row({ description_en: "Office buildings", commodity_type: "C", vendor_name: "ACME ROOFING LTD" }))).toEqual(["roofing"]);
    const person = federalRow(row({ vendor_name: "JONATHAN DALTON" }), OPTS) as AwardHistoryInput;
    expect(person.winner_business_name).toBeNull();
    expect(person.winner_is_individual).toBe(true);
    expect(federalRow(row({ number_of_bids: "0" }), OPTS)).toMatchObject({ number_of_bids: null });
  });
  it("streams the file and keeps the latest restatement", async () => {
    const text = csv([row({ contract_value: "100000", reporting_period: "2025-2026-Q1" }), row({ contract_value: "130000", reporting_period: "2025-2026-Q3" }), row({ contract_date: "2015-01-01", procurement_id: "OLD" })]);
    const b = await parseFederalStream(new Blob([text]).stream(), OPTS);
    expect(b.read).toBe(3);
    expect(b.awards).toHaveLength(1);
    expect(b.awards[0].value).toBe(130000);
    expect(b.skipped["too-old"]).toBe(1);
  });
});

describe("CanadaBuys award notices (admin upload)", () => {
  const r = (o: Record<string, string> = {}) => ({
    "title-titre-eng": "Snow removal services - Halifax depot",
    "referenceNumber-numeroReference": "PW-24-01234",
    "contractAwardDate-dateAttributionContrat": "2024-06-01",
    "contractAmount-montantContrat": "90000",
    "totalContractValue-valeurTotaleContrat": "95000",
    "contractCurrency-contratMonnaie": "CAD",
    "procurementCategory-categorieApprovisionnement": "*SRV",
    "supplierLegalName-nomLegalFournisseur-eng": "Northline Snow Services Ltd",
    "contractingEntityName-nomEntitContractante-eng": "Public Services and Procurement Canada",
    "amendmentNumber-numeroModification": "000",
    "contractStartDate-contratDateDebut": "2024-11-01",
    "contractEndDate-dateFinContrat": "2027-04-30",
    "regionsOfDelivery-regionsLivraison-eng": "Nova Scotia",
    ...o,
  });
  it("keeps the stated end date and the board ref", () => {
    const a = canadabuysRow(r(), OPTS) as AwardHistoryInput;
    expect(a).toMatchObject({ end_date: "2027-04-30", end_date_source: "stated", board_ref: "cba-pw-24-01234", value: 95000, province: "Nova Scotia", trade_slugs: ["snow-removal"] });
    expect(canadabuysRow(r({ "contractCurrency-contratMonnaie": "USD" }), OPTS)).toBe("currency");
    expect(canadabuysRow(r({ "title-titre-eng": "IT consulting services" }), OPTS)).toBe("not-building-work");
  });
  it("the highest amendment wins", () => {
    const b = parseCanadabuysCsv(csv([r({ "amendmentNumber-numeroModification": "001", "contractEndDate-dateFinContrat": "2028-04-30" }), r()]), OPTS);
    expect(b.awards).toHaveLength(1);
    expect(b.awards[0].end_date).toBe("2028-04-30");
  });
});

describe("SEAO", () => {
  const release = {
    ocid: "ocds-ec9k95-1",
    date: "2026-09-10T10:00:00-04:00",
    tag: ["contract"],
    parties: [
      { id: "OP-1", name: "Ville de Laval.", roles: ["buyer"], address: { locality: "Laval" } },
      { id: "FO-1", name: "Déneigement Laval Inc.", roles: ["supplier"] },
    ],
    buyer: { name: "Ville de Laval.", id: "OP-1" },
    tender: {
      id: "AO-2026-15",
      title: "Déneigement des stationnements municipaux, saisons 2026-2027 à 2028-2029",
      status: "complete",
      procurementMethod: "open",
      mainProcurementCategory: "services",
      items: [{ id: "S5", description: "S5 - Services d'entretien" }],
      numberOfTenderers: 3,
      tenderers: [{ id: "FO-1", name: "Déneigement Laval Inc." }, { id: "FO-2", name: "Excavation Rive-Nord Ltée" }, { id: "FO-3", name: "Pierre Gagnon" }],
      documents: [{ url: "https://seao.gouv.qc.ca/avis-resultat-recherche/consulter?ItemId=abc" }],
    },
    bids: [{ id: "FO-2", value: 260000, valueUnit: "1" }, { id: "FO-1", value: 240000, valueUnit: "1" }, { id: "FO-3", value: 300000, valueUnit: "1" }],
    awards: [{ id: "A1", date: "2026-08-20T00:00:00-04:00", value: { amount: 240000, currency: "CAD" }, suppliers: [{ id: "FO-1", name: "Déneigement Laval Inc." }] }],
    contracts: [{ id: "A1", awardID: "A1", status: "active", period: { endDate: "2029-04-30T00:00:00-04:00" }, value: { amount: 240000, currency: "CAD" } }],
  };
  it("reads the award, the stated end date and the ranked bid list (people unnamed)", () => {
    const b = parseSeaoFile({ publishedDate: "2026-10-01", releases: [release] }, OPTS);
    expect(b.awards).toHaveLength(1);
    expect(b.awards[0]).toMatchObject({ end_date: "2029-04-30", end_date_source: "stated", number_of_bids: 3, board_ref: "qca-ao-2026-15", province: "Quebec", city: "Laval", buyer: "Ville de Laval" });
    expect(b.awards[0].trade_slugs[0]).toBe("snow-removal");
    expect(b.bids.map((x) => [x.rank, x.bidder_business_name, x.status_label])).toEqual([
      [1, "Déneigement Laval Inc.", "awarded"],
      [2, "Excavation Rive-Nord Ltée", "not_awarded"],
      [3, null, "not_awarded"],
    ]);
    expect(b.bids[2].bidder_is_individual).toBe(true);
  });
  it("skips gré à gré, goods and civil works", () => {
    const b = parseSeaoFile({ releases: [{ ...release, tender: { ...release.tender, procurementMethod: "direct" } }, { ...release, tender: { ...release.tender, items: [{ id: "C02", description: "C02 - Ouvrages de génie civil" }] } }] }, OPTS);
    expect(b.awards).toHaveLength(0);
    expect(b.skipped).toMatchObject({ "not-competitive": 1, "civil-works": 1 });
  });
  it("lists /download/ files from the page, and has a saved list for when the page is behind a bot challenge", () => {
    const html = `<a href="https://www.donneesquebec.ca/recherche/dataset/d23b/resource/aa-1/download/hebdo_20261005_20261011.json">x</a><a href="https://www.donneesquebec.ca/recherche/dataset/d23b/resource/bb-2/download/mensuel_20260901_20260930.json">y</a>`;
    expect(seaoFilesFromPage(html).map((f) => f.name)).toEqual(["hebdo_20261005_20261011.json", "mensuel_20260901_20260930.json"]);
    const saved = savedSeaoFiles();
    expect(saved.filter((f) => f.kind === "mensuel").length).toBeGreaterThanOrEqual(60);
    expect(saved.every((f) => f.url.includes("/download/") && !f.url.includes("/api/"))).toBe(true);
  });
});

describe("city award lists", () => {
  it("Toronto: building trades with a derived term", () => {
    const text = csv([
      { "Document Number": "Doc1", "RFx (Solicitation) Type": "RFT", "High Level Category": "Construction Services", "Successful Supplier": "Metro Clean Ltd", Award: "450,000.00", "Award Authority Obtained Date": "2024-03-01", Division: "Facilities", "Solicitation Document Description": "Janitorial services for civic centres for a 3 year term", Wards: "" },
      { "Document Number": "Doc2", "RFx (Solicitation) Type": "RFQ", "High Level Category": "Goods", "Successful Supplier": "Paper Co", Award: "10,000", "Award Authority Obtained Date": "2024-03-01", Division: "x", "Solicitation Document Description": "Office paper", Wards: "" },
    ]);
    const b = parseToronto(text, OPTS);
    expect(b.awards).toHaveLength(1);
    expect(b.awards[0]).toMatchObject({ trade_slugs: ["cleaning-janitorial"], end_date: "2027-03-01", end_date_source: "derived_from_title", city: "Toronto" });
  });
  it("Montréal: bid count and term from the decision text, file links from the page", () => {
    const text = csv([{ FOURNISSEUR: "Les Entreprises Roseneige Inc.", SERVICE: "Concertation", "NO DE DOSSIER": "1234", OBJET: "Conclure un contrat de déneigement d'une durée de 36 mois, suite à l'appel d'offres public 24-1 (4 SOUM.)", "NO DÉCISION": "CM24 0001", "DATE SIGNATURE": "2024-10-01", MONTANT: "1200000" }]);
    const b = parseMontreal(text, { ...OPTS, file: "contrats_conseil_municipal.csv", datasetUrl: "https://donnees.montreal.ca/dataset/x" });
    expect(b.awards[0]).toMatchObject({ number_of_bids: 4, end_date: "2027-10-01", end_date_source: "derived_from_title", trade_slugs: ["snow-removal"], value: 1200000 });
    expect(montrealCsvLinks('href="https://donnees.montreal.ca/dataset/5cf0/resource/1e5a/download/contrats_conseil_municipal.csv"')).toHaveLength(1);
  });
  it("Ottawa: half-year date, consulting dropped", () => {
    const b = parseOttawaFeatures(
      [
        { attributes: { Contract: "C1", Department: "Facilities", Description: "Snow removal at transit stations for one year", Amount: "85000", Vendor: "Capital Snow Inc", Professional_Consulting_Services: "No" } },
        { attributes: { Contract: "C2", Department: "Planning", Description: "Engineering design services", Amount: "85000", Vendor: "X Engineering Ltd", Professional_Consulting_Services: "Yes" } },
      ],
      { layer: "L", to: "2025-12-31", ...OPTS },
    );
    expect(b.awards).toHaveLength(1);
    expect(b.awards[0]).toMatchObject({ award_date: "2025-12-31", award_date_precision: "half_year", trade_slugs: ["snow-removal"] });
  });
});

describe("USAspending", () => {
  const row = (o: Record<string, string> = {}) => ({
    contract_award_unique_key: "CONT_AWD_1", award_id_piid: "W1", current_total_value_of_award: "1460832.26", total_obligated_amount: "1460832.26",
    award_base_action_date: "2025-12-01", period_of_performance_start_date: "2025-12-01", period_of_performance_current_end_date: "2026-11-30",
    period_of_performance_potential_end_date: "2030-11-30", awarding_agency_name: "Department of Defense", awarding_sub_agency_name: "Department of the Army",
    recipient_name: "PREMIER ALLIANCES INC", primary_place_of_performance_country_code: "USA", primary_place_of_performance_state_code: "AZ",
    primary_place_of_performance_city_name: "FORT HUACHUCA", award_type_code: "C", prime_award_base_transaction_description: "GROUNDS AND CEMETERY MAINTENANCE",
    naics_code: "561730", naics_description: "LANDSCAPING SERVICES", number_of_offers_received: "4", usaspending_permalink: "https://www.usaspending.gov/award/CONT_AWD_1/",
    ...o,
  });
  it("current end date is stated; options give the potential end; USD, U.S. state", () => {
    expect(usaRow(row(), OPTS)).toMatchObject({ currency: "USD", country: "US", province: "Arizona", end_date: "2026-11-30", end_date_source: "stated", potential_end_date: "2030-11-30", number_of_bids: 4, trade_slugs: ["landscaping"] });
    expect(usaRow(row({ primary_place_of_performance_country_code: "DEU" }), OPTS)).toBe("outside-us");
    expect(usaRow(row({ award_type_code: "IDV_B" }), OPTS)).toBe("not-a-contract");
  });
  it("NAICS → trade, refined by the description", () => {
    expect(usaTrades("238220", "HVAC PREVENTIVE MAINTENANCE")).toEqual(["hvac"]);
    expect(usaTrades("238220", "MISC WORK")).toEqual(["hvac", "plumbing"]);
    expect(usaTrades("561720", "CUSTODIAL SERVICES")).toEqual(["cleaning-janitorial"]);
    expect(usaTrades("541330", "ENGINEERING")).toEqual([]);
  });
  it("reads the prime award CSV out of the download zip", () => {
    const text = csv([row()]);
    const zip = makeZip("Contracts_PrimeAwardSummaries_2026-10-16_1.csv", text);
    expect(parseUsaCsv(usaCsvFromZip(zip), OPTS).awards).toHaveLength(1);
  });
});

describe("writes", () => {
  it("drops invalid rows and duplicate keys before upserting", () => {
    const a = (k: string, o: Partial<AwardHistoryInput> = {}) => ({ ...(canadabuysRow({
      "title-titre-eng": "Janitorial services", "referenceNumber-numeroReference": k, "contractAwardDate-dateAttributionContrat": "2024-06-01",
      "contractCurrency-contratMonnaie": "CAD", "procurementCategory-categorieApprovisionnement": "SRV", "supplierLegalName-nomLegalFournisseur-eng": "Clean Co Ltd",
    }, OPTS) as AwardHistoryInput), ...o });
    const { rows, invalid } = prepareAwards([a("1"), a("1", { value: 5 }), a("2", { currency: "USD" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(5);
    expect(invalid).toEqual({ "currency-mismatch": 1 });
    const bid = { award_source: "s", award_source_key: "k", bidder_business_name: "A Ltd", bidder_key: "a", bidder_is_individual: false, bid_amount: 1, currency: "CAD" as const, rank: 1, status_label: "awarded" as const, as_of: "2026-10-16", source: "s" };
    expect(dedupeBids([bid, { ...bid, bid_amount: 2 }])).toEqual([{ ...bid, bid_amount: 2 }]);
  });
});

/** A one-entry deflate zip (what USAspending generates, minus the other entries). */
function makeZip(name: string, text: string): Uint8Array {
  const data = new TextEncoder().encode(text);
  const comp = deflateRawSync(data);
  const nameBytes = new TextEncoder().encode(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = 30 + nameBytes.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + nameBytes.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return new Uint8Array(Buffer.concat([local, nameBytes, comp, central, nameBytes, eocd]));
}
