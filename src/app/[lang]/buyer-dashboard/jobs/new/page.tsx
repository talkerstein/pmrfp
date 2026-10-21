import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { TownJobForm } from "@/components/towns/jobs/town-job-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { buyerDisplayName } from "@/lib/towns/claimable";
import { loadBuyerDashboard } from "@/lib/towns/dashboard-data";
import { placeOf } from "@/lib/towns/nearby";
import { followRegionSlug } from "@/lib/towns/page-data";
import { claimOnboardingHref } from "@/lib/towns/paths";
import { parsePostKind } from "@/lib/town-jobs/rules";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams?: Promise<{ kind?: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const kind = parsePostKind((await searchParams)?.kind) ?? "quote_request";
  return { title: getDictionary(hasLocale(lang) ? lang : "en").townJobs.post.newTitle[kind] };
}

/**
 * A town posts a quote request (?kind=quote_request, the default) or a
 * formal tender mirror (?kind=tender_mirror). ?draft=1 fills it from the
 * municipal writer. A verified town's post goes live at once; a town whose
 * claim is still being checked waits for PMRFP review; a public buyer with no
 * page is asked to claim one first.
 */
export default async function NewTownJobPage({ params, searchParams }: { params: Promise<object>; searchParams?: Promise<{ kind?: string; draft?: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("townJobs").post;
  const session = await requireRole(["public_buyer"]);
  const demo = isDemoMode();
  if (!demo && !session.organization) redirect(localizePath("/onboarding", lang));
  const sp = (await searchParams) ?? {};
  const kind = parsePostKind(sp.kind) ?? "quote_request";
  const [dash, categories, regions] = await Promise.all([
    demo ? Promise.resolve({ own: null, claim: null, page: null }) : loadBuyerDashboard(session),
    getCategories().catch(() => []),
    getRegions().catch(() => []),
  ]);
  const { own, claim, page } = dash;
  const verified = Boolean(own);
  const claimed = !verified && (claim?.status === "pending" || claim?.status === "verified");
  const name = own?.buyer_name ?? (page ? buyerDisplayName(page, lang) : (claim?.buyer_name ?? session.organization?.name ?? ""));
  const regionSlug = page ? await followRegionSlug(page) : null;
  const other = kind === "quote_request" ? "tender_mirror" : "quote_request";

  return (
    <div className="max-w-4xl">
      {demo && <DemoBanner />}
      <PageHeader title={t.newTitle[kind]} description={name} />
      <p className="-mt-3 mb-5 max-w-2xl text-sm text-muted-foreground">{t.newIntro[kind]}</p>

      {!verified && !claimed && !demo ? (
        <div className="rounded-xl border border-border bg-card p-5 text-sm" data-state="no-page">
          <p>{t.noPage}</p>
          <Link href={claimOnboardingHref(null)} className={cn(buttonVariants({ size: "sm" }), "mt-3")}>{t.claim}</Link>
        </div>
      ) : (
        <>
          <p className={cn("mb-5 rounded-md border px-4 py-3 text-sm", verified ? "border-teal-300 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-900")} data-state={verified ? "verified" : "review"}>
            {fmt(verified ? t.verified : t.review, { name })}
          </p>
          {kind === "quote_request" && (
            <p className="mb-5 text-sm">
              {t.writer}{" "}
              <Link href="/rfp-writer?for=town" className="font-medium text-teal-700 underline">{t.writerLink} →</Link>
            </p>
          )}
          <TownJobForm
            kind={kind}
            categories={categories}
            regions={regions}
            defaultRegion={regionSlug && regions.some((r) => r.slug === regionSlug) ? regionSlug : null}
            province={page?.province ?? ""}
            city={page ? placeOf(page, lang) : ""}
            loadWriterDraft={sp.draft === "1"}
          />
          <p className="mt-6 text-sm">
            <Link href={`/buyer-dashboard/jobs/new?kind=${other}`} className="text-teal-700 underline">{t.switchKind[kind]}</Link>
          </p>
        </>
      )}
    </div>
  );
}
