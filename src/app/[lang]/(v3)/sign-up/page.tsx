import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { SignUpFlow, type SignupRole } from "@/components/home-v3/signup-flow";
import { safeNextPath } from "@/lib/auth/next";
import { signupRoleFromLink, type SignupLinkRole } from "@/lib/auth/signup-link";
import { isGoogleAuthEnabled } from "@/lib/auth/google";
import { billingPathForIntent, parsePlanIntent } from "@/lib/billing/plan-intent";
import { parseAwardRef } from "@/lib/gc/packages";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { getVisitorListCounts, getOpenCountsByName } from "@/lib/data/list-counts";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { regionCountry } from "@/lib/visitor-geo";
import { FT_COOKIE, parseFirstTouch } from "@/lib/attribution/cookie";
import { tradeLeaningArrival } from "@/lib/auth/visitor-upgrade";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { regionName, tradeName } from "@/i18n/terms";
import { redirect } from "next/navigation";
import { getSession, roleHome } from "@/lib/access/access";
import { loadBuyers } from "@/lib/buyers/load";
import { findBuyerPage } from "@/lib/buyers/model";
import { PublicBuyerSignUp } from "@/components/towns/public-buyer-signup";
import { TrackOnMount } from "@/components/track";
import { buyerDisplayName } from "@/lib/towns/claimable";
import { parseBuyerKey } from "@/lib/towns/managed";
import { PUBLIC_BUYER_ROLE, claimOnboardingHref } from "@/lib/towns/paths";

type ValidRole = SignupLinkRole;

/** Role-aware share card: link previews (WhatsApp/iMessage/LinkedIn) fetch the
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
  if (role === PUBLIC_BUYER_ROLE) {
    const tt = getDictionary(l).towns.meta;
    return { title: tt.signUpTitle, description: tt.signUpDescription, alternates: alternatesFor(l, "/sign-up"), robots: { index: false, follow: true } };
  }
  const trade = role === "trade" || role === "supplier";
  const pm = role === "property_manager" || role === "real_estate_agent";
  const gc = role === "general_contractor";
  const landlord = role === "landlord";
  const title = trade ? t.tradeTitle : gc ? t.gcTitle : landlord ? t.landlordTitle : pm ? t.pmTitle : t.defaultTitle;
  const description = trade ? t.tradeDescription : gc ? t.gcDescription : landlord ? t.landlordDescription : pm ? t.pmDescription : t.defaultDescription;
  return {
    title,
    description,
    alternates: alternatesFor(l, "/sign-up"),
    // Utility page: kept out of the index (links still followed), as under the auth layout.
    robots: { index: false, follow: true },
    openGraph: { title, description, url: `https://pmrfp.com${localizePath("/sign-up", l)}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SignUpPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ role?: string; kind?: string; next?: string; template?: string; plan?: string; interval?: string; award?: string; region?: string; claim?: string; sent?: string; error?: string }>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const t = getT("v3Pages").signup;
  const ta = getT("auth").signUp;
  const { role: rawRole, kind, next: rawNext, template, plan, interval, award: rawAward, region: rawRegion, claim: rawClaim, sent, error } = await searchParams;
  // Towns, cities, school boards, housing providers: their own one-field sign-up (PMRFP for Towns).
  if (rawRole === PUBLIC_BUYER_ROLE) {
    const key = parseBuyerKey(rawClaim);
    const claim = key ? rawClaim! : null;
    const session = await getSession().catch(() => null);
    if (session) redirect(localizePath(session.profile.primary_role === PUBLIC_BUYER_ROLE ? claimOnboardingHref(claim) : roleHome(session.profile.primary_role), lang));
    const page = key ? findBuyerPage((await loadBuyers()).pages, key.provinceSlug, key.slug) : null;
    const claimName = page ? `${buyerDisplayName(page, lang)}, ${regionName(page.province, lang)}` : null;
    return (
      <>
        {sent !== "1" && <TrackOnMount event="signup_started" props={{ role: PUBLIC_BUYER_ROLE }} />}
        <PublicBuyerSignUp lang={lang} claim={page ? claim : null} claimName={claimName} sent={sent === "1"} error={error ?? null} />
      </>
    );
  }
  // A GC arriving from a public award they won: their first package is prefilled.
  const award = parseAwardRef(rawAward);
  // Plan chosen on /pricing: re-validated against an allowlist; never trusted for price.
  const intent = parsePlanIntent(plan, interval);
  // ?role=property_manager / ?role=landlord (or &kind=landlord|gc) start with that role picked; never on "just looking".
  const linkedRole: ValidRole | undefined = signupRoleFromLink(rawRole, kind);
  // No role in the link: start on "I do the work" when they came from a trade page or trade outreach.
  const initialRole: ValidRole | undefined = linkedRole ?? (!intent && (await cameFromTradeSide()) ? "trade" : undefined);
  // Back-compat: older links pass ?template=X; promote it to a `next` path.
  const next = safeNextPath(rawNext ?? (template ? `/pm-dashboard/rfps/new?template=${template}` : intent ? billingPathForIntent(intent) : null));
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";

  const { country, province } = await getVisitorCountry();
  const [google, categories, regions, counts, open] = await Promise.all([
    isGoogleAuthEnabled(),
    getCategories(),
    getRegions(),
    getVisitorListCounts(country),
    getOpenCountsByName(country),
  ]);
  // Busiest trades and regions first: the chips show today's open contracts.
  const trades = categories
    .map((c) => ({ slug: c.slug, name: tradeName(c.name, lang), n: open.trades[c.name] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  // Country-first: the visitor's country's regions (their province/state first), then the other country's.
  const rank = (r: { name: string; province: string | null; country: string }) =>
    regionCountry(r) !== country ? 2 : province && (r.province === province || r.name === province) ? 0 : 1;
  const regionChips = regions
    .map((r) => ({ slug: r.slug, name: regionName(r.name, lang), n: open.regions[r.name] ?? 0, k: rank(r) }))
    .sort((a, b) => a.k - b.k || b.n - a.n || a.name.localeCompare(b.name))
    .map(({ slug, name }) => ({ slug, name }));
  // "Follow this town" (a town page): its region comes pre-picked.
  const initialRegions = rawRegion && regionChips.some((r) => r.slug === rawRegion) ? [rawRegion] : [];

  return (
    <>
      {/* First-party funnel: the sign-up page opened (lib/tracking). */}
      <TrackOnMount event="signup_started" props={{ role: initialRole ?? null, plan: intent?.plan ?? null }} />
      <SignUpFlow
        initialRegions={initialRegions}
        lang={lang}
        t={{ ...t, linkNote: getT("agencies").signupLinkNote }}
        initialRole={initialRole as SignupRole | undefined}
        intent={intent ? { plan: intent.plan, interval: intent.interval, name: ta.plans[intent.plan] } : null}
        next={next}
        award={award}
        google={google}
        signInHref={signInHref}
        stats={{ open: counts.open, closing7: counts.closing7, trades: categories.length, regions: regions.length }}
        trades={trades}
        regions={regionChips}
      />
    </>
  );
}

/** This request's referrer (our own pages only) or the first-touch cookie say "trade side". */
async function cameFromTradeSide(): Promise<boolean> {
  try {
    const [h, c] = await Promise.all([headers(), cookies()]);
    let referrerPath: string | null = null;
    const ref = h.get("referer");
    if (ref) {
      const u = new URL(ref);
      if (u.host === h.get("host")) referrerPath = u.pathname;
    }
    return tradeLeaningArrival({ referrerPath, firstTouch: parseFirstTouch(c.get(FT_COOKIE)?.value) });
  } catch {
    return false;
  }
}
