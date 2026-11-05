import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/i18n/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { isDemoMode, requireRole } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { ListingStatusBanner } from "@/components/dashboard/listing-status-banner";
import { ListingFinishStep } from "@/components/forms/listing-finish";
import { buttonVariants } from "@/components/ui/button";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { plural } from "@/i18n/format";
import { finishHref, missingSteps, pickStep, stepsFor, type ListingStep } from "@/lib/organizations/listing-steps";
import type { Organization } from "@/types/db";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").dashClient.finish.title };
}

function initialValue(step: ListingStep, org: Organization): string {
  const values: Record<ListingStep, string | null | undefined> = {
    logo: org.logo_url,
    short: org.short_description,
    full: org.full_description,
    website: org.website,
    phone: org.phone,
    city: org.city,
    insurance: org.insurance_status,
    wsib: org.wsib_status,
    team: org.employee_count_range,
  };
  return values[step] ?? "";
}

/**
 * One question at a time for the parts of a listing that are still empty, with
 * the listing beside it. New companies land here after onboarding; the
 * dashboard's completion card and the welcome email link here too. The full
 * form at /dashboard/company stays for everything else.
 */
export default async function FinishListingPage({
  params,
  searchParams,
}: {
  params: Promise<object>;
  searchParams: Promise<{ step?: string; after?: string; welcome?: string }>;
}) {
  await setLangFrom(params);
  const session = await requireRole(["trade", "supplier"]);
  const org = session.organization;
  if (!org) redirect(localizePath("/onboarding", getLang()));

  const t = getT("dashClient").finish;
  const items = getT("dash").profile.items;
  const sp = await searchParams;
  const step = pickStep(org, sp.step, sp.after);
  const steps = stepsFor(org);
  const missing = missingSteps(org);
  const live = org.profile_status === "approved" && org.slug;

  return (
    <div>
      <PageHeader title={t.title} description={t.description} />
      {!isDemoMode() && <ListingStatusBanner status={org.profile_status} name={org.name} slug={org.slug} welcome={sp.welcome === "1"} />}
      {step ? (
        <ListingFinishStep
          key={step}
          step={step}
          initial={initialValue(step, org)}
          done={steps.length - missing.length}
          total={steps.length}
          organizationId={org.id}
          preview={{
            name: org.name,
            logoUrl: org.logo_url ?? null,
            city: org.city ?? null,
            province: org.province ?? null,
            shortDescription: org.short_description ?? null,
            insurance: org.insurance_status ?? null,
            wsib: org.wsib_status ?? null,
            team: org.employee_count_range ?? null,
          }}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          {missing.length === 0 ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              <div>
                <h2 className="text-lg font-semibold">{t.doneTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t.doneBody}</p>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{plural(missing.length, t.leftTitle)}</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {missing.map((s) => (
                  <li key={s}>
                    <Link href={finishHref(s)} className="font-medium text-teal-ink hover:underline">
                      {items[s]}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            {live && (
              <Link href={`/directory/${org.slug}`} className={buttonVariants({ variant: "accent" })}>
                {t.viewListing} <ArrowRight className="size-4" />
              </Link>
            )}
            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
              {t.toDashboard}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
