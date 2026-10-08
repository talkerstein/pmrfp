import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVisitorGeo } from "@/lib/visitor-geo.server";
import { visitorMarket, visitorRegionSlug } from "@/lib/visitor-geo";
import { OnboardingForm } from "@/components/forms/onboarding-form";
import { RolePickerForm } from "@/components/forms/role-picker-form";
import { requireUser } from "@/lib/access/access";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { getSignupPrefs } from "@/lib/auth/signup-prefs";
import { V3Shell } from "@/components/home-v3/shell";
import { SignupTop } from "@/components/home-v3/signup-ui";
import type { Locale } from "@/i18n/config";
import { safeNextPath } from "@/lib/auth/next";
import { needsRolePick, parseRoleChoice } from "@/lib/auth/oauth";
import { rolePickStateFor } from "@/lib/auth/google";
import { getSignupGcIntent } from "@/lib/gc/intent";
import { parseAwardRef } from "@/lib/gc/packages";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary as dict } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  return { title: getDictionary(l).auth.meta.onboarding, alternates: alternatesFor(l, "/onboarding"), robots: { index: false, follow: true } };
}

export default async function OnboardingPage({
  searchParams, params }: {
  searchParams: Promise<{ next?: string; kind?: string; award?: string; role?: string }>;
} & { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const t = getT("auth").onboarding;
  const session = await requireUser();
  const role = session.profile.primary_role;
  const { next: rawNext, kind, award: awardParam, role: roleParam } = await searchParams;
  const next = safeNextPath(rawNext);
  // What the sign-up page said (?role=). Only a pre-selection: never saved as-is.
  const choice = parseRoleChoice(roleParam, kind);
  // Tradespeople looking for work have no company to set up.
  if (role === "talent") redirect(localizePath("/talent/edit", lang));

  // Signed up with Google, so no role yet: ask that one question first.
  if (needsRolePick(await rolePickStateFor(session))) {
    return (
      <Shell lang={lang} heading={t.rolePickHeading} intro={t.rolePickIntro}>
        <RolePickerForm initial={choice} next={next} award={parseAwardRef(awardParam)} />
      </Shell>
    );
  }

  const [categories, allRegions, geo, prefs] = await Promise.all([getCategories(), getRegions(), getVisitorGeo(), getSignupPrefs()]);
  // Visitors in the U.S. see the U.S. regions first (the list is long and
  // scrolls); everyone gets their own province/state ticked to start.
  const us = visitorMarket(geo) === "US";
  const isUsRegion = (r: { slug: string }) => r.slug === "united-states" || r.slug.startsWith("us-");
  const regions = us ? [...allRegions.filter(isUsRegion), ...allRegions.filter((r) => !isUsRegion(r))] : allRegions;
  const home = visitorRegionSlug(geo);
  // What they picked on the sign-up page wins; else their own province/state.
  const pickedRegions = prefs.regions.filter((slug) => regions.some((r) => r.slug === slug));
  const preselectedRegions = pickedRegions.length ? pickedRegions : home && regions.some((r) => r.slug === home) ? [home] : [];
  const preselectedCategories = prefs.categories.filter((slug) => categories.some((c) => c.slug === slug));

  // Buyers pick "property manager" or "general contractor"; a GC sign-up
  // (or ?kind=gc) starts on the contractor choice.
  const gcIntent = role === "property_manager" ? await getSignupGcIntent() : { builder: false, landlord: false, award: null };
  const isGc = role === "property_manager" && (kind === "gc" || choice === "general_contractor" || gcIntent.builder);
  // Landlords (independent building owners): from ?role=landlord or sign-up metadata.
  const isLandlord = role === "property_manager" && !isGc && (choice === "landlord" || gcIntent.landlord);
  const award = parseAwardRef(awardParam) ?? gcIntent.award;

  const heading =
    role === "trade"
      ? t.headings.trade
      : role === "supplier"
        ? t.headings.supplier
        : isGc
          ? t.headings.gc
          : isLandlord
            ? t.headings.landlord
            : role === "property_manager"
            ? t.headings.pm
            : t.headings.done;

  return (
    <Shell
      lang={lang}
      heading={heading}
      intro={
        role === "trade" || role === "supplier"
          ? t.intros.listing
          : isGc
            ? t.intros.gc
            : isLandlord
              ? t.intros.landlord
              : t.intros.buyer
      }
    >
      <OnboardingForm
        role={role}
        categories={categories}
        regions={regions}
        next={next}
        preselectedRegions={preselectedRegions}
        preselectedCategories={preselectedCategories}
        defaultName={prefs.company}
        orgKind={isGc ? "builder" : isLandlord ? "landlord" : "property_manager"}
        award={award}
      />
    </Shell>
  );
}

/** The sign-up template's card, inside the v3 header and footer. */
function Shell({ lang, heading, intro, children }: { lang: Locale; heading: string; intro: string; children: React.ReactNode }) {
  const t = dict(lang).v3Pages.signup;
  return (
    <V3Shell lang={lang}>
      <div className="v3-su-main">
        <div className="v3-wrap" style={{ paddingTop: 28, paddingBottom: 96 }}>
          <div className="v3-su-card" style={{ maxWidth: 880, margin: "0 auto" }}>
            <SignupTop eyebrow={t.eyebrow} />
            <div className="v3-su-pane">
              <h1 className="v3-su-h1">{heading}</h1>
              <p className="v3-su-sub">{intro}</p>
            </div>
            {/* The existing onboarding form (Tailwind), inside the design card. */}
            <div className="v3-su-form v3-bb">{children}</div>
            <div className="v3-su-foot"><div className="v3-su-legal" style={{ marginTop: 0 }}>{t.disclaimer}</div></div>
          </div>
        </div>
      </div>
    </V3Shell>
  );
}
