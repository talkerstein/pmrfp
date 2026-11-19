import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_STORED_TRADES, MEMBER_CONSENT_VERSION, decideMemberSubscribe, memberDigestPlace, weeklyEmailTicked } from "@/lib/digest/config";
import auth from "@/i18n/messages/auth";
import v3Pages from "@/i18n/messages/v3Pages";

/**
 * "Honest first" (2026-11-19): the site stops promising what it does not do.
 *
 *  1. Sign-up promised every free trade a weekly tender email, but creating
 *     an account never added anyone to the list the weekly job sends to. Now
 *     it is a choice on the onboarding form (never pre-ticked), and ticking it
 *     really adds the person.
 *  2. Trade Pro picked at sign-up went to the yearly checkout while the card
 *     also showed a monthly price. Now checkout and the card agree.
 *  3. Three dashboard cards showed a hardcoded 0. Now real counts, or no card.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const LANGS = ["en", "fr", "es"] as const;
const TRADES = new Set(["roofing", "plumbing", "electrical", "hvac", "painting", "paving", "snow-removal", "landscaping", "masonry", "flooring", "glazing", "drywall"]);

describe("the weekly email is a choice that really adds the member", () => {
  const base = { emailConfirmed: true, existing: null, suppressed: false, provinceRaw: "Ontario", trades: ["roofing", "plumbing"], validTrades: TRADES };

  it("only an explicit tick counts", () => {
    for (const v of ["on", "1", "true", "yes", " ON "]) expect(weeklyEmailTicked(v), v).toBe(true);
    for (const v of [null, undefined, "", "off", "0", "no", true, 1]) expect(weeklyEmailTicked(v), String(v)).toBe(false);
  });

  it("a new member goes straight onto the list with their own place and trades", () => {
    expect(decideMemberSubscribe(base)).toEqual({ kind: "write", country: "CA", province: "Ontario", trades: ["roofing", "plumbing"] });
  });

  it("an address that is not confirmed is never added", () => {
    expect(decideMemberSubscribe({ ...base, emailConfirmed: false })).toEqual({ kind: "skip", why: "unconfirmed" });
  });

  it("suppressed, bounced and already-active addresses are left alone", () => {
    expect(decideMemberSubscribe({ ...base, suppressed: true })).toEqual({ kind: "skip", why: "suppressed" });
    expect(decideMemberSubscribe({ ...base, existing: { status: "bounced", confirm_sent_at: null } })).toEqual({ kind: "skip", why: "bounced" });
    expect(decideMemberSubscribe({ ...base, existing: { status: "active", confirm_sent_at: null, trades: ["hvac"] } })).toEqual({ kind: "skip", why: "active" });
  });

  it("a pending sign-up is activated and keeps the trades it already had", () => {
    const d = decideMemberSubscribe({ ...base, existing: { status: "pending", confirm_sent_at: null, trades: ["hvac", "not-a-trade"] } });
    expect(d).toEqual({ kind: "write", country: "CA", province: "Ontario", trades: ["hvac", "roofing", "plumbing"] });
  });

  it("someone who unsubscribed and ticks the box again starts over with the company's trades", () => {
    const d = decideMemberSubscribe({ ...base, existing: { status: "unsubscribed", confirm_sent_at: null, trades: ["hvac"] } });
    expect(d).toEqual({ kind: "write", country: "CA", province: "Ontario", trades: ["roofing", "plumbing"] });
  });

  it("trades that do not exist are dropped, and more than the column holds means all trades", () => {
    expect(decideMemberSubscribe({ ...base, trades: ["roofing", "made-up", "roofing"] })).toMatchObject({ trades: ["roofing"] });
    const many = [...TRADES];
    expect(many.length).toBeGreaterThan(MAX_STORED_TRADES);
    expect(decideMemberSubscribe({ ...base, trades: many })).toMatchObject({ kind: "write", trades: [] });
  });

  it("country first: the typed province or state decides the country, and an unknown place adds nobody", () => {
    expect(memberDigestPlace("QC")).toEqual({ country: "CA", province: "Quebec" });
    expect(memberDigestPlace("Québec")).toEqual({ country: "CA", province: "Quebec" });
    expect(memberDigestPlace("south carolina")).toEqual({ country: "US", province: "South Carolina" });
    expect(memberDigestPlace("SC")).toEqual({ country: "US", province: "South Carolina" });
    expect(memberDigestPlace(" tx ")).toEqual({ country: "US", province: "Texas" });
    expect(memberDigestPlace("Canada")).toBeNull();
    expect(memberDigestPlace("")).toBeNull();
    expect(decideMemberSubscribe({ ...base, provinceRaw: "South Carolina" })).toMatchObject({ kind: "write", country: "US", province: "South Carolina" });
    expect(decideMemberSubscribe({ ...base, provinceRaw: "Somewhere" })).toEqual({ kind: "skip", why: "place" });
  });

  it("the box is on the onboarding form for listings, starts unticked, and the action only acts on a tick", () => {
    const form = read("src/components/forms/onboarding-form.tsx");
    const box = form.slice(form.indexOf('name="weekly_email"') - 40, form.indexOf('name="weekly_email"') + 200);
    expect(box).toContain('type="checkbox"');
    // Ticked again only when they ticked it themselves before "Edit my details"; never on by default.
    expect(box).toContain('defaultChecked={echoed("weekly_email") === "on"}');
    expect(form).not.toMatch(/name="weekly_email"[^>]*\bdefaultChecked(?!=\{echoed)/);
    const action = read("src/lib/auth/actions.ts");
    expect(action).toMatch(/isListing && listingStatus !== "rejected" && weeklyEmailTicked\(formData\.get\("weekly_email"\)\)/);
    // It adds people to the list; it never sends, and it never flips the weekly switch.
    const member = read("src/lib/digest/member.ts");
    expect(member).not.toMatch(/sendDigestEmail|sendEmail|WEEKLY_DIGEST_ENABLED\s*=/);
    expect(member).toMatch(/email_confirmed_at/);
    expect(read("src/app/api/cron/weekly-digest/route.ts")).toMatch(/weeklyDigestEnabled\(\)/);
  });

  // Changing a word of the label without bumping MEMBER_CONSENT_VERSION fails here.
  const PINNED: Record<string, Record<(typeof LANGS)[number], string>> = {
    "member-v1-2026-11": {
      en: "Yes, send me the free weekly PMRFP email: open bids, major projects and recent awards for my trades in my province or state. I can unsubscribe at any time.",
      fr: "Oui, envoyez-moi le courriel hebdomadaire gratuit de PMRFP : appels d'offres ouverts, grands projets et contrats octroyés récemment pour mes métiers dans ma province ou mon État. Je peux me désabonner en tout temps.",
      es: "Sí, envíenme el correo semanal gratuito de PMRFP: licitaciones abiertas, grandes proyectos y contratos adjudicados recientemente para mis oficios en mi provincia o estado. Puedo cancelar la suscripción en cualquier momento.",
    },
  };

  it("the label's words are pinned to the consent version", () => {
    const pinned = PINNED[MEMBER_CONSENT_VERSION];
    expect(pinned, `no pinned wording for ${MEMBER_CONSENT_VERSION}`).toBeTruthy();
    for (const lang of LANGS) expect(auth[lang].onboarding.weeklyEmailLabel, lang).toBe(pinned[lang]);
  });

  it("sign-up no longer promises the weekly email to everyone", () => {
    const everyone = /the weekly tender digest for your trade|you get the weekly tender digest|le résumé hebdomadaire des appels d'offres de votre|vous recevez le résumé hebdomadaire|el resumen semanal de licitaciones de su oficio|recibe el resumen semanal\./i;
    for (const lang of LANGS) {
      const s = v3Pages[lang].signup;
      const lines = [...s.getsSeller, ...s.freePoints, ...s.nextSeller.map((x) => x.desc), ...auth[lang].joinProof.freeItems];
      for (const line of lines) expect(line, `${lang}: ${line}`).not.toMatch(everyone);
      // It is still offered, as a choice.
      expect(s.getsSeller.some((x) => /if you want it|si vous le voulez|si lo desea/.test(x)), lang).toBe(true);
    }
    expect(read("src/app/[lang]/(v3)/welcome/ejt/page.tsx")).not.toMatch(everyone);
  });
});

describe("Trade Pro at sign-up: the card and the checkout agree", () => {
  const flow = read("src/components/home-v3/signup-flow.tsx");

  it("checkout follows the same monthly-when-available rule as every other upgrade link", () => {
    expect(flow).toContain('checkoutPath("pro", p.proInterval)');
    expect(flow).not.toContain('checkoutPath("pro", "annual")');
    const page = read("src/app/[lang]/(v3)/sign-up/page.tsx");
    expect(page).toContain("proInterval={upgradeInterval(Boolean(process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY))}");
    expect(read("src/app/[lang]/(v3)/check-email/page.tsx")).not.toContain('checkoutPath("pro", "annual")');
  });

  it("the plan card leads with the price checkout will ask for", () => {
    expect(flow).toContain("m.money(proMonthly ? PRICING.proMonthly : PRICING.proAnnual)");
    for (const lang of LANGS) {
      const s = v3Pages[lang].signup;
      expect(s.proPerMonthly, lang).toContain("{currency}");
      expect(s.proPerMonthly, lang).toContain("{price}");
      // Checkout opens on one price; the page no longer says you choose there.
      expect(s.checkoutBody, lang).not.toMatch(/choose yearly or monthly|choisissez annuel ou mensuel|elija anual o mensual/i);
    }
  });
});

describe("the trade dashboard shows real numbers or nothing", () => {
  const page = read("src/app/[lang]/dashboard/page.tsx");

  it("no stat card carries a hardcoded zero", () => {
    expect(page).not.toMatch(/<StatCard[^>]*value=\{0\}/);
    expect(page).not.toMatch(/value=\{demo \? \d+ : 0\}/);
  });

  it("saved and interests are counted from the same rows their pages list, and profile views only exist in the demo", () => {
    expect(page).toMatch(/from\("saved_rfps"\)/);
    expect(page).toMatch(/from\("rfp_interests"\)/);
    expect(page).toMatch(/activity\.saved != null && <StatCard/);
    expect(page).toMatch(/activity\.interests != null && <StatCard/);
    expect(page).toMatch(/\{demo && <StatCard label=\{t\.views\}/);
  });
});
