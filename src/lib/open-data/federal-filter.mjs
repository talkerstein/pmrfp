/**
 * CA-F06 Government of Canada "Proactive Publication - Contracts over
 * $10,000" (open.canada.ca dataset d8f85d91-7dec-4fd1-8055-483b77225d8b,
 * Open Government Licence - Canada v2.0, rebuilt nightly, ~642 MB).
 *
 * THE FILTER (pure functions, shared by scripts/import-federal-contracts.mjs
 * and the vitest suite; plain ES module so the script needs no build step):
 *
 *   KEEP a row when ALL of these hold
 *     1. contract_value >= 50,000 (CAD, amendments included: that is the
 *        value the department reports for the contract today);
 *     2. it is building / property work, i.e. one of
 *        a. commodity_type "C" (construction), unless the object-code
 *           description is civil or equipment work (roads, highways,
 *           marine, engineering works, power installations, equipment...);
 *        b. services (or untyped older rows) whose object-code description
 *           is building work: repair of / construction of buildings (office,
 *           institutional, industrial, laboratories, other non-residential),
 *           building cleaning / janitorial, waste disposal, heating /
 *           air-conditioning / refrigeration, electric lighting and
 *           distribution, "engineering consultants - construction", and the
 *           older descriptions ("Construction Works - Buildings", "Special
 *           Trade Construction Wrk", "Electrical Contractor Services",
 *           "Snow Removal", "Grounds Maintenance", "Heat, Ventilation & Air
 *           Conditioning Maintenance");
 *        c. "Other business services" only when the comment says snow, lawn,
 *           grounds, pest, elevator or janitorial work.
 *     3. NEVER: goods (commodity_type "G"), software / IT licence and
 *        maintenance fees, computer / telecom / medical / laboratory
 *        EQUIPMENT, rentals and leases, vessels, aircraft, vehicles, weapon
 *        systems, civil works.
 *
 * Older rows (before about 2018) carry no commodity_type and have the 4-digit
 * object code INSIDE description_en ("0630 Repair - Office buildings"); both
 * layouts are handled.
 *
 * Idempotency: the stable id is "<owner_org>|<procurement_id>", the same key
 * the monthly cron source (src/lib/contract-history/sources/federal.ts) uses,
 * and the latest reporting_period wins, so loading this file and running the
 * cron write the SAME rows (no duplicates).
 */
import { businessOnly } from "./business-name.mjs";

export const FEDERAL_SOURCE = "ca-federal-contracts";
export const FEDERAL_MIN_VALUE = 50_000;
export const FEDERAL_CSV_URL =
  "https://open.canada.ca/data/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b/resource/fac950c0-00d5-4ec1-a4d3-9cbebf98a305/download/contracts.csv";
export const FEDERAL_DATASET_URL = "https://open.canada.ca/data/en/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b";

/** Object-code description with its leading code stripped; the code as a number. */
export function objectOf(r) {
  const raw = String(r.description_en ?? "").replace(/\s+/g, " ").trim();
  const inText = raw.match(/^(\d{3,4})\s+(.*)$/);
  const code = Number(String(r.economic_object_code ?? "").trim() || (inText ? inText[1] : "")) || null;
  const text = (inText ? inText[2] : raw).replace(/^[-\s]+/, "").trim();
  return { code, text };
}

const NOT_BUILDING =
  /software|licen[cs]e|computer|data communic|telecom|equipment|instruments?|apparatus|rental|leasing|lease\b|vessels?|ships?|boats?|aircraft|vehicles?|weapon|aerospace|military|highways?|roads?\b|streets|runway|bridges?|dams?\b|canals?|waterworks|engineering works|power installations|marine|railway|payments?|suspense|information technology|network|hotel|restaurant|laundry|ground handling|firefight|furniture|printing|training|tuition|hospitality/i;

/** Building work by object description (any commodity type except goods). */
const BUILDING_DESC = [
  [/^(?:construction works? - buildings|special trade construction)/i, "general-contracting"],
  [/(?:office|institutional|industrial|other|educational|health|recreational|storage|non-residential|residential|commercial)\s+buildings?$/i, "general-contracting"],
  [/^laboratories$/i, "general-contracting"],
  [/^real property services/i, "general-contracting"],
  [/building cleaning|cleaning and maintenance, janitorial|janitorial/i, "cleaning-janitorial"],
  [/^waste disposal$|waste disposal services$/i, "waste-removal"],
  [/^heating, air-?conditioning|heat(?:ing)?, ventilation (?:&|and) air conditioning maintenance/i, "hvac"],
  [/^electric lighting, distribution|electrical contractor services/i, "electrical"],
  [/^engineering consultants\s*-\s*construction/i, null],
  [/snow (?:removal|plow)|grounds maintenance/i, "snow-removal"],
];

/** "Other business services" is a catch-all: only these words in the comment make it property work. */
const SERVICE_WORDS = [
  [/snow (?:removal|clearing|plow)|de-?icing|d[ée]neigement/i, "snow-removal"],
  [/\blawn|landscap|grounds? (?:maintenance|keeping)|mowing|grass cutting|tree (?:removal|pruning|trimming)/i, "landscaping"],
  [/pest control|extermina/i, "pest-control"],
  [/elevator|escalator/i, "elevator-services"],
  [/janitor|custodial|building cleaning/i, "cleaning-janitorial"],
];

/** Trade words in the department's comment (first match wins per trade, max 3). */
const COMMENT_TRADES = [
  [/roof/i, "roofing"],
  [/plumb/i, "plumbing"],
  [/hvac|heating|ventilat|air.?condition|chiller|boiler/i, "hvac"],
  [/electri/i, "electrical"],
  [/paint/i, "painting"],
  [/floor/i, "flooring"],
  [/elevator|escalator/i, "elevator-services"],
  [/fire (?:alarm|protection|suppression)|sprinkler/i, "fire-safety"],
  [/window|glazing|curtain wall/i, "glass-and-windows"],
  [/mason|brick/i, "masonry"],
  [/asbestos|abatement|hazardous/i, "environmental-hazardous-materials"],
  [/demolition/i, "demolition"],
];

const BOILERPLATE = /^(?:this (?:contract|item|is a notice)|the amendment value|increase contract|n\/?a$)/i;

export const SOLICITATION = {
  OB: "open bidding",
  TC: "competitive (traditional)",
  TN: "non-competitive",
  ST: "selective tendering",
  AC: "advance contract award notice",
};

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const clip = (s, n) => {
  const t = tidy(s);
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** Why a row is not kept ("goods", "below-50k"...), or { trades } when it is building work. */
export function classifyFederal(r, { minValue = FEDERAL_MIN_VALUE } = {}) {
  const value = Number(String(r.contract_value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(value) || value < minValue) return { skip: "below-50k" };
  const type = tidy(r.commodity_type).toUpperCase();
  if (type === "G") return { skip: "goods" };
  const { text } = objectOf(r);
  const comments = BOILERPLATE.test(tidy(r.comments_en)) ? "" : tidy(r.comments_en);

  if (/^other business services/i.test(text)) {
    const hit = SERVICE_WORDS.find(([p]) => p.test(`${comments} ${r.vendor_name ?? ""}`));
    return hit ? { trades: [hit[1]], text } : { skip: "not-building-work" };
  }
  const desc = BUILDING_DESC.find(([p]) => p.test(text));
  if (desc && !/rental|leasing|lease\b/i.test(text)) {
    const fromComment = COMMENT_TRADES.filter(([p]) => p.test(comments)).map(([, s]) => s);
    const trades = [...new Set([...(desc[1] ? [desc[1]] : []), ...fromComment])].slice(0, 3);
    return { trades, text };
  }
  // Construction contracts (commodity_type C) that are not civil / equipment / payments.
  if (type === "C" && !NOT_BUILDING.test(text)) {
    const fromComment = COMMENT_TRADES.filter(([p]) => p.test(comments)).map(([, s]) => s);
    return { trades: fromComment.length ? fromComment.slice(0, 3) : ["general-contracting"], text };
  }
  return { skip: NOT_BUILDING.test(text) ? "equipment-software-or-civil" : "not-building-work" };
}

/** ISO yyyy-mm-dd or null. */
export function isoDay(v) {
  const m = String(v ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1990 && y <= 2100 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * One kept row in the compact seed shape (one JSON line), or { skip }.
 * The vendor is business-only: an individual / unrecognised name is
 * stored as vendor = null with vendor_is_individual = true (counted, never named).
 */
export function federalSeedRow(r, { minValue = FEDERAL_MIN_VALUE, today = new Date().toISOString().slice(0, 10) } = {}) {
  const c = classifyFederal(r, { minValue });
  if (c.skip) return { skip: c.skip };
  const date = isoDay(r.contract_date);
  if (!date) return { skip: "no-date" };
  if (date > today) return { skip: "future-date" };
  const org = tidy(r.owner_org);
  const id = tidy(r.procurement_id) || tidy(r.reference_number);
  if (!org || !id) return { skip: "no-key" };
  const vendorRaw = tidy(r.vendor_name);
  if (!vendorRaw) return { skip: "no-vendor" };
  const vendor = businessOnly(vendorRaw);
  const comments = BOILERPLATE.test(tidy(r.comments_en)) ? "" : tidy(r.comments_en);
  const bids = Number(tidy(r.number_of_bids));
  const proc = tidy(r.solicitation_procedure).toUpperCase();
  const ref = tidy(r.reference_number);
  return {
    source_key: `${org}|${id}`,
    reference: ref || null,
    owner_org: org,
    buyer: clip(tidy(r.owner_org_title).split("|")[0], 200) || null,
    vendor,
    vendor_is_individual: vendor === null,
    title: clip(comments.length >= 12 ? comments : c.text, 300) || "Federal contract",
    object: clip(c.text, 120),
    value: Math.round(Number(String(r.contract_value).replace(/,/g, "")) * 100) / 100,
    award_date: date,
    start_date: isoDay(r.contract_period_start),
    end_date: isoDay(r.delivery_date),
    // 0 = a call-up or sole source, not "nobody bid".
    number_of_bids: Number.isInteger(bids) && bids > 0 && bids <= 1000 ? bids : null,
    solicitation_procedure: proc || null,
    procurement_method: SOLICITATION[proc] ?? (proc || null),
    non_competitive: proc === "TN" || Boolean(tidy(r.limited_tendering_reason) && proc !== "TC" && proc !== "OB"),
    trades: c.trades,
    period: tidy(r.reporting_period),
  };
}

/** Keep the newest reporting period per source_key (a contract is restated each quarter it changes). */
export function keepLatest(map, row) {
  const prev = map.get(row.source_key);
  if (!prev || row.period >= prev.period) {
    map.set(row.source_key, row);
    return true;
  }
  return false;
}
