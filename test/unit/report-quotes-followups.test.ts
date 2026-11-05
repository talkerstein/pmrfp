import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeDb, type FakeDb } from "./fake-supabase";

// No real model calls, emails, analytics or post-response work in tests.
vi.mock("@/lib/ai/gemini", () => ({ geminiClient: () => null, geminiAvailable: () => false, isQuotaError: () => false }));
vi.mock("@/lib/email/send", () => ({ sendTrustedQuoteRequest: vi.fn(async () => undefined) }));
vi.mock("@/lib/analytics", () => ({ EVENT: {}, trackEvent: vi.fn(async () => undefined) }));
const route = vi.hoisted(() => ({ db: null as unknown, after: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => route.db }));
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true, isSupabaseConfigured: () => true }));
vi.mock("@/lib/data/taxonomy", () => ({ getCategories: async () => [] }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: route.after }));

import {
  bidAmount,
  buildSummary,
  hashSummaryToken,
  hasMoney,
  isSummaryToken,
  newSummaryToken,
  stripAddress,
  stripMoney,
  summaryAddress,
  summaryCurrency,
  summarySharePath,
  summaryTitle,
  summaryTokenOpens,
  type SummaryInput,
} from "@/lib/report-quotes/summary";
import { createSummaryShare, loadInsurance, resolveSummaryShare, revokeSummaryShare, safeLogo } from "@/lib/report-quotes/summary-server";
import { readFromReport } from "@/lib/report-quotes/rfp-link";
import {
  bareAddress,
  cleanFrom,
  cleanSubject,
  hasLink,
  inboundConfig,
  inboxAddress,
  isOwnDomain,
  isPdfCandidate,
  isProviderDownloadUrl,
  newInboxToken,
  parseResendEvent,
  pickInboxToken,
  signPayload,
  signatureHeaders,
  verifySignature,
  type InboundEmail,
} from "@/lib/report-quotes/inbound";
import { processInboundEmail, purgeInboundLog, readCapped, resendDeps, type InboundDeps, type ProviderAttachment } from "@/lib/report-quotes/inbound-server";
import { DAILY_UPLOAD_LIMIT, MAX_REPORT_BYTES } from "@/lib/report-quotes/rules";
import {
  WIDGET_PATH_RE,
  fallbackHref,
  iframeSnippet,
  initialHeight,
  isCardWidget,
  reportQuotesLink,
  scriptSnippet,
  widgetLabel,
  widgetPath,
} from "@/lib/embed/widgets";
import { byteCapacity, formatBits, qrEncode, qrSvg, readFormatBits } from "@/lib/embed/qr";
import messages from "@/i18n/messages/reportQuotes";

const NOW = new Date("2026-11-01T15:00:00Z");
const asClient = (d: FakeDb) => d as unknown as SupabaseClient;

// ── Repair Cost Summary ──────────────────────────────────────────────

const REPORT = {
  title: "Pre-listing inspection 12 Elm St for tenant Jane Smith",
  report_type: "pre_listing" as const,
  country: "CA" as const,
  created_at: "2026-10-20T15:00:00Z",
  building_name: null,
  street_address: "12 Elm St",
  city: "Toronto",
  region: "Ontario",
};

const ITEMS: SummaryInput["items"] = [
  { trade_slug: "plumbing", item: "Leaking trap under kitchen sink (est. $250)", location: "Kitchen", urgency: "soon" },
  { trade_slug: "electrical", item: "Double-tapped breaker; Mrs. Lee says lights flicker", location: "Basement panel", urgency: "safety" },
  { trade_slug: "plumbing", item: "Water heater near end of life, budget $1,500-$2,000", location: "", urgency: "monitor" },
  { trade_slug: null, item: "Loose handrail", location: "Front steps", urgency: "soon" },
];

function input(over: Partial<SummaryInput> = {}): SummaryInput {
  return {
    report: REPORT,
    items: ITEMS,
    links: [],
    rfps: [],
    responses: [],
    tradeNames: {},
    insurance: {},
    sends: [],
    includeAddress: false,
    fallbackTitle: "Pre-listing inspection",
    ...over,
  };
}

describe("Repair Cost Summary: grouping and status", () => {
  it("groups items by trade, safety first, unassigned last", () => {
    const s = buildSummary(input());
    expect(s.groups.map((g) => g.tradeSlug)).toEqual(["electrical", "plumbing", null]);
    expect(s.groups[1].counts).toEqual({ safety: 0, soon: 1, monitor: 1 });
    expect(s.itemCount).toBe(4);
    expect(s.quoteCount).toBe(0);
    expect(s.groups.every((g) => g.status.kind === "notRequested")).toBe(true);
  });

  it("a quote request sent to trusted trades counts as requested on that day", () => {
    const s = buildSummary(input({ sends: [{ trade_slug: "electrical", initiated_at: "2026-10-22T10:00:00Z" }] }));
    expect(s.groups[0].status).toEqual({ kind: "requested", on: "2026-10-22T10:00:00Z" });
    expect(s.groups[1].status).toEqual({ kind: "notRequested" });
  });

  it("a linked RFP counts from when it was published; a rejected one and another company's don't count", () => {
    const s = buildSummary(
      input({
        links: [
          { trade_slug: "plumbing", rfp_id: "r1" },
          { trade_slug: "electrical", rfp_id: "r2" },
          { trade_slug: "electrical", rfp_id: "other-org" },
        ],
        rfps: [
          { id: "r1", status: "published", created_at: "2026-10-20T16:00:00Z", published_at: "2026-10-21T09:00:00Z" },
          { id: "r2", status: "rejected", created_at: "2026-10-20T16:00:00Z", published_at: null },
        ],
        responses: [{ rfp_id: "other-org", trade_organization_id: "t9", quote_amount: 100, quote_kind: "firm", start_date: null, created_at: "2026-10-23T09:00:00Z" }],
        tradeNames: { t9: "Elsewhere Electric" },
      }),
    );
    const plumbing = s.groups.find((g) => g.tradeSlug === "plumbing")!;
    const electrical = s.groups.find((g) => g.tradeSlug === "electrical")!;
    expect(plumbing.status).toEqual({ kind: "requested", on: "2026-10-21T09:00:00Z" });
    expect(electrical.status).toEqual({ kind: "notRequested" });
    expect(electrical.rfpIds).toEqual(["r2"]);
    expect(electrical.quotes).toEqual([]);
  });

  it("shows the real quotes trades sent, cheapest first, priceless last, with the insurance line only when on file", () => {
    const s = buildSummary(
      input({
        links: [{ trade_slug: "plumbing", rfp_id: "r1" }],
        rfps: [{ id: "r1", status: "published", created_at: "2026-10-20T16:00:00Z", published_at: "2026-10-21T09:00:00Z" }],
        responses: [
          { rfp_id: "r1", trade_organization_id: "a", quote_amount: "4800.00", quote_kind: "firm", start_date: "2026-11-10", created_at: "2026-10-24T09:00:00Z" },
          { rfp_id: "r1", trade_organization_id: "b", quote_amount: 3200, quote_kind: "estimate", start_date: null, created_at: "2026-10-25T09:00:00Z" },
          { rfp_id: "r1", trade_organization_id: "c", quote_amount: null, quote_kind: null, start_date: null, created_at: "2026-10-22T09:00:00Z" },
          { rfp_id: "r1", trade_organization_id: "nameless", quote_amount: 1, quote_kind: "firm", start_date: null, created_at: "2026-10-22T09:00:00Z" },
          { rfp_id: "r1", trade_organization_id: "d", quote_amount: "lots", quote_kind: "maybe", start_date: null, created_at: "2026-10-26T09:00:00Z" },
        ],
        tradeNames: { a: "Able Plumbing", b: "Best Drains", c: "City Pipes", d: "Dee's Plumbing" },
        insurance: { a: "2026-09-01T12:00:00Z" },
      }),
    );
    const plumbing = s.groups.find((g) => g.tradeSlug === "plumbing")!;
    expect(plumbing.status).toEqual({ kind: "quotes", count: 4 });
    expect(plumbing.quotes.map((q) => [q.tradeName, q.amount, q.kind])).toEqual([
      ["Best Drains", 3200, "estimate"],
      ["Able Plumbing", 4800, "firm"],
      ["City Pipes", null, null],
      ["Dee's Plumbing", null, null],
    ]);
    expect(plumbing.quotes[1].insuranceUploadedAt).toBe("2026-09-01T12:00:00Z");
    expect(plumbing.quotes[0].insuranceUploadedAt).toBeNull();
    expect(s.quoteCount).toBe(4);
  });

  it("only takes a sane bid amount", () => {
    expect(bidAmount("1200.50")).toBe(1200.5);
    expect(bidAmount(0)).toBe(0);
    expect(bidAmount(-5)).toBeNull();
    expect(bidAmount("abc")).toBeNull();
    expect(bidAmount(2e9)).toBeNull();
    expect(bidAmount(null)).toBeNull();
    expect(bidAmount("")).toBeNull();
  });

  it("uses one currency per country, never mixed", () => {
    expect(summaryCurrency("CA")).toBe("CAD");
    expect(summaryCurrency("US")).toBe("USD");
  });
});

describe("Repair Cost Summary: redaction", () => {
  it("never carries the street address unless the owner opts in", () => {
    const off = buildSummary(input());
    expect(off.address).toBeNull();
    expect(off.area).toBe("Toronto, Ontario");
    expect(off.title).not.toMatch(/Elm/);
    const on = buildSummary(input({ includeAddress: true }));
    expect(on.address).toBe("12 Elm St");
    expect(on.title).toContain("12 Elm St");
  });

  it("strips people's names from the title and every item", () => {
    const s = buildSummary(input({ includeAddress: true }));
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/Jane|Smith|Lee/);
    expect(s.title).toContain("tenant");
  });

  it("strips typed and street-shaped addresses from a title", () => {
    expect(stripAddress("Inspection – 1405-88 Harbour Street", {})).toBe("Inspection");
    expect(stripAddress("Rapport 4500 rue Sherbrooke Ouest", {})).toBe("Rapport");
    expect(stripAddress("Tower B condition assessment", { buildingName: "Tower B" })).toBe("condition assessment");
    // Numbers that aren't an address stay.
    expect(stripAddress("2026 annual inspection", {})).toBe("2026 annual inspection");
    expect(summaryTitle("12 Elm St", { streetAddress: "12 Elm St" }, false, "Home inspection")).toBe("Home inspection");
    expect(summaryAddress({ buildingName: "Unit 4", streetAddress: "12 Elm St" }, true)).toBe("Unit 4, 12 Elm St");
    expect(summaryAddress({ streetAddress: "12 Elm St" }, false)).toBeNull();
  });

  it("removes every dollar figure (estimates from the report or the AI), keeps other numbers", () => {
    const cases = [
      "Replace shingles (est. $8,000-$12,000)",
      "Coût estimé 1 500 $",
      "Approx. USD 300 to repair",
      "CA$800 budget",
      "Repair cost $8k",
      "Presupuesto: 2,000 USD",
    ];
    for (const c of cases) expect(hasMoney(stripMoney(c))).toBe(false);
    expect(stripMoney("Replace shingles (est. $8,000-$12,000)")).toBe("Replace shingles");
    expect(stripMoney("Replace 2 windows on the 3rd floor")).toBe("Replace 2 windows on the 3rd floor");
    expect(stripMoney("Panel is 100 amp")).toBe("Panel is 100 amp");
  });

  it("guard: no dollar sign or currency figure survives anywhere in a built summary's text", () => {
    const s = buildSummary(
      input({
        report: { ...REPORT, title: "Inspection ($450 fee)" },
        items: [
          { trade_slug: "roofing", item: "Roof at end of life, replacement $9,000–$14,000", location: "Main roof", urgency: "soon" },
          { trade_slug: "hvac", item: "Furnace service recommended (approx. 150 $)", location: "Basement $ room", urgency: "monitor" },
        ],
      }),
    );
    const words = [s.title, ...s.groups.flatMap((g) => g.items.flatMap((i) => [i.item, i.location]))];
    for (const w of words) expect(hasMoney(w), w).toBe(false);
  });
});

describe("Repair Cost Summary: the share link", () => {
  it("tokens are random, well formed, and only their hash is kept", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newSummaryToken()));
    expect(tokens.size).toBe(50);
    const t = [...tokens][0];
    expect(isSummaryToken(t)).toBe(true);
    expect(hashSummaryToken(t)).toBe(createHash("sha256").update(t).digest("hex"));
    expect(summarySharePath(t)).toBe(`/repair-summary/${t}`);
  });

  it("opens only with the current token's hash", () => {
    const t = newSummaryToken();
    const other = newSummaryToken();
    expect(summaryTokenOpens(hashSummaryToken(t), t)).toBe(true);
    expect(summaryTokenOpens(hashSummaryToken(t), other)).toBe(false);
    expect(summaryTokenOpens(null, t)).toBe(false);
    expect(summaryTokenOpens(hashSummaryToken(t).toUpperCase(), t)).toBe(false);
    expect(summaryTokenOpens(hashSummaryToken(t), "short")).toBe(false);
    expect(summaryTokenOpens(hashSummaryToken(t), `${t}x`)).toBe(false);
  });

  function shareDb() {
    return fakeDb(
      {
        quote_report_summaries: [],
        quote_reports: [{ id: "rep-1", organization_id: "org-1", created_by: "user-1", ...REPORT }],
      },
      { unique: { quote_report_summaries: (e, r) => e.report_id === r.report_id }, defaults: { quote_report_summaries: { include_address: false, open_count: 0 } } },
    );
  }
  const report = { id: "rep-1", organization_id: "org-1" };

  it("turning on stores the hash, never the token; opening counts", async () => {
    const d = shareDb();
    const token = (await createSummaryShare(asClient(d), report, "user-1", NOW))!;
    expect(token).toBeTruthy();
    expect(JSON.stringify(d.tables.quote_report_summaries)).not.toContain(token);
    expect(d.tables.quote_report_summaries[0].share_token_hash).toBe(hashSummaryToken(token));
    const opened = await resolveSummaryShare(asClient(d), token, NOW);
    expect(opened.state).toBe("open");
    if (opened.state === "open") {
      expect(opened.report.id).toBe("rep-1");
      expect(opened.includeAddress).toBe(false);
      expect(opened.preparedBy).toBe("user-1");
    }
    expect(d.tables.quote_report_summaries[0].open_count).toBe(1);
  });

  it("replacing the link closes the old one; turning off closes all", async () => {
    const d = shareDb();
    const first = (await createSummaryShare(asClient(d), report, "user-1", NOW))!;
    const second = (await createSummaryShare(asClient(d), report, "user-1", NOW))!;
    expect(second).not.toBe(first);
    expect(d.tables.quote_report_summaries).toHaveLength(1);
    expect((await resolveSummaryShare(asClient(d), first, NOW)).state).toBe("closed");
    expect((await resolveSummaryShare(asClient(d), second, NOW)).state).toBe("open");
    expect(await revokeSummaryShare(asClient(d), report, "user-1")).toBe(true);
    expect(d.tables.quote_report_summaries[0].share_token_hash).toBeNull();
    expect((await resolveSummaryShare(asClient(d), second, NOW)).state).toBe("closed");
  });

  it("a malformed token never reaches the database", async () => {
    const d = shareDb();
    expect((await resolveSummaryShare(asClient(d), "../../etc", NOW)).state).toBe("closed");
    expect(d.calls).toHaveLength(0);
  });

  it("insurance: a current general liability certificate with a file only; no table, no line", async () => {
    const d = fakeDb({
      vendor_certificates: [
        { organization_id: "org-1", vendor_organization_id: "a", cert_type: "general_liability", file_path: "x.pdf", file_uploaded_at: "2026-09-01T12:00:00Z", expires_on: "2027-01-01" },
        { organization_id: "org-1", vendor_organization_id: "b", cert_type: "general_liability", file_path: "y.pdf", file_uploaded_at: "2026-09-01T12:00:00Z", expires_on: "2026-10-01" },
        { organization_id: "org-1", vendor_organization_id: "c", cert_type: "wsib", file_path: "z.pdf", file_uploaded_at: "2026-09-01T12:00:00Z", expires_on: null },
        { organization_id: "org-1", vendor_organization_id: "e", cert_type: "general_liability", file_path: null, file_uploaded_at: null, expires_on: null },
        { organization_id: "org-2", vendor_organization_id: "f", cert_type: "general_liability", file_path: "w.pdf", file_uploaded_at: "2026-09-01T12:00:00Z", expires_on: null },
      ],
    });
    expect(await loadInsurance(asClient(d), "org-1", ["a", "b", "c", "e", "f"], NOW)).toEqual({ a: "2026-09-01T12:00:00Z" });
    expect(await loadInsurance(asClient(fakeDb({})), "org-1", ["a"], NOW)).toEqual({});
  });

  it("only an https logo goes on the page", () => {
    expect(safeLogo("https://cdn.example.com/logo.png")).toBe("https://cdn.example.com/logo.png");
    expect(safeLogo("http://cdn.example.com/logo.png")).toBeNull();
    expect(safeLogo("javascript:alert(1)")).toBeNull();
    expect(safeLogo(null)).toBeNull();
  });

  it("reads the prefilled RFP form's link back to the report", () => {
    const f = new FormData();
    f.set("fromReport", "0f9b7f0e-6a8a-4c1e-9d55-3f1f3b2b2a10");
    f.set("fromReportTrade", "plumbing");
    expect(readFromReport(f)).toEqual({ reportId: "0f9b7f0e-6a8a-4c1e-9d55-3f1f3b2b2a10", tradeSlug: "plumbing" });
    f.set("fromReportTrade", "Not A Slug");
    expect(readFromReport(f)).toBeNull();
    expect(readFromReport(new FormData())).toBeNull();
  });
});

// ── Email forwarding ─────────────────────────────────────────────────

const DOMAIN = "in.pmrfp.com";
const SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const CFG = { domain: DOMAIN, secret: SECRET, apiKey: "re_test" };
const TOKEN = "abcdefghij0123456789";

describe("inbound: switch and addresses", () => {
  it("is off unless the domain, secret and API key are all set", () => {
    expect(inboundConfig({})).toBeNull();
    expect(inboundConfig({ INBOUND_EMAIL_DOMAIN: DOMAIN, INBOUND_EMAIL_SECRET: SECRET })).toBeNull();
    expect(inboundConfig({ INBOUND_EMAIL_DOMAIN: "not a domain", INBOUND_EMAIL_SECRET: SECRET, RESEND_API_KEY: "re_x" })).toBeNull();
    expect(inboundConfig({ INBOUND_EMAIL_DOMAIN: DOMAIN, INBOUND_EMAIL_SECRET: "short", RESEND_API_KEY: "re_x" })).toBeNull();
    expect(inboundConfig({ INBOUND_EMAIL_DOMAIN: "IN.PMRFP.COM ", INBOUND_EMAIL_SECRET: SECRET, RESEND_API_KEY: "re_x" })).toEqual({ domain: DOMAIN, secret: SECRET, apiKey: "re_x" });
  });

  it("makes private, lowercase, rotatable tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => newInboxToken()));
    expect(tokens.size).toBe(100);
    for (const t of tokens) expect(t).toMatch(/^[a-z0-9]{20}$/);
    expect(inboxAddress(TOKEN, DOMAIN)).toBe(`r-${TOKEN}@${DOMAIN}`);
  });

  it("finds the token on our domain only (any case, plus-tags ignored), never in the sender", () => {
    expect(pickInboxToken([`Jane <r-${TOKEN}@${DOMAIN}>`], DOMAIN)).toBe(TOKEN);
    expect(pickInboxToken([`R-${TOKEN.toUpperCase()}@IN.PMRFP.COM`], DOMAIN)).toBe(TOKEN);
    expect(pickInboxToken([`r-${TOKEN}+listing@${DOMAIN}`], DOMAIN)).toBe(TOKEN);
    expect(pickInboxToken([`r-${TOKEN}@evil.example`], DOMAIN)).toBeNull();
    expect(pickInboxToken([`r-${TOKEN}@sub.${DOMAIN}`], DOMAIN)).toBeNull();
    expect(pickInboxToken([`r-short@${DOMAIN}`], DOMAIN)).toBeNull();
    expect(pickInboxToken(["agent@brokerage.example", `r-${TOKEN}@${DOMAIN}`], DOMAIN)).toBe(TOKEN);
    expect(bareAddress("Jane Doe <JANE@Example.com>")).toBe("jane@example.com");
    expect(isOwnDomain(`bounce@${DOMAIN}`, DOMAIN)).toBe(true);
    expect(isOwnDomain("inspector@example.com", DOMAIN)).toBe(false);
  });
});

describe("inbound: webhook signature", () => {
  const body = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });
  const ts = String(Math.floor(NOW.getTime() / 1000));
  const sig = signPayload(SECRET, "msg_1", ts, body);

  it("accepts a fresh, correctly signed body", () => {
    expect(verifySignature(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, SECRET, NOW.getTime())).toBe(true);
    // Several signatures while a secret rotates: any one may match.
    expect(verifySignature(body, { id: "msg_1", timestamp: ts, signature: `v1,bm9wZQ== v1,${sig}` }, SECRET, NOW.getTime())).toBe(true);
  });

  it("rejects a changed body, another id, an old or future timestamp, a wrong version or missing headers", () => {
    expect(verifySignature(`${body} `, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, SECRET, NOW.getTime())).toBe(false);
    expect(verifySignature(body, { id: "msg_2", timestamp: ts, signature: `v1,${sig}` }, SECRET, NOW.getTime())).toBe(false);
    expect(verifySignature(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, SECRET, NOW.getTime() + 6 * 60 * 1000)).toBe(false);
    expect(verifySignature(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, SECRET, NOW.getTime() - 6 * 60 * 1000)).toBe(false);
    expect(verifySignature(body, { id: "msg_1", timestamp: ts, signature: `v2,${sig}` }, SECRET, NOW.getTime())).toBe(false);
    expect(verifySignature(body, { id: null, timestamp: ts, signature: `v1,${sig}` }, SECRET, NOW.getTime())).toBe(false);
    expect(verifySignature(body, { id: "msg_1", timestamp: "abc", signature: `v1,${sig}` }, SECRET, NOW.getTime())).toBe(false);
    const otherSecret = `whsec_${randomBytes(24).toString("base64")}`;
    expect(verifySignature(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, otherSecret, NOW.getTime())).toBe(false);
  });

  it("reads the svix and Standard Webhooks header names", () => {
    expect(signatureHeaders(new Headers({ "svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x" }))).toEqual({ id: "a", timestamp: "1", signature: "v1,x" });
    expect(signatureHeaders(new Headers({ "webhook-id": "b", "webhook-timestamp": "2", "webhook-signature": "v1,y" }))).toEqual({ id: "b", timestamp: "2", signature: "v1,y" });
  });
});

describe("inbound: parsing the email", () => {
  it("reads Resend's email.received event and ignores anything else", () => {
    const email = parseResendEvent({
      type: "email.received",
      data: {
        email_id: "e1",
        from: "Inspector <inspector@example.com>",
        to: [`r-${TOKEN}@${DOMAIN}`],
        cc: ["agent@brokerage.example"],
        subject: "Fwd: Inspection report",
        attachments: [{ id: "a1", filename: "report.pdf", content_type: "application/pdf", size: 1000 }, { filename: "no-id.pdf" }],
      },
    })!;
    expect(email.messageId).toBe("e1");
    expect(email.recipients).toEqual([`r-${TOKEN}@${DOMAIN}`, "agent@brokerage.example"]);
    expect(email.attachments).toEqual([{ id: "a1", filename: "report.pdf", contentType: "application/pdf", size: 1000 }]);
    expect(parseResendEvent({ type: "email.sent", data: { email_id: "e1" } })).toBeNull();
    expect(parseResendEvent({ type: "email.received", data: {} })).toBeNull();
    expect(parseResendEvent(null)).toBeNull();
  });

  it("only PDFs are candidates (the bytes are checked again after download)", () => {
    expect(isPdfCandidate({ filename: "r.pdf", contentType: "application/pdf" })).toBe(true);
    expect(isPdfCandidate({ filename: "r", contentType: "application/pdf; name=r" })).toBe(true);
    expect(isPdfCandidate({ filename: "R.PDF", contentType: "application/octet-stream" })).toBe(true);
    expect(isPdfCandidate({ filename: "photo.png", contentType: "image/png" })).toBe(false);
    expect(isPdfCandidate({ filename: "r.docx", contentType: "application/octet-stream" })).toBe(false);
    expect(isPdfCandidate({ filename: "r.pdf", contentType: "text/html" })).toBe(false);
  });

  it("notices a link (never opened) and only downloads from the provider's own hosts", () => {
    expect(hasLink("Download your report: https://reports.example.com/x", null)).toBe(true);
    expect(hasLink(null, '<a href="https://reports.example.com/x">Report</a>')).toBe(true);
    expect(hasLink("No attachment, sorry.", "<p>Hi</p>")).toBe(false);
    expect(isProviderDownloadUrl("https://inbound-cdn.resend.com/att/1")).toBe(true);
    expect(isProviderDownloadUrl("http://inbound-cdn.resend.com/att/1")).toBe(false);
    expect(isProviderDownloadUrl("https://evil-resend.com/att/1")).toBe(false);
    expect(isProviderDownloadUrl("https://resend.com.evil.io/att/1")).toBe(false);
    expect(isProviderDownloadUrl("https://user:pw@resend.com/att/1")).toBe(false);
    expect(isProviderDownloadUrl("not a url")).toBe(false);
  });

  it("keeps a clean subject and a bare From address for the owner's log", () => {
    expect(cleanSubject("Fwd: FW: Inspection report\r\n")).toBe("Inspection report");
    expect(cleanSubject("TR: Rapport d'inspection")).toBe("Rapport d'inspection");
    expect(cleanFrom("Jane <jane@example.com>")).toBe("jane@example.com");
    expect(cleanFrom("not an address")).toBeNull();
  });

  it("refuses a download URL off the provider's hosts without fetching, and caps reads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const deps = resendDeps(CFG, asClient(fakeDb({})));
    expect(await deps.download("https://reports.example.com/x.pdf", MAX_REPORT_BYTES)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(await readCapped(new Response(new Uint8Array(20)), 10)).toBe("tooBig");
    expect(await readCapped(new Response(new Uint8Array(5), { headers: { "content-length": "999" } }), 10)).toBe("tooBig");
    const ok = await readCapped(new Response(new Uint8Array([1, 2, 3])), 10);
    expect(Buffer.isBuffer(ok) && ok.length).toBe(3);
  });
});

describe("inbound: processing one email", () => {
  const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200, 1)]);
  const ZIP = Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(200, 1)]);

  function tables(over: Record<string, Record<string, unknown>[]> = {}) {
    return fakeDb(
      {
        quote_report_inboxes: [{ organization_id: "org-1", user_id: "user-1", token: TOKEN }],
        organization_members: [{ organization_id: "org-1", user_id: "user-1" }],
        users_profile: [{ id: "user-1", primary_role: "real_estate_agent", status: "active" }],
        organizations: [{ id: "org-1", province: "Ontario", country: "CA" }],
        quote_report_inbound: [],
        quote_reports: [],
        ...over,
      },
      {
        unique: { quote_report_inbound: (e, r) => e.provider === r.provider && e.provider_message_id === r.provider_message_id },
        defaults: { quote_reports: { created_at: NOW.toISOString() }, quote_report_inbound: { outcome: "received", pdf_count: 0, report_ids: [] } },
      },
    );
  }

  function deps(files: Record<string, { meta: Partial<ProviderAttachment>; data: Buffer | "tooBig" | null }>, body: { text: string | null; html: string | null } | null = null) {
    const d = {
      listAttachments: vi.fn<InboundDeps["listAttachments"]>(async () =>
        Object.entries(files).map(([id, f]) => ({ id, filename: null, size: null, contentType: "application/pdf", downloadUrl: `https://inbound-cdn.resend.com/${id}`, ...f.meta })),
      ),
      getBody: vi.fn<InboundDeps["getBody"]>(async () => body),
      download: vi.fn<InboundDeps["download"]>(async (url) => files[url.split("/").pop()!]?.data ?? null),
      store: vi.fn<InboundDeps["store"]>(async () => true),
    };
    return d;
  }

  const email = (over: Partial<InboundEmail> = {}): InboundEmail => ({
    provider: "resend",
    messageId: "e1",
    from: "Inspector <inspector@example.com>",
    recipients: [`r-${TOKEN}@${DOMAIN}`],
    subject: "Fwd: 12 Elm inspection",
    attachments: [{ id: "a1", filename: "Inspection-Report.pdf", contentType: "application/pdf", size: PDF.length }],
    ...over,
  });

  it("turns a forwarded PDF into an upload for the inbox owner, waiting for review", async () => {
    const d = tables();
    const dp = deps({ a1: { meta: { filename: "Inspection-Report.pdf" }, data: PDF } });
    const res = await processInboundEmail(asClient(d), email(), CFG, dp, NOW);
    expect(res).toMatchObject({ status: "done", outcome: "created" });
    expect(d.tables.quote_reports).toHaveLength(1);
    expect(d.tables.quote_reports[0]).toMatchObject({ organization_id: "org-1", created_by: "user-1", source: "upload", country: "CA", report_type: "home_inspection" });
    expect(dp.store).toHaveBeenCalledTimes(1);
    expect(d.tables.quote_report_inbound[0]).toMatchObject({ outcome: "created", from_address: "inspector@example.com", subject: "12 Elm inspection", pdf_count: 1 });
    expect((d.tables.quote_report_inbound[0].report_ids as string[]).length).toBe(1);
  });

  it("a provider retry of the same email is a duplicate, not a second report", async () => {
    const d = tables();
    const dp = deps({ a1: { meta: {}, data: PDF } });
    await processInboundEmail(asClient(d), email(), CFG, dp, NOW);
    expect(await processInboundEmail(asClient(d), email(), CFG, dp, NOW)).toEqual({ status: "duplicate" });
    expect(d.tables.quote_reports).toHaveLength(1);
  });

  it("checks the bytes: a file named .pdf that isn't one is skipped", async () => {
    const d = tables();
    const dp = deps({ a1: { meta: { contentType: "application/octet-stream", filename: "report.pdf" }, data: ZIP } });
    const res = await processInboundEmail(asClient(d), email({ attachments: [{ id: "a1", filename: "report.pdf", contentType: "application/octet-stream", size: ZIP.length }] }), CFG, dp, NOW);
    expect(res).toMatchObject({ status: "done", outcome: "not_pdf", reportIds: [] });
    expect(d.tables.quote_reports).toHaveLength(0);
    expect(dp.store).not.toHaveBeenCalled();
  });

  it("over 15 MB is refused before downloading", async () => {
    const d = tables();
    const dp = deps({ a1: { meta: { size: MAX_REPORT_BYTES + 1 }, data: PDF } });
    const res = await processInboundEmail(asClient(d), email(), CFG, dp, NOW);
    expect(res).toMatchObject({ outcome: "too_big" });
    expect(dp.download).not.toHaveBeenCalled();
  });

  it("no PDF: records whether the email had a link, never opens it, ignores other attachments", async () => {
    const d = tables();
    const dp = deps({}, { text: "Your report is ready: https://reports.example.com/abc", html: null });
    const res = await processInboundEmail(asClient(d), email({ attachments: [{ id: "p1", filename: "photo.jpg", contentType: "image/jpeg", size: 10 }] }), CFG, dp, NOW);
    expect(res).toMatchObject({ outcome: "no_pdf_link" });
    expect(dp.download).not.toHaveBeenCalled();
    expect(dp.listAttachments).not.toHaveBeenCalled();
    expect(d.tables.quote_report_inbound[0].outcome).toBe("no_pdf_link");

    const d2 = tables();
    const res2 = await processInboundEmail(asClient(d2), email({ attachments: [] }), CFG, deps({}, { text: "Hi", html: null }), NOW);
    expect(res2).toMatchObject({ outcome: "no_pdf" });
  });

  it("respects the organization's daily upload cap", async () => {
    const full = Array.from({ length: DAILY_UPLOAD_LIMIT }, (_, i) => ({ id: `u${i}`, organization_id: "org-1", source: "upload", created_at: NOW.toISOString() }));
    const d = tables({ quote_reports: full });
    const dp = deps({ a1: { meta: {}, data: PDF } });
    expect(await processInboundEmail(asClient(d), email(), CFG, dp, NOW)).toMatchObject({ outcome: "cap" });
    expect(dp.listAttachments).not.toHaveBeenCalled();
    expect(d.tables.quote_reports).toHaveLength(DAILY_UPLOAD_LIMIT);

    // One upload left, three PDFs: only one is read.
    const d2 = tables({ quote_reports: full.slice(1) });
    const three = deps({ a1: { meta: {}, data: PDF }, a2: { meta: {}, data: PDF }, a3: { meta: {}, data: PDF } });
    const atts = ["a1", "a2", "a3"].map((id) => ({ id, filename: `${id}.pdf`, contentType: "application/pdf", size: PDF.length }));
    const res = await processInboundEmail(asClient(d2), email({ attachments: atts }), CFG, three, NOW);
    expect(res).toMatchObject({ outcome: "created" });
    expect(res.status === "done" && res.reportIds).toHaveLength(1);
    expect(three.download).toHaveBeenCalledTimes(1);
  });

  it("the token is the only key: unknown token, other domain, our own domain or a former member are ignored", async () => {
    const dp = deps({ a1: { meta: {}, data: PDF } });
    expect(await processInboundEmail(asClient(tables()), email({ recipients: ["r-zzzzzzzzzzzzzzzzzzzz@in.pmrfp.com"] }), CFG, dp, NOW)).toEqual({ status: "ignored", reason: "unknownInbox" });
    expect(await processInboundEmail(asClient(tables()), email({ recipients: [`r-${TOKEN}@other.example`] }), CFG, dp, NOW)).toEqual({ status: "ignored", reason: "noToken" });
    expect(await processInboundEmail(asClient(tables()), email({ from: `loop@${DOMAIN}` }), CFG, dp, NOW)).toEqual({ status: "ignored", reason: "ownDomain" });
    expect(await processInboundEmail(asClient(tables({ organization_members: [] })), email(), CFG, dp, NOW)).toEqual({ status: "ignored", reason: "notMember" });
    expect(
      await processInboundEmail(asClient(tables({ users_profile: [{ id: "user-1", primary_role: "trade_company", status: "active" }] })), email(), CFG, dp, NOW),
    ).toEqual({ status: "ignored", reason: "notMember" });
    // A From address that matches a member changes nothing without the token.
    expect(await processInboundEmail(asClient(tables()), email({ from: "user-1@example.com", recipients: ["hi@pmrfp.com"] }), CFG, dp, NOW)).toEqual({ status: "ignored", reason: "noToken" });
    expect(dp.store).not.toHaveBeenCalled();
  });

  it("before the migration, nothing happens", async () => {
    const d = fakeDb({});
    expect(await processInboundEmail(asClient(d), email(), CFG, deps({}), NOW)).toEqual({ status: "ignored", reason: "unavailable" });
  });

  it("an unexpected provider failure drops the log row so the retry can run", async () => {
    const d = tables();
    const dp = deps({ a1: { meta: {}, data: PDF } });
    dp.listAttachments.mockResolvedValueOnce(null);
    await expect(processInboundEmail(asClient(d), email(), CFG, dp, NOW)).rejects.toThrow();
    expect(d.tables.quote_report_inbound).toHaveLength(0);
    expect(await processInboundEmail(asClient(d), email(), CFG, dp, NOW)).toMatchObject({ outcome: "created" });
  });

  it("the daily purge forgets log rows after 90 days", async () => {
    const d = fakeDb({
      quote_report_inbound: [
        { id: "old", received_at: "2026-07-01T00:00:00Z" },
        { id: "new", received_at: "2026-10-30T00:00:00Z" },
      ],
    });
    expect(await purgeInboundLog(asClient(d), NOW)).toBe(1);
    expect(d.tables.quote_report_inbound.map((r) => r.id)).toEqual(["new"]);
  });
});

describe("inbound: the webhook route", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    route.after.mockClear();
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  async function post(body: string, headers: Record<string, string> = {}) {
    const { POST } = await import("@/app/api/inbound/report-email/route");
    return POST(new Request("https://pmrfp.com/api/inbound/report-email", { method: "POST", body, headers }));
  }
  function signed(body: string) {
    const ts = String(Math.floor(Date.now() / 1000));
    return { "svix-id": "msg_9", "svix-timestamp": ts, "svix-signature": `v1,${signPayload(SECRET, "msg_9", ts, body)}` };
  }

  it("answers 404 while the feature is switched off", async () => {
    delete process.env.INBOUND_EMAIL_DOMAIN;
    delete process.env.INBOUND_EMAIL_SECRET;
    const res = await post("{}");
    expect(res.status).toBe(404);
    const { GET } = await import("@/app/api/inbound/report-email/route");
    expect(GET().status).toBe(404);
  });

  it("rejects a bad signature, acknowledges other events, and never replies to anyone", async () => {
    process.env.INBOUND_EMAIL_DOMAIN = DOMAIN;
    process.env.INBOUND_EMAIL_SECRET = SECRET;
    process.env.RESEND_API_KEY = "re_test";
    route.db = fakeDb({});
    const body = JSON.stringify({ type: "email.sent", data: { email_id: "e1" } });
    expect((await post(body, { "svix-id": "msg_9", "svix-timestamp": "1", "svix-signature": "v1,bad" })).status).toBe(401);
    const ok = await post(body, signed(body));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, ignored: "event" });
    expect(route.after).not.toHaveBeenCalled();
  });

  it("a signed email for an unknown inbox is acknowledged and dropped", async () => {
    process.env.INBOUND_EMAIL_DOMAIN = DOMAIN;
    process.env.INBOUND_EMAIL_SECRET = SECRET;
    process.env.RESEND_API_KEY = "re_test";
    route.db = fakeDb({ quote_report_inboxes: [] });
    const body = JSON.stringify({ type: "email.received", data: { email_id: "e2", from: "x@example.com", to: [`r-${TOKEN}@${DOMAIN}`], subject: "Report", attachments: [] } });
    const res = await post(body, signed(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "ignored" });
  });
});

// ── The "Get repair quotes" widget ───────────────────────────────────

const BASE = "https://pmrfp.com";

describe("report-quotes widget", () => {
  const w = { kind: "report-quotes", ref: "acme-inspections", lang: "en" } as const;

  it("has one cacheable path per language and company handle, framed by the loader", () => {
    expect(widgetPath(w)).toBe("report-quotes/en/acme-inspections");
    expect(widgetPath({ ...w, lang: "fr" })).toBe("report-quotes/fr/acme-inspections");
    expect(WIDGET_PATH_RE.test("report-quotes/es/acme-inspections")).toBe(true);
    for (const bad of ["report-quotes/de/acme", "report-quotes/en", "report-quotes/en/a/b", "report-quotes/en/../admin"]) expect(WIDGET_PATH_RE.test(bad)).toBe(false);
    const loader = readFileSync(join(process.cwd(), "public", "embed.js"), "utf8");
    expect(loader).toContain(`var PATH = /${WIDGET_PATH_RE.source}/;`);
  });

  it("links to the Report → Quotes page with the owner's handle and widget UTM tags", () => {
    expect(reportQuotesLink(BASE, "acme-inspections", "en", "embed")).toBe(
      "https://pmrfp.com/inspection-report-to-quotes?ref=acme-inspections&utm_source=widget&utm_medium=embed&utm_campaign=report-quotes",
    );
    expect(reportQuotesLink(BASE, "acme-inspections", "fr", "qr")).toBe(
      "https://pmrfp.com/fr/inspection-report-to-quotes?ref=acme-inspections&utm_source=widget&utm_medium=qr&utm_campaign=report-quotes",
    );
    expect(reportQuotesLink(BASE, "../evil", "en")).toBe("https://pmrfp.com/inspection-report-to-quotes?utm_source=widget&utm_medium=embed&utm_campaign=report-quotes");
    expect(fallbackHref(BASE, w)).toBe(reportQuotesLink(BASE, "acme-inspections", "en", "embed"));
  });

  it("is a card: no item limit in the code, a short starting height, the button text in each language", () => {
    expect(isCardWidget("report-quotes")).toBe(true);
    const code = scriptSnippet(BASE, w, { theme: "light", limit: 5 });
    expect(code).toContain('data-pmrfp="report-quotes/en/acme-inspections"');
    expect(code).not.toContain("data-limit");
    expect(code).toContain("Get repair quotes from local trades");
    const iframe = iframeSnippet(BASE, w, { theme: "dark", limit: 5 });
    expect(iframe).toContain("#theme=dark\"");
    expect(iframe).toContain('height="210"');
    expect(initialHeight(w, { theme: "light", limit: 5 })).toBe(210);
    for (const lang of ["en", "fr", "es"] as const) expect(widgetLabel("report-quotes", lang)).toBe(messages[lang].widget.button);
  });
});

describe("QR code encoder", () => {
  // Reference output of an independent QR library for the same text, level M, mask 0.
  const HELLO = [
    "111111100110001111111",
    "100000101100001000001",
    "101110100101101011101",
    "101110100011001011101",
    "101110101100101011101",
    "100000100000101000001",
    "111111101010101111111",
    "000000000011100000000",
    "101010100101000010010",
    "001011000010001000011",
    "010100101110100011111",
    "110010000000001000010",
    "011010110010101010000",
    "000000001111010100111",
    "111111100011011100111",
    "100000100011110110000",
    "101110101011011100011",
    "101110100100001100110",
    "101110101110100010101",
    "100000100100001010010",
    "111111101110101100011",
  ];
  const rows = (text: string) => qrEncode(text)!.modules.map((r) => r.map((b) => (b ? "1" : "0")).join(""));
  const digest = (text: string) => createHash("sha256").update(rows(text).join("\n")).digest("hex");

  it("matches an independent encoder bit for bit", () => {
    const q = qrEncode("hello")!;
    expect([q.version, q.mask]).toEqual([1, 0]);
    expect(rows("hello")).toEqual(HELLO);
    // Multi-block versions with version information (v7, v8, v11, v15): the same reference library's
    // output with the mask this encoder picks (its own mask scoring can pick a different, equally valid mask).
    expect(digest("https://pmrfp.com/inspection-report-to-quotes?ref=acme-home-inspections&utm_source=widget&utm_medium=qr&utm_campaign=report-quotes")).toBe(
      "189b55a703aae5a4e962ce8223f8887e4f7beaf68fb7ddb3d315548f2be5757c",
    );
    expect(digest("https://pmrfp.com/fr/inspection-report-to-quotes?ref=a&utm_source=widget&utm_medium=qr&utm_campaign=report-quotes")).toBe(
      "8c459f48e63cb4ca6d399a3747f7fac413cc1febe0324566d8f0b485ba025724",
    );
    expect(digest("z".repeat(230))).toBe("1ea6fe44a94d63e673b713bdcefff939dba1c0c896b6bce88a57f1236f79809a");
    expect(digest("w".repeat(400))).toBe("a5250b3a1ca6936df6a854168699e6ff60f2dd138e6403f8e117008768573dff");
  });

  it("carries the format bits, finder patterns and dark module, and fits a long widget link", () => {
    const link = reportQuotesLink(BASE, "a".repeat(80), "fr", "qr");
    const q = qrEncode(link)!;
    expect(q.size).toBe(q.version * 4 + 17);
    expect(readFormatBits(q)).toBe(formatBits(q.mask));
    expect(q.modules[q.size - 8][8]).toBe(true);
    for (const [x, y] of [[0, 0], [q.size - 7, 0], [0, q.size - 7]]) {
      expect(q.modules[y][x] && q.modules[y + 6][x + 6] && q.modules[y + 3][x + 3] && !q.modules[y + 1][x + 1]).toBe(true);
    }
    for (let i = 8; i < q.size - 8; i++) expect(q.modules[6][i]).toBe(i % 2 === 0);
  });

  it("knows its capacity and refuses text that doesn't fit", () => {
    expect([byteCapacity(1), byteCapacity(10), byteCapacity(15)]).toEqual([14, 213, 412]);
    expect(qrEncode("x".repeat(412))).not.toBeNull();
    expect(qrEncode("x".repeat(413))).toBeNull();
  });

  it("draws a black-on-white SVG with a quiet zone and a safe title", () => {
    const q = qrEncode("hello")!;
    const svg = qrSvg(q, { title: "<Scan> & go" });
    expect(svg).toContain('viewBox="0 0 29 29"');
    expect(svg).toContain("<title>Scan  go</title>");
    expect(svg).toContain('fill="#000000"');
    expect(svg.match(/h1v1h-1z/g)!.length).toBe(HELLO.join("").split("").filter((c) => c === "1").length);
  });
});

// ── Copy ─────────────────────────────────────────────────────────────

describe("follow-up copy", () => {
  const keys = (o: unknown, p = ""): string[] =>
    o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p];
  const sections = ["summary", "inbound", "widget"] as const;

  it("English, French and Spanish have the same keys", () => {
    for (const s of sections) {
      expect(keys(messages.fr[s])).toEqual(keys(messages.en[s]));
      expect(keys(messages.es[s])).toEqual(keys(messages.en[s]));
    }
  });

  it("no dollar figures, no 'verified' or 'vetted' trades, no insurance claims beyond the certificate line", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      const text = JSON.stringify(sections.map((s) => messages[lang][s]));
      expect(text).not.toMatch(/\$/);
      expect(text).not.toMatch(/\bverified\b|\bvetted\b|licensed and insured|vérifiés|verificados/i);
    }
    expect(messages.en.summary.insurance).toBe("Insurance certificate on file (uploaded {date})");
  });

  it("Canada and US attach hints stay apart", () => {
    expect(messages.en.summary.attach.CA).toContain("OREA Form 120");
    expect(messages.en.summary.attach.US).not.toContain("OREA");
    expect(messages.en.summary.attach.US).toMatch(/repair request/);
  });
});
