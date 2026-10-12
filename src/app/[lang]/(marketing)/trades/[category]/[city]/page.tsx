import type { Metadata } from "next";
import { prebuildSlice } from "@/lib/build/prebuild";
import Link from "@/i18n/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Container, Eyebrow } from "@/components/container";
import { DirectoryCard } from "@/components/public/directory-card";
import { RfpCard } from "@/components/public/rfp-card";
import { CTASection } from "@/components/public/section";
import { buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd, breadcrumbSchema, faqSchema, itemListSchema } from "@/lib/seo/jsonld";
import {
  getQualifyingCombo,
  listAllRfpsCached,
  listCitiesForTrade,
  listQualifyingCombos,
  listTradesForRegion,
  type TradeCityCombo,
} from "@/lib/data/trade-city";
import { listVendors } from "@/lib/data/directory";
import { withPublicRfpPhotos } from "@/lib/data/rfps";
import { parseAward } from "@/lib/data/fomo";
import { isPublishableWinner, winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { publicTenderSource } from "@/lib/tenders/sources";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { costGuidesFor } from "@/lib/seo/cost-guides.fr";
import { listCaseStudies } from "@/lib/data/case-studies";
import { heroUrlsBySlug } from "@/lib/data/projects";
import { getTemplatesForTrade } from "@/lib/seo/rfp-templates";
import { localizeRfpTemplate } from "@/lib/seo/rfp-templates.fr";
import { PRICING, SITE } from "@/lib/site";
import { SponsorSlot } from "@/components/sponsors/sponsor-slot";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { frIn, frPortal, frTradeOf } from "@/lib/seo/phrases.fr";
import { esIn, esPortal, esTradeOf } from "@/lib/seo/phrases.es";

export const revalidate = 3600;

/**
 * Content-gated programmatic page: exists ONLY for trade × place combos with
 * real content — enough approved vendors, or enough tenders (open or past).
 * See lib/data/trade-city. Everything else 404s: never rendered, never in the
 * sitemap, never linked. New combos turn on via ISR as vendors are approved
 * and tenders import. The busiest 40 prerender at build; the rest render on
 * first visit.
 */
export async function generateStaticParams({ params }: { params: { lang: string } }) {
  // A few pages are prebuilt (lib/build/prebuild); the rest render
  // on first visit, then cache (ISR), so deploys do not stampede the database.
  // (An empty list for any language switches prebuilding off for the whole route.)
  const combos = await listQualifyingCombos();
  const all = combos.map((c) => ({ category: c.category.slug, city: c.region.slug }));
  return prebuildSlice(all, params.lang);
}

const hasListings = (c: TradeCityCombo) => c.open.length + c.past.length > 0;

/** English "$1,200", Spanish (U.S.) "$1,200", French "1 200 $". */
function money(n: number, lang: Locale): string {
  if (lang === "fr") return `${formatNumber(Math.round(n), lang)} $`;
  if (lang === "es") return `$${formatNumber(Math.round(n), lang)}`;
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

/** Counts: English keeps its bare digits, other languages get their separators. */
function num(n: number, lang: Locale): string {
  return lang === "en" ? String(n) : formatNumber(n, lang);
}

/** The {in} place phrase: Spanish "en Toronto", French "à Toronto" (English strings don't use it). */
const placeIn = (name: string, lang: Locale) => (lang === "es" ? esIn(name) : frIn(name));

/** Placeholders for the seo strings: each language picks the ones it needs. */
function comboVars(tradeEn: string, placeEn: string, lang: Locale) {
  return {
    site: SITE.name,
    trade: tradeName(tradeEn, lang),
    lower: tradeEn.toLowerCase(),
    of: lang === "es" ? esTradeOf(tradeEn) : frTradeOf(tradeEn),
    place: regionName(placeEn, lang),
    in: placeIn(placeEn, lang),
  };
}

function awardStats(c: TradeCityCombo) {
  const amounts = c.past
    .map((r) => parseAward(r.summary).amount)
    .filter((n): n is number => !!n && n > 0)
    .sort((a, b) => a - b);
  if (amounts.length < 3) return null;
  return {
    count: amounts.length,
    median: amounts[Math.floor(amounts.length / 2)],
    min: amounts[0],
    max: amounts[amounts.length - 1],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; category: string; city: string }>;
}): Promise<Metadata> {
  const { lang, category, city } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const seo = getDictionary(l).seo;
  const m = seo.tradeCity.meta;
  const combo = await getQualifyingCombo(category, city);
  if (!combo) return { title: seo.notFound };
  const { category: cat, region, open, past } = combo;
  const vars = comboVars(cat.name, region.name, l);
  const alternates = alternatesFor(l, `/trades/${cat.slug}/${region.slug}`);

  if (!hasListings(combo)) {
    return {
      title: fmt(m.vendorTitle, vars),
      description: plural(combo.vendorCount, m.vendorDescription, { ...vars, n: num(combo.vendorCount, l) }),
      alternates,
    };
  }

  const stats = awardStats(combo);
  // Searchers type "<trade> rfp <city>" / "<trade> tenders <city>" / "<trade>
  // contracts <city>" — say those words, and the live count.
  const parts = [
    open.length ? plural(open.length, m.partOpen, { ...vars, n: num(open.length, l) }) : fmt(m.partNoOpen, vars),
    past.length
      ? plural(past.length, m.partPast, {
          ...vars,
          n: num(past.length, l),
          median: stats ? fmt(m.median, { money: money(stats.median, l) }) : "",
        })
      : null,
  ].filter(Boolean);
  return {
    title: fmt(m.title, { ...vars, open: open.length ? plural(open.length, m.openSuffix, { n: num(open.length, l) }) : "" }),
    description: fmt(m.description, { ...vars, parts: parts.join(m.join) }).replace(/^./, (c) => c.toUpperCase()),
    alternates,
  };
}

export default async function TradeCityPage({
  params,
}: {
  params: Promise<{ category: string; city: string }>;
}) {
  await setLangFrom(params);
  const seo = getT("seo");
  const t = seo.tradeCity;
  const lang = getLang();
  const { category, city } = await params;
  const combo = await getQualifyingCombo(category, city);
  if (!combo) notFound();

  const { category: cat, region, open, past } = combo;
  const vars = comboVars(cat.name, region.name, lang);
  const n = (x: number) => num(x, lang);

  const [vendors, caseStudies, allRfps, sameTrade, sameRegion] = await Promise.all([
    listVendors({ category: cat.slug, region: region.slug }),
    listCaseStudies({ categorySlug: cat.slug, regionSlug: region.slug, limit: 3 }),
    listAllRfpsCached(),
    listCitiesForTrade(cat.slug),
    listTradesForRegion(region.slug),
  ]);
  const [heroes, openCards] = await Promise.all([
    heroUrlsBySlug(caseStudies.map((cs) => cs.slug)),
    // Photos only for the cards shown, one small query.
    withPublicRfpPhotos(open.slice(0, 12)).catch(() => open.slice(0, 12)),
  ]);
  // A vendor-only page whose approvals were just revoked: don't render a hollow page.
  if (!hasListings(combo) && vendors.length === 0) notFound();

  const stats = awardStats(combo);
  const winnerPages = new Map(winnersFromRfps(allRfps).map((w) => [winnerKey(w.name), w.slug]));
  const pastRows = past.slice(0, 15).map((r) => {
    const a = parseAward(r.summary);
    const name = a.winner && isPublishableWinner(a.winner) ? a.winner : null;
    return { r, amount: a.amount, winner: name, winnerSlug: name ? winnerPages.get(winnerKey(name)) : undefined };
  });
  // Who wins this work here, by number of contracts.
  const tally = new Map<string, { name: string; count: number }>();
  for (const r of past) {
    const w = parseAward(r.summary).winner;
    if (!w || !isPublishableWinner(w)) continue; // never name individuals
    const entry = tally.get(winnerKey(w)) ?? { name: w, count: 0 };
    entry.count++;
    tally.set(winnerKey(w), entry);
  }
  const topWinners = [...tally]
    .filter(([, w]) => w.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([k, w]) => ({ ...w, slug: winnerPages.get(k) }));
  const sources = [...new Set([...open, ...past].filter((r) => r.sourceType === "public_source").map((r) => publicTenderSource(r.slug).portal))];
  const hasPmRfps = open.some((r) => r.sourceType !== "public_source");

  const guide = costGuidesFor(lang).find((g) => g.tradeSlug === cat.slug);
  const templates = getTemplatesForTrade(cat.slug).map((tpl) => localizeRfpTemplate(tpl, lang));
  const proHref = signUpHrefForPlan("pro", "annual");
  const otherPlaces = sameTrade.filter((c) => c.region.slug !== region.slug).slice(0, 10);
  const otherTrades = sameRegion.filter((c) => c.category.slug !== cat.slug).slice(0, 10);

  const f = t.faqs;
  const sourceList = sources.map((s) => (lang === "fr" ? frPortal(s) : lang === "es" ? esPortal(s) : s)).join(", ");
  const faqs = hasListings(combo)
    ? [
        {
          q: fmt(f.whereQ, vars),
          a: `${sources.length ? fmt(f.wherePublic, { sources: sourceList }) : f.wherePm}${
            sources.length && hasPmRfps ? fmt(f.wherePlusPm, vars) : ""
          }${fmt(f.whereTail, vars)}`,
        },
        ...(stats
          ? [
              {
                q: fmt(f.payQ, vars),
                a: fmt(f.payA, {
                  ...vars,
                  count: n(stats.count),
                  median: money(stats.median, lang),
                  min: money(stats.min, lang),
                  max: money(stats.max, lang),
                }),
              },
            ]
          : []),
        {
          q: fmt(f.firstQ, vars),
          a: fmt(f.firstA, { ...vars, annual: PRICING.proAnnual, monthly: PRICING.proMonthly }),
        },
        {
          q: fmt(f.hiringQ, vars),
          a: fmt(f.hiringA, vars),
        },
      ]
    : [
        { q: fmt(f.quotesQ, vars), a: fmt(f.quotesA, vars) },
        { q: fmt(f.vettedQ, vars), a: fmt(f.vettedA, vars) },
        { q: fmt(f.listedQ, vars), a: fmt(f.listedA, vars) },
      ];

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: seo.crumbs.home, path: localizePath("/", lang) },
          { name: seo.crumbs.trades, path: localizePath("/trades", lang) },
          { name: vars.trade, path: localizePath(`/trades/${cat.slug}`, lang) },
          { name: vars.place, path: localizePath(`/trades/${cat.slug}/${region.slug}`, lang) },
        ])}
      />
      {open.length > 0 ? (
        <JsonLd
          data={itemListSchema(
            fmt(t.openTitle, vars),
            open.slice(0, 20).map((r) => ({ name: r.title, path: localizePath(`/rfps/${r.slug}`, lang) })),
          )}
        />
      ) : vendors.length > 0 ? (
        <JsonLd
          data={itemListSchema(
            fmt(t.companiesList, vars),
            vendors.map((v) => ({ name: v.name, path: localizePath(`/directory/${v.slug}`, lang) })),
          )}
        />
      ) : null}
      <JsonLd data={faqSchema(faqs)} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <nav className="mb-3 text-xs text-muted-foreground">
            <Link href="/trades" className="hover:text-foreground">{seo.crumbs.trades}</Link>
            {" / "}
            <Link href={`/trades/${cat.slug}`} className="hover:text-foreground">{vars.trade}</Link>
            {" / "}
            {vars.place}
          </nav>
          <Eyebrow>
            {fmt(t.eyebrow, vars)}
          </Eyebrow>
          {hasListings(combo) ? (
            <>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                {fmt(t.title, vars)}
              </h1>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                {open.length > 0
                  ? plural(open.length, t.leadOpen, { ...vars, n: n(open.length) })
                  : fmt(t.leadNoOpen, vars)}
                {past.length > 0 ? plural(past.length, t.leadPast, { ...vars, n: n(past.length) }) : ""}
                {t.leadTail}
              </p>
              <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t.stats.open}</dt>
                  <dd className="text-2xl font-semibold">{n(open.length)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t.stats.past}</dt>
                  <dd className="text-2xl font-semibold">{n(past.length)}</dd>
                </div>
                {stats && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t.stats.median}</dt>
                    <dd className="text-2xl font-semibold">{money(stats.median, lang)}</dd>
                  </div>
                )}
                {vendors.length > 0 && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t.stats.companies}</dt>
                    <dd className="text-2xl font-semibold">{n(vendors.length)}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={proHref} className={buttonVariants()}>
                  {fmt(t.byEmail, vars)}
                </Link>
                <Link href="/rfp-writer" className={buttonVariants({ variant: "outline" })}>
                  {t.hiring}
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                {fmt(t.vendorTitle, vars)}
              </h1>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                {plural(combo.vendorCount, t.vendorLead, { ...vars, n: n(combo.vendorCount) })}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/sign-up" className={buttonVariants()}>
                  {fmt(t.postFree, vars)}
                </Link>
                <Link
                  href={`/directory?category=${cat.slug}&region=${region.slug}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {seo.browseDirectory}
                </Link>
              </div>
            </>
          )}
        </Container>
      </section>

      {open.length > 0 && (
        <Container className="py-12">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              {fmt(t.openTitle, vars)}
            </h2>
            <Link href={`/rfps?category=${cat.slug}`} className="text-sm text-teal-700 hover:underline">
              {fmt(t.allRfps, vars)}
            </Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {openCards.map((r) => (
              <RfpCard key={r.slug} rfp={r} locked />
            ))}
          </div>
          {open.length > 12 && (
            <p className="mt-4 text-sm text-muted-foreground">
              {fmt(t.more.before, { n: n(open.length - 12) })}<Link href={`/rfps?category=${cat.slug}`} className="text-teal-700 underline">{t.more.link}</Link>{t.more.after}
            </p>
          )}
        </Container>
      )}

      {pastRows.length > 0 && (
        <section className="bg-secondary/30">
          <Container className="py-12">
            <h2 className="text-2xl font-semibold tracking-tight">
              {fmt(t.pastTitle, vars)}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {t.pastLead}
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3 font-medium">{t.table.contract}</th>
                    <th className="p-3 font-medium">{t.table.wonBy}</th>
                    <th className="p-3 text-right font-medium">{t.table.value}</th>
                    <th className="hidden p-3 font-medium sm:table-cell">{t.table.awarded}</th>
                  </tr>
                </thead>
                <tbody>
                  {pastRows.map(({ r, amount, winner, winnerSlug }) => (
                    <tr key={r.slug} className="border-b border-border last:border-0 align-top">
                      <td className="p-3">
                        <Link href={`/rfps/${r.slug}`} className="hover:text-teal-ink hover:underline">
                          {r.title}
                        </Link>
                      </td>
                      <td className="p-3">
                        {winner ? (
                          winnerSlug ? (
                            <Link href={`/contract-winners/${winnerSlug}`} className="text-teal-700 hover:underline">
                              {winner}
                            </Link>
                          ) : (
                            winner
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3 text-right">{amount ? money(amount, lang) : "—"}</td>
                      <td className="hidden whitespace-nowrap p-3 text-muted-foreground sm:table-cell">{r.deadline ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {topWinners.length > 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                {t.topWinners}{" "}
                {topWinners.map((w, i) => (
                  <span key={w.name}>
                    {i > 0 && " · "}
                    {w.slug ? (
                      <Link href={`/contract-winners/${w.slug}`} className="text-teal-700 hover:underline">{w.name}</Link>
                    ) : (
                      w.name
                    )}{" "}
                    ({n(w.count)})
                  </span>
                ))}
              </p>
            )}
          </Container>
        </section>
      )}

      {vendors.length > 0 && (
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            {fmt(t.companiesTitle, vars)}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <DirectoryCard key={v.slug} vendor={v} />
            ))}
          </div>
        </Container>
      )}

      {caseStudies.length > 0 && (
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            {fmt(t.projectsTitle, vars)}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {caseStudies.map((cs) => (
              <Link
                key={cs.slug}
                href={`/case-studies/${cs.slug}`}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-teal-400 hover:shadow-sm"
              >
                {heroes.get(cs.slug) && (
                  <div className="relative aspect-[16/10] bg-secondary">
                    <Image
                      src={heroes.get(cs.slug)!}
                      alt={cs.title}
                      fill
                      sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-base font-semibold leading-snug group-hover:text-teal-ink">
                    {cs.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {cs.challenge}
                  </p>
                  <span className="mt-auto pt-4 text-sm font-medium text-teal-ink">{fmt(t.projectBy, { org: cs.orgName })}</span>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      )}

      {(guide || templates.length > 0) && (
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            {fmt(t.planningTitle, vars)}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {guide && (
              <Link
                href={`/cost-guides/${guide.slug}`}
                className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm"
              >
                <h3 className="text-base font-semibold group-hover:text-teal-ink">
                  {t.costTitle}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {fmt(t.costBody, vars)}
                </p>
              </Link>
            )}
            {templates.slice(0, 1).map((tpl) => (
              <Link
                key={tpl.slug}
                href={`/rfp-templates/${tpl.slug}`}
                className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm"
              >
                <h3 className="text-base font-semibold group-hover:text-teal-ink">
                  {t.templateTitle}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {fmt(t.templateBody, { name: tpl.shortName })}
                </p>
              </Link>
            ))}
          </div>
        </Container>
      )}

      {(otherPlaces.length > 0 || otherTrades.length > 0) && (
        <Container className="pb-12">
          {otherPlaces.length > 0 && (
            <>
              <h2 className="text-lg font-semibold tracking-tight">{fmt(t.otherPlaces, vars)}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {otherPlaces.map((c) => (
                  <Link key={c.region.slug} href={`/trades/${cat.slug}/${c.region.slug}`} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-teal-400">
                    {fmt(seo.trade.inPlace, { ...vars, place: regionName(c.region.name, lang), in: placeIn(c.region.name, lang) })}
                  </Link>
                ))}
              </div>
            </>
          )}
          {otherTrades.length > 0 && (
            <>
              <h2 className="mt-8 text-lg font-semibold tracking-tight">{fmt(t.otherTrades, vars)}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {otherTrades.map((c) => (
                  <Link key={c.category.slug} href={`/trades/${c.category.slug}/${region.slug}`} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-teal-400">
                    {fmt(seo.trade.inPlace, { ...vars, trade: tradeName(c.category.name, lang) })}
                  </Link>
                ))}
              </div>
            </>
          )}
        </Container>
      )}

      <Container className="pb-12">
        <SponsorSlot
          className="max-w-md"
          ctx={{
            placement: "trade_page",
            categories: [cat.slug],
            market: region.slug.startsWith("us-") || region.slug === "united-states" ? "US" : "CA",
            // The trade × province slot: the city's province/state (a province-level region is its own).
            province: region.province ?? region.name,
            seed: `${cat.slug}|${region.slug}`,
          }}
        />
      </Container>

      <section className="border-t border-border">
        <Container size="narrow" className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">{seo.faqTitle}</h2>
          <Accordion className="mt-4">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Container>
      </section>

      {hasListings(combo) ? (
        <CTASection
          title={fmt(t.ctaPro.title, vars)}
          description={fmt(t.ctaPro.description, { annual: PRICING.proAnnual })}
          primaryHref={proHref}
          primaryLabel={seo.startPro}
          secondaryHref={`/trades/${cat.slug}`}
          secondaryLabel={fmt(t.allTrade, vars)}
        />
      ) : (
        <CTASection
          title={fmt(t.ctaHire.title, vars)}
          description={fmt(t.ctaHire.description, vars)}
          primaryHref="/sign-up"
          primaryLabel={t.ctaHire.primary}
          secondaryHref={`/trades/${cat.slug}`}
          secondaryLabel={fmt(t.allTrade, vars)}
        />
      )}
    </>
  );
}
