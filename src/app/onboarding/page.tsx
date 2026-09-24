import type { Metadata } from "next";
import Link from "next/link";
import { getVisitorGeo } from "@/lib/visitor-geo.server";
import { visitorMarket, visitorRegionSlug } from "@/lib/visitor-geo";
import { OnboardingForm } from "@/components/forms/onboarding-form";
import { requireUser } from "@/lib/access/access";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { SITE } from "@/lib/site";
import { safeNextPath } from "@/lib/auth/next";
import { getSignupGcIntent } from "@/lib/gc/intent";
import { parseAwardRef } from "@/lib/gc/packages";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; kind?: string; award?: string }>;
}) {
  const session = await requireUser();
  const role = session.profile.primary_role;
  const { next: rawNext, kind, award: awardParam } = await searchParams;
  const next = safeNextPath(rawNext);
  const [categories, allRegions, geo] = await Promise.all([getCategories(), getRegions(), getVisitorGeo()]);
  // Visitors in the U.S. see the U.S. regions first (the list is long and
  // scrolls); everyone gets their own province/state ticked to start.
  const us = visitorMarket(geo) === "US";
  const isUsRegion = (r: { slug: string }) => r.slug === "united-states" || r.slug.startsWith("us-");
  const regions = us ? [...allRegions.filter(isUsRegion), ...allRegions.filter((r) => !isUsRegion(r))] : allRegions;
  const home = visitorRegionSlug(geo);
  const preselectedRegions = home && regions.some((r) => r.slug === home) ? [home] : [];

  // Buyers pick "property manager" or "general contractor"; a GC sign-up
  // (or ?kind=gc) starts on the contractor choice.
  const gcIntent = role === "property_manager" ? await getSignupGcIntent() : { builder: false, award: null };
  const isGc = role === "property_manager" && (kind === "gc" || gcIntent.builder);
  const award = parseAwardRef(awardParam) ?? gcIntent.award;

  const heading =
    role === "trade"
      ? "Set up your company profile"
      : role === "supplier"
        ? "Set up your supplier profile"
        : isGc
          ? "Tell us about your company"
          : role === "property_manager"
            ? "Tell us about your organization"
            : "You're all set";

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-indigo text-[13px] font-bold text-background">PM</span>
            <span className="text-lg font-semibold tracking-tight">{SITE.name}</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {role === "trade" || role === "supplier"
            ? "This helps property decision-makers and trades find you. You can edit everything later."
            : isGc
              ? "Just the basics — you can post your first sub-trade package right after."
              : "Just the basics — you can post an RFP right after."}
        </p>
        <div className="mt-8 rounded-xl border border-border bg-card p-6 sm:p-8">
          <OnboardingForm
            role={role}
            categories={categories}
            regions={regions}
            next={next}
            preselectedRegions={preselectedRegions}
            orgKind={isGc ? "builder" : "property_manager"}
            award={award}
          />
        </div>
      </main>
    </div>
  );
}
