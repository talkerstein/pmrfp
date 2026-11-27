import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The forms that email whatever address is typed, with no login: the two
 * referral forms and "Email me this RFP". A stranger must not be able to write
 * to anyone as PMRFP, or put live HTML in the admin inbox.
 */

const h = vi.hoisted(() => ({
  send: vi.fn(),
  buckets: [] as string[],
  recipientBlocked: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: h.send };
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Map<string, string>() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: async () => undefined, EVENT: {} }));
vi.mock("@/lib/ghl/sync", () => ({ syncProjectReferralToGhl: async () => undefined, syncTradeReferralToGhl: async () => undefined }));
vi.mock("@/lib/ghl/client", () => ({ upsertGhlContact: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => {
  const blocked = { limit: 3, remaining: 0, reset: 0 };
  return {
    checkRateLimitByIp: async (_ip: string, bucket: string) => {
      h.buckets.push(bucket);
      return null;
    },
    checkRateLimit: async (_r: Request, bucket: string) => {
      h.buckets.push(bucket);
      return null;
    },
    checkRecipientLimit: async () => (h.recipientBlocked ? blocked : null),
    rateLimitResponse: () => new Response(null, { status: 429 }),
  };
});

import { submitReferralAction, submitTradeReferralAction } from "@/lib/refer/actions";
import { POST } from "@/app/api/rfp-writer/email/route";
import { removeLinks } from "@/lib/email/parts";
import { composeRfp } from "@/lib/rfp-writer/compose";
import { rfpEmailDraftSchema, type WizardInput } from "@/lib/rfp-writer/schema";

const EVIL = '<a href="https://evil.example/login">Verify your account</a>';

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

const projectForm = (over: Record<string, string> = {}) =>
  form({
    projectDescription: "A roof replacement on a 40-unit building in the east end.",
    projectCity: "Toronto",
    projectProvince: "Ontario",
    referrerName: "Sam Referrer",
    referrerEmail: "victim@example.com",
    permission: "on",
    ...over,
  });

const tradeForm = (over: Record<string, string> = {}) =>
  form({
    tradeCompanyName: "Northline Roofing",
    tradeCity: "Toronto",
    tradeProvince: "Ontario",
    referrerName: "Sam Referrer",
    referrerEmail: "victim@example.com",
    permission: "on",
    ...over,
  });

const emailTo = (to: string) => h.send.mock.calls.map((c) => c[0]).find((m) => m.to === to);
const toReferrer = () => emailTo("victim@example.com");
const toAdmin = () => h.send.mock.calls.map((c) => c[0]).find((m) => m.to !== "victim@example.com");

beforeEach(() => {
  h.send.mockReset();
  h.send.mockResolvedValue({ data: { id: "re_1" }, error: null });
  h.buckets = [];
  h.recipientBlocked = false;
  process.env.RESEND_API_KEY = "re_test_key";
});

describe("referral forms", () => {
  it("project: the confirmation carries nothing from the form", async () => {
    const out = await submitReferralAction({}, projectForm({ projectCity: EVIL }));
    expect(out.success).toBeTruthy();
    expect(toReferrer().html).not.toContain("evil.example");
    expect(toReferrer().subject).not.toContain("evil");
  });

  it("trade: the confirmation carries nothing from the form", async () => {
    const out = await submitTradeReferralAction({}, tradeForm({ tradeCompanyName: EVIL }));
    expect(out.success).toBeTruthy();
    expect(toReferrer().html).not.toContain("evil.example");
  });

  it("project: the admin copy shows form text as text, not as HTML", async () => {
    await submitReferralAction(
      {},
      projectForm({ projectCity: EVIL, referrerName: EVIL, ownerName: EVIL, projectDescription: `${EVIL} and a long enough description.` }),
    );
    const html = toAdmin().html as string;
    expect(html).not.toContain('<a href="https://evil.example');
    expect(html).toContain("&lt;a href=");
  });

  it("trade: the admin copy shows form text as text, not as HTML", async () => {
    await submitTradeReferralAction(
      {},
      tradeForm({ tradeCompanyName: EVIL, referrerName: EVIL, tradeContactName: EVIL, whyThemNote: EVIL, tradeWebsite: 'https://ok.example/"><img src=x>' }),
    );
    const html = toAdmin().html as string;
    expect(html).not.toContain('<a href="https://evil.example');
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;a href=");
  });

  it("keeps the admin's line breaks in the description and the note", async () => {
    await submitReferralAction({}, projectForm({ projectDescription: "First line of the project.\nSecond line of the project." }));
    expect(toAdmin().html).toContain("First line of the project.<br/>Second line of the project.");
  });

  it("refuses a website that isn't a web address", async () => {
    const out = await submitTradeReferralAction({}, tradeForm({ tradeWebsite: "javascript:alert(1)" }));
    expect(out.error).toBeTruthy();
    expect(h.send).not.toHaveBeenCalled();
  });

  it("refuses text too long for the field, and sends nothing", async () => {
    for (const out of [
      await submitReferralAction({}, projectForm({ projectCity: "x".repeat(121) })),
      await submitTradeReferralAction({}, tradeForm({ tradeCompanyName: "x".repeat(201) })),
    ]) {
      expect(out.error).toMatch(/too long/);
    }
    expect(h.send).not.toHaveBeenCalled();
  });

  it("uses the tighter per-IP limit", async () => {
    await submitReferralAction({}, projectForm());
    await submitTradeReferralAction({}, tradeForm());
    expect(h.buckets).toEqual(["referral", "referral"]);
  });

  it("past the limit for an address, the referral still reaches us but that address gets nothing", async () => {
    h.recipientBlocked = true;
    const out = await submitReferralAction({}, projectForm());
    expect(out.success).toBeTruthy();
    expect(toAdmin()).toBeTruthy();
    expect(toReferrer()).toBeUndefined();
  });
});

const BASE: WizardInput = {
  tradeSlug: "roofing",
  tradeName: "Roofing",
  description: "Flat roof over the east wing leaks in heavy rain. About 18,000 sq ft, 20+ years old.",
  propertyType: "Condominium",
  city: "Mississauga",
  province: "Ontario",
  size: "18,000 sq ft",
  occupied: true,
  contractType: "project",
  timing: "1-3-months",
  bidDeadline: "2099-10-14",
  insurance: "5m",
  siteVisit: true,
  priority: "balanced",
};

const draft = (over: Record<string, unknown> = {}) => ({
  title: "Roof replacement",
  summary: "A summary.",
  scope: "The scope.",
  requirements: "The requirements.",
  submissionInstructions: "Send bids to bids@acme.com.",
  evaluationCriteria: ["Price"],
  questionsForBidders: ["When can you start?"],
  ...over,
});

const post = (body: unknown) =>
  POST(new Request("https://pmrfp.com/api/rfp-writer/email", { method: "POST", body: JSON.stringify(body) }));

describe("Email me this RFP", () => {
  it("still emails a normal draft, with the address someone typed for bids", async () => {
    const res = await post({ email: "pm@example.com", rfp: draft() });
    expect(res.status).toBe(200);
    expect(emailTo("pm@example.com").html).toContain("bids@acme.com");
    expect(h.buckets).toEqual(["rfp-email"]);
  });

  it("the subject can't be written by whoever posts", async () => {
    await post({ email: "pm@example.com", rfp: draft({ title: "Your account is suspended" }) });
    expect(emailTo("pm@example.com").subject).toBe("Your RFP draft");
  });

  it("web addresses don't go out, in any field", async () => {
    await post({
      email: "pm@example.com",
      rfp: draft({
        title: "See https://evil.example/a",
        summary: "Go to https://evil.example/b now",
        scope: "www.evil.example/c",
        requirements: "evil-site.com/login",
        submissionInstructions: "http://evil.example/d",
        evaluationCriteria: ["https://evil.example/e"],
        questionsForBidders: ["https://evil.example/f"],
      }),
    });
    const html = emailTo("pm@example.com").html as string;
    expect(html).not.toMatch(/evil/);
    expect(html).toContain("[link removed]");
  });

  it("escapes HTML", async () => {
    await post({ email: "pm@example.com", rfp: draft({ summary: "<img src=x onerror=alert(1)>" }) });
    expect(emailTo("pm@example.com").html).not.toContain("<img src=x");
  });

  it("refuses an oversized draft, and sends nothing", async () => {
    const res = await post({ email: "pm@example.com", rfp: draft({ scope: "x".repeat(20001) }) });
    expect(res.status).toBe(422);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("past the limit for an address, sends nothing", async () => {
    h.recipientBlocked = true;
    const res = await post({ email: "pm@example.com", rfp: draft() });
    expect(res.status).toBe(429);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("the limits sit above what the RFP Writer really produces", () => {
    expect(rfpEmailDraftSchema.safeParse(composeRfp(BASE)).success).toBe(true);
  });
});

describe("removeLinks", () => {
  it("keeps email addresses and ordinary sentences", () => {
    for (const text of ["Send bids to bids@acme.com.", "Starts at 8 a.m. on site. Insurance: $5.00M, e.g. general liability."]) {
      expect(removeLinks(text)).toBe(text);
    }
  });

  it("takes out web addresses, with or without https", () => {
    expect(removeLinks("See https://a.example/x?y=1 today")).toBe("See [link removed] today");
    expect(removeLinks("See www.acme.ca")).toBe("See [link removed]");
    expect(removeLinks("See acme.com/login now")).toBe("See [link removed] now");
  });
});
