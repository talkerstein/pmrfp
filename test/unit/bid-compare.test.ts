import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  bidTax,
  bidTotal,
  bidderCoverage,
  bestCertStatus,
  cleanBidInput,
  cleanComparisonInput,
  cleanScopeItems,
  compareBids,
  coverageFlagged,
  coverageState,
  currencyOf,
  normalizeCompany,
  parsePercent,
  planInvites,
  readLinePrices,
  readScopeItems,
  spreadPct,
  toSharedBid,
  MAX_SCOPE_ITEMS,
  type SheetBid,
  type TrackerCert,
} from "@/lib/bid-compare/rules";
import { hashShareToken, isShareToken, newShareToken, shareTokenOpens } from "@/lib/bid-compare/share";
import { buildSheet, formatMoney, type BidRow, type BidderOrg } from "@/lib/bid-compare/view";
import { bidUnsubscribeUrl, verifyBidUnsubscribe } from "@/lib/bid-compare/unsubscribe";
import { bidAwardEmail, bidInviteEmail } from "@/lib/bid-compare/email-copy";
import { quotePath } from "@/lib/bid-compare/server";

const bid = (id: string, price: number | null, extra: Partial<SheetBid> = {}): SheetBid => ({ id, price, taxAmount: null, taxPercent: null, linePrices: {}, ...extra });

describe("bid comparison math", () => {
  it("finds the lowest price before tax and the spread", () => {
    const m = compareBids([bid("a", 48500), bid("b", 52000), bid("c", 61000)], []);
    expect(m.priced).toBe(3);
    expect(m.lowest).toBe(48500);
    expect(m.lowestIds).toEqual(["a"]);
    expect(m.highest).toBe(61000);
    // (61000 - 48500) / 48500 = 25.77...% → one decimal
    expect(m.spreadPct).toBe(25.8);
    expect(m.aboveLowest.a).toEqual({ amount: 0, pct: 0 });
    expect(m.aboveLowest.b).toEqual({ amount: 3500, pct: 7.2 });
  });

  it("keeps every bid tied at the lowest", () => {
    const m = compareBids([bid("a", 1000), bid("b", 1000), bid("c", 1500)], []);
    expect(m.lowestIds).toEqual(["a", "b"]);
  });

  it("ignores bids without a price for lowest and spread", () => {
    const m = compareBids([bid("a", null), bid("b", 2000)], []);
    expect(m.priced).toBe(1);
    expect(m.lowest).toBe(2000);
    expect(m.spreadPct).toBeNull();
    expect(m.aboveLowest.a).toBeNull();
    expect(m.total.a).toBeNull();
  });

  it("compares before tax, even when tax changes the order", () => {
    const m = compareBids([bid("a", 1000, { taxAmount: 300 }), bid("b", 1100, { taxAmount: 0 })], []);
    expect(m.lowestIds).toEqual(["a"]);
    expect(m.total.a).toBe(1300);
    expect(m.total.b).toBe(1100);
  });

  it("spreadPct needs two prices and a positive low", () => {
    expect(spreadPct([])).toBeNull();
    expect(spreadPct([100])).toBeNull();
    expect(spreadPct([0, 100])).toBeNull();
    expect(spreadPct([100, 100])).toBe(0);
    expect(spreadPct([100, 150])).toBe(50);
  });

  it("tax: an amount wins, else percent of the price, else unknown", () => {
    expect(bidTax({ price: 1000, taxAmount: 130, taxPercent: 5 })).toBe(130);
    expect(bidTax({ price: 1000, taxAmount: null, taxPercent: 13 })).toBe(130);
    // Quebec GST + QST
    expect(bidTax({ price: 1000, taxAmount: null, taxPercent: 14.975 })).toBe(149.75);
    expect(bidTax({ price: 1000, taxAmount: null, taxPercent: null })).toBeNull();
    expect(bidTax({ price: null, taxAmount: null, taxPercent: 13 })).toBeNull();
  });

  it("total = price + tax, rounded to cents; no tax stated = the price alone", () => {
    expect(bidTotal({ price: 0.1, taxAmount: 0.2, taxPercent: null })).toBe(0.3);
    expect(bidTotal({ price: 2500, taxAmount: null, taxPercent: 8.875 })).toBe(2721.88);
    expect(bidTotal({ price: 2500, taxAmount: null, taxPercent: null })).toBe(2500);
    expect(bidTotal({ price: null, taxAmount: 10, taxPercent: null })).toBeNull();
  });

  it("flags scope items a bid didn't quote and finds per-item lows", () => {
    const items = [
      { id: "tearoff", label: "Tear-off" },
      { id: "membrane", label: "Membrane" },
      { id: "flash", label: "Flashing" },
    ];
    const m = compareBids(
      [
        bid("a", 30000, { linePrices: { tearoff: 8000, membrane: 20000, flash: 2000 } }),
        bid("b", 28000, { linePrices: { tearoff: 7000, membrane: 21000 } }),
        bid("c", 31000, { linePrices: { tearoff: 7000, membrane: null } }),
      ],
      items,
    );
    expect(m.notQuoted.a).toEqual([]);
    expect(m.notQuoted.b).toEqual(["flash"]);
    expect(m.notQuoted.c).toEqual(["membrane", "flash"]);
    expect(m.items.tearoff.lowestIds).toEqual(["b", "c"]);
    expect(m.items.membrane.lowestIds).toEqual(["a"]);
    expect(m.items.membrane.notQuoted).toEqual(["c"]);
    // Only one bid quoted flashing: no "lowest" for a single price.
    expect(m.items.flash.lowestIds).toEqual([]);
    expect(m.items.flash.notQuoted).toEqual(["b", "c"]);
    expect(m.lineSum.a).toBe(30000);
    expect(m.lineSum.b).toBe(28000);
  });

  it("flags line items that don't add up to the price (only when every item is quoted)", () => {
    const items = [
      { id: "x", label: "X" },
      { id: "y", label: "Y" },
    ];
    const m = compareBids(
      [
        bid("ok", 1000, { linePrices: { x: 400, y: 600.5 } }),
        bid("off", 1000, { linePrices: { x: 400, y: 700 } }),
        bid("partial", 1000, { linePrices: { x: 400 } }),
      ],
      items,
    );
    expect(m.lineMismatch.ok).toBe(false);
    expect(m.lineMismatch.off).toBe(true);
    expect(m.lineMismatch.partial).toBe(false);
    expect(m.lineSum.partial).toBe(400);
  });

  it("currency follows the country", () => {
    expect(currencyOf("CA")).toBe("CAD");
    expect(currencyOf("US")).toBe("USD");
    expect(formatMoney(48500, "CA", "en")).toContain("48,500");
    expect(formatMoney(48500, "US", "en")).toContain("48,500");
    expect(formatMoney(48500, "US", "en")).not.toBe(formatMoney(48500, "CA", "en"));
    expect(formatMoney(1234.5, "CA", "en")).toContain("1,234.50");
  });
});

describe("insurance and WSIB coverage", () => {
  const cert = (over: Partial<TrackerCert>): TrackerCert => ({ vendor_name: "Acme Roofing Inc.", contact_email: null, vendor_organization_id: null, cert_type: "general_liability", status: "valid", ...over });

  it("best status: valid > expiring > undated > expired", () => {
    expect(bestCertStatus([])).toBeNull();
    expect(bestCertStatus(["expired", "valid"])).toBe("valid");
    expect(bestCertStatus(["expired", "missing"])).toBe("missing");
    expect(bestCertStatus(["expired", "expiring"])).toBe("expiring");
  });

  it("states and flags", () => {
    expect(coverageState({ tracker: "valid", profile: null })).toBe("on_file");
    expect(coverageState({ tracker: "expiring", profile: null })).toBe("expiring");
    expect(coverageState({ tracker: null, profile: "Insured, $5M" })).toBe("profile");
    expect(coverageState({ tracker: "expired", profile: "Insured" })).toBe("expired");
    expect(coverageState({ tracker: null, profile: "  " })).toBe("missing");
    expect(coverageState({ tracker: "missing", profile: null })).toBe("missing");
    expect(coverageFlagged("missing")).toBe(true);
    expect(coverageFlagged("expired")).toBe(true);
    expect(coverageFlagged("profile")).toBe(false);
    expect(coverageFlagged("on_file")).toBe(false);
  });

  it("matches tracker rows by PMRFP company, email or company name", () => {
    expect(normalizeCompany("Acme Roofing Inc.")).toBe(normalizeCompany("ACME roofing"));
    expect(normalizeCompany("Smith & Sons Ltd")).toBe(normalizeCompany("smith and sons"));
    const certs = [
      cert({}),
      cert({ vendor_name: "Other", contact_email: "Ops@Beta.ca", cert_type: "wsib_clearance", status: "expiring" }),
      cert({ vendor_name: "Third", vendor_organization_id: "org-3", cert_type: "workers_comp", status: "expired" }),
    ];
    expect(bidderCoverage({ companyName: "acme roofing", contactEmail: null, bidderOrgId: null }, certs, null)).toEqual({ insurance: "on_file", wsib: "missing" });
    expect(bidderCoverage({ companyName: "Beta Co", contactEmail: "ops@beta.ca", bidderOrgId: null }, certs, null)).toEqual({ insurance: "missing", wsib: "expiring" });
    expect(bidderCoverage({ companyName: "Gamma", contactEmail: null, bidderOrgId: "org-3" }, certs, { insurance_status: "Insured", wsib_status: null })).toEqual({
      insurance: "profile",
      wsib: "expired",
    });
  });
});

describe("fields", () => {
  const items = [
    { id: "a1", label: "Tear-off" },
    { id: "b2", label: "Membrane" },
  ];

  it("parsePercent", () => {
    expect(parsePercent("13")).toBe(13);
    expect(parsePercent("13%")).toBe(13);
    expect(parsePercent("14,975 %")).toBe(14.975);
    expect(parsePercent(8.875)).toBe(8.875);
    expect(parsePercent("101")).toBeNull();
    expect(parsePercent("-5")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
  });

  it("a comparison needs a title", () => {
    expect(cleanComparisonInput({ title: "  " })).toEqual({ ok: false, field: "title" });
    const r = cleanComparisonInput({ title: " Roof   replacement ", building_name: "12 King St", trade: "" });
    expect(r).toEqual({ ok: true, value: { title: "Roof replacement", building_name: "12 King St", building_address: null, trade: null } });
  });

  it("a bid: company required, price optional, tax amount wins over percent", () => {
    expect(cleanBidInput({ company_name: "" }, items)).toEqual({ ok: false, field: "company" });
    expect(cleanBidInput({ company_name: "Acme", contact_email: "nope" }, items)).toEqual({ ok: false, field: "email" });
    expect(cleanBidInput({ company_name: "Acme", total_price: "abc" }, items)).toEqual({ ok: false, field: "price" });
    expect(cleanBidInput({ company_name: "Acme", tax_percent: "200" }, items)).toEqual({ ok: false, field: "tax" });
    expect(cleanBidInput({ company_name: "Acme", start_date: "not a date" }, items)).toEqual({ ok: false, field: "date" });
    expect(cleanBidInput({ company_name: "Acme", line_a1: "x" }, items)).toEqual({ ok: false, field: "line" });

    const r = cleanBidInput(
      { company_name: "Acme", contact_email: "Ops@Acme.ca", total_price: "$48,500", tax_amount: "6305", tax_percent: "13", line_a1: "8000", line_b2: "", line_zz: "99", notes: "No disposal\r\n\r\n\r\nNo permits" },
      items,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.contact_email).toBe("ops@acme.ca");
    expect(r.value.total_price).toBe(48500);
    expect(r.value.tax_amount).toBe(6305);
    expect(r.value.tax_percent).toBeNull();
    // Only the comparison's own items, and empty ones are "not quoted".
    expect(r.value.line_prices).toEqual({ a1: 8000 });
    expect(r.value.notes).toBe("No disposal\n\nNo permits");

    const pct = cleanBidInput({ company_name: "Acme", total_price: "1000", tax_percent: "13%" }, items);
    expect(pct.ok && pct.value.tax_percent).toBe(13);
  });

  it("scope items: ids kept, new ids made, blanks dropped, capped", () => {
    let n = 0;
    const rand = () => ((n++ * 7) % 32) / 32;
    const out = cleanScopeItems([{ id: "keep1", label: " Tear-off " }, { label: "Membrane" }, { id: "keep1", label: "Dup id" }, { id: "BAD ID", label: "x" }, { label: "  " }], rand);
    expect(out.map((i) => i.label)).toEqual(["Tear-off", "Membrane", "Dup id", "x"]);
    expect(out[0].id).toBe("keep1");
    expect(new Set(out.map((i) => i.id)).size).toBe(4);
    for (const i of out) expect(i.id).toMatch(/^[a-z0-9]{1,16}$/);
    const many = cleanScopeItems(Array.from({ length: 40 }, (_, i) => ({ label: `Item ${i}` })));
    expect(many).toHaveLength(MAX_SCOPE_ITEMS);
  });

  it("reads stored jsonb defensively", () => {
    expect(readScopeItems(null)).toEqual([]);
    expect(readScopeItems([{ id: "a", label: "A" }, { id: 1 }, "x"])).toEqual([{ id: "a", label: "A" }]);
    expect(readLinePrices({ a: 10, b: "20.5", c: -1, d: "x" })).toEqual({ a: 10, b: 20.5 });
    expect(readLinePrices([1, 2])).toEqual({});
  });
});

describe("invites", () => {
  const c = (id: string, email: string | null, over: { org?: string; invited?: string } = {}) => ({ id, contact_email: email, bidder_organization_id: over.org ?? null, invited_at: over.invited ?? null });

  it("skips members, no email, already invited, duplicates, unsubscribed, and over today's limit", () => {
    const plan = planInvites(
      [
        c("member-org", "a@x.ca", { org: "org-1" }),
        c("member-email", "member@x.ca"),
        c("no-email", null),
        c("already", "b@x.ca", { invited: "2026-10-30T00:00:00Z" }),
        c("send-1", "C@x.ca"),
        c("dup", "c@x.ca"),
        c("unsub", "d@x.ca"),
        c("send-2", "e@x.ca"),
        c("over", "f@x.ca"),
      ],
      { suppressed: new Set(["d@x.ca"]), members: new Set(["member@x.ca"]), budget: 2 },
    );
    expect(plan.send).toEqual(["send-1", "send-2"]);
    expect(plan.skipped).toEqual({ onPmrfp: ["member-org", "member-email"], noEmail: ["no-email"], already: ["already", "dup"], unsubscribed: ["unsub"], overLimit: ["over"] });
  });

  it("a used-up allowance sends nothing", () => {
    const plan = planInvites([c("a", "a@x.ca")], { suppressed: new Set(), members: new Set(), budget: 0 });
    expect(plan.send).toEqual([]);
    expect(plan.skipped.overLimit).toEqual(["a"]);
  });
});

describe("share link", () => {
  it("makes unguessable, well-formed tokens", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(isShareToken(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(hashShareToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(a)).not.toContain(a);
  });

  it("opens only with the current token", () => {
    const token = newShareToken();
    const hash = hashShareToken(token);
    expect(shareTokenOpens(hash, token)).toBe(true);
    // Wrong token
    expect(shareTokenOpens(hash, newShareToken())).toBe(false);
    // Revoked (no hash stored)
    expect(shareTokenOpens(null, token)).toBe(false);
    expect(shareTokenOpens("", token)).toBe(false);
    // Replaced (a new token's hash is stored)
    expect(shareTokenOpens(hashShareToken(newShareToken()), token)).toBe(false);
    // Malformed tokens never reach the comparison
    expect(shareTokenOpens(hash, token.slice(1))).toBe(false);
    expect(shareTokenOpens(hash, `${token.slice(0, 31)}!`)).toBe(false);
    expect(shareTokenOpens(hash, null)).toBe(false);
    // A raw token stored instead of a hash doesn't count
    expect(shareTokenOpens(token, token)).toBe(false);
  });
});

describe("the sheet and the shared view", () => {
  const row = (over: Partial<BidRow>): BidRow => ({
    id: "b1",
    comparison_id: "c1",
    organization_id: "pm-org",
    position: 0,
    company_name: "Acme Roofing",
    contact_email: "ops@acme.ca",
    total_price: "48500.00",
    tax_amount: null,
    tax_percent: "13",
    line_prices: { a1: 8000 },
    start_date: null,
    duration: "3 weeks",
    warranty: "10 years",
    payment_terms: "Net 30",
    notes: null,
    bidder_organization_id: null,
    rfp_interest_id: null,
    file_path: "quotes/pm-org/c1/b1/x.pdf",
    file_name: "acme.pdf",
    file_uploaded_at: "2026-10-30T00:00:00Z",
    invited_at: "2026-10-31T00:00:00Z",
    created_at: "2026-10-30T00:00:00Z",
    ...over,
  });
  const orgs = new Map<string, BidderOrg>([["org-2", { id: "org-2", name: "Beta Roofing", slug: "beta-roofing", approved: true, insurance_status: "Insured", wsib_status: null }]]);
  const rows = [row({}), row({ id: "b2", position: 1, company_name: "Beta", contact_email: "hi@beta.ca", total_price: 52000, line_prices: {}, bidder_organization_id: "org-2", rfp_interest_id: "int-1" })];

  it("the owner's sheet keeps emails and files", () => {
    const v = buildSheet({ scopeItems: [{ id: "a1", label: "Tear-off" }], bids: rows, certs: [], orgs });
    expect(v.bids.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(v.bids[0].contactEmail).toBe("ops@acme.ca");
    expect(v.bids[0].hasFile).toBe(true);
    expect(v.bids[0].price).toBe(48500);
    expect(v.math.lowestIds).toEqual(["b1"]);
    expect(v.math.tax.b1).toBe(6305);
    expect(v.bids[1].onPmrfp).toBe(true);
    expect(v.bids[1].fromRfp).toBe(true);
    expect(v.bids[1].profileSlug).toBe("beta-roofing");
    expect(v.bids[1].insurance).toBe("profile");
    expect(v.bids[1].wsib).toBe("missing");
    expect(v.math.notQuoted.b2).toEqual(["a1"]);
  });

  it("the shared (board) view drops contact emails, files and invite stamps", () => {
    const v = buildSheet({ scopeItems: [], bids: rows, certs: [], orgs, shared: true });
    for (const b of v.bids) {
      expect(b.contactEmail).toBeNull();
      expect(b.hasFile).toBe(false);
      expect(b.fileName).toBeNull();
      expect(b.invitedAt).toBeNull();
    }
    expect(JSON.stringify(v)).not.toContain("@");
    expect(JSON.stringify(v)).not.toContain("quotes/");
  });

  it("toSharedBid keeps only board-safe fields", () => {
    const s = toSharedBid({ ...rows[1] });
    expect(Object.keys(s).sort()).toEqual(
      ["company_name", "duration", "id", "line_prices", "notes", "on_pmrfp", "payment_terms", "start_date", "tax_amount", "tax_percent", "total_price", "warranty"].sort(),
    );
    expect(s.total_price).toBe(52000);
    expect(s.on_pmrfp).toBe(true);
  });

  it("quote files live under the PM company's own prefix", () => {
    expect(quotePath("pm-org", "c1", "b1", "nonce", "application/pdf")).toBe("quotes/pm-org/c1/b1/nonce.pdf");
    expect(quotePath("pm-org", "c1", "b1", "nonce", "text/html")).toBe("quotes/pm-org/c1/b1/nonce.bin");
  });
});

describe("bidder emails", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("unsubscribe links are signed per bid", () => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
    const url = bidUnsubscribeUrl("https://example.test", "bid-1");
    expect(url).toMatch(/^https:\/\/example\.test\/api\/email\/bid-unsubscribe\?i=bid-1&t=/);
    const t = new URL(url!).searchParams.get("t");
    expect(verifyBidUnsubscribe("bid-1", t)).toBe(true);
    expect(verifyBidUnsubscribe("bid-2", t)).toBe(false);
    expect(verifyBidUnsubscribe("bid-1", "forged")).toBe(false);
    expect(verifyBidUnsubscribe(null, t)).toBe(false);
  });

  it("no secret, no link", () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(bidUnsubscribeUrl("https://example.test", "bid-1")).toBeNull();
    expect(verifyBidUnsubscribe("bid-1", "anything")).toBe(false);
  });

  const bits = { base: "https://example.test", company: "Maple <PM>", vendor: "Acme", title: "Roof & flashing", unsubscribeUrl: "https://example.test/u", mailingAddress: null as string | null };

  it("the award email carries the PMRFP pitch only with a mailing address", () => {
    const without = bidAwardEmail("en", { ...bits, contact: { name: "Pat", company: "Maple PM", email: "pat@maple.ca", phone: null } });
    expect(without.bodyHtml).not.toContain("PMRFP trade profile");
    expect(without.bodyHtml).toContain("pat@maple.ca");
    expect(without.bodyHtml).toContain("Maple &lt;PM&gt;");
    expect(without.bodyHtml).not.toContain("<PM>");
    expect(without.footnote).toContain("https://example.test/u");
    const withAddr = bidAwardEmail("en", { ...bits, mailingAddress: "1 Main St", contact: { name: null, company: null, email: null, phone: null } });
    expect(withAddr.bodyHtml).toContain("PMRFP trade profile");
    expect(withAddr.footnote).toContain("1 Main St");
  });

  it("the invite email escapes the PM's company name", () => {
    const e = bidInviteEmail("fr", { ...bits, mailingAddress: "1 Main St" });
    expect(e.title).toContain("Maple &lt;PM&gt;");
    expect(e.bodyHtml).not.toContain("<PM>");
    expect(e.subject).not.toMatch(/[\r\n]/);
  });
});
