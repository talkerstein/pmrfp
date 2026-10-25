import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./fake-supabase";

/**
 * The sign-up drop-off fix, through the real server actions and the /checkout
 * page with their surroundings mocked: what is recorded when, that the plan
 * rides through the confirmation email, the resend answer, onboarding's
 * blank-email / bare-website fixes and consent, and Stripe checkout events.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  events: [] as { name: string; props: Record<string, unknown>; ctx: Record<string, unknown> }[],
  session: null as unknown,
  deleted: [] as string[],
  stripeCreate: vi.fn(),
  stripeConfigured: true,
  rateLimited: false,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "1.2.3.4"]]),
  cookies: async () => ({ get: () => undefined, delete: (n: string) => void h.deleted.push(n), set: vi.fn() }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/onboarding/progress", () => ({ recordOnboardingStep: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitByIp: async () => h.rateLimited }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => h.db) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: h.signUp, signInWithOtp: h.signInWithOtp } }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => undefined }));
vi.mock("@/lib/email/send", () => ({ sendAdminNewSignup: vi.fn(), sendWelcomeEmail: vi.fn(), sendAdminListingRejected: vi.fn() }));
vi.mock("@/lib/ghl/sync", () => ({ syncPmrfpUserToGhl: vi.fn() }));
vi.mock("@/lib/lifecycle/config", () => ({ lifecycleEnabled: () => false }));
vi.mock("@/lib/digest/link", () => ({ linkDigestSubscriber: vi.fn() }));
vi.mock("@/lib/attribution/record", () => ({ recordSignupAttribution: vi.fn(), recordSignupAttributionForEmail: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  EVENT: {
    SIGNUP_STARTED: "signup_started",
    SIGNUP_COMPLETED: "signup_completed",
    EMAIL_CONFIRMED: "email_confirmed",
    ONBOARDING_STEP: "onboarding_step",
    ONBOARDING_COMPLETED: "onboarding_completed",
    CHECKOUT_STARTED: "checkout_started",
    CHECKOUT_FAILED: "checkout_failed",
  },
  trackEvent: async (name: string, props: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) => void h.events.push({ name, props, ctx }),
}));
vi.mock("@/lib/access/access", () => ({
  getSession: vi.fn(async () => h.session),
  roleHome: () => "/dashboard",
}));
vi.mock("@/lib/stripe/server", () => ({
  isStripeConfigured: () => h.stripeConfigured,
  getStripe: () => ({ checkout: { sessions: { create: h.stripeCreate } } }),
  SITE_URL: "https://pmrfp.com",
  realtorPriceId: async () => null,
}));
vi.mock("@/i18n/server", () => ({
  setLangFrom: async (p: Promise<{ lang?: string }>) => (await p).lang ?? "en",
}));

import { completeOnboardingAction, resendSignupLinkAction, signUpAction } from "@/lib/auth/actions";
import { EMAIL_NOTICE_VERSION, MARKETING_OPT_IN_VERSION } from "@/lib/consent/email";
import { magicLinkRedirect } from "@/lib/auth/magic-link";
import { createTradeCheckout } from "@/lib/billing/checkout";
import CheckoutPage from "@/app/[lang]/checkout/page";

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
}

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  return "(no redirect)";
}

const NEXT = "/checkout?plan=pro&interval=annual";
const names = () => h.events.map((e) => e.name);

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://pmrfp.com";
  h.db = fakeDb({
    users_profile: [{ id: "fresh-1", email: "pk@example.com", primary_role: "trade", status: "active", created_at: new Date().toISOString() }],
    email_consents: [],
    organizations: [],
    organization_members: [],
    trade_categories: [],
    regions: [],
    organization_categories: [],
    organization_regions: [],
  });
  h.signUp.mockReset().mockResolvedValue({ data: { user: { id: "new-1", identities: [{}] }, session: null }, error: null });
  h.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  h.stripeCreate.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
  h.stripeConfigured = true;
  h.rateLimited = false;
  h.events = [];
  h.deleted = [];
  h.session = null;
  process.env.STRIPE_PRICE_TRADE_PRO_ANNUAL = "price_annual";
  process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY = "price_monthly";
  process.env.STRIPE_PRICE_FEATURED_ANNUAL = "price_featured";
});

describe("signup_started means the form was submitted", () => {
  const base = { role: "trade", lang: "en", email: "someone.new@example.com" };

  it("is recorded when a valid form is submitted, with the method, before the account exists", async () => {
    const to = await redirectOf(signUpAction({}, form({ ...base, method: "link", plan: "pro", next: NEXT })));
    expect(to).toMatch(/^\/check-email\?/);
    expect(names()).toEqual(["signup_started", "signup_completed"]);
    expect(h.events[0]).toMatchObject({ props: { method: "link", role: "trade", plan: "pro", hasNext: true } });
  });

  it("is not recorded for a form that failed validation (a page view is not a submission)", async () => {
    const res = await signUpAction({}, form({ ...base, method: "link", email: "not-an-email" }));
    expect(res.error).toBeTruthy();
    expect(names()).toEqual([]);
  });

  it("carries a method, which is how the database tells it from an old page-view row", async () => {
    await redirectOf(signUpAction({}, form({ ...base, method: "password", password: "longenough1" })));
    expect(h.events[0].props.method).toBe("password");
  });
});

describe("the plan rides through the confirmation email", () => {
  const base = { role: "trade", lang: "en", email: "new.person@example.com", plan: "pro", next: NEXT };

  it("password sign-up: the confirmation link comes back through /auth/callback with the return path", async () => {
    const to = await redirectOf(signUpAction({}, form({ ...base, method: "password", password: "longenough1" })));
    const redirectTo = h.signUp.mock.calls[0][0].options.emailRedirectTo as string;
    expect(redirectTo).toBe(magicLinkRedirect("https://pmrfp.com", `/onboarding?next=${encodeURIComponent(NEXT)}`));
    expect(new URL(redirectTo).pathname).toBe("/auth/callback");
    const onboarding = new URL(redirectTo).searchParams.get("next")!;
    expect(new URL(onboarding, "http://x").searchParams.get("next")).toBe(NEXT);
    // The check-your-email screen keeps the method, the plan and the return path.
    const q = new URL(to, "http://x").searchParams;
    expect([q.get("method"), q.get("plan"), q.get("next"), q.get("role")]).toEqual(["password", "pro", NEXT, "trade"]);
  });

  it("emailed-link sign-up: same link, same path", async () => {
    const to = await redirectOf(signUpAction({}, form({ ...base, method: "link" })));
    const redirectTo = h.signInWithOtp.mock.calls[0][0].options.emailRedirectTo as string;
    expect(redirectTo).toBe(magicLinkRedirect("https://pmrfp.com", `/onboarding?next=${encodeURIComponent(NEXT)}`));
    expect(new URL(to, "http://x").searchParams.get("next")).toBe(NEXT);
  });

  it("a French sign-up lands on the French check-your-email screen and clears the remembered intent", async () => {
    const to = await redirectOf(signUpAction({}, form({ ...base, lang: "fr", method: "link" })));
    expect(to).toMatch(/^\/fr\/check-email\?/);
    expect(h.deleted).toContain("pmrfp_su");
  });

  it("no plan, no return path: onboarding as before", async () => {
    await redirectOf(signUpAction({}, form({ role: "trade", lang: "en", email: "x.y@example.com", method: "password", password: "longenough1" })));
    expect(h.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(magicLinkRedirect("https://pmrfp.com", "/onboarding"));
  });
});

describe("send the link again", () => {
  it("sends a fresh link to the same place and answers the same whether or not the address has an account", async () => {
    const ok = await resendSignupLinkAction({}, form({ email: "Pk@Example.com", lang: "en", role: "trade", next: NEXT }));
    expect(ok.success).toBeTruthy();
    expect(h.signInWithOtp).toHaveBeenCalledWith({
      email: "pk@example.com",
      options: { shouldCreateUser: false, emailRedirectTo: magicLinkRedirect("https://pmrfp.com", `/onboarding?next=${encodeURIComponent(NEXT)}`) },
    });
    h.signInWithOtp.mockResolvedValue({ error: { message: "User not found" } });
    const unknown = await resendSignupLinkAction({}, form({ email: "nobody@example.com", lang: "en" }));
    expect(unknown).toEqual(ok);
  });

  it("refuses a bad address and a flood, and sends nothing", async () => {
    expect((await resendSignupLinkAction({}, form({ email: "nope", lang: "en" }))).error).toBeTruthy();
    h.rateLimited = true;
    expect((await resendSignupLinkAction({}, form({ email: "pk@example.com", lang: "en" }))).error).toBeTruthy();
    expect(h.signInWithOtp).not.toHaveBeenCalled();
  });
});

/** Supabase creates the account (and handle_new_user its profile) when the emailed link is requested. */
function accountAppearsOnLinkRequest(email: string) {
  h.signInWithOtp.mockImplementation(async () => {
    h.db.tables.users_profile.push({ id: "fresh-1", email, primary_role: "trade", status: "active", created_at: new Date().toISOString() });
    return { error: null };
  });
}

describe("email consent is recorded with the wording they saw", () => {
  it("sign-up form (emailed link): the notice, for the account just made", async () => {
    accountAppearsOnLinkRequest("new.link@example.com");
    await redirectOf(signUpAction({}, form({ role: "trade", lang: "fr", email: "new.link@example.com", method: "link" })));
    expect(h.db.tables.email_consents).toEqual([expect.objectContaining({ user_id: "fresh-1", scope: "service", source: "signup_form", wording_version: EMAIL_NOTICE_VERSION, lang: "fr" })]);
  });

  it("sign-up form (password): the notice, for the new user id", async () => {
    await redirectOf(signUpAction({}, form({ role: "trade", lang: "en", email: "z@example.com", method: "password", password: "longenough1" })));
    expect(h.db.tables.email_consents).toEqual([expect.objectContaining({ user_id: "new-1", scope: "service", source: "signup_form" })]);
  });

  it("a database without the table yet: sign-up still works", async () => {
    delete h.db.tables.email_consents;
    accountAppearsOnLinkRequest("later@example.com");
    await expect(redirectOf(signUpAction({}, form({ role: "trade", lang: "en", email: "later@example.com", method: "link" })))).resolves.toMatch(/check-email/);
  });

  describe("onboarding", () => {
    const session = { userId: "u9", profile: { primary_role: "trade", email: "owner@acmecleaning.ca", full_name: "P K", status: "active", onboarding_completed: false }, organization: null };
    const fields = { lang: "en", name: "Acme Cleaning", province: "Ontario", categories: ["janitorial"], regions: ["toronto"] };
    beforeEach(() => {
      h.session = session;
    });

    it("an unticked box records the notice only; the marketing row exists only if they tick it", async () => {
      expect(await redirectOf(completeOnboardingAction({}, form(fields)))).toBe("/dashboard");
      expect(h.db.tables.email_consents).toEqual([expect.objectContaining({ user_id: "u9", scope: "service", source: "onboarding", wording_version: EMAIL_NOTICE_VERSION, lang: "en" })]);

      h.db.tables.email_consents.length = 0;
      h.db.tables.organizations.length = 0;
      await redirectOf(completeOnboardingAction({}, form({ ...fields, marketing: "on" })));
      expect(h.db.tables.email_consents).toEqual([
        expect.objectContaining({ scope: "service", source: "onboarding" }),
        expect.objectContaining({ user_id: "u9", scope: "marketing", source: "onboarding", wording_version: MARKETING_OPT_IN_VERSION, lang: "en" }),
      ]);
    });

    it("a blank contact email falls back to the account's own, and a bare website gets https://", async () => {
      await redirectOf(completeOnboardingAction({}, form({ ...fields, email: "", website: "acmecleaning.ca" })));
      expect(h.db.tables.organizations).toHaveLength(1);
      expect(h.db.tables.organizations[0]).toMatchObject({ email: "owner@acmecleaning.ca", website: "https://acmecleaning.ca", province: "Ontario" });
    });

    it("records which field a refused form named, as a funnel step", async () => {
      const res = await completeOnboardingAction({}, form({ ...fields, name: "" }));
      expect(res.error).toBeTruthy();
      expect(h.events).toContainEqual(expect.objectContaining({ name: "onboarding_step", props: { step: "form_error", field: "name" } }));
    });
  });
});

describe("Stripe checkout events", () => {
  const session = { userId: "u9", profile: { primary_role: "trade", email: "owner@acmecleaning.ca", onboarding_completed: true }, organization: { id: "org-1", organization_type: "trade_company" }, paid: false };

  it("checkout_started is recorded when Stripe has made the page, with the plan and the price's interval", async () => {
    const r = await createTradeCheckout(session as never, { plan: "pro", interval: "monthly" }, "link");
    expect(r).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    expect(h.stripeCreate.mock.calls[0][0].line_items).toEqual([{ price: "price_monthly", quantity: 1 }]);
    expect(h.stripeCreate.mock.calls[0][0].metadata).toMatchObject({ organization_id: "org-1", user_id: "u9", plan: "pro", interval: "monthly" });
    expect(h.events).toEqual([expect.objectContaining({ name: "checkout_started", props: { plan: "pro", interval: "monthly", where: "link" } })]);
  });

  it("Featured is annual whatever was asked", async () => {
    await createTradeCheckout(session as never, { plan: "featured", interval: "monthly" }, "api");
    expect(h.stripeCreate.mock.calls[0][0].line_items[0].price).toBe("price_featured");
    expect(h.events[0].props).toMatchObject({ plan: "featured", interval: "annual" });
  });

  it("every way it can fail leaves a checkout_failed with the reason, and no checkout_started", async () => {
    h.stripeCreate.mockRejectedValue(new Error("Stripe is down"));
    expect(await createTradeCheckout(session as never, { plan: "pro", interval: "annual" }, "link")).toEqual({ ok: false, reason: "stripe_error" });
    delete process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY;
    expect(await createTradeCheckout(session as never, { plan: "pro", interval: "monthly" }, "link")).toEqual({ ok: false, reason: "plan_unavailable" });
    expect(await createTradeCheckout({ ...session, organization: null } as never, { plan: "pro", interval: "annual" }, "api")).toEqual({ ok: false, reason: "no_company" });
    expect(await createTradeCheckout(null, { plan: "pro", interval: "annual" }, "api")).toEqual({ ok: false, reason: "no_session" });
    h.stripeConfigured = false;
    expect(await createTradeCheckout(session as never, { plan: "pro", interval: "annual" }, "api")).toEqual({ ok: false, reason: "not_configured" });
    expect(h.events.map((e) => [e.name, e.props.reason])).toEqual([
      ["checkout_failed", "stripe_error"],
      ["checkout_failed", "plan_unavailable"],
      ["checkout_failed", "no_company"],
      ["checkout_failed", "no_session"],
      ["checkout_failed", "not_configured"],
    ]);
  });
});

describe("/checkout (the upgrade link) in the visitor's language", () => {
  const ready = { userId: "u9", profile: { primary_role: "trade", email: "o@x.ca", onboarding_completed: true }, organization: { id: "org-1", organization_type: "trade_company" }, paid: false };
  const page = (sp: Record<string, string>, lang = "en") => redirectOf(CheckoutPage({ searchParams: Promise.resolve(sp), params: Promise.resolve({ lang }) }));

  it("signed out goes to sign-up for that plan (French stays French)", async () => {
    expect(await page({ plan: "pro", interval: "annual" })).toBe("/sign-up?role=trade&plan=pro&interval=annual");
    expect(await page({ plan: "pro", interval: "monthly" }, "fr")).toBe("/fr/sign-up?role=trade&plan=pro&interval=monthly");
    expect(h.stripeCreate).not.toHaveBeenCalled();
  });

  it("not onboarded goes to onboarding with the checkout as the next stop", async () => {
    h.session = { ...ready, profile: { ...ready.profile, onboarding_completed: false }, organization: null };
    expect(await page({ plan: "pro", interval: "annual" })).toBe(`/onboarding?next=${encodeURIComponent(NEXT)}`);
  });

  it("ready goes straight to Stripe and records checkout_started", async () => {
    h.session = ready;
    expect(await page({ plan: "pro", interval: "annual" })).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(names()).toEqual(["checkout_started"]);
  });

  it("a Stripe failure lands on the billing page with a message, not a blank error", async () => {
    h.session = ready;
    h.stripeCreate.mockRejectedValue(new Error("boom"));
    expect(await page({ plan: "pro", interval: "annual" }, "fr")).toBe("/fr/dashboard/billing?plan=pro&interval=annual&checkout=failed");
    expect(names()).toEqual(["checkout_failed"]);
  });

  it("an unknown plan is never guessed", async () => {
    h.session = ready;
    expect(await page({ plan: "platinum" })).toBe("/dashboard/billing");
    expect(h.stripeCreate).not.toHaveBeenCalled();
  });
});
