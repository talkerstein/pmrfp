import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeDb, type FakeDb } from "./fake-supabase";

// No real model calls, emails or analytics in tests.
const gemini = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/ai/gemini", () => ({
  geminiClient: () => gemini.client,
  geminiAvailable: () => Boolean(gemini.client),
  isQuotaError: (e: unknown) => e instanceof Error && /quota|429/i.test(e.message),
}));
const email = vi.hoisted(() => ({ sendTrustedQuoteRequest: vi.fn<(args: Record<string, unknown>) => Promise<void>>(async () => undefined) }));
vi.mock("@/lib/email/send", () => ({ sendTrustedQuoteRequest: email.sendTrustedQuoteRequest }));
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn<(event: string, props: unknown, ctx: unknown) => Promise<void>>(async () => undefined) }));
vi.mock("@/lib/analytics", () => ({ EVENT: { QUOTE_REQUEST_POSTED: "quote_request_posted" }, trackEvent: analytics.trackEvent }));

import {
  DAILY_UPLOAD_LIMIT,
  MAX_ITEMS,
  MAX_REPORT_BYTES,
  RETENTION_DAYS,
  buildQuoteMessage,
  buildRfpPrefill,
  canUpload,
  capWindowStart,
  checkPdf,
  cleanEditorItems,
  cleanFileName,
  deleteAfter,
  groupItems,
  isPastRetention,
  isPdf,
  isStaleRun,
  itemSchema,
  mapTradeSlug,
  normalizeModelItems,
  normalizeUrgency,
  notRecentlySent,
  reportPath,
  reviewSchema,
  stripNames,
  titleFromFileName,
  uploadsLeft,
  type ReportItem,
} from "@/lib/report-quotes/rules";
import { extractReportItems, systemPrompt } from "@/lib/report-quotes/ai";
import { purgeExpiredReports, resolveShare, runExtraction, sendReportQuotes, type ReportRow, type SendQuotesInput } from "@/lib/report-quotes/server";
import { generateReviewToken, hashReviewToken } from "@/lib/projects/tokens";
import messages from "@/i18n/messages/reportQuotes";

const TRADES = [
  { slug: "electrical", name: "Electrical" },
  { slug: "plumbing", name: "Plumbing" },
  { slug: "roofing", name: "Roofing" },
  { slug: "hvac", name: "HVAC" },
  { slug: "masonry", name: "Masonry" },
  { slug: "carpentry", name: "Carpentry" },
  { slug: "glass-and-windows", name: "Glass and Windows" },
];

const en = messages.en;
const item = (over: Partial<ReportItem> = {}): ReportItem => ({ trade_slug: "electrical", item: "Double-tapped breaker", location: "Basement", urgency: "soon", source_page: 12, ...over });

// ── People's names ──────────────────────────────────────────────────

describe("stripNames: tenant and occupant names never reach a trade", () => {
  it("drops a name after a role word and keeps the role", () => {
    expect(stripNames("Tenant Jane Smith reports a leak under the sink")).toBe("Tenant reports a leak under the sink");
    expect(stripNames("Occupant: J. Smith says the outlet sparks")).toBe("Occupant says the outlet sparks");
    expect(stripNames("owner (Mark Lee) noted water in basement")).toBe("owner noted water in basement");
    expect(stripNames("locataire Marie Tremblay signale une fuite")).toBe("locataire signale une fuite");
    expect(stripNames("inquilino José García reporta humedad")).toBe("inquilino reporta humedad");
  });

  it("drops a name after an honorific", () => {
    const out = stripNames("Mrs. Lee mentioned the furnace is noisy; Mme Tremblay agreed");
    expect(out).not.toMatch(/Lee|Tremblay/);
    expect(out).toContain("mentioned the furnace is noisy");
  });

  it("drops every name the model listed, wherever it appears", () => {
    const out = stripNames("Leak reported by Priya Patel in Unit 4; Patel family away", ["Priya Patel", "Patel"]);
    expect(out).not.toMatch(/Priya|Patel/);
    expect(out).toContain("Unit 4");
  });

  it("keeps places that follow a role word, and leaves clean text untouched", () => {
    expect(stripNames("tenant Unit 4 bathroom fan not working")).toBe("tenant Unit 4 bathroom fan not working");
    expect(stripNames("Owner Kitchen faucet drips")).toBe("Owner Kitchen faucet drips");
    const clean = "Double-tapped breaker in main panel";
    expect(stripNames(clean)).toBe(clean);
  });
});

// ── Validation and trade mapping ───────────────────────────────────

describe("normalizeUrgency", () => {
  it("maps the words reports and models use", () => {
    expect(normalizeUrgency("High")).toBe("safety");
    expect(normalizeUrgency("Safety hazard")).toBe("safety");
    expect(normalizeUrgency("Repair soon")).toBe("soon");
    expect(normalizeUrgency("monitor")).toBe("monitor");
    expect(normalizeUrgency("Minor wear")).toBe("monitor");
  });
  it("falls back to 'soon' for anything unknown", () => {
    expect(normalizeUrgency("whenever")).toBe("soon");
    expect(normalizeUrgency("")).toBe("soon");
    expect(normalizeUrgency(null)).toBe("soon");
  });
});

describe("mapTradeSlug", () => {
  it("accepts a slug, a category name or a known alias", () => {
    expect(mapTradeSlug("electrical", TRADES)).toBe("electrical");
    expect(mapTradeSlug("HVAC", TRADES)).toBe("hvac");
    expect(mapTradeSlug("Glass and Windows", TRADES)).toBe("glass-and-windows");
    expect(mapTradeSlug("Glass & Windows", TRADES)).toBe("glass-and-windows");
    expect(mapTradeSlug("Electrician", TRADES)).toBe("electrical");
    expect(mapTradeSlug("plumber", TRADES)).toBe("plumbing");
    expect(mapTradeSlug("Chimney", TRADES)).toBe("masonry");
  });
  it("returns null (Other / unassigned) for unknown trades and aliases outside the taxonomy", () => {
    expect(mapTradeSlug("wizardry", TRADES)).toBeNull();
    expect(mapTradeSlug("other", TRADES)).toBeNull();
    expect(mapTradeSlug("", TRADES)).toBeNull();
    expect(mapTradeSlug(null, TRADES)).toBeNull();
    // "elevator" is an alias for elevator-services, which this taxonomy lacks.
    expect(mapTradeSlug("elevator", TRADES)).toBeNull();
  });
});

describe("itemSchema / reviewSchema", () => {
  it("accepts a clean item and rejects bad values", () => {
    expect(itemSchema.safeParse(item()).success).toBe(true);
    expect(itemSchema.safeParse(item({ trade_slug: null, source_page: null })).success).toBe(true);
    expect(itemSchema.safeParse({ ...item(), urgency: "urgent" }).success).toBe(false);
    expect(itemSchema.safeParse(item({ trade_slug: "Not A Slug" })).success).toBe(false);
    expect(itemSchema.safeParse(item({ item: "   " })).success).toBe(false);
    expect(itemSchema.safeParse(item({ source_page: 0 })).success).toBe(false);
    expect(itemSchema.safeParse(item({ item: "x".repeat(501) })).success).toBe(false);
  });
  it("caps the list and defaults the property details", () => {
    const base = { title: "12 Elm inspection", reportType: "home_inspection" as const };
    expect(reviewSchema.safeParse({ ...base, items: Array.from({ length: MAX_ITEMS + 1 }, () => item()) }).success).toBe(false);
    const ok = reviewSchema.parse({ ...base, items: [item()] });
    expect(ok).toMatchObject({ buildingName: "", streetAddress: "", city: "", region: "" });
    expect(reviewSchema.safeParse({ ...base, reportType: "appraisal", items: [] }).success).toBe(false);
  });
});

describe("normalizeModelItems", () => {
  it("normalizes, maps, strips names, drops empties and duplicates", () => {
    const out = normalizeModelItems(
      {
        items: [
          { trade_slug: "Electrician", item: "  Double-tapped   breaker in panel ", location: "Basement", urgency: "High", source_page: 12 },
          { trade_slug: "electrical", item: "Double-tapped breaker in panel", location: "basement", urgency: "soon", source_page: 3 },
          { trade_slug: "Wizard", item: "Odd smell reported by tenant Jane Smith", location: "Unit 2, Jane Smith's bedroom", urgency: "?", source_page: 0 },
          { trade_slug: "roofing", item: "", location: "", urgency: "monitor", source_page: 4 },
        ],
        names_to_redact: ["Jane Smith"],
      },
      TRADES,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ trade_slug: "electrical", item: "Double-tapped breaker in panel", location: "Basement", urgency: "safety", source_page: 12 });
    expect(out[1].trade_slug).toBeNull();
    expect(out[1].urgency).toBe("soon");
    expect(out[1].source_page).toBeNull();
    expect(JSON.stringify(out)).not.toContain("Jane");
  });
  it(`stops at ${MAX_ITEMS} items`, () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ trade_slug: "plumbing", item: `Leak ${i}`, location: "", urgency: "soon", source_page: 1 }));
    expect(normalizeModelItems({ items: many, names_to_redact: [] }, TRADES)).toHaveLength(MAX_ITEMS);
  });
});

describe("cleanEditorItems", () => {
  it("unassigns trades the taxonomy doesn't know and caps the list", () => {
    const out = cleanEditorItems([item({ trade_slug: "gone-trade" }), item({ trade_slug: "plumbing" })], TRADES);
    expect(out.map((i) => i.trade_slug)).toEqual([null, "plumbing"]);
    expect(cleanEditorItems(Array.from({ length: MAX_ITEMS + 5 }, () => item()), TRADES)).toHaveLength(MAX_ITEMS);
  });
});

// ── Grouping ────────────────────────────────────────────────────────

describe("groupItems", () => {
  it("puts safety groups first, unassigned last, and sorts items by urgency then report order", () => {
    const groups = groupItems([
      item({ trade_slug: "plumbing", item: "Slow drain", urgency: "monitor" }),
      item({ trade_slug: null, item: "Loose railing", urgency: "safety" }),
      item({ trade_slug: "electrical", item: "Open junction box", urgency: "soon" }),
      item({ trade_slug: "electrical", item: "Double-tapped breaker", urgency: "safety" }),
      item({ trade_slug: "plumbing", item: "Leaking trap", urgency: "soon" }),
      item({ trade_slug: "electrical", item: "Missing cover plate", urgency: "soon" }),
    ]);
    expect(groups.map((g) => g.tradeSlug)).toEqual(["electrical", "plumbing", null]);
    expect(groups[0].items.map((i) => i.item)).toEqual(["Double-tapped breaker", "Open junction box", "Missing cover plate"]);
    expect(groups[0].counts).toEqual({ safety: 1, soon: 2, monitor: 0 });
    expect(groups[1].items.map((i) => i.item)).toEqual(["Leaking trap", "Slow drain"]);
    expect(groups[2].items).toHaveLength(1);
  });
  it("breaks ties by the trades PMs hire most, then A-Z", () => {
    const groups = groupItems([
      item({ trade_slug: "masonry", urgency: "soon" }),
      item({ trade_slug: "electrical", urgency: "soon" }),
      item({ trade_slug: "carpentry", urgency: "soon" }),
      item({ trade_slug: "roofing", urgency: "soon" }),
    ]);
    expect(groups.map((g) => g.tradeSlug)).toEqual(["roofing", "electrical", "carpentry", "masonry"]);
  });
  it("returns no groups for no items", () => {
    expect(groupItems([])).toEqual([]);
  });
});

// ── Caps, files, retention ──────────────────────────────────────────

describe("daily upload cap", () => {
  it(`allows ${DAILY_UPLOAD_LIMIT} uploads per organization per 24 hours`, () => {
    expect(uploadsLeft(0)).toBe(10);
    expect(uploadsLeft(9)).toBe(1);
    expect(uploadsLeft(10)).toBe(0);
    expect(uploadsLeft(25)).toBe(0);
    expect(uploadsLeft(-2)).toBe(10);
    expect(canUpload(9)).toBe(true);
    expect(canUpload(10)).toBe(false);
  });
  it("counts in a rolling 24-hour window", () => {
    expect(capWindowStart(new Date("2026-11-01T12:00:00.000Z"))).toBe("2026-10-31T12:00:00.000Z");
  });
});

describe("retention", () => {
  it(`deletes the file ${RETENTION_DAYS} days after upload`, () => {
    const up = new Date("2026-11-01T00:00:00.000Z");
    const due = deleteAfter(up);
    expect(due.toISOString()).toBe("2027-01-30T00:00:00.000Z");
    expect(isPastRetention(due, new Date("2027-01-29T23:59:59.000Z"))).toBe(false);
    expect(isPastRetention(due.toISOString(), due)).toBe(true);
  });
});

describe("isStaleRun", () => {
  it("treats a read stuck on 'running' for over 5 minutes as failed", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");
    expect(isStaleRun("running", "2026-11-01T11:54:00.000Z", now)).toBe(true);
    expect(isStaleRun("running", "2026-11-01T11:57:00.000Z", now)).toBe(false);
    expect(isStaleRun("done", "2026-10-01T00:00:00.000Z", now)).toBe(false);
  });
});

describe("PDF checks", () => {
  const bytes = (s: string) => new TextEncoder().encode(s);
  it("checks the file's bytes, not its name", () => {
    expect(isPdf(bytes("%PDF-1.7\n%âãÏÓ"))).toBe(true);
    expect(isPdf(bytes(`${" ".repeat(200)}%PDF-1.4`))).toBe(true);
    expect(isPdf(bytes(`${" ".repeat(1100)}%PDF-1.4`))).toBe(false);
    expect(isPdf(bytes("PK\u0003\u0004 not a pdf"))).toBe(false);
  });
  it("enforces empty / 15 MB / type", () => {
    expect(checkPdf(0, bytes("%PDF-"))).toEqual({ ok: false, error: "empty" });
    expect(checkPdf(MAX_REPORT_BYTES + 1, bytes("%PDF-"))).toEqual({ ok: false, error: "tooBig" });
    expect(checkPdf(MAX_REPORT_BYTES, bytes("%PDF-1.7"))).toEqual({ ok: true });
    expect(checkPdf(1000, bytes("<html>"))).toEqual({ ok: false, error: "type" });
  });
  it("cleans file names and builds the title and storage key", () => {
    expect(cleanFileName("C:\\Users\\me\\12 Elm report.pdf")).toBe("12 Elm report.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("bad\u0000name\u001f.pdf")).toBe("badname.pdf");
    expect(cleanFileName("")).toBeNull();
    expect(titleFromFileName("2026-10_Inspection_12 Elm.PDF", "Report")).toBe("2026-10 Inspection 12 Elm");
    expect(titleFromFileName(null, "Report")).toBe("Report");
    expect(reportPath("org-1", "rep-1", "ab/c..d=")).toBe("org-1/rep-1/abcd.pdf");
  });
});

// ── What trades see ─────────────────────────────────────────────────

const PLACE = { buildingName: "Elm Court", streetAddress: "12 Elm St", city: "Toronto", region: "Ontario" };
const RFP_STRINGS = { ...en.rfp, urgency: en.urgency, page: en.page, reportType: en.reportTypeInline.home_inspection };
const QUOTE_STRINGS = { ...en.quote, urgency: en.urgency, page: en.page, reportType: en.reportTypeInline.home_inspection };

describe("buildRfpPrefill", () => {
  const [group] = groupItems([
    item({ item: "Double-tapped breaker; tenant Jane Smith noticed flicker", urgency: "safety", source_page: 12 }),
    item({ item: "Missing cover plate", location: "Garage", urgency: "soon", source_page: null }),
  ]);

  it("shows the city / area but never the street address unless included", () => {
    const out = buildRfpPrefill(group, "Electrical", PLACE, false, RFP_STRINGS);
    expect(out.title).toBe("Electrical: 2 repair items from the home inspection in Toronto");
    expect(out.scope).toContain("- Toronto, Ontario");
    expect(out.scope).not.toContain("12 Elm St");
    expect(out.scope).not.toContain("Elm Court");
    expect(out.summary).toContain("1 safety, 1 repair soon, 0 to monitor");
    expect(buildRfpPrefill(group, "Electrical", PLACE, true, RFP_STRINGS).scope).toContain("- Elm Court, 12 Elm St");
  });

  it("lists items with urgency and page, without people's names", () => {
    const out = buildRfpPrefill(group, "Electrical", PLACE, false, RFP_STRINGS);
    expect(out.scope).toContain("- [Safety] Double-tapped breaker; tenant noticed flicker (Basement, p. 12)");
    expect(out.scope).toContain("- [Repair soon] Missing cover plate (Garage)");
    expect(out.scope).not.toContain("Jane");
    expect(out.scope).not.toMatch(/\$\s?\d/);
  });
});

describe("buildQuoteMessage", () => {
  const items = [item({ item: "Occupant: J. Smith says the outlet sparks", urgency: "safety", location: "Kitchen" })];
  it("never includes the street address unless the user ticks it", () => {
    const msg = buildQuoteMessage(items, "Electrical", PLACE, false, QUOTE_STRINGS, "Dana Realtor\nAcme Realty");
    expect(msg.startsWith("Hello, I'd like a quote for these Electrical items from the recent home inspection:")).toBe(true);
    expect(msg).toContain("Property: Toronto, Ontario");
    expect(msg).not.toContain("12 Elm St");
    expect(msg.endsWith("Dana Realtor\nAcme Realty")).toBe(true);
    expect(buildQuoteMessage(items, "Electrical", PLACE, true, QUOTE_STRINGS, "")).toContain("Address: Elm Court, 12 Elm St");
  });
  it("strips occupants' names from the items", () => {
    const msg = buildQuoteMessage(items, "Electrical", PLACE, false, QUOTE_STRINGS, "");
    expect(msg).toContain("- [Safety] Occupant says the outlet sparks (Kitchen, p. 12)");
    expect(msg).not.toContain("Smith");
  });
});

describe("notRecentlySent", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  const sends = [
    { trade_slug: "electrical", recipient_organization_ids: ["t1"], initiated_at: "2026-10-29T12:00:00.000Z" },
    { trade_slug: "electrical", recipient_organization_ids: ["t2"], initiated_at: "2026-10-20T12:00:00.000Z" },
    { trade_slug: "plumbing", recipient_organization_ids: ["t3"], initiated_at: "2026-10-31T12:00:00.000Z" },
  ];
  it("skips a company already sent this trade group in the last 7 days", () => {
    expect(notRecentlySent(["t1", "t2", "t3", "t3"], sends, "electrical", now)).toEqual({ send: ["t2", "t3"], skipped: ["t1"] });
    expect(notRecentlySent(["t3"], sends, "plumbing", now)).toEqual({ send: [], skipped: ["t3"] });
  });
});

// ── Copy and prompt guardrails ──────────────────────────────────────

function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.length && typeof v[0] === "object" ? v.map(shape) : `array`;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}

describe("copy guardrails", () => {
  it("French and Spanish have every English key", () => {
    expect(shape(messages.fr)).toEqual(shape(messages.en));
    expect(shape(messages.es)).toEqual(shape(messages.en));
  });
  it("makes no trust claims and no dollar figures", () => {
    const text = JSON.stringify(messages);
    expect(text).not.toMatch(/\b(verified|vetted)\b|licensed and insured|insured local/i);
    expect(text).not.toMatch(/\$\s?\d/);
    expect(en.review.safetyBanner).toBe("Safety item: confirm with a licensed professional.");
    expect(en.dash.disclaimer).toMatch(/not a substitute for a licensed home inspector or engineer/i);
  });
  it("tells the model to restate the report only: no prices, no names, a page for every item", () => {
    const p = systemPrompt(TRADES);
    expect(p).toMatch(/Never output prices, cost estimates or dollar amounts/);
    expect(p).toMatch(/never write anyone's name/i);
    expect(p).toMatch(/Every item must point at the page/);
    expect(p).toContain("electrical: Electrical");
  });
});

// ── Extraction (model mocked) ───────────────────────────────────────

function fakeGemini(responses: (string | Error)[]) {
  const generateContent = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { text: next ?? "" };
  });
  return { models: { generateContent }, files: { upload: vi.fn(), delete: vi.fn(async () => ({})) } };
}

const MODEL_JSON = JSON.stringify({
  items: [
    { trade_slug: "electrical", item: "Double-tapped breaker; tenant Ann Lee saw sparks", location: "Basement", urgency: "safety", source_page: 12 },
    { trade_slug: "roofer", item: "Worn shingles on north slope", location: "Roof", urgency: "monitor", source_page: 4 },
  ],
  names_to_redact: ["Ann Lee"],
});

describe("extractReportItems", () => {
  const opts = { trades: TRADES, country: "CA" as const, reportType: "home_inspection" as const };
  const pdf = Buffer.from("%PDF-1.7 test");

  it("falls back to manual entry when no model is configured", async () => {
    gemini.client = null;
    expect(await extractReportItems(pdf, opts)).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("returns normalized items without names", async () => {
    gemini.client = fakeGemini([MODEL_JSON]);
    const out = await extractReportItems(pdf, opts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items.map((i) => i.trade_slug)).toEqual(["electrical", "roofing"]);
    expect(JSON.stringify(out.items)).not.toContain("Ann");
  });

  it("tries the next model on a bad answer, and stops on quota", async () => {
    const g = fakeGemini(["not json", JSON.stringify({ items: "nope" }), MODEL_JSON]);
    gemini.client = g;
    expect((await extractReportItems(pdf, opts)).ok).toBe(true);
    expect(g.models.generateContent).toHaveBeenCalledTimes(3);

    const q = fakeGemini([new Error("429 quota exceeded"), MODEL_JSON]);
    gemini.client = q;
    expect(await extractReportItems(pdf, opts)).toMatchObject({ ok: false, reason: "quota" });
    expect(q.models.generateContent).toHaveBeenCalledTimes(1);
  });
});

// ── Server flows against a fake database ────────────────────────────

interface FakeStorage {
  removed: string[][];
  signed: [string, number][];
  from: () => {
    remove: (paths: string[]) => Promise<{ data: null; error: { message: string } | null }>;
    createSignedUrl: (path: string, seconds: number) => Promise<{ data: { signedUrl: string }; error: null }>;
    download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
  };
}

function fakeStorage(opts: { removeError?: boolean; file?: Blob | null } = {}): FakeStorage {
  const s: FakeStorage = {
    removed: [],
    signed: [],
    from: () => ({
      remove: async (paths) => {
        s.removed.push(paths);
        return { data: null, error: opts.removeError ? { message: "storage down" } : null };
      },
      createSignedUrl: async (path, seconds) => {
        s.signed.push([path, seconds]);
        return { data: { signedUrl: `https://storage.example/${path}?token=x` }, error: null };
      },
      download: async () => (opts.file ? { data: opts.file, error: null } : { data: null, error: { message: "missing" } }),
    }),
  };
  return s;
}

const asClient = (db: FakeDb, storage?: FakeStorage) => Object.assign(db, { storage }) as unknown as SupabaseClient;

const NOW = new Date("2026-11-01T12:00:00.000Z");
const FUTURE = "2027-01-30T12:00:00.000Z";
const PAST = "2026-10-30T12:00:00.000Z";
const U = "user-1";
const ORG = "org-1";
const R = "report-1";

describe("runExtraction", () => {
  const report = {
    id: R,
    organization_id: ORG,
    file_path: `${ORG}/${R}/abc.pdf`,
    report_deleted_after: "2099-01-01T00:00:00.000Z",
    country: "CA",
    report_type: "home_inspection",
  } as ReportRow;

  function db() {
    return fakeDb({
      quote_reports: [{ ...report, extraction_status: "none" }],
      quote_report_items: [
        { id: "old-ai", report_id: R, item: "Old AI item", origin: "ai" },
        { id: "typed", report_id: R, item: "Typed by the user", origin: "manual" },
      ],
    });
  }

  it("replaces earlier AI items, keeps the user's own, and marks the report done", async () => {
    gemini.client = fakeGemini([MODEL_JSON]);
    const d = db();
    const out = await runExtraction(asClient(d, fakeStorage({ file: new Blob(["%PDF-1.7"]) })), report, TRADES);
    expect(out).toEqual({ status: "done", count: 2 });
    const items = d.tables.quote_report_items;
    expect(items.map((i) => i.item)).not.toContain("Old AI item");
    expect(items.map((i) => i.item)).toContain("Typed by the user");
    expect(items.filter((i) => i.origin === "ai")).toHaveLength(2);
    expect(items.every((i) => !String(i.item).includes("Ann"))).toBe(true);
    expect(d.tables.quote_reports[0].extraction_status).toBe("done");
  });

  it("leaves the user able to type items when the model isn't available", async () => {
    gemini.client = null;
    const d = db();
    const out = await runExtraction(asClient(d, fakeStorage({ file: new Blob(["%PDF-1.7"]) })), report, TRADES);
    expect(out).toEqual({ status: "manual", reason: "unavailable" });
    expect(d.tables.quote_reports[0].extraction_status).toBe("unavailable");
    expect(d.tables.quote_report_items).toHaveLength(2);
  });

  it("never reads a file past its delete date", async () => {
    const out = await runExtraction(asClient(db(), fakeStorage()), { ...report, report_deleted_after: PAST }, TRADES);
    expect(out).toEqual({ status: "manual", reason: "expired" });
  });
});

describe("sendReportQuotes", () => {
  const requester = { name: "Dana Realtor", email: "dana@example.com", phone: null };

  function seed(over: { reviewed_at?: string | null; file_path?: string | null } = {}) {
    return fakeDb({
      quote_reports: [
        {
          id: R,
          organization_id: ORG,
          reviewed_at: over.reviewed_at === undefined ? "2026-11-01T11:00:00.000Z" : over.reviewed_at,
          file_path: over.file_path === undefined ? `${ORG}/${R}/abc.pdf` : over.file_path,
          report_deleted_after: FUTURE,
        },
      ],
      quote_report_items: [
        { id: "i1", report_id: R, trade_slug: "electrical" },
        { id: "i2", report_id: R, trade_slug: "electrical" },
        { id: "i3", report_id: R, trade_slug: "plumbing" },
      ],
      trusted_list_items: [
        { owner_id: U, organization_id: "t-ok" },
        { owner_id: U, organization_id: "t-suppressed" },
        { owner_id: U, organization_id: "t-pending" },
        { owner_id: U, organization_id: "t-recent" },
        { owner_id: "someone-else", organization_id: "t-not-mine" },
      ],
      organizations: [
        { id: "t-ok", name: "Bright Spark Electric", slug: "bright-spark", email: "Office@BrightSpark.example", profile_status: "approved" },
        { id: "t-suppressed", name: "Bounced Electric", slug: "bounced", email: "gone@bounced.example", profile_status: "approved" },
        { id: "t-pending", name: "Pending Electric", slug: "pending", email: "p@pending.example", profile_status: "pending_review" },
        { id: "t-recent", name: "Recent Electric", slug: "recent", email: "r@recent.example", profile_status: "approved" },
        { id: "t-not-mine", name: "Stranger Electric", slug: "stranger", email: "s@stranger.example", profile_status: "approved" },
      ],
      quote_report_sends: [{ id: "s-old", report_id: R, trade_slug: "electrical", recipient_organization_ids: ["t-recent"], initiated_at: "2026-10-30T12:00:00.000Z" }],
      email_suppressions: [{ email_key: "gone@bounced.example" }],
      trusted_lists: [{ owner_id: U, handle: "dana", display_name: "Dana Realtor", brokerage: "Acme Realty", published: true }],
      contact_requests: [],
    });
  }

  const input = (over: Partial<SendQuotesInput> = {}): SendQuotesInput => ({
    userId: U,
    requester,
    reportId: R,
    tradeSlug: "electrical",
    recipientIds: ["t-ok", "t-suppressed", "t-pending", "t-recent", "t-not-mine"],
    message: "Hello, tenant Jane Smith says the panel buzzes.\n- [Safety] Double-tapped breaker (Basement, p. 12)",
    includeAddress: false,
    attachReport: false,
    attachTemplate: en.quote.attach,
    formatDate: (iso) => iso.slice(0, 10),
    ...over,
  });

  beforeEach(() => {
    email.sendTrustedQuoteRequest.mockClear();
    analytics.trackEvent.mockClear();
  });

  it("refuses to send before the list has been reviewed", async () => {
    const d = seed({ reviewed_at: null });
    expect(await sendReportQuotes(asClient(d), asClient(d), input(), NOW)).toEqual({ ok: false, error: "notReviewed" });
    expect(email.sendTrustedQuoteRequest).not.toHaveBeenCalled();
    expect(d.tables.quote_report_sends).toHaveLength(1);
  });

  it("sends only to approved trades on the user's own list, honouring suppressions and the 7-day guard", async () => {
    const d = seed();
    const out = await sendReportQuotes(asClient(d), asClient(d), input(), NOW);
    expect(out).toEqual({ ok: true, sent: 1, skipped: 1, suppressed: 1 });

    expect(email.sendTrustedQuoteRequest).toHaveBeenCalledTimes(1);
    const args = email.sendTrustedQuoteRequest.mock.calls[0][0];
    expect(args).toMatchObject({
      to: "Office@BrightSpark.example",
      tradeName: "Bright Spark Electric",
      recommender: "Dana Realtor (Acme Realty)",
      requester,
      cc: ["dana@example.com"],
    });
    expect(String(args.pageUrl)).toMatch(/\/trusted\/dana$/);
    expect(String(args.message)).not.toContain("Jane");
    expect(String(args.message)).not.toContain("/api/report-quotes/shared/");

    const log = d.tables.quote_report_sends.find((s) => s.id !== "s-old")!;
    expect(log).toMatchObject({
      report_id: R,
      organization_id: ORG,
      initiated_by: U,
      initiated_at: NOW.toISOString(),
      trade_slug: "electrical",
      recipient_organization_ids: ["t-ok"],
      item_count: 2,
      include_address: false,
      attach_report: false,
      share_token_hash: null,
    });

    expect(d.tables.contact_requests).toHaveLength(1);
    const contact = d.tables.contact_requests[0];
    expect(contact).toMatchObject({ request_type: "directory_intro", target_organization_id: "t-ok", requester_email: "dana@example.com" });
    expect(String(contact.message).startsWith("[Quote request via Report → Quotes]")).toBe(true);
    expect(String(contact.message)).not.toContain("Jane");
    expect(analytics.trackEvent).toHaveBeenCalledWith("quote_request_posted", { kind: "report_to_quotes", trades: 1 }, { userId: U });
  });

  it("puts the report link in the trade's email only, behind a hashed one-time token", async () => {
    const d = seed();
    const out = await sendReportQuotes(asClient(d), asClient(d), input({ attachReport: true, recipientIds: ["t-ok"] }), NOW);
    expect(out).toMatchObject({ ok: true, sent: 1 });
    const msg = String(email.sendTrustedQuoteRequest.mock.calls[0][0].message);
    const token = msg.match(/\/api\/report-quotes\/shared\/([A-Za-z0-9_-]{32})/)?.[1];
    expect(token).toBeTruthy();
    expect(msg).toContain("(this link works until 2027-01-30)");
    const log = d.tables.quote_report_sends.find((s) => s.id !== "s-old")!;
    expect(log.share_token_hash).toBe(hashReviewToken(token!));
    expect(log.share_expires_at).toBe(FUTURE);
    expect(log.attach_report).toBe(true);
    const contact = String(d.tables.contact_requests[0].message);
    expect(contact).toContain(", report attached");
    expect(contact).not.toContain("/api/report-quotes/shared/");
    expect(contact).not.toContain(token!);
  });

  it("rejects bad requests without sending anything", async () => {
    const d = seed();
    const db = asClient(d);
    expect(await sendReportQuotes(db, db, input({ recipientIds: [] }), NOW)).toEqual({ ok: false, error: "noRecipients" });
    expect(await sendReportQuotes(db, db, input({ recipientIds: Array.from({ length: 11 }, (_, i) => `t${i}`) }), NOW)).toEqual({ ok: false, error: "tooMany" });
    expect(await sendReportQuotes(db, db, input({ recipientIds: ["t-not-mine"] }), NOW)).toEqual({ ok: false, error: "noRecipients" });
    expect(await sendReportQuotes(db, db, input({ reportId: "missing" }), NOW)).toEqual({ ok: false, error: "notFound" });
    expect(await sendReportQuotes(db, db, input({ tradeSlug: "roofing" }), NOW)).toEqual({ ok: false, error: "noItems" });
    const noFile = seed({ file_path: null });
    expect(await sendReportQuotes(asClient(noFile), asClient(noFile), input({ attachReport: true }), NOW)).toEqual({ ok: false, error: "noFile" });
    const missing = asClient(fakeDb({}));
    expect(await sendReportQuotes(missing, missing, input(), NOW)).toEqual({ ok: false, error: "unavailable" });
    expect(email.sendTrustedQuoteRequest).not.toHaveBeenCalled();
    expect(d.tables.contact_requests).toHaveLength(0);
  });

  it("sends nothing (and logs nothing) when every pick was recently sent or suppressed", async () => {
    const d = seed();
    const out = await sendReportQuotes(asClient(d), asClient(d), input({ recipientIds: ["t-recent", "t-suppressed"] }), NOW);
    expect(out).toEqual({ ok: true, sent: 0, skipped: 1, suppressed: 1 });
    expect(email.sendTrustedQuoteRequest).not.toHaveBeenCalled();
    expect(d.tables.quote_report_sends).toHaveLength(1);
  });
});

describe("purgeExpiredReports", () => {
  function seed() {
    return fakeDb({
      quote_reports: [
        { id: "old", file_path: "o/old/a.pdf", file_name: "a.pdf", file_size: 10, report_deleted_after: PAST, file_deleted_at: null },
        { id: "gone", file_path: null, report_deleted_after: PAST, file_deleted_at: "2026-10-31T00:00:00.000Z" },
        { id: "fresh", file_path: "o/fresh/b.pdf", file_name: "b.pdf", file_size: 20, report_deleted_after: FUTURE, file_deleted_at: null },
      ],
      quote_report_sends: [
        { id: "s1", report_id: "old", share_token_hash: "a".repeat(64) },
        { id: "s2", report_id: "fresh", share_token_hash: "b".repeat(64) },
      ],
    });
  }

  it("deletes expired files, clears their links, and keeps the item list", async () => {
    const d = seed();
    const storage = fakeStorage();
    expect(await purgeExpiredReports(asClient(d, storage), NOW)).toEqual({ ready: true, deleted: 1, errors: 0 });
    expect(storage.removed).toEqual([["o/old/a.pdf"]]);
    const [old, , fresh] = d.tables.quote_reports;
    expect(old).toMatchObject({ file_path: null, file_name: null, file_size: null, file_deleted_at: NOW.toISOString() });
    expect(fresh.file_path).toBe("o/fresh/b.pdf");
    expect(d.tables.quote_report_sends.map((s) => s.share_token_hash)).toEqual([null, "b".repeat(64)]);
  });

  it("keeps the row pointing at the file when storage fails, so the next run retries", async () => {
    const d = seed();
    expect(await purgeExpiredReports(asClient(d, fakeStorage({ removeError: true })), NOW)).toEqual({ ready: true, deleted: 0, errors: 1 });
    expect(d.tables.quote_reports[0].file_path).toBe("o/old/a.pdf");
    expect(d.tables.quote_report_sends[0].share_token_hash).toBe("a".repeat(64));
  });

  it("is a no-op before the migration is applied", async () => {
    expect(await purgeExpiredReports(asClient(fakeDb({}), fakeStorage()), NOW)).toEqual({ ready: false, deleted: 0, errors: 0 });
  });
});

describe("resolveShare", () => {
  function seed(token: string, over: { share_expires_at?: string | null; file_path?: string | null } = {}) {
    return fakeDb({
      quote_report_sends: [
        { id: "s1", report_id: R, share_token_hash: hashReviewToken(token), share_expires_at: over.share_expires_at === undefined ? FUTURE : over.share_expires_at, open_count: 0 },
      ],
      quote_reports: [{ id: R, file_path: over.file_path === undefined ? `${ORG}/${R}/abc.pdf` : over.file_path, report_deleted_after: FUTURE }],
    });
  }

  it("turns a valid token into a 2-minute signed link and counts the open", async () => {
    const token = generateReviewToken();
    const d = seed(token);
    const storage = fakeStorage();
    const url = await resolveShare(asClient(d, storage), token, NOW);
    expect(url).toBe(`https://storage.example/${ORG}/${R}/abc.pdf?token=x`);
    expect(storage.signed).toEqual([[`${ORG}/${R}/abc.pdf`, 120]]);
    expect(d.tables.quote_report_sends[0]).toMatchObject({ open_count: 1, last_opened_at: NOW.toISOString() });
  });

  it("refuses malformed, unknown, expired and purged links", async () => {
    const token = generateReviewToken();
    const storage = fakeStorage();
    const d = seed(token);
    expect(await resolveShare(asClient(d, storage), "short", NOW)).toBeNull();
    expect(d.calls).toHaveLength(0);
    expect(await resolveShare(asClient(d, storage), generateReviewToken(), NOW)).toBeNull();
    expect(await resolveShare(asClient(seed(token, { share_expires_at: PAST }), storage), token, NOW)).toBeNull();
    expect(await resolveShare(asClient(seed(token, { share_expires_at: null }), storage), token, NOW)).toBeNull();
    expect(await resolveShare(asClient(seed(token, { file_path: null }), storage), token, NOW)).toBeNull();
    expect(storage.signed).toHaveLength(0);
  });
});
