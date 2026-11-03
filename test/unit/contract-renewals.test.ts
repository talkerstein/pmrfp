import { describe, expect, it } from "vitest";
import {
  STARTERS,
  addMonths,
  availableStarters,
  buildRetenderPrefill,
  cleanContractInput,
  contractStatus,
  currencyFor,
  currentTerm,
  guessTrade,
  importContracts,
  needsRenewalReminder,
  nextTerm,
  renewalStage,
  retenderDates,
  timelinePosition,
  timelineRange,
  windowOpens,
  type PrefillCopy,
  type RetenderContract,
  type RetenderSource,
} from "@/lib/contracts/rules";
import { renewalDigestEmail, retenderPath } from "@/lib/contracts/email-copy";
import { getDictionary } from "@/i18n/dictionaries";

const TODAY = "2026-11-01";
const TRADES = [
  { slug: "snow-removal", name: "Snow Removal" },
  { slug: "landscaping", name: "Landscaping" },
  { slug: "hvac", name: "HVAC" },
  { slug: "cleaning-janitorial", name: "Cleaning & Janitorial" },
  { slug: "elevator-services", name: "Elevator Services" },
];
const SLUGS = new Set(TRADES.map((t) => t.slug));

const c = (end: string | null, over: Partial<{ start_date: string | null; auto_renews: boolean; notice_days: number }> = {}) => ({
  start_date: null,
  end_date: end,
  auto_renews: false,
  notice_days: 60,
  ...over,
});

describe("dates", () => {
  it("keeps month ends when adding months", () => {
    expect(addMonths("2027-04-30", 1)).toBe("2027-05-31");
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonths("2027-01-15", 1)).toBe("2027-02-15");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
  });
  it("opens the renewal window notice days before the end", () => {
    expect(windowOpens("2027-04-30", 60)).toBe("2027-03-01");
  });
  it("picks the currency by country, never mixing", () => {
    expect(currencyFor("CA")).toBe("CAD");
    expect(currencyFor("US")).toBe("USD");
  });
});

describe("status chips", () => {
  it("needs dates without an end date", () => {
    expect(contractStatus(c(null), TODAY)).toEqual({ status: "no_dates", end: null, days: null });
  });
  it("is active beyond the notice days", () => {
    expect(contractStatus(c("2027-01-01"), TODAY).status).toBe("active"); // 61 days
  });
  it("is in its renewal window within notice days (inclusive)", () => {
    expect(contractStatus(c("2026-12-31"), TODAY)).toMatchObject({ status: "window", days: 60 });
    expect(contractStatus(c("2026-11-16"), TODAY)).toMatchObject({ status: "window", days: 15 });
  });
  it("respects each contract's own notice days", () => {
    expect(contractStatus(c("2027-01-30", { notice_days: 90 }), TODAY).status).toBe("window");
    expect(contractStatus(c("2026-12-01", { notice_days: 20 }), TODAY).status).toBe("active");
  });
  it("is ending soon within 14 days, the end date itself included", () => {
    expect(contractStatus(c("2026-11-15"), TODAY)).toMatchObject({ status: "ending", days: 14 });
    expect(contractStatus(c("2026-11-01"), TODAY)).toMatchObject({ status: "ending", days: 0 });
  });
  it("is expired the day after the end", () => {
    expect(contractStatus(c("2026-10-31"), TODAY)).toMatchObject({ status: "expired", days: -1 });
  });
  it("never expires when it renews automatically: it rolls to the current term", () => {
    const s = contractStatus(c("2026-04-30", { start_date: "2025-05-01", auto_renews: true }), TODAY);
    expect(s.status).toBe("active");
    expect(s.end).toBe("2027-04-30");
  });
});

describe("terms", () => {
  it("repeats a yearly term by a year", () => {
    expect(nextTerm({ start_date: "2026-05-01", end_date: "2027-04-30" })).toEqual({ start: "2027-05-01", end: "2028-04-30" });
  });
  it("brings a seasonal contract back the same season next year", () => {
    // Snow: Nov 1 to Apr 30 (6 months) → next winter, not next May.
    expect(nextTerm({ start_date: "2026-11-01", end_date: "2027-04-30" })).toEqual({ start: "2027-11-01", end: "2028-04-30" });
  });
  it("starts the day after without a start date", () => {
    expect(nextTerm({ start_date: null, end_date: "2027-04-30" })).toEqual({ start: "2027-05-01", end: "2028-04-30" });
  });
  it("has no next term without an end date", () => {
    expect(nextTerm({ start_date: "2026-01-01", end_date: null })).toBeNull();
  });
  it("rolls an auto-renewing contract's start and end forward together", () => {
    expect(currentTerm({ start_date: "2024-05-01", end_date: "2025-04-30", auto_renews: true }, TODAY)).toEqual({ start: "2026-05-01", end: "2027-04-30" });
    expect(currentTerm({ start_date: "2024-05-01", end_date: "2025-04-30", auto_renews: false }, TODAY)).toEqual({ start: "2024-05-01", end: "2025-04-30" });
  });
});

describe("reminders", () => {
  const row = (end: string | null, over: Record<string, unknown> = {}) => ({
    ...c(end),
    retender_rfp_id: null,
    reminder_stage: null,
    reminder_for: null,
    ...over,
  });
  it("maps days to the window, 14 and end-date stages", () => {
    expect(renewalStage(61, 60)).toBeNull();
    expect(renewalStage(60, 60)).toBe("window");
    expect(renewalStage(14, 60)).toBe("14");
    expect(renewalStage(0, 60)).toBe("0");
    expect(renewalStage(-3, 60)).toBe("0");
  });
  it("sends each stage once per end date", () => {
    expect(needsRenewalReminder(row("2026-12-15"), TODAY)).toMatchObject({ stage: "window", end: "2026-12-15" });
    expect(needsRenewalReminder(row("2026-12-15", { reminder_stage: "window", reminder_for: "2026-12-15" }), TODAY)).toBeNull();
    expect(needsRenewalReminder(row("2026-11-10", { reminder_stage: "window", reminder_for: "2026-11-10" }), TODAY)).toMatchObject({ stage: "14" });
    expect(needsRenewalReminder(row("2026-11-01", { reminder_stage: "14", reminder_for: "2026-11-01" }), TODAY)).toMatchObject({ stage: "0" });
    expect(needsRenewalReminder(row("2026-11-01", { reminder_stage: "0", reminder_for: "2026-11-01" }), TODAY)).toBeNull();
  });
  it("starts over when the end date changes", () => {
    expect(needsRenewalReminder(row("2026-12-15", { reminder_stage: "0", reminder_for: "2025-12-15" }), TODAY)).toMatchObject({ stage: "window" });
  });
  it("first seen at 14 days gets only the 14-day email", () => {
    expect(needsRenewalReminder(row("2026-11-10"), TODAY)).toMatchObject({ stage: "14" });
  });
  it("skips contracts already re-tendered, long-ended, outside the window or without dates", () => {
    expect(needsRenewalReminder(row("2026-11-10", { retender_rfp_id: "x" }), TODAY)).toBeNull();
    expect(needsRenewalReminder(row("2026-10-20"), TODAY)).toBeNull();
    expect(needsRenewalReminder(row("2027-06-01"), TODAY)).toBeNull();
    expect(needsRenewalReminder(row(null), TODAY)).toBeNull();
  });
  it("reminds an auto-renewing contract before its rolled-forward end", () => {
    const r = row("2025-12-20", { start_date: "2024-12-21", auto_renews: true });
    expect(needsRenewalReminder(r, TODAY)).toMatchObject({ stage: "window", end: "2026-12-20" });
  });
});

describe("re-tender dates", () => {
  it("closes bids three weeks before the next term starts", () => {
    // Ends Dec 31 → new term Jan 1 → deadline Dec 11.
    expect(retenderDates({ start_date: "2026-01-01", end_date: "2026-12-31" }, TODAY)).toEqual({
      deadline: "2026-12-11",
      newStart: "2027-01-01",
      newEnd: "2027-12-31",
    });
  });
  it("never gives trades less than 10 days", () => {
    const d = retenderDates({ start_date: "2025-11-21", end_date: "2026-11-20" }, TODAY);
    expect(d.deadline).toBe("2026-11-11");
    expect(d.newStart).toBe("2026-11-21");
  });
  it("caps an early re-tender at 60 days out", () => {
    expect(retenderDates({ start_date: "2026-09-01", end_date: "2027-08-31" }, TODAY).deadline).toBe("2026-12-31");
  });
  it("starts as soon as possible when the contract has already ended", () => {
    expect(retenderDates({ start_date: "2025-10-01", end_date: "2026-09-30" }, TODAY)).toEqual({ deadline: "2026-11-11", newStart: null, newEnd: null });
  });
  it("defaults to three weeks without an end date", () => {
    expect(retenderDates({ start_date: null, end_date: null }, TODAY)).toEqual({ deadline: "2026-11-22", newStart: null, newEnd: null });
  });
});

describe("re-tender RFP prefill", () => {
  const copy: PrefillCopy = getDictionary("en").contracts.prefill.CA;
  const contract: RetenderContract = {
    id: "11111111-1111-4111-8111-111111111111",
    building_name: "Maple Court",
    building_address: "120 Example St, Toronto",
    trade_slug: "snow-removal",
    service_detail: "Lot and walkways",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    auto_renews: false,
    annual_value: 18000.4,
    notes: "Salt walkways by 7am.\nPlow at 5 cm.",
  };
  const day = (iso: string) => iso;

  it("maps a contract to the RFP form: trade, building, scope from notes, deadline from end date", () => {
    const p = buildRetenderPrefill({ contract, source: null, tradeName: "Snow Removal", today: TODAY, copy, day });
    expect(p.title).toBe("Snow Removal contract renewal: Maple Court");
    expect(p.categories).toEqual(["snow-removal"]);
    expect(p.summary).toContain("Maple Court");
    expect(p.summary).toContain("2027-01-01");
    expect(p.scope).toContain("Service: Snow Removal (Lot and walkways)");
    expect(p.scope).toContain("Address: 120 Example St, Toronto");
    expect(p.scope).toContain("Contract term: 2027-01-01 to 2027-12-31");
    expect(p.scope).toContain("Salt walkways by 7am.");
    expect(p.deadline).toBe("2026-12-11");
    expect(p.budgetMax).toBe(18000);
    expect(p.budgetMin).toBeUndefined();
    expect(p.contractId).toBe(contract.id);
    expect(p.retenderNotice).toContain("Maple Court");
    expect(p.requirements).toBeUndefined();
  });

  it("clones the RFP the contract came from, with the new term on top", () => {
    const source: RetenderSource = {
      summary: "Snow clearing for a 120-unit condo.",
      scope: "Plow, salt and sand the lot.",
      requirements: "WSIB clearance. $5M CGL.",
      submission_instructions: "Quote per season.",
      city: "Toronto",
      province: "ON",
      budget_min: 15000,
      budget_max: 22000,
      region_slug: "toronto",
      property_type_slug: "condo",
      categories: ["snow-removal", "landscaping", "snow-removal"],
    };
    const p = buildRetenderPrefill({ contract, source, tradeName: "Snow Removal", today: TODAY, copy, day });
    expect(p.summary).toBe(source.summary);
    expect(p.scope.startsWith("Service: Snow Removal (Lot and walkways)")).toBe(true);
    expect(p.scope).toContain("Plow, salt and sand the lot.");
    expect(p.requirements).toBe(source.requirements);
    expect(p.submissionInstructions).toBe(source.submission_instructions);
    expect(p.categories).toEqual(["snow-removal", "landscaping"]);
    expect(p).toMatchObject({ city: "Toronto", province: "ON", regionSlug: "toronto", propertyType: "condo", budgetMin: 15000, budgetMax: 22000 });
  });

  it("works without a building or value, and re-tenders an auto-renewed contract from its current term", () => {
    const p = buildRetenderPrefill({
      contract: { ...contract, building_name: null, building_address: null, annual_value: null, notes: null, auto_renews: true, start_date: "2024-12-01", end_date: "2025-11-30" },
      source: null,
      tradeName: null,
      today: TODAY,
      copy,
      day,
    });
    expect(p.title).toBe("Lot and walkways contract renewal");
    expect(p.budgetMax).toBeUndefined();
    // Rolled to Dec 1 2025 → Nov 30 2026; next term starts Dec 1 2026; deadline clamped to 10 days out.
    expect(p.deadline).toBe("2026-11-11");
    expect(p.scope).toContain("Contract term: 2026-12-01 to 2027-11-30");
  });

  it("says rebid for U.S. companies", () => {
    const us = buildRetenderPrefill({ contract, source: null, tradeName: "Snow Removal", today: TODAY, copy: getDictionary("en").contracts.prefill.US, day });
    expect(us.summary).toContain("rebidding");
    const ca = buildRetenderPrefill({ contract, source: null, tradeName: "Snow Removal", today: TODAY, copy, day });
    expect(ca.summary).toContain("re-tendering");
  });
});

describe("input, import and starters", () => {
  it("needs a trade or a description", () => {
    expect(cleanContractInput({ building_name: "A" }, SLUGS)).toEqual({ ok: false, field: "service" });
    expect(cleanContractInput({ trade_slug: "not-a-trade" }, SLUGS)).toEqual({ ok: false, field: "service" });
    const ok = cleanContractInput({ trade_slug: "hvac", notice_days: "", auto_renews: "on" }, SLUGS);
    expect(ok).toMatchObject({ ok: true, value: { trade_slug: "hvac", notice_days: 60, auto_renews: true } });
  });
  it("rejects bad emails, dates, order, amounts and notice days", () => {
    expect(cleanContractInput({ service_detail: "x", vendor_email: "nope" }, SLUGS)).toEqual({ ok: false, field: "email" });
    expect(cleanContractInput({ service_detail: "x", end_date: "soon" }, SLUGS)).toEqual({ ok: false, field: "date" });
    expect(cleanContractInput({ service_detail: "x", start_date: "2027-01-01", end_date: "2026-01-01" }, SLUGS)).toEqual({ ok: false, field: "order" });
    expect(cleanContractInput({ service_detail: "x", annual_value: "lots" }, SLUGS)).toEqual({ ok: false, field: "amount" });
    expect(cleanContractInput({ service_detail: "x", notice_days: "400" }, SLUGS)).toEqual({ ok: false, field: "notice" });
  });
  it("matches a spreadsheet's service text to a PMRFP trade", () => {
    expect(guessTrade("HVAC", TRADES)).toEqual({ slug: "hvac", detail: null });
    expect(guessTrade("Snow plowing - winter", TRADES)).toEqual({ slug: "snow-removal", detail: "Snow plowing - winter" });
    expect(guessTrade("Déneigement", TRADES).slug).toBe("snow-removal");
    expect(guessTrade("Window washing", TRADES)).toEqual({ slug: null, detail: "Window washing" });
  });
  it("imports a CSV with a header, skipping bad lines", () => {
    const csv = [
      "Building,Service,Vendor,Vendor email,Start,End,Annual value,Notice days,Auto-renews,Notes",
      "Maple Court,Snow removal,Northline,office@example.com,2026-11-01,2027-04-30,18000,90,no,Lot",
      "Maple Court,Elevator maintenance,LiftCo,,2026-01-01,2026-12-31,,,yes,",
      ",,NoService,,,,,,,",
      "Oak Tower,Janitorial,CleanCo,bad-email,,,,,,",
    ].join("\n");
    const r = importContracts(csv, TRADES);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ building_name: "Maple Court", trade_slug: "snow-removal", end_date: "2027-04-30", annual_value: 18000, notice_days: 90, auto_renews: false });
    expect(r.rows[1]).toMatchObject({ trade_slug: "elevator-services", auto_renews: true, notice_days: 60 });
    expect(r.skipped).toEqual([4, 5]);
    expect(r.truncated).toBe(false);
  });
  it("offers each starter once, only for trades that exist, with no prices or dates", () => {
    const all = availableStarters(TRADES, []);
    expect(all.map((s) => s.key)).toEqual(["snow_removal", "landscaping", "hvac_maintenance", "janitorial", "elevator"]);
    expect(availableStarters(TRADES, ["snow_removal", null]).map((s) => s.key)).not.toContain("snow_removal");
    for (const s of STARTERS) expect(Object.keys(s).sort()).toEqual(["key", "noticeDays", "trade"]);
  });
});

describe("timeline", () => {
  it("spans this month to the same month next year", () => {
    const r = timelineRange("2026-11-17");
    expect(r.from).toBe("2026-11-01");
    expect(r.to).toBe("2027-11-01");
    expect(r.months).toHaveLength(12);
    expect(r.months[2]).toBe("2027-01-01");
  });
  it("places days between 0 and 1, clamped", () => {
    expect(timelinePosition("2026-11-01", "2026-11-01", "2027-11-01")).toBe(0);
    expect(timelinePosition("2028-01-01", "2026-11-01", "2027-11-01")).toBe(1);
    expect(timelinePosition("2027-05-02", "2026-11-01", "2027-11-01")).toBeCloseTo(0.5, 1);
  });
});

describe("renewal digest email", () => {
  const item = (over: Partial<Parameters<typeof renewalDigestEmail>[1]["items"][number]> = {}) => ({
    id: "22222222-2222-4222-8222-222222222222",
    service: "Snow Removal",
    building: "Maple Court",
    vendor: "Northline",
    end: "2026-11-15",
    days: 14,
    stage: "14" as const,
    autoRenews: false,
    ...over,
  });
  it("leads with Re-tender on PMRFP (Canada) pointing at the pre-filled RFP", () => {
    const e = renewalDigestEmail("en", { base: "https://pmrfp.com", company: "Acme PM", country: "CA", items: [item()], unsubscribeUrl: "https://pmrfp.com/u" });
    expect(e.bodyHtml).toContain("Re-tender on PMRFP");
    expect(e.bodyHtml).toContain(`https://pmrfp.com${retenderPath(item().id)}`);
    expect(e.subject).toContain("Snow Removal at Maple Court");
    expect(e.footnote).toContain("https://pmrfp.com/u");
  });
  it("says Rebid in the U.S., counts several contracts and adds the notice tip for auto-renewals", () => {
    const e = renewalDigestEmail("en", {
      base: "https://pmrfp.com",
      company: "Acme PM",
      country: "US",
      items: [item(), item({ id: "33333333-3333-4333-8333-333333333333", autoRenews: true, stage: "window", days: 40 })],
      unsubscribeUrl: null,
    });
    expect(e.bodyHtml).toContain("Rebid on PMRFP");
    expect(e.bodyHtml).not.toContain("Re-tender");
    expect(e.subject).toBe("2 service contracts are coming up for renewal");
    expect(e.bodyHtml).toContain("written notice");
  });
  it("escapes what the PM typed and localizes", () => {
    const e = renewalDigestEmail("fr", { base: "https://pmrfp.com", company: "<b>X</b>", country: "CA", items: [item({ building: "<script>" })], unsubscribeUrl: null });
    expect(e.bodyHtml).not.toContain("<script>");
    expect(e.bodyHtml).toContain("Relancer l'appel d'offres sur PMRFP");
    expect(e.bodyHtml).toContain("/fr/pm-dashboard/rfps/new?contract=");
  });
});
