import type { Metadata } from "next";
import Link from "@/i18n/link";
import { SignUpForm } from "@/components/forms/auth-forms";
import { DemoNotice } from "@/components/forms/demo-notice";
import { PRICING } from "@/lib/site";
import { safeNextPath } from "@/lib/auth/next";
import { isGoogleAuthEnabled } from "@/lib/auth/google";
import { billingPathForIntent, parsePlanIntent, type PlanIntent } from "@/lib/billing/plan-intent";
import { parseAwardRef } from "@/lib/gc/packages";
import { getJoinProof } from "@/lib/data/join-proof";
import { JoinProof } from "@/components/public/join-proof";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary, type Messages } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

const VALID_ROLES = ["trade", "supplier", "property_manager", "visitor", "real_estate_agent", "general_contractor", "landlord", "talent"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

/** Role-aware share card — link previews (WhatsApp/iMessage/LinkedIn) fetch the
 *  full URL including ?role=, so invites speak to the right audience. */
export async function generateMetadata({
  searchParams,
  params,
}: {
  searchParams: Promise<{ role?: string }>;
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const [{ role }, { lang }] = await Promise.all([searchParams, params]);
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).auth.meta.signUp;
  const trade = role === "trade" || role === "supplier";
  const pm = role === "property_manager" || role === "real_estate_agent";
  const gc = role === "general_contractor";
  const landlord = role === "landlord";
  const title = trade
    ? t.tradeTitle
    : gc
      ? t.gcTitle
      : landlord
        ? t.landlordTitle
        : pm
        ? t.pmTitle
        : t.defaultTitle;
  const description = trade
    ? t.tradeDescription
    : gc
      ? t.gcDescription
      : landlord
        ? t.landlordDescription
        : pm
        ? t.pmDescription
        : t.defaultDescription;
  return {
    title,
    description,
    alternates: alternatesFor(l, "/sign-up"),
    openGraph: { title, description, url: `https://pmrfp.com${localizePath("/sign-up", l)}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** The chosen plan's name and price in the page's language ("$249 CAD/year", "249 $ CAD/an"). */
function planLabels(intent: PlanIntent, t: Messages["auth"]["signUp"]): { name: string; price: string } {
  const monthly = intent.interval === "monthly";
  const amount =
    intent.plan === "featured"
      ? PRICING.featuredAnnual
      : intent.plan === "seo"
        ? monthly ? PRICING.seoMonthly : PRICING.seoAnnual
        : monthly ? PRICING.proMonthly : PRICING.proAnnual;
  return {
    name: t.plans[intent.plan],
    price: fmt(monthly ? t.priceMonth : t.priceYear, { amount, currency: PRICING.currency }),
  };
}

export default async function SignUpPage({
  searchParams, params }: {
  searchParams: Promise<{ role?: string; next?: string; template?: string; plan?: string; interval?: string; award?: string }>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("auth").signUp;
  const { role: rawRole, next: rawNext, template, plan, interval, award: rawAward } = await searchParams;
  // A GC arriving from a public award they won: their first package is prefilled.
  const award = parseAwardRef(rawAward);
  // Plan chosen on /pricing — re-validated against an allowlist; never trusted for price.
  const intent = parsePlanIntent(plan, interval);
  const planText = intent ? planLabels(intent, t) : null;
  const initialRole: ValidRole | undefined =
    rawRole && (VALID_ROLES as readonly string[]).includes(rawRole)
      ? (rawRole as ValidRole)
      : undefined;
  // Back-compat: older links pass ?template=X; promote it to a `next` path.
  const next = safeNextPath(
    rawNext ??
      (template ? `/pm-dashboard/rfps/new?template=${template}` : intent ? billingPathForIntent(intent) : null),
  );
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
  const [google, proof] = await Promise.all([isGoogleAuthEnabled(), getJoinProof()]);
  // Buyers (PMs, GCs, realtors) see how posting works; everyone else sees the live board.
  const audience =
    !intent && (initialRole === "property_manager" || initialRole === "general_contractor" || initialRole === "landlord" || initialRole === "real_estate_agent")
      ? "buyer"
      : "trade";

  const card = (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-indigo/5">
      <p className="eyebrow text-teal-ink">
        <span className="mr-2 inline-block h-px w-5 align-middle bg-teal-500" />
        {t.eyebrow}
      </p>
      {intent && planText ? (
        <>
          {/* Paid path: one decision on this page, not five. */}
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{fmt(t.startPlan, { plan: planText.name })}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {t.planIntro}
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t.heading}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {t.intro}
          </p>
        </>
      )}
      {intent && planText && (
        <div className="mt-5 rounded-lg border border-teal-300 bg-teal-50/60 p-4 text-sm">
          <p className="font-semibold text-foreground">
            {fmt(t.chose, { plan: planText.name, price: planText.price })}
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            {fmt(t.choseBody, { plan: planText.name })}{" "}
            <Link href="/pricing" className="font-medium text-teal-700 hover:underline">
              {t.changePlan}
            </Link>
          </p>
        </div>
      )}
      <div className="mt-6">
        <SignUpForm
          initialRole={intent ? (initialRole === "supplier" ? "supplier" : "trade") : initialRole}
          lockRole={!!intent}
          next={next}
          award={award}
          google={google}
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t.disclaimer}</p>
      <DemoNotice />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t.haveAccount}{" "}
        <Link href={signInHref} className="font-medium text-teal-700 hover:underline">
          {t.signIn}
        </Link>
      </p>
    </div>
  );

  return (
    <div data-wide className="grid items-start gap-8 lg:grid-cols-[minmax(0,448px)_minmax(0,1fr)] lg:gap-10">
      {/* Phones get the panel below the form; lead with the one number that matters. */}
      {audience === "trade" && proof.open > 0 && (
        <p className="-mb-4 flex items-center justify-center gap-2 text-sm text-muted-foreground lg:hidden">
          <span className="size-2 rounded-full bg-teal-500" />
          <strong className="font-semibold text-foreground">{proof.open}</strong> {t.openNow}
        </p>
      )}
      {card}
      <JoinProof proof={proof} audience={audience} />
    </div>
  );
}
