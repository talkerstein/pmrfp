import type { Metadata } from "next";
import { SignUpFlow, type SignupRole } from "@/components/home-v3/signup-flow";
import { safeNextPath } from "@/lib/auth/next";
import { isGoogleAuthEnabled } from "@/lib/auth/google";
import { billingPathForIntent, parsePlanIntent } from "@/lib/billing/plan-intent";
import { parseAwardRef } from "@/lib/gc/packages";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { getVisitorListCounts, getOpenCountsByName } from "@/lib/data/list-counts";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { regionCountry } from "@/lib/visitor-geo";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { regionName, tradeName } from "@/i18n/terms";

const VALID_ROLES = ["trade", "supplier", "property_manager", "visitor", "real_estate_agent", "general_contractor", "landlord", "talent"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

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
  searchParams: Promise<{ role?: string; next?: string; template?: string; plan?: string; interval?: string; award?: string }>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const t = getT("v3Pages").signup;
  const ta = getT("auth").signUp;
  const { role: rawRole, next: rawNext, template, plan, interval, award: rawAward } = await searchParams;
  // A GC arriving from a public award they won: their first package is prefilled.
  const award = parseAwardRef(rawAward);
  // Plan chosen on /pricing: re-validated against an allowlist; never trusted for price.
  const intent = parsePlanIntent(plan, interval);
  const initialRole: ValidRole | undefined = rawRole && (VALID_ROLES as readonly string[]).includes(rawRole) ? (rawRole as ValidRole) : undefined;
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

  return (
    <SignUpFlow
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
  );
}
