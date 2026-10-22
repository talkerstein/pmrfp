import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, SITE_EVENTS, isClientEvent, isSiteEvent } from "@/lib/tracking/events";
import { parseBeacon } from "@/lib/tracking/beacon";
import { upgradeIntent } from "@/lib/tracking/intent";
import { SIGNUP_INTENT_TTL_S, intentFromParams, parseIntent, serializeIntent, withRememberedIntent } from "@/lib/auth/signup-intent";
import { checkoutFailureMessage, checkoutPath, decideCheckout, parseCheckoutAsk, upgradeInterval, type CheckoutWho } from "@/lib/billing/checkout-flow";
import { RESEND_COOLDOWN_S, RESEND_MAX, afterResend, countdownLabel, resendStatus } from "@/lib/auth/resend";
import { mailProviderFor } from "@/lib/auth/mail-provider";
import { callbackCredential, isFreshConfirmation } from "@/lib/auth/callback";
import { postOAuthRedirect } from "@/lib/auth/oauth";
import { magicLinkRedirect } from "@/lib/auth/magic-link";
import { normalizeWebsite } from "@/lib/auth/website";
import { EMAIL_NOTICE_VERSION, MARKETING_OPT_IN_VERSION, consentRow, marketingTicked } from "@/lib/consent/email";
import auth from "@/i18n/messages/auth";
import v3Pages from "@/i18n/messages/v3Pages";
import dash from "@/i18n/messages/dash";

/**
 * The sign-up drop-off fix (2026-10-22): what each funnel event means, that a
 * plan / return path survives the emailed link, the upgrade link's return
 * flow, the resend cooldown, the email notice and its wording version.
 */

const root = (p: string) => join(__dirname, "..", "..", p);
const read = (p: string) => readFileSync(root(p), "utf8");

describe("funnel event semantics", () => {
  it("the page opening is signup_viewed (the browser may report it); submitting is signup_started (the server only)", () => {
    expect(isClientEvent("signup_viewed")).toBe(true);
    expect(isClientEvent("signup_step")).toBe(true);
    // A browser can no longer claim a submission, and stale cached pages that still send the old meaning are dropped.
    expect(isClientEvent("signup_started")).toBe(false);
    expect(isSiteEvent("signup_started")).toBe(true);
    expect(CLIENT_EVENTS).not.toContain("signup_started");
    const body = JSON.stringify({
      v: 1,
      items: [
        { t: "ev", e: "signup_started", p: "/sign-up", x: { plan: "pro" } },
        { t: "ev", e: "signup_viewed", p: "/sign-up", x: { role: "trade" } },
        { t: "ev", e: "signup_step", p: "/sign-up", x: { step: 2 } },
        { t: "ev", e: "email_confirmed", p: "/sign-up" },
      ],
    });
    const parsed = parseBeacon(body);
    expect(parsed.ok && parsed.items.filter((i) => i.t === "ev").map((i) => (i.t === "ev" ? i.event : ""))).toEqual(["signup_viewed", "signup_step"]);
  });

  it("the funnel's events are all known, in funnel order", () => {
    const order = ["signup_viewed", "signup_step", "signup_started", "signup_completed", "email_confirmed", "onboarding_step", "onboarding_completed"];
    expect(SITE_EVENTS.filter((e) => order.includes(e))).toEqual(order);
    for (const e of ["checkout_started", "checkout_failed", "trial_started"]) expect(isSiteEvent(e)).toBe(true);
  });

  it("the sign-up page sends signup_viewed on open, never signup_started", () => {
    const page = read("src/app/[lang]/(v3)/sign-up/page.tsx");
    expect(page).toContain('event="signup_viewed"');
    expect(page).not.toContain('event="signup_started"');
  });

  it("the migration lets the database accept exactly these events, and relabels only old page-view rows", () => {
    const sql = read("supabase/migrations/20261022000100_signup_funnel_and_consent.sql");
    for (const e of SITE_EVENTS) expect(sql, e).toContain(`'${e}'`);
    // Old rows carry no `method`; the new submit rows always do.
    expect(sql).toMatch(/set event = 'signup_viewed'[\s\S]*event = 'signup_started'[\s\S]*\(props->>'method'\) is null/);
    // Safe to run twice.
    expect(sql).toMatch(/drop constraint if exists site_events_event_check/);
    expect(sql).toMatch(/create table if not exists public\.email_consents/);
  });
});

describe("a sign-up's plan and return path survive the emailed link", () => {
  const next = checkoutPath("pro", "annual");

  it("the link goes through /auth/callback and carries the return path through onboarding", () => {
    const link = magicLinkRedirect("https://pmrfp.com", `/onboarding?next=${encodeURIComponent(next)}`);
    const url = new URL(link);
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("m")).toBe("link");
    const afterCallback = url.searchParams.get("next")!;
    // Not onboarded yet: stays on /onboarding with its own next.
    expect(postOAuthRedirect(afterCallback, { onboardingCompleted: false, home: "/dashboard" })).toBe(afterCallback);
    expect(new URL(afterCallback, "http://x").searchParams.get("next")).toBe(next);
    // Already a member who clicked an old link: straight to the checkout.
    expect(postOAuthRedirect(afterCallback, { onboardingCompleted: true, home: "/dashboard" })).toBe(next);
  });

  it("remembers what the link asked for for two hours, and the URL always wins", () => {
    const now = Date.UTC(2026, 9, 22, 12, 0, 0);
    const first = intentFromParams({ role: "trade", plan: "pro", interval: "monthly", next: "/rfps/roof-a1", region: "ontario" }, now)!;
    expect(first).toMatchObject({ role: "trade", plan: "pro", interval: "monthly", next: "/rfps/roof-a1", region: "ontario" });
    const cookie = serializeIntent(first);
    expect(parseIntent(cookie, now + 60_000)).toMatchObject({ plan: "pro", interval: "monthly" });
    // Back on /sign-up with nothing in the URL (the 9-second repeat visit in the real data).
    expect(withRememberedIntent({}, parseIntent(cookie, now + 9_000))).toMatchObject({ role: "trade", plan: "pro", interval: "monthly", next: "/rfps/roof-a1", region: "ontario" });
    // A specific link beats the cookie.
    expect(withRememberedIntent({ plan: "featured" }, parseIntent(cookie, now))).toEqual({ plan: "featured" });
    expect(withRememberedIntent({ next: "/follow?x=1" }, parseIntent(cookie, now))).toEqual({ next: "/follow?x=1" });
    // A property-manager invite isn't about an earlier trade plan.
    expect(withRememberedIntent({ role: "property_manager" }, parseIntent(cookie, now))).toEqual({ role: "property_manager" });
  });

  it("expires after two hours and refuses tampering", () => {
    const now = Date.UTC(2026, 9, 22, 12, 0, 0);
    const cookie = serializeIntent(intentFromParams({ plan: "pro" }, now)!);
    expect(parseIntent(cookie, now + SIGNUP_INTENT_TTL_S * 1000 - 1000)).not.toBeNull();
    expect(parseIntent(cookie, now + SIGNUP_INTENT_TTL_S * 1000 + 1000)).toBeNull();
    expect(parseIntent("not json")).toBeNull();
    // Re-validated on the way back in: an open redirect or an unknown plan is dropped, not trusted.
    const evil = encodeURIComponent(JSON.stringify({ a: now, p: "free-forever", n: "//evil.example/x", r: "admin" }));
    expect(parseIntent(evil, now)).toBeNull();
    expect(intentFromParams({ next: "https://evil.example" })).toBeNull();
    // A role alone is the page's own default: nothing to remember.
    expect(intentFromParams({ role: "trade" })).toBeNull();
  });

  it("accepts a token_hash link (works in any browser) as well as a code, and spots a fresh confirmation", () => {
    expect(callbackCredential(new URLSearchParams("code=abc"))).toEqual({ kind: "code", code: "abc" });
    expect(callbackCredential(new URLSearchParams("token_hash=abcdefgh12345&type=email"))).toEqual({ kind: "token_hash", tokenHash: "abcdefgh12345", type: "email" });
    expect(callbackCredential(new URLSearchParams("token_hash=abcdefgh12345&type=recovery"))).toBeNull();
    expect(callbackCredential(new URLSearchParams("token_hash=short&type=email"))).toBeNull();
    expect(callbackCredential(new URLSearchParams(""))).toBeNull();
    const now = Date.UTC(2026, 9, 22, 20, 4, 0);
    expect(isFreshConfirmation("2026-10-22T20:03:32Z", now)).toBe(true);
    expect(isFreshConfirmation("2026-10-20T21:52:00Z", now)).toBe(false); // a later sign-in, not the confirmation
    expect(isFreshConfirmation(null, now)).toBe(false);
  });
});

describe("an upgrade link resumes checkout", () => {
  const ready: CheckoutWho = { signedIn: true, onboarded: true, role: "trade", hasOrganization: true, paid: false, stripeConfigured: true };
  const ask = parseCheckoutAsk("pro", "monthly");

  it("only valid plans are asked for; Featured is annual-only; the retired SEO plan is steered to Pro", () => {
    expect(ask).toEqual({ plan: "pro", interval: "monthly" });
    expect(parseCheckoutAsk("featured", "monthly")).toEqual({ plan: "featured", interval: "annual" });
    expect(parseCheckoutAsk("seo", "annual")).toEqual({ plan: "pro", interval: "annual" });
    expect(parseCheckoutAsk("free", "annual")).toBeNull();
    expect(parseCheckoutAsk(undefined, undefined)).toBeNull();
    expect(checkoutPath("featured", "monthly")).toBe("/checkout?plan=featured&interval=annual");
  });

  it("signed out: sign-up for that plan; the sign-up page comes back here after the emailed link", () => {
    expect(decideCheckout(ask, { ...ready, signedIn: false })).toEqual({ go: "redirect", to: "/sign-up?role=trade&plan=pro&interval=monthly", why: "signed_out" });
  });

  it("signed in but not finished: onboarding first, then the checkout", () => {
    const d = decideCheckout(ask, { ...ready, onboarded: false });
    expect(d).toMatchObject({ go: "redirect", why: "onboarding" });
    expect(d.go === "redirect" && d.to).toBe(`/onboarding?next=${encodeURIComponent("/checkout?plan=pro&interval=monthly")}`);
    expect(decideCheckout(ask, { ...ready, hasOrganization: false })).toMatchObject({ why: "onboarding" });
  });

  it("ready: straight to Stripe. Everything unusual lands on the billing page, which explains", () => {
    expect(decideCheckout(ask, ready)).toEqual({ go: "stripe" });
    expect(decideCheckout(ask, { ...ready, paid: true })).toMatchObject({ to: "/dashboard/billing", why: "paid" });
    expect(decideCheckout(ask, { ...ready, role: "property_manager" })).toMatchObject({ to: "/dashboard", why: "wrong_role" });
    expect(decideCheckout(ask, { ...ready, stripeConfigured: false })).toMatchObject({ why: "unavailable", to: expect.stringContaining("checkout=unavailable") });
    expect(decideCheckout(null, ready)).toMatchObject({ to: "/dashboard/billing", why: "bad_plan" });
    expect(decideCheckout(null, { ...ready, signedIn: false })).toMatchObject({ to: "/pricing", why: "bad_plan" });
  });

  it("counts as an upgrade click, and asks for monthly only when a monthly price exists", () => {
    expect(upgradeIntent("/checkout?plan=pro&interval=annual")).toBe("pro");
    expect(upgradeIntent("/fr/checkout?plan=featured")).toBe("featured");
    expect(upgradeIntent("/checkout")).toBe("checkout");
    expect(upgradeInterval(true)).toBe("monthly");
    expect(upgradeInterval(false)).toBe("annual");
  });

  it("explains each way a checkout can fail", () => {
    expect(checkoutFailureMessage("no_session")).toEqual({ status: 401, error: "Sign in required" });
    expect(checkoutFailureMessage("plan_unavailable").error).toBe("That plan isn't available yet.");
    expect(checkoutFailureMessage("stripe_error").status).toBe(502);
  });

  it("every public 'Unlock' link asks for a plan the shop can sell", () => {
    for (const f of ["src/app/[lang]/(v3)/rfps/[slug]/page.tsx", "src/app/[lang]/(v3)/benchmarks/[trade]/[province]/page.tsx", "src/app/[lang]/(v3)/major-projects/[slug]/page.tsx"]) {
      const src = read(f);
      expect(src, f).toContain("upgradeInterval(");
      expect(src, f).not.toContain('"/dashboard/billing?plan=pro&interval=monthly"');
    }
  });
});

describe("send the link again", () => {
  const sentAt = 1_000_000;

  it("waits a minute after the sign-up's own email, then allows one more, up to the cap", () => {
    expect(RESEND_COOLDOWN_S).toBe(60);
    let s = { lastSentAt: sentAt, sent: 0 };
    expect(resendStatus(s, sentAt)).toEqual({ can: false, reason: "wait", secondsLeft: 60 });
    expect(resendStatus(s, sentAt + 59_000)).toEqual({ can: false, reason: "wait", secondsLeft: 1 });
    expect(resendStatus(s, sentAt + 60_000)).toEqual({ can: true });
    s = afterResend(s, sentAt + 61_000);
    expect(s).toEqual({ lastSentAt: sentAt + 61_000, sent: 1 });
    expect(resendStatus(s, sentAt + 62_000)).toMatchObject({ can: false, reason: "wait" }); // the clock restarts
    for (let i = 1; i < RESEND_MAX; i++) s = afterResend(s, s.lastSentAt + 61_000);
    expect(resendStatus(s, s.lastSentAt + 3_600_000)).toEqual({ can: false, reason: "limit" });
  });

  it("never reports more than a minute, and formats the countdown", () => {
    expect(resendStatus({ lastSentAt: sentAt + 10 * 60_000, sent: 0 }, sentAt)).toEqual({ can: false, reason: "wait", secondsLeft: 60 }); // clock skew
    expect([countdownLabel(60), countdownLabel(59), countdownLabel(5), countdownLabel(0), countdownLabel(-3)]).toEqual(["1:00", "0:59", "0:05", "0:00", "0:00"]);
  });

  it("opens the right inbox for the address, and none when it can't tell", () => {
    expect(mailProviderFor("Someone@Gmail.com")?.name).toBe("Gmail");
    expect(mailProviderFor("a@hotmail.ca")?.name).toBe("Outlook");
    expect(mailProviderFor("a@live.ca")?.name).toBe("Outlook");
    expect(mailProviderFor("a@yahoo.com")?.name).toBe("Yahoo Mail");
    expect(mailProviderFor("a@icloud.com")?.name).toBe("iCloud Mail");
    expect(mailProviderFor("owner@integritymasonry.ca")).toBeNull(); // someone's own domain: no guess
    expect(mailProviderFor("not an email")).toBeNull();
    expect(mailProviderFor(null)).toBeNull();
    // The address itself never goes into the inbox URL.
    expect(mailProviderFor("secret.person@gmail.com")!.href).not.toContain("secret");
  });
});

describe("onboarding asks only what it needs", () => {
  it("accepts a website typed the way people type it", () => {
    expect(normalizeWebsite("marlinleads.com")).toBe("https://marlinleads.com");
    expect(normalizeWebsite("  www.example.ca/about ")).toBe("https://www.example.ca/about");
    expect(normalizeWebsite("https://example.com")).toBe("https://example.com");
    expect(normalizeWebsite("http://example.com")).toBe("http://example.com");
    expect(normalizeWebsite("")).toBe("");
    expect(normalizeWebsite(null)).toBe("");
    expect(normalizeWebsite("not a site")).toBe("not a site"); // left for the schema to refuse
  });

  it("the company form keeps the name, province, trades and regions up front and folds the rest away", () => {
    const form = read("src/components/forms/onboarding-form.tsx");
    const folded = form.slice(form.indexOf("<details"), form.indexOf("</details>"));
    for (const field of ['name="website"', 'name="phone"', 'name="email"', 'name="city"', 'name="shortDescription"', 'name="publicContactVisibility"']) {
      expect(folded, field).toContain(field);
    }
    const upFront = form.slice(0, form.indexOf("<details"));
    expect(upFront).toContain('name="name"');
    expect(upFront).toContain('name="province"');
    expect(upFront).toContain('name="categories"');
    expect(upFront).toContain('name="regions"');
    for (const field of ['name="website"', 'name="phone"', 'name="email"', 'name="city"']) expect(upFront, field).not.toContain(field);
  });
});

describe("the email notice and consent", () => {
  // Changing the words means bumping the version AND adding the new wording here, so the record of what each
  // person saw stays true. These exact texts go to a lawyer.
  const PINNED: Record<string, Record<"en" | "fr" | "es", { notice: string; marketing: string }>> = {
    "2026-10-22.1": {
      en: {
        notice: "We'll email you about your account, the bids and buyers you follow, and tips for getting set up on PMRFP. You can unsubscribe from any email.",
        marketing: "Also send me occasional offers and news from PMRFP. Optional; you can change your mind at any time.",
      },
      fr: {
        notice: "Nous vous écrirons au sujet de votre compte, des appels d'offres et des acheteurs que vous suivez, et pour vous aider à bien démarrer sur PMRFP. Vous pouvez vous désabonner de n'importe quel courriel.",
        marketing: "Je veux aussi recevoir à l'occasion des offres et des nouvelles de PMRFP. Facultatif; vous pouvez changer d'avis en tout temps.",
      },
      es: {
        notice: "Le enviaremos correos sobre su cuenta, las licitaciones y los compradores que sigue, y para ayudarle a empezar bien en PMRFP. Puede darse de baja desde cualquier correo.",
        marketing: "También quiero recibir de vez en cuando ofertas y novedades de PMRFP. Opcional; puede cambiar de opinión en cualquier momento.",
      },
    },
  };

  it("the wording on the page is the wording the version names (en, fr, es)", () => {
    expect(EMAIL_NOTICE_VERSION).toBe(MARKETING_OPT_IN_VERSION);
    const pinned = PINNED[EMAIL_NOTICE_VERSION];
    expect(pinned, "new wording version: pin its text here").toBeDefined();
    for (const lang of ["en", "fr", "es"] as const) {
      expect(auth[lang].emailConsent.notice, lang).toBe(pinned[lang].notice);
      expect(auth[lang].emailConsent.marketingLabel, lang).toBe(pinned[lang].marketing);
      expect(auth[lang].emailConsent.terms.length).toBeGreaterThan(0);
      expect(auth[lang].emailConsent.privacy.length).toBeGreaterThan(0);
    }
  });

  it("is on the sign-up form under the button, and the marketing box is never pre-ticked", () => {
    const flow = read("src/components/home-v3/signup-flow.tsx");
    expect(flow).toContain("p.consent.notice");
    // The notice sits after the submit button in the footer.
    expect(flow.indexOf("{pending ? t.creating")).toBeLessThan(flow.indexOf("p.consent.notice"));
    const onboarding = read("src/components/forms/onboarding-form.tsx");
    const box = onboarding.slice(onboarding.indexOf('name="marketing"') - 80, onboarding.indexOf('name="marketing"') + 120);
    expect(box).toContain('type="checkbox"');
    expect(box).not.toMatch(/defaultChecked|checked=/);
    // Marketing consent is asked in onboarding only, not on the sign-up page (it would cost sign-ups).
    expect(flow).not.toContain('name="marketing"');
  });

  it("only an explicit tick counts as marketing consent; the row names the wording and language", () => {
    expect(marketingTicked("on")).toBe(true);
    expect(marketingTicked("true")).toBe(true);
    expect(marketingTicked("")).toBe(false);
    expect(marketingTicked(null)).toBe(false);
    expect(marketingTicked("off")).toBe(false);
    expect(consentRow("u1", "marketing", "onboarding", "fr")).toEqual({ user_id: "u1", scope: "marketing", source: "onboarding", wording_version: MARKETING_OPT_IN_VERSION, lang: "fr" });
    expect(consentRow(null, "service", "signup_form")).toBeNull();
    expect(consentRow("u1", "service", "signup_form", "de")?.lang).toBeNull();
  });
});

describe("new copy exists in all three languages", () => {
  it("check-email, billing and onboarding strings are in en, fr and es", () => {
    for (const lang of ["en", "fr", "es"] as const) {
      const s = v3Pages[lang].signup;
      for (const k of ["openMail", "resend", "resendIn", "resending", "resent", "resendLimit", "wrongEmail", "startOver", "sameBrowser", "spam"] as const) {
        expect(s[k], `${lang}.signup.${k}`).toBeTruthy();
      }
      // "check your email" no longer blames a vendor name the member never heard of.
      expect(s.spam).not.toMatch(/Supabase/);
      for (const k of ["checkoutFailed", "checkoutUnavailable", "trialHead", "trialBody"] as const) expect(dash[lang].billing[k], `${lang}.billing.${k}`).toBeTruthy();
      expect(auth[lang].onboarding.moreDetails).toBeTruthy();
      expect(s.resendIn).toContain("{time}");
      expect(s.openMail).toContain("{name}");
    }
  });
});
