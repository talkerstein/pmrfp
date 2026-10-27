"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { audienceForRole, rememberAudience } from "@/lib/audience/pm";
import { signUpAction, type ActionState } from "@/lib/auth/actions";
import { onboardingPath, parseRoleChoice } from "@/lib/auth/oauth";
import { type PlanId, type PlanInterval } from "@/lib/billing/plan-intent";
import { checkoutPath } from "@/lib/billing/checkout-flow";
import { SIGNUP_INTENT_COOKIE, intentCookieAttributes, intentFromParams, serializeIntent } from "@/lib/auth/signup-intent";
import { track } from "@/lib/tracking/client";
import { PRICING } from "@/lib/site";
import { ContinueWithGoogle } from "@/components/forms/google-button";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";
import { useV3Money, V3Skeleton } from "./chrome";
import { BigTick, ROLE_PHOTO, SignupAside, SignupFrame, SignupSticky, SignupTop, SmallTick, Stepper } from "./signup-ui";
import { SignupRolePicker } from "./signup-role-picker";
import { looksLikeBusiness } from "@/lib/auth/visitor-upgrade";

export type SignupCopy = Messages["v3Pages"]["signup"] & { linkNote?: string };
export const SIGNUP_ROLES = ["trade", "supplier", "property_manager", "landlord", "general_contractor", "real_estate_agent", "talent", "visitor"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

/** Companies that sell to the board: they pick trades and a plan. */
const SELLERS: SignupRole[] = ["trade", "supplier"];
const SHOW_TRADES = 15;
const SHOW_REGIONS = 8;

export interface SignupProps {
  lang: Locale;
  t: SignupCopy;
  initialRole?: SignupRole;
  /** The link itself named the role (?role=…): the "who are you?" step is skipped. */
  roleFromLink?: boolean;
  /** The plain email notice under the button (auth.emailConsent). */
  consent: { notice: string; terms: string; privacy: string };
  /** Arrived from a paid-plan button: the role (trade/supplier) and plan are decided. */
  intent: { plan: PlanId; interval: PlanInterval; name: string } | null;
  next: string | null;
  award: string | null;
  google: boolean;
  signInHref: string;
  stats: { open: number | null; closing7: number | null; trades: number; regions: number };
  trades: { slug: string; name: string; n: number }[];
  regions: { slug: string; name: string }[];
  /** Regions picked before they arrive (a town page's "Follow this town"). */
  initialRegions?: string[];
  /** A community group's link was used (lib/campaigns/community): shown as a confirmation on every step. */
  offer?: string | null;
}

export function SignUpFlow(p: SignupProps) {
  const { t, lang } = p;
  const L = (path: string) => localizePath(path, lang);
  const num = (n: number) => formatNumber(n, lang);
  const m = useV3Money(lang);
  const [state, action, pending] = useActionState(signUpAction, {} as ActionState);
  const locked = !!p.intent;
  // A plan or a role named by the link is already decided: start on the details.
  const skipWho = locked || (!!p.roleFromLink && !!p.initialRole);
  const [step, setStep] = useState(skipWho ? 1 : 0);
  const [role, setRole] = useState<SignupRole | "">(locked ? (p.initialRole === "supplier" ? "supplier" : "trade") : p.initialRole ?? "");
  // A property-manager-side pick: no trade popups or toasts for this visitor afterwards.
  useEffect(() => {
    if (audienceForRole(role) === "pm") rememberAudience("pm");
  }, [role]);
  const [trades, setTrades] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>(p.initialRegions ?? []);
  const [plan, setPlan] = useState<"free" | "pro">(p.intent ? "pro" : "free");
  const [allTrades, setAllTrades] = useState(false);
  const [allRegions, setAllRegions] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  // "Just looking" with a company-ish name or a company email: offer the free listing.
  const [typed, setTyped] = useState({ name: "", email: "" });
  const [bizDismissed, setBizDismissed] = useState(false);
  const showBiz = role === "visitor" && !bizDismissed && looksLikeBusiness(typed);
  // Passwordless by default (Supabase emails a link); a password is optional.
  const [method, setMethod] = useState<"link" | "password">("link");
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  // A community group's link: name (and company) asked up front, so the account
  // has them even if the emailed link is never clicked.
  const askName = !!p.offer;

  const isSeller = role === "" || SELLERS.includes(role);
  const pickTrades = isSeller || role === "talent";
  const pro = isSeller && plan === "pro";
  const roleName = role ? t.roles[role].name : t.notPicked;
  const toggle = (list: string[], set: (v: string[]) => void, slug: string, single = false) =>
    set(list.includes(slug) ? list.filter((x) => x !== slug) : single ? [slug] : [...list, slug]);
  const tradeBySlug = new Map(p.trades.map((x) => [x.slug, x]));
  const regionBySlug = new Map(p.regions.map((x) => [x.slug, x]));
  const openInPicked = trades.reduce((s, x) => s + (tradeBySlug.get(x)?.n ?? 0), 0);
  const listText = (names: string[]) => (!names.length ? t.notPicked : names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`);

  // Server-side meaning of the choice (same rules as the classic sign-up form).
  const isGc = role === "general_contractor";
  const isLandlord = role === "landlord";
  const formRole = isGc || isLandlord ? "property_manager" : role || "trade";
  // Picked Trade Pro here (no plan in the URL): checkout comes after the account.
  const nextPath = p.next ?? (pro && !p.intent ? checkoutPath("pro", "annual") : null);

  // Which step of the wizard people reach (once each per visit): where the sign-up leaks is measured, not guessed.
  const seenSteps = useRef(new Set<number>());
  useEffect(() => {
    if (seenSteps.current.has(step)) return;
    seenSteps.current.add(step);
    track("signup_step", { step: step + 1, role: role || null });
  }, [step, role]);
  // Keep what the link asked for (plan, return path, town, role) for two hours, in case this page is opened again without it.
  useEffect(() => {
    const i = intentFromParams({
      role: p.roleFromLink ? p.initialRole : undefined,
      plan: p.intent?.plan,
      interval: p.intent?.interval,
      next: p.next ?? undefined,
      region: p.initialRegions?.[0],
    });
    if (!i) return;
    try {
      document.cookie = `${SIGNUP_INTENT_COOKIE}=${serializeIntent(i)}; ${intentCookieAttributes(window.location.protocol === "https:")}`;
    } catch {
      /* cookies off: the URL still works */
    }
  }, [p.roleFromLink, p.initialRole, p.intent, p.next, p.initialRegions]);

  const stepText = step === 3 ? t.done : fmt(t.stepOf, { n: step + 1 });
  const gets = isSeller ? (pro ? t.getsPro : t.getsSeller) : t.getsPoster;
  const summary: { k: string; v: string; tone: "on" | "no" | "mint" }[] = [{ k: t.sumAccount, v: roleName, tone: role ? "on" : "no" }];
  const tradeNames = trades.map((x) => tradeBySlug.get(x)?.name ?? x);
  const regionNames = regions.map((x) => regionBySlug.get(x)?.name ?? x);
  if (pickTrades) summary.push({ k: role === "talent" ? t.sumTrade : t.sumTrades, v: listText(tradeNames), tone: trades.length ? "on" : "no" });
  summary.push({ k: t.sumRegions, v: listText(regionNames), tone: regions.length ? "on" : "no" });
  summary.push({ k: t.sumPlan, v: isSeller ? (pro ? t.planPro : t.planFree) : t.planPoster, tone: "mint" });

  const goDetails = () => {
    const fields = [nameRef.current, companyRef.current, emailRef.current, method === "password" ? passRef.current : null];
    const bad = fields.find((f) => f && !f.checkValidity());
    if (bad) {
      setDetailsError(true);
      bad.reportValidity();
      return false;
    }
    setDetailsError(false);
    return true;
  };
  const next = () => {
    if (step === 0 && !role) return;
    if (step === 1 && !goDetails()) return;
    setStep((s) => Math.min(2, s + 1));
  };
  const back = () => setStep((s) => Math.max(locked ? 1 : 0, s - 1));

  const canGo = step !== 0 || !!role;
  const contLabel = step === 0 ? t.cont : step === 1 ? t.contEmail : isSeller ? (pro ? t.contPro : t.contFree) : t.contPoster;
  const hint = step === 0 ? (role ? "" : t.hintPick) : step === 1 ? t.hintLater : isSeller && pro ? t.hintCheckout : t.hintNoCard;
  const intentPrice = (): ReactNode => {
    if (!p.intent) return null;
    if (!m.known) return <V3Skeleton w="8ch" />;
    const monthly = p.intent.interval === "monthly";
    const cad = p.intent.plan === "featured" ? PRICING.featuredAnnual : monthly ? PRICING.proMonthly : PRICING.proAnnual;
    return `${m.money(cad)} ${m.currency}`;
  };
  const posterLine = isGc ? t.posterLines.gc : isLandlord ? t.posterLines.landlord : role === "visitor" ? t.posterLines.visitor : t.posterLines.default;

  const aside = (
    <SignupAside
      d={{
        photo: ROLE_PHOTO[role || "trade"],
        live: t.live,
        open: p.stats.open != null ? num(p.stats.open) : null,
        openLabel: t.openNow,
        three: [
          ...(p.stats.closing7 != null ? [{ n: num(p.stats.closing7), l: t.closing }] : []),
          { n: num(p.stats.trades), l: t.trades },
          { n: num(p.stats.regions), l: t.regions },
        ],
        getsLabel: isSeller && pro ? t.getPro : t.getFree,
        gets,
        setupLabel: t.setup,
        stepText,
        summary,
        lock: t.noCard,
      }}
    />
  );

  const chips = (items: { slug: string; name: string; n?: number }[], list: string[], set: (v: string[]) => void, single: boolean) =>
    items.map((c) => (
      <button key={c.slug} type="button" className="v3-su-chip" aria-pressed={list.includes(c.slug)} onClick={() => toggle(list, set, c.slug, single)}>
        {c.name}
        {c.n != null && <span className="c">{num(c.n)}</span>}
      </button>
    ));
  const shownTrades = allTrades ? p.trades : p.trades.slice(0, SHOW_TRADES);
  const shownRegions = allRegions ? p.regions : p.regions.slice(0, SHOW_REGIONS);

  return (
    <>
      <SignupFrame aside={aside}>
        <form action={action}>
          <SignupTop eyebrow={t.eyebrow} have={<>{t.have} <a href={L(p.signInHref)}>{t.signIn}</a></>}>
            <Stepper labels={t.steps} step={step} onGo={(i) => setStep(Math.max(locked ? 1 : 0, i))} />
          </SignupTop>

          {p.offer && <div role="status" className="v3-su-offer" data-testid="community-offer">✓ {p.offer}</div>}
          {state.error && <div role="alert" className="v3-su-err">{state.error}</div>}

          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="role" value={formRole} />
          {isGc && <input type="hidden" name="orgKind" value="builder" />}
          {isLandlord && <input type="hidden" name="orgKind" value="landlord" />}
          {isGc && p.award && <input type="hidden" name="award" value={p.award} />}
          {nextPath && <input type="hidden" name="next" value={nextPath} />}
          {pro && <input type="hidden" name="plan" value="pro" />}
          {pickTrades && trades.map((x) => <input key={x} type="hidden" name="pref_categories" value={x} />)}
          {regions.map((x) => <input key={x} type="hidden" name="pref_regions" value={x} />)}
          <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

          {/* 01 · Who are you? */}
          <div className="v3-su-pane" hidden={step !== 0}>
            {step === 0 && <h1 className="v3-su-h1">{t.whoHead}</h1>}
            <p className="v3-su-sub">{t.whoSub}</p>
            <SignupRolePicker
              t={t}
              role={role}
              onRole={setRole}
              onLooking={() => {
                setRole("visitor");
                setStep(1);
              }}
            />
          </div>

          {/* 02 · Your details */}
          <div className="v3-su-pane" hidden={step !== 1}>
            {step === 1 && <h1 className="v3-su-h1">{role === "talent" ? t.detailsWorker : isSeller ? t.detailsSeller : t.detailsPoster}</h1>}
            <p className="v3-su-sub">{isSeller || role === "talent" ? t.subSeller : t.subPoster}</p>
            {showBiz && (
              <div className="v3-su-biz" role="status">
                <b>{t.bizHead}</b>
                <span>{t.bizBody}</span>
                <span className="act">
                  <button type="button" className="v3-su-go" onClick={() => setRole("trade")}>{t.bizCta}</button>
                  <button type="button" className="v3-su-more" onClick={() => setBizDismissed(true)}>{t.bizDismiss}</button>
                </span>
              </div>
            )}
            {p.google && role !== "talent" && (
              <div className="v3-su-google v3-bb">
                {/* The role rides to onboarding, where it's asked again (pre-selected) before anything is saved. */}
                <ContinueWithGoogle next={onboardingPath({ role: parseRoleChoice(role || "trade"), award: p.award, next: nextPath })} />
              </div>
            )}
            {/* The email is the one thing the account needs: it comes first, so on a phone it isn't five screens below the trade and region pickers. */}
            <div className="v3-su-block">
              <input type="hidden" name="method" value={method} />
              {askName && (
                <div className="v3-su-two" style={{ marginTop: 0, marginBottom: 12 }}>
                  <label className="v3-su-fld"><span>{t.yourName}</span><input ref={nameRef} name="fullName" type="text" required maxLength={120} autoComplete="name" onBlur={(e) => { const name = e.currentTarget.value; setTyped((x) => ({ ...x, name })); }} /></label>
                  {role !== "talent" && role !== "visitor" && (
                    <label className="v3-su-fld"><span>{isSeller ? t.companyName : t.companyIfAny}</span><input ref={companyRef} name="pref_company" type="text" required={isSeller} maxLength={120} autoComplete="organization" /></label>
                  )}
                </div>
              )}
              <div className="v3-su-two" style={{ marginTop: 0 }}>
                <label className="v3-su-fld"><span>{t.workEmail}</span><input ref={emailRef} name="email" type="email" required autoComplete="email" placeholder="you@example.com" onBlur={(e) => { const email = e.currentTarget.value; setTyped((x) => ({ ...x, email })); }} /></label>
                {method === "password" && (
                  <label className="v3-su-fld"><span>{t.password}</span><input ref={passRef} name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
                )}
              </div>
              <div role="group" aria-label={t.methodLabel} className="v3-su-chips" style={{ marginTop: 10 }}>
                <button type="button" className="v3-su-chip" aria-pressed={method === "link"} onClick={() => setMethod("link")}>{t.methodLink}</button>
                <button type="button" className="v3-su-chip" aria-pressed={method === "password"} onClick={() => setMethod("password")}>{t.methodPassword}</button>
              </div>
              <div className="v3-su-note">{t.emailNote} {method === "link" ? t.methodLinkNote : t.passwordHint}</div>
              {detailsError && <div className="v3-su-note" role="alert" style={{ color: "#9B1C1C", fontWeight: 700 }}>{askName ? t.fillInName : t.fillIn}</div>}
            </div>

            {/* Trade + region picks are optional; name and company are asked at onboarding. */}
            {pickTrades && p.trades.length > 0 && (
              <div className="v3-su-block">
                <div className="hd"><b>{t.yourTrades}</b><span>{trades.length ? fmt(t.tradesCount, { n: num(trades.length), open: num(openInPicked) }) : t.pickSome}</span></div>
                <div className="v3-su-chips">
                  {chips(shownTrades, trades, setTrades, role === "talent")}
                  {p.trades.length > SHOW_TRADES && (
                    <button type="button" className="v3-su-more" aria-expanded={allTrades} onClick={() => setAllTrades((x) => !x)}>
                      {allTrades ? t.showFewer : fmt(t.seeAllTrades, { n: num(p.trades.length) })}
                    </button>
                  )}
                </div>
                <div className="v3-su-note">{t.tradesNote}</div>
              </div>
            )}

            {p.regions.length > 0 && (
              <div className="v3-su-block">
                <div className="hd"><b>{isSeller ? t.serviceRegions : t.yourRegions}</b><span>{regions.length ? fmt(t.picked, { n: num(regions.length) }) : t.pickSome}</span></div>
                <div className="v3-su-chips">
                  {chips(shownRegions, regions, setRegions, false)}
                  {p.regions.length > SHOW_REGIONS && (
                    <button type="button" className="v3-su-more" aria-expanded={allRegions} onClick={() => setAllRegions((x) => !x)}>
                      {allRegions ? t.showFewer : fmt(t.seeAllRegions, { n: num(p.regions.length) })}
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* 03 · Pick a plan */}
          <div className="v3-su-pane" hidden={step !== 2}>
            {isSeller && !p.intent && (
              <>
                {step === 2 && <h1 className="v3-su-h1">{t.planHead}</h1>}
                <p className="v3-su-sub">{t.planSub}</p>
                <div role="radiogroup" aria-label={t.planLabel} className="v3-su-plans">
                  <button type="button" role="radio" aria-checked={!pro} className="v3-su-plan" onClick={() => setPlan("free")}>
                    <span className="hd"><span className="nm">{t.free}</span><span className="tk"><SmallTick stroke="#FFFFFF" /></span></span>
                    <span className="pr">{lang === "fr" ? "0 $" : "$0"}</span>
                    <span className="per">{t.forever}</span>
                    <ul>{t.freePoints.map((x) => <li key={x}><BigTick />{x}</li>)}</ul>
                  </button>
                  <button type="button" role="radio" aria-checked={pro} className="v3-su-plan pro" onClick={() => setPlan("pro")}>
                    <span className="hd"><span className="nm">{t.pro}<span className="pp">{t.popular}</span></span><span className="tk"><SmallTick stroke={pro ? "#1B1D3A" : "#282B59"} /></span></span>
                    <span className="pr">{m.known ? m.money(PRICING.proAnnual) : <V3Skeleton w="4ch" />}</span>
                    <span className="per">{m.known ? fmt(t.proPer, { currency: m.currency, price: m.money(PRICING.proMonthly) }) : <V3Skeleton w="12em" />}</span>
                    <ul>{t.proPoints.map((x) => <li key={x}><BigTick stroke="#91F2CF" />{x}</li>)}</ul>
                  </button>
                </div>
                <div className="v3-su-info">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#282B59" strokeWidth="2" aria-hidden><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.2v.3" /></svg>
                  <span>{pro ? t.notePro : t.noteFree}</span>
                </div>
              </>
            )}
            {isSeller && p.intent && (
              <>
                {step === 2 && <h1 className="v3-su-h1">{t.planHead}</h1>}
                <div className="v3-su-chosen">
                  <b>{fmt(t.chosen, { plan: p.intent.name })}</b> {intentPrice()}
                  <a href={L("/pricing")}>{t.changePlan}</a>
                </div>
                <div className="v3-su-info">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#282B59" strokeWidth="2" aria-hidden><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.2v.3" /></svg>
                  <span>{t.notePro}</span>
                </div>
              </>
            )}
            {!isSeller && (
              <>
                {step === 2 && <h1 className="v3-su-h1">{t.posterHead}</h1>}
                <p className="v3-su-sub">{t.posterSub}</p>
                <div className="v3-su-free">
                  <div><div className="n">{lang === "fr" ? "0 $" : "$0"}</div><div className="k">{role === "visitor" ? t.posterTagBrowse : t.posterTagPost}</div></div>
                  <ul>
                    <li><BigTick stroke="#1B1D3A" />{posterLine}</li>
                    <li><BigTick stroke="#1B1D3A" />{t.posterBrowse}</li>
                    <li><BigTick stroke="#1B1D3A" />{t.posterNoPressure}</li>
                  </ul>
                </div>
              </>
            )}
            <p className="v3-su-note" style={{ marginTop: 16 }}>{t.later}</p>
          </div>

          <div className="v3-su-foot">
            <div className="row">
              <button type="button" className="v3-su-back" hidden={step === (locked ? 1 : 0)} onClick={back}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#282B59" strokeWidth="2.5" aria-hidden><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
                {t.back}
              </button>
              <div className="r">
                {hint && <span className="hint">{hint}</span>}
                {step < 2 ? (
                  <button type="button" className="v3-su-go" aria-disabled={!canGo} onClick={next}>{contLabel}</button>
                ) : (
                  <button type="submit" className="v3-su-go" disabled={pending}>{pending ? t.creating : contLabel}</button>
                )}
              </div>
            </div>
            {/* The plain email notice, right under the button on every step (CASL; lib/consent/email). */}
            <p className="v3-su-notice" data-testid="email-notice">
              {p.consent.notice}{" "}
              <a href={L("/terms")}>{p.consent.terms}</a> · <a href={L("/privacy")}>{p.consent.privacy}</a>
            </p>
            <div className="v3-su-legal">{t.disclaimer}</div>
          </div>
        </form>
      </SignupFrame>
      {p.stats.open != null && (
        <SignupSticky
          a={fmt(t.stickyA, { n: num(p.stats.open) })}
          b={p.stats.closing7 != null ? fmt(t.stickyB, { n: num(p.stats.closing7) }) : ""}
          meta={stepText}
          cta={{ href: L("/rfp-writer"), label: t.postFree }}
        />
      )}
    </>
  );
}
