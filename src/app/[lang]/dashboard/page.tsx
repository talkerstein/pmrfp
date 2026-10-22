import Link from "@/i18n/link";
import { Camera, FileText } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { listMyProjects, projectsReady } from "@/lib/projects/server";
import { portfolioReady } from "@/lib/projects/manage";
import { buttonVariants } from "@/components/ui/button";
import { listRfps } from "@/lib/data/rfps";
import { getCategories } from "@/lib/data/taxonomy";
import { HUB_DAYS, filterWins, hubWins } from "@/lib/gc/hub";
import { torontoToday } from "@/lib/data/monthly-winners-load";
import { StatCard, PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { ActivateButton } from "@/components/dashboard/billing-actions";
import { ProfileCompletionCard } from "@/components/dashboard/profile-completion-card";
import { ReputationCard } from "@/components/karma/reputation-card";
import { RecentUpdates, TRADE_NOTICE_TYPES } from "@/components/pm-jobs/recent-updates";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt, formatNumber, plural } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { benchmarkView } from "@/lib/data/price-benchmarks";
import { benchmarkPath, benchmarksForTrades } from "@/lib/data/price-benchmarks-load";
import { PriceBenchmarkCard } from "@/components/benchmarks/price-benchmark-card";
import { getMemberMarket } from "@/lib/leads/load";
import { MarketPanel } from "@/components/leads/market-panel";
import { TrialFlash, TrialStartForm, TrialStatus, canStartTrial } from "@/components/leads/trial";
import { InsightsCard } from "@/components/insights/insights-card";
import { dashboardInsights } from "@/lib/insights/dashboard";
import { JoinRequestsCard } from "@/components/dashboard/join-requests-card";
import { BadgeInstallCard } from "@/components/dashboard/badge-install-card";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").dash.meta.home };
}

export default async function TradeDashboardHome({
  params,
  searchParams,
}: {
  params: Promise<object>;
  searchParams?: Promise<{ trial?: string; join?: string }>;
}) {
  await setLangFrom(params);
  const t = getT("dash").home;
  const tl = getT("leads").trial;
  const session = await requireRole(["trade"]);
  const demo = isDemoMode();
  const org = session.organization;
  const sp = await searchParams;
  const flash = sp?.trial;
  // Country-first: the company's own country (its profile, else the CA|US switch / IP).
  const { country, province } = await getVisitorCountry({ session });
  const [rfps, photoProjects, tradeSlugs, market] = await Promise.all([
    listRfps({ country }),
    projectsReady(),
    orgTradeSlugs(org?.id ?? null, demo),
    demo ? Promise.resolve(null) : getMemberMarket(session, country).catch((e) => {
      console.warn("[leads] market unavailable", e instanceof Error ? e.message : e);
      return null;
    }),
  ]);
  const onTrial = !session.paid && session.trial?.status === "active";
  const trialOffer = !demo && canStartTrial({ paid: session.paid, trial: session.trial, organizationType: org?.organization_type });
  const matchingRfps = rfps.filter((r) => r.status === "open").length;
  const recentWins = await gcWinsForTrades(rfps, tradeSlugs);
  // Price benchmarks for this company's trades, in its own country and province first.
  const benches = tradeSlugs.length ? await benchmarksForTrades(tradeSlugs, country, province).catch(() => []) : [];
  const tb = getT("benchmarks").dash;
  const lang = getLang();
  const tp = getT("portfolio").home;
  const nudge = photoProjects && org && !demo ? await projectNudge(org.id) : null;
  // "Insights for you": facts from the cached snapshots, gated on the session's entitlements.
  const insights = market
    ? await dashboardInsights(session, market, lang).catch((e) => {
        console.warn("[insights] unavailable", e instanceof Error ? e.message : e);
        return null;
      })
    : null;

  return (
    <div>
      {demo && <DemoBanner />}
      <PageHeader
        title={org?.name ? fmt(t.welcomeName, { name: org.name }) : t.welcome}
        description={t.description}
      />

      {!demo && <JoinRequestsCard session={session} back="/dashboard" flash={sp?.join} />}
      <TrialFlash value={flash} />
      <TrialStatus trial={session.trial} paid={session.paid} country={country} />

      {market && <MarketPanel market={market} session={session} country={country} />}

      {insights && (
        <InsightsCard insights={insights.insights} persona={insights.persona} lang={lang} isPro={insights.isPro} marketHref={insights.marketHref} />
      )}

      {/* Prominent profile-completion meter — single source of truth for "what
          to do next." Replaces the previous trio (stat / checklist / recommended-
          action) which were spread across the page and visually inconsistent. */}
      <ProfileCompletionCard org={org} hasActiveSub={session.hasTradeAccess} />

      {!demo && <RecentUpdates userId={session.userId} types={TRADE_NOTICE_TYPES} />}

      {!demo && <ReputationCard orgId={org?.id} audience="trade" />}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={t.subscription}
          value={onTrial ? tl.label : session.hasTradeAccess ? t.proActive : t.free}
          hint={onTrial ? plural(session.trial!.daysLeft, tl.active) : session.hasTradeAccess ? t.fullAccess : t.upgradeHint}
          href="/dashboard/billing"
        />
        <StatCard label={t.matching} value={matchingRfps} hint={t.openOpps} href="/dashboard/rfps" />
        <StatCard label={t.saved} value={0} href="/dashboard/saved-rfps" />
        <StatCard label={t.interests} value={0} href="/dashboard/interests" />
        <StatCard label={t.views} value={demo ? 42 : 0} hint={t.last30} />
      </div>

      {recentWins.n > 0 && (
        <Link
          href={recentWins.trade ? `/gc-hub?trade=${recentWins.trade.slug}` : "/gc-hub"}
          className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-6 transition-colors hover:border-teal-300"
        >
          <div>
            <h2 className="text-base font-semibold">
              {recentWins.trade ? fmt(t.gcTitle, { trade: tradeName(recentWins.trade.name, lang) }) : t.gcTitleAny}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {fmt(recentWins.trade ? t.gcBody : t.gcBodyAny, { n: formatNumber(recentWins.n, lang), days: HUB_DAYS })}
            </p>
          </div>
          <span className={buttonVariants({ variant: "outline" })}>{t.gcCta}</span>
        </Link>
      )}

      {benches.length > 0 && (
        <section className="mt-6" data-section="price-benchmarks">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{tb.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tb.body}</p>
            </div>
            <Link href="/benchmarks" className="text-sm font-medium text-teal-700 hover:underline">{tb.all} →</Link>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {benches.map(({ benchmark, tradeSlug }) => (
              <PriceBenchmarkCard
                key={tradeSlug}
                view={benchmarkView(benchmark, session.hasTradeAccess)}
                href={benchmarkPath(tradeSlug, benchmark.province)}
                upgradeHref="/dashboard/billing?plan=pro&interval=monthly"
              />
            ))}
          </div>
        </section>
      )}

      {photoProjects && nudge?.kind === "build" && (
        <Link
          href={`/dashboard/projects/${nudge.project.id}/case-study`}
          className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-teal-300 bg-teal-50/60 p-6 transition-colors hover:bg-teal-50"
        >
          <div className="flex items-start gap-4">
            <FileText className="mt-0.5 size-6 shrink-0 text-teal-600" />
            <div>
              <h2 className="text-base font-semibold">{fmt(tp.buildTitle, { title: nudge.project.title })}</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{tp.buildBody}</p>
            </div>
          </div>
          <span className={buttonVariants()}>{tp.buildCta}</span>
        </Link>
      )}

      {photoProjects && nudge?.kind === "sheet" && (
        <Link
          href="/dashboard/projects/capability-sheet"
          className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-6 transition-colors hover:border-teal-300"
        >
          <div className="flex items-start gap-4">
            <FileText className="mt-0.5 size-6 shrink-0 text-teal-600" />
            <div>
              <h2 className="text-base font-semibold">{tp.sheetTitle}</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{tp.sheetBody}</p>
            </div>
          </div>
          <span className={buttonVariants({ variant: "outline" })}>{tp.sheetCta}</span>
        </Link>
      )}

      {photoProjects && !nudge && (
        <Link
          href="/dashboard/projects/new"
          className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-teal-300 bg-teal-50/60 p-6 transition-colors hover:bg-teal-50"
        >
          <div className="flex items-start gap-4">
            <Camera className="mt-0.5 size-6 shrink-0 text-teal-600" />
            <div>
              <h2 className="text-base font-semibold">{t.projectTitle}</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t.projectBody}</p>
            </div>
          </div>
          <span className={buttonVariants()}>{t.addProject}</span>
        </Link>
      )}

      {org?.profile_status === "approved" && org.slug && (
        <BadgeInstallCard org={{ id: org.id, slug: org.slug, name: org.name, website: org.website }} lang={lang} paid={Boolean(session.paid)} />
      )}

      {!session.hasTradeAccess && (
        <div className="mt-6 rounded-lg border border-teal-300 bg-teal-50/60 p-6">
          <h2 className="text-base font-semibold">{t.upsellTitle}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.upsellBody}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {trialOffer && <TrialStartForm source="dashboard" label={tl.start} lang={lang} />}
            <ActivateButton variant={trialOffer ? "outline" : "default"} />
          </div>
          {trialOffer && <p className="mt-2 text-xs text-muted-foreground">{tl.note}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Public contracts awarded in the last HUB_DAYS days — in this company's busiest
 * listed trade when it has any, else all of them — for the GC Hub card.
 */
async function gcWinsForTrades(
  rfps: Awaited<ReturnType<typeof listRfps>>,
  tradeSlugs: string[],
): Promise<{ n: number; trade: { slug: string; name: string } | null }> {
  const wins = hubWins(rfps, [], { today: torontoToday() });
  const categories = tradeSlugs.length ? await getCategories().catch(() => []) : [];
  const best = categories
    .filter((c) => tradeSlugs.includes(c.slug))
    .map((c) => ({ trade: { slug: c.slug, name: c.name }, n: filterWins(wins, { trade: c.name }).length }))
    .sort((a, b) => b.n - a.n)[0];
  return best && best.n > 0 ? best : { n: wins.length, trade: null };
}

/**
 * The next portfolio step for a company that already has projects: finish
 * the newest project's case study, or (all done) print a capability sheet.
 * Null = no projects yet, which keeps the "Add a project" card.
 */
async function projectNudge(
  orgId: string,
): Promise<{ kind: "build"; project: { id: string; title: string } } | { kind: "sheet" } | null> {
  const [projects, ready] = await Promise.all([listMyProjects(orgId), portfolioReady()]);
  const live = projects.filter((p) => p.status !== "rejected" && p.status !== "archived");
  if (live.length === 0) return null;
  const todo = ready ? live.find((p) => !p.progress.complete) : undefined;
  if (todo) return { kind: "build", project: { id: todo.id, title: todo.title } };
  return live.some((p) => p.status === "published") ? { kind: "sheet" } : null;
}

/** The trades this company lists under, for picking a relevant sponsor. */
async function orgTradeSlugs(orgId: string | null, demo: boolean): Promise<string[]> {
  if (!orgId || demo) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_categories")
    .select("trade_categories(slug)")
    .eq("organization_id", orgId);
  return ((data as unknown as { trade_categories: { slug: string } | null }[] | null) ?? [])
    .map((r) => r.trade_categories?.slug)
    .filter((s): s is string => Boolean(s));
}
