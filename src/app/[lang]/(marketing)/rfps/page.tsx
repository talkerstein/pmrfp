import type { Metadata } from "next";
import Link from "@/i18n/link";
import { Lock } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { FilterBar } from "@/components/public/filter-bar";
import { RfpCard } from "@/components/public/rfp-card";
import { EmptyState } from "@/components/public/empty-state";
import { ReferBanner } from "@/components/public/refer-banner";
import { FoundingBanner } from "@/components/public/founding-banner";
import { listRfps, withPublicRfpPhotos } from "@/lib/data/rfps";
import { getOpenRfpCounts } from "@/lib/data/rfp-counts";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { hasActiveTradeAccess } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { boardStats, compactDollars, isPastContract } from "@/lib/data/fomo";
import { isGcPackage } from "@/lib/gc/packages";
import { rfpMarket } from "@/lib/visitor-geo";
import { getVisitorMarket } from "@/lib/visitor-geo.server";
import type { RfpListItem } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { EmailCapture } from "@/components/public/email-capture";

const PAGE_SIZE = 30;
const AWARDED_PREVIEW = 9;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang: Locale = hasLocale(raw) ? raw : "en";
  const t = getDictionary(lang).board.meta;
  const open = (await getOpenRfpCounts().catch(() => ({ totalOpen: 0 }))).totalOpen;
  return {
    title: t.title,
    description: fmt(t.description, { lead: open > 0 ? plural(open, t.lead) : t.leadNone }),
    alternates: alternatesFor(lang, "/rfps"),
  };
}

export default async function RfpsPage({
  searchParams, params }: {
  searchParams: Promise<Record<string, string | undefined>>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("board");
  const lang = getLang();
  // Counts: raw in English (as before), grouped the local way elsewhere.
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  const sp = await searchParams;
  const [allRfps, categories, regions, propertyTypes, access, market] = await Promise.all([
    listRfps({
      category: sp.category,
      region: sp.region,
      propertyType: sp.propertyType,
      q: sp.q,
      sort: (sp.sort as "closing" | "newest") ?? "closing",
    }, { photos: false }),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
    hasActiveTradeAccess(),
    getVisitorMarket(),
  ]);

  // Country: the visitor's market by default (U.S. visitors see U.S. work
  // first, Canadians Canadian), switchable with the tabs. A region filter
  // already picks a place, so it shows every country.
  type Country = "ca" | "us" | "all";
  const country: Country =
    sp.country === "ca" || sp.country === "us" || sp.country === "all"
      ? sp.country
      : sp.region
        ? "all"
        : market === "US" ? "us" : "ca";
  const inCountry = (c: Country) => (r: RfpListItem) => c === "all" || (rfpMarket(r) === "US") === (c === "us");
  const rfps = allRfps.filter(inCountry(country));
  const openIn = (c: Country) => allRfps.filter((r) => r.status === "open" && inCountry(c)(r)).length;
  const countryHref = (c: Country) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "country") as [string, string][]);
    q.set("country", c);
    return `/rfps?${q.toString()}`;
  };

  // Demo mode (no Supabase): show as full-access so the experience is browsable.
  const locked = isSupabaseConfigured() ? !access : false;
  // Open tenders first (paginated), then real past contracts — who won, for
  // how much. Every number on this page is counted from the listings shown.
  const stats_ = boardStats(rfps);
  const open = rfps.filter((r) => r.status === "open");
  const past = rfps.filter((r) => r.status !== "open" && isPastContract(r));
  const otherClosed = rfps.filter((r) => r.status !== "open" && !isPastContract(r));
  const showAwarded = sp.view === "awarded";
  // GC sub-trade packages: open ones only, as their own tab once any exist.
  const gcOpen = open.filter(isGcPackage);
  const showGc = sp.view === "gc";
  const pageNum = Math.max(1, Number(sp.page) || 1);
  const listing = showAwarded ? [...past, ...otherClosed] : showGc ? gcOpen : open;
  const pages = Math.max(1, Math.ceil(listing.length / PAGE_SIZE));
  const visible = listing.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);
  const recent = !showAwarded && !showGc ? past.slice(0, AWARDED_PREVIEW) : [];
  const hydrated = await withPublicRfpPhotos([...visible, ...recent]);
  const pageItems = hydrated.slice(0, visible.length);
  const recentItems = hydrated.slice(visible.length);
  const pageHref = (n: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(n));
    return `/rfps?${q.toString()}`;
  };
  const viewHref = (view: "awarded" | "gc" | null) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "view") as [string, string][]);
    if (view) q.set("view", view);
    const qs = q.toString();
    return qs ? `/rfps?${qs}` : "/rfps";
  };

  const tabs: { key: "open" | "gc" | "awarded"; label: string; count: number; href: string; active: boolean; show: boolean }[] = [
    { key: "open", label: t.tabs.open, count: open.length, href: viewHref(null), active: !showAwarded && !showGc, show: true },
    { key: "gc", label: t.tabs.gc, count: gcOpen.length, href: viewHref("gc"), active: showGc, show: gcOpen.length > 0 || showGc },
    { key: "awarded", label: t.tabs.awarded, count: past.length + otherClosed.length, href: viewHref("awarded"), active: showAwarded, show: true },
  ];
  // Email prompt names the filtered trade / place when there is one.
  const captureCategory = sp.category ? categories.find((c) => c.slug === sp.category) : undefined;
  const captureRegion = sp.region ? regions.find((r) => r.slug === sp.region) : undefined;
  const hasFilters = Boolean(sp.category || sp.region || sp.propertyType || sp.q);

  return (
    <>
      <section className="border-b border-border bg-card">
        <Container className="py-10 sm:py-12">
          <Eyebrow>{t.hero.eyebrow}</Eyebrow>
          <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-indigo sm:text-4xl">
                {t.hero.title}
              </h1>
              <p className="mt-3 text-muted-foreground">
                {t.hero.body}
              </p>
            </div>
            {(stats_.open > 0 || stats_.pastContracts > 0) && (
              <dl className="grid shrink-0 grid-cols-3 divide-x divide-border rounded-lg border border-border">
                <div className="px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t.stats.open}</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{num(stats_.open)}</dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t.stats.closingWeek}</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{num(stats_.closingThisWeek)}</dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {stats_.awardedValue > 0 ? t.stats.awarded : t.stats.pastAwards}
                  </dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
                    {stats_.awardedValue > 0 ? compactDollars(stats_.awardedValue, lang) : num(stats_.pastContracts)}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </Container>
      </section>

      <FoundingBanner />

      <Container className="py-8">
        <nav aria-label={t.country.aria} className="mb-5 flex flex-wrap gap-2">
          {(["ca", "us", "all"] as const).map((c) => (
            <Link
              key={c}
              href={countryHref(c)}
              aria-current={country === c ? "page" : undefined}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                country === c ? "border-indigo bg-indigo text-white" : "border-border bg-card text-foreground hover:border-indigo/40",
              )}
            >
              {t.country[c]} <span className="ml-1 tabular-nums opacity-70">{num(openIn(c))}</span>
            </Link>
          ))}
        </nav>
        <FilterBar
          categories={categories}
          regions={regions}
          propertyTypes={propertyTypes}
          sortOptions={[
            { value: "closing", label: t.sort.closing },
            { value: "newest", label: t.sort.newest },
          ]}
        />

        <div className="mt-6 flex flex-col gap-3 border-b border-border sm:flex-row sm:items-end sm:justify-between">
          <nav className="-mb-px flex gap-6 overflow-x-auto text-sm" aria-label={t.tabs.aria}>
            {tabs.filter((tab) => tab.show).map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 pb-3 font-medium transition-colors ${tab.active ? "border-indigo text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tab.label}
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{num(tab.count)}</span>
              </Link>
            ))}
          </nav>
          {locked && (
            <p className="flex items-center gap-1.5 pb-3 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> {t.locked.previews}{" "}
              <Link href="/pricing" className="font-medium text-teal-ink hover:underline">{t.locked.unlock}</Link>
            </p>
          )}
        </div>

        {pageItems.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={
                showAwarded
                  ? t.empty.awarded
                  : showGc
                    ? t.empty.gc
                    : t.empty.open
              }
              description={
                hasFilters
                  ? t.empty.filtered
                  : t.empty.unfiltered
              }
            >
              <div className="flex flex-wrap justify-center gap-2">
                {hasFilters && (
                  <Link href={showAwarded ? "/rfps?view=awarded" : showGc ? "/rfps?view=gc" : "/rfps"} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
                    {t.empty.clear}
                  </Link>
                )}
                <Link href="/pricing" className="rounded-md bg-indigo px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                  {t.empty.alerts}
                </Link>
              </div>
            </EmptyState>
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs text-muted-foreground">
              {plural(listing.length, t.count, { n: num(listing.length) })}
              {pages > 1 && fmt(t.pageOf, { page: pageNum, pages })}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((r) => (
                <RfpCard key={r.slug} rfp={r} locked={locked} />
              ))}
            </div>
          </>
        )}

        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5 text-sm" aria-label={t.pagination.aria}>
            {pageNum > 1 ? (
              <Link href={pageHref(pageNum - 1)} className="rounded-md border border-border px-4 py-2 font-medium hover:bg-secondary">{t.pagination.prev}</Link>
            ) : <span />}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{pageNum} / {pages}</span>
            {pageNum < pages ? (
              <Link href={pageHref(pageNum + 1)} className="rounded-md border border-border px-4 py-2 font-medium hover:bg-secondary">{t.pagination.next}</Link>
            ) : <span />}
          </nav>
        )}

        {/* Real past contracts: who won, for how much. */}
        {!showAwarded && !showGc && past.length > 0 && (
          <section className="mt-16">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
              <div>
                <Eyebrow>{t.recent.eyebrow}</Eyebrow>
                <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-indigo">{t.recent.title}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {t.recent.body}
                </p>
              </div>
              <Link href={viewHref("awarded")} className="text-sm font-medium text-teal-ink hover:underline">
                {plural(past.length, t.recent.all, { n: num(past.length) })}
              </Link>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentItems.map((r) => (
                <RfpCard key={r.slug} rfp={r} locked={locked} />
              ))}
            </div>
          </section>
        )}

        <ReferBanner variant="subtle" className="mt-14" />
        <EmailCapture
          trade={captureCategory ? tradeName(captureCategory.name, lang) : null}
          region={captureRegion ? regionName(captureRegion.name, lang) : null}
          categorySlug={captureCategory?.slug}
          regionSlug={captureRegion?.slug}
          signedInHint={access}
        />
      </Container>
    </>
  );
}
