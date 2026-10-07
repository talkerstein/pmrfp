import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/i18n/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Minus,
  Trophy,
} from "lucide-react";
import { Container } from "@/components/container";
import { RfpCard } from "@/components/public/rfp-card";
import { ByMarket } from "@/components/geo/by-market";
import { UsdHint } from "@/components/geo/usd-hint";
import { MarketPrice } from "@/components/geo/market-price";
import { rfpMarket } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";
import { buttonVariants } from "@/components/ui/button";
import { PRICING, SITE } from "@/lib/site";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { listAllRfpsCached, listQualifyingCombos, openCountsByTradeRegion, regionTree } from "@/lib/data/trade-city";
import { JobFinder, type FinderPlace } from "@/components/public/job-finder";
import { DeadlineStamp } from "@/components/public/deadline-stamp";
import { orderPlaces } from "@/lib/data/place-order";
import { MatchEmailPreview } from "@/components/public/match-email-preview";
import { HomeAncillary, HomeRecentProjects, HomeSuppliers } from "@/components/public/home-growth";
import { HomeMarketplaceTeaser } from "@/components/marketplace/home-teaser";
import { winnersFromRfps } from "@/lib/data/winners";
import { boardStats, compactDollars, daysUntil, isPastContract, parseAward } from "@/lib/data/fomo";
import { cn } from "@/lib/utils";
import { isIndexableRfp } from "@/lib/seo/rfp-indexing";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { FoundingBanner } from "@/components/founding/banner";

// The RFP board refreshes daily from the public-tender feed; without this the
// page was frozen at build time and showed stale open counts until a deploy.
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).home.meta;
  return {
    title: { absolute: `${SITE.name} — ${t.title}` },
    description: t.description,
    alternates: alternatesFor(l, "/"),
  };
}

/** Plain counts: English keeps its bare digits, other languages get their separators. */
function count(n: number, lang: Locale): string {
  return lang === "en" ? String(n) : formatNumber(n, lang);
}

/** compactDollars ("$1.2M") for English, "$1.2 M" for Spanish; "1,2 M$" style for French. */
function money(n: number, lang: Locale): string {
  if (lang === "en" || lang === "es") return compactDollars(n, lang);
  const one = (x: number) => formatNumber(x, lang, { maximumFractionDigits: 1 });
  if (n >= 1e9) return `${one(n / 1e9)} G$`;
  if (n >= 1e6) return `${n >= 1e8 ? formatNumber(Math.round(n / 1e6), lang) : one(n / 1e6)} M$`;
  if (n >= 1e3) return `${formatNumber(Math.round(n / 1e3), lang)} k$`;
  return `${formatNumber(Math.round(n), lang)} $`;
}

/** Public buyers the board pulls from every morning (see /api/cron/public-tenders). */
// Public sources. CanadaBuys and SEAO show government signatures rather than
// logos of their own, and those signatures are tightly controlled, so they
// stay as names. Descriptive use only: PMRFP isn't affiliated with any of them.
const SOURCES: { name: string; logo?: string; h?: number }[] = [
  { name: "CanadaBuys" },
  { name: "SAM.gov", logo: "/logos/sources/sam-gov.svg", h: 22 },
  { name: "City of Toronto", logo: "/logos/sources/city-of-toronto.svg", h: 26 },
  { name: "Québec SEAO" },
  { name: "Nova Scotia", logo: "/logos/sources/nova-scotia.svg", h: 26 },
  { name: "Yukon", logo: "/logos/sources/yukon.png", h: 28 },
  { name: "NYC City Record" },
];

// Every row must stay true of Trade Pro (rfp-alerts cron, LockedContentPanel,
// express-interest). No "appear higher" claims.
// Labels live in messages/home.ts (compare.*).
type CompareKey = keyof ReturnType<typeof getDictionary>["home"]["compare"];
const COMPARE: [CompareKey, boolean, boolean][] = [
  ["profile", true, true],
  ["badge", true, true],
  ["titles", true, true],
  ["digest", true, true],
  ["full", false, true],
  ["daily", false, true],
  ["interest", false, true],
];

/** Photo tiles: one per headline trade, each with its live open count. Alt text: messages/home.ts (tiles.*). */
const TRADE_TILES = [
  { slug: "roofing", img: "/images/home/hero-roofing.webp", alt: "roofing" },
  { slug: "snow-removal", img: "/images/home/trade-snow.webp", alt: "snow" },
  { slug: "hvac", img: "/images/home/trade-hvac.webp", alt: "hvac" },
  { slug: "electrical", img: "/images/home/trade-electrical.webp", alt: "electrical" },
  { slug: "cleaning-janitorial", img: "/images/home/trade-cleaning.webp", alt: "cleaning" },
] as const;

/** SEAO (Quebec) notices are published in French. */
function isFrench(r: { slug: string }) {
  return /-qca?-/.test(r.slug);
}

/** Round-robin by key, keeping each group's order: a, b, c, a, b, c, … */
function spread<T>(items: T[], key: (t: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  const out: T[] = [];
  const queues = [...groups.values()];
  while (out.length < items.length) {
    for (const q of queues) if (q.length) out.push(q.shift()!);
  }
  return out;
}


export default async function HomePage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const t = getT("home");
  // One cached board fetch shared with the trade × place index.
  const [categories, rfps, regions, tree, combos] = await Promise.all([
    getCategories(),
    listAllRfpsCached(),
    getRegions(),
    regionTree(),
    listQualifyingCombos(),
  ]);
  // "Your trade + your area" finder data: open counts per trade × place.
  const openCounts = openCountsByTradeRegion(rfps, categories, tree);
  const finderPlaces: FinderPlace[] = orderPlaces(regions, tree).map((p) => ({
    slug: p.slug,
    name: regionName(p.name, lang),
    depth: p.depth,
    country: p.root === "united-states" || p.slug.startsWith("us-") ? "US" : "CA",
  }));
  const finderTrades = categories
    .map((c) => ({ slug: c.slug, name: tradeName(c.name, lang) }))
    .sort((a, b) => (openCounts[`${b.slug}|*`] ?? 0) - (openCounts[`${a.slug}|*`] ?? 0) || a.name.localeCompare(b.name));
  const livePages = combos.map((c) => `${c.category.slug}|${c.region.slug}`);
  // Homepage links to trade × city pages and fresh tenders, so Google discovers
  // them from the strongest page instead of only via the sitemap.
  const topCombos = combos
    .filter((c) => c.open.length > 0)
    .sort((a, b) => b.open.length - a.open.length || a.category.name.localeCompare(b.category.name))
    .slice(0, 16);
  const newest = rfps
    .filter((r) => isIndexableRfp(r) && (daysUntil(r.deadline) ?? -1) >= 1 && !isFrench(r))
    // No posted date on list items; the latest deadlines are the freshest notices.
    .sort((a, b) => (b.deadline ?? "").localeCompare(a.deadline ?? ""))
    .slice(0, 10);
  const stats = boardStats(rfps);
  const winners = winnersFromRfps(rfps);
  // Still biddable (closes tomorrow or later), soonest first, English notices
  // ahead of SEAO's French ones, spread across regions.
  const closingSoon = spread(
    rfps
      .filter((r) => r.status === "open" && (daysUntil(r.deadline) ?? -1) >= 1)
      .sort((a, b) => Number(isFrench(a)) - Number(isFrench(b)) || (a.deadline ?? "").localeCompare(b.deadline ?? "")),
    (r) => r.regionName ?? "",
  );
  // Canadian by default (crawlers, first paint); visitors in the U.S. get U.S.
  // tenders swapped in on the client (ByMarket, lib/visitor-geo).
  const closingSoonCa = closingSoon.filter((r) => rfpMarket(r) === "CA");
  const closingSoonUs = closingSoon.filter((r) => rfpMarket(r) === "US");
  const heroRows = closingSoonCa.slice(0, 4);
  const heroRowsUs = closingSoonUs.slice(0, 4);
  // "Your morning email": the busiest trade's next closers, minus what the hero already shows.
  const showcase = (pool: RfpListItem[], hero: RfpListItem[]) => {
    const heroSlugs = new Set(hero.map((r) => r.slug));
    const rest = pool.filter((r) => !isFrench(r) && !heroSlugs.has(r.slug) && r.categories[0]);
    const counts = new Map<string, number>();
    for (const r of rest) counts.set(r.categories[0], (counts.get(r.categories[0]) ?? 0) + 1);
    const trade = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const rows = trade ? rest.filter((r) => r.categories[0] === trade).slice(0, 3) : [];
    // The email lists soonest deadline first; so does the preview.
    return { trade, rows: rows.sort((a, b) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9")) };
  };
  const emailCa = showcase(closingSoonCa, heroRows);
  const emailUs = showcase(closingSoonUs, heroRowsUs);
  // Awards a trade can picture winning: $50K–$2M, most recent first, one per source.
  const bigAwards = spread(
    rfps
      .filter((r) => {
        const amount = parseAward(r.summary).amount ?? 0;
        return isPastContract(r) && !isFrench(r) && !/\bdesign\b/i.test(r.title) && amount >= 50_000 && amount <= 2_000_000;
      })
      .sort((a, b) => (b.deadline ?? "").localeCompare(a.deadline ?? "")),
    (r) => r.slug.match(/-(cba|tora|nsa|qca)-/)?.[1] ?? "",
  ).slice(0, 3);
  const awardAmounts = rfps
    .map((r) => (isPastContract(r) ? parseAward(r.summary).amount : null))
    .filter((n): n is number => typeof n === "number" && n > 0)
    .sort((a, b) => a - b);
  const medianAward = awardAmounts.length >= 25 ? awardAmounts[Math.floor(awardAmounts.length / 2)] : null;
  const tiles = TRADE_TILES.map((tile) => {
    const name = categories.find((c) => c.slug === tile.slug)?.name ?? tile.slug;
    const open = rfps.filter((r) => r.status === "open" && r.categories.includes(name)).length;
    return { ...tile, name: tradeName(name, lang), open };
  });
  // Below ~10 open listings a live-count headline undersells; lead with the PM pitch.
  const live = stats.open >= 10;
  const proMonthly = signUpHrefForPlan("pro", "monthly");
  const proAnnual = signUpHrefForPlan("pro", "annual");
  const disclaimer = getT("common").disclaimer;

  return (
    <>
      {/* ───────────────────────────── HERO ───────────────────────────── */}
      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.06)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 size-[640px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(145,242,207,.14), transparent 62%)" }}
        />
        <Image
          src="/images/home/hero-roofing.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[70%_40%] opacity-60 mix-blend-luminosity"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-indigo via-indigo/85 to-indigo/35" />
        <Container className="relative z-10 grid items-center gap-12 py-16 md:py-20 lg:grid-cols-[1.2fr_.8fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-indigo-100">
              <span className="inline-flex size-2 rounded-full bg-teal-300" />
              {live ? t.hero.badgeLive : t.hero.badgeGta}
            </p>
            <div className="mt-3"><FoundingBanner variant="badge" /></div>
            <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.06] tracking-tight text-white md:text-5xl lg:text-[3.35rem] xl:text-[3.6rem]">
              {live ? (
                <>
                  <span className="text-teal-300">{count(stats.open, lang)}</span>{t.hero.titleLive}
                </>
              ) : (
                <>{t.hero.titleIntro}</>
              )}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-indigo-100/80">
              {live ? t.hero.subLive : fmt(t.hero.subIntro, { name: SITE.name })}
            </p>
            {live ? (
              <div className="mt-9">
                {/* Relevance before payment: show this trade, this area, right now. */}
                <JobFinder trades={finderTrades} places={finderPlaces} counts={openCounts} livePages={livePages} />
                <p className="mt-4 text-sm text-indigo-100/70">
                  {t.hero.proPrompt}{" "}
                  <Link href={proMonthly} className="font-semibold text-teal-300 hover:underline">
                    {fmt(t.hero.proLink, { price: PRICING.proMonthly })}
                  </Link>
                </p>
              </div>
            ) : (
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/sign-up?role=property_manager" className={cn(buttonVariants({ size: "lg", variant: "accent" }), "active:scale-[0.98]")}>
                  {t.hero.postProject} <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/rfps"
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white active:scale-[0.98]",
                  )}
                >
                  {t.hero.seeOpen}
                </Link>
              </div>
            )}
          </div>

          {/* Live preview: real listings closing soonest, not a mock. */}
          {heroRows.length > 0 && (
            <div className="relative">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-2xl shadow-black/30 backdrop-blur-sm">
                <div className="rounded-xl bg-white p-5 text-foreground">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="font-heading text-sm font-semibold">{t.hero.closingSoonest}</span>
                    <Link href="/rfps" className="text-xs font-medium text-teal-700 hover:underline">
                      {fmt(t.hero.allOpen, { n: count(stats.open, lang) })}
                    </Link>
                  </div>
                  <ByMarket ca={<HeroRows rows={heroRows} />} us={heroRowsUs.length ? <HeroRows rows={heroRowsUs} /> : undefined} />
                </div>
              </div>
            </div>
          )}
        </Container>
      </section>

      {/* ─────────────────────── SOURCES ─────────────────────── */}
      <section className="border-b border-border bg-secondary/40">
        <Container className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:gap-10">
          <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {t.sourcesStrip.pulled}
          </p>
          <ul className="flex flex-wrap items-center gap-x-9 gap-y-3">
            {SOURCES.map((src) => {
              const name = t.sources[src.name] ?? src.name;
              return (
                <li key={src.name} title={name}>
                  {src.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src.logo}
                      alt={name}
                      style={{ height: src.h }}
                      className="w-auto opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
                    />
                  ) : (
                    <span className="font-heading text-base font-semibold tracking-tight text-indigo/60">{name}</span>
                  )}
                </li>
              );
            })}
            <li className="text-sm text-muted-foreground">{t.sourcesStrip.pms}</li>
            <li className="basis-full text-[11px] text-muted-foreground/80">{t.sourcesStrip.notAffiliated}</li>
          </ul>
        </Container>
      </section>

      {/* ─────────────────────── LIVE NUMBERS ─────────────────────── */}
      <section className="border-b border-border bg-background">
        <Container className="grid grid-cols-2 divide-border py-10 md:grid-cols-4 md:divide-x">
          {[
            [count(stats.open, lang), t.numbers.open, "/rfps"],
            [count(stats.closingThisWeek, lang), t.numbers.closing, "/rfps"],
            [stats.awardedValue ? money(stats.awardedValue, lang) : count(stats.pastContracts, lang), t.numbers.awarded, "/rfps?view=awarded"],
            [count(winners.length, lang), t.numbers.winners, "/contract-winners"],
          ].map(([v, k, href]) => (
            <Link key={k} href={href} className="group px-2 py-3 md:px-8 first:md:pl-0">
              <div className="font-heading text-3xl font-extrabold tracking-tight text-indigo sm:text-4xl">{v}</div>
              <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground group-hover:text-teal-700">
                {k} <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          ))}
        </Container>
      </section>

      {/* ──────────────────── HOW IT WORKS (infographic) ──────────────────── */}
      <section className="bg-background">
        <Container className="pt-20 md:pt-24">
          <h2 className="sr-only">{t.how.heading}</h2>
          <picture>
            <source media="(max-width: 767px)" srcSet="/images/home/how-it-works-tall.webp" />
            <img
              src="/images/home/how-it-works-wide.webp"
              width={1800}
              height={1018}
              loading="lazy"
              className="w-full rounded-2xl shadow-xl shadow-indigo/15"
              alt={t.how.alt}
            />
          </picture>
        </Container>
      </section>

      {/* ──────────────────── PICK YOUR TRADE (photo mosaic) ──────────────────── */}
      <section className="bg-background">
        <Container className="pt-20 md:pt-24">
          <h2 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">{t.trades.heading}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2">
            {tiles.map((tile, i) => (
              <Link
                key={tile.slug}
                href={`/trades/${tile.slug}`}
                className={cn(
                  "group relative isolate flex min-h-56 flex-col justify-end overflow-hidden rounded-2xl bg-indigo p-6 text-white",
                  i === 0 && "sm:col-span-2 lg:col-span-1 lg:row-span-2 lg:min-h-[30rem]",
                )}
              >
                <Image
                  src={tile.img}
                  alt={t.tiles[tile.alt]}
                  fill
                  sizes={i === 0 ? "(min-width: 1024px) 33vw, 100vw" : "(min-width: 1024px) 33vw, 50vw"}
                  className="-z-10 object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-indigo via-indigo/40 to-transparent" />
                <span className="text-xl font-semibold">{tile.name}</span>
                <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-teal-300">
                  {tile.open > 0 ? plural(tile.open, t.trades.openNow, { n: count(tile.open, lang) }) : t.trades.recent}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* ──────────── BROWSE (crawlable links to trade × city pages and new tenders) ──────────── */}
      {(topCombos.length > 0 || newest.length > 0) && (
        <section className="bg-background">
          <Container className="grid gap-10 pt-16 md:grid-cols-2">
            {topCombos.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{t.browse.heading}</h2>
                <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {topCombos.map((c) => (
                    <li key={`${c.category.slug}/${c.region.slug}`}>
                      <Link href={`/trades/${c.category.slug}/${c.region.slug}`} className="text-teal-700 hover:underline">
                        {tradeName(c.category.name, lang)} · {regionName(c.region.name, lang)}
                      </Link>{" "}
                      <span className="text-muted-foreground">({count(c.open.length, lang)})</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
                  <Link href="/trades" className="text-teal-700 hover:underline">{t.browse.allTrades}</Link>
                  <Link href="/regions" className="text-teal-700 hover:underline">{t.browse.allRegions}</Link>
                </p>
              </div>
            )}
            {newest.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{t.browse.newest}</h2>
                <ul className="mt-4 space-y-2 text-sm">
                  {newest.map((r) => (
                    <li key={r.slug} className="truncate">
                      <Link href={`/rfps/${r.slug}`} className="text-teal-700 hover:underline">{r.title}</Link>
                      {r.city && <span className="text-muted-foreground"> — {r.city}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm font-medium">
                  <Link href="/rfps" className="text-teal-700 hover:underline">{t.browse.allRfps}</Link>
                </p>
              </div>
            )}
          </Container>
        </section>
      )}

      {/* ──────────────────── THE MORNING EMAIL ──────────────────── */}
      {emailCa.trade && (
        <section className="bg-background">
          <Container className="grid items-center gap-12 py-20 md:py-24 lg:grid-cols-[.95fr_1.05fr] lg:gap-16">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-teal-700">{t.email.eyebrow}</p>
              <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {t.email.heading}
              </h2>
              <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground">
                {t.email.body}
              </p>
              <ul className="mt-8 space-y-3.5">
                {COMPARE.filter(([, free]) => !free).map(([key]) => (
                  <li key={key} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-100">
                      <Check className="size-3 text-teal-800" strokeWidth={3} />
                    </span>
                    <span className="font-medium">{t.compare[key]}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link href={proMonthly} className={cn(buttonVariants({ size: "lg" }), "active:scale-[0.98]")}>
                  {t.email.start} <ArrowRight className="size-4" />
                </Link>
                <span className="text-sm text-muted-foreground">
                  {fmt(t.email.price, { monthly: PRICING.proMonthly, annual: PRICING.proAnnual })}
                </span>
              </div>
            </div>
            <ByMarket
              ca={<MatchEmailPreview trade={emailCa.trade} place={t.email.acrossCanada} rows={emailCa.rows} />}
              us={emailUs.trade ? <MatchEmailPreview trade={emailUs.trade} place={t.email.acrossUs} rows={emailUs.rows} /> : undefined}
            />
          </Container>
        </section>
      )}

      {/* ──────────────────── ALREADY AWARDED ──────────────────── */}
      {bigAwards.length === 3 && (
        <section className="bg-indigo text-white">
          <Container className="py-20 md:py-24">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-teal-300">
              <Trophy className="size-4" /> {t.awarded.eyebrow}
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">{t.awarded.heading}</h2>
            <p className="mt-4 max-w-xl text-lg text-indigo-100/75">
              {t.awarded.body}
            </p>
            <div className="mt-10 grid gap-4 text-foreground md:grid-cols-3">
              {bigAwards.map((r) => (
                <RfpCard key={r.slug} rfp={r} locked />
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href={proMonthly} className={cn(buttonVariants({ size: "lg", variant: "accent" }), "active:scale-[0.98]")}>
                {t.awarded.start} <ArrowRight className="size-4" />
              </Link>
              <Link href="/contract-winners" className="text-sm font-semibold text-teal-300 hover:underline">
                {t.awarded.winners}
              </Link>
              <Link href="/reports/public-building-contracts" className="text-sm font-semibold text-teal-300 hover:underline">
                {t.awarded.report}
              </Link>
            </div>
          </Container>
        </section>
      )}

      {/* ──────────────────── PROPERTY MANAGERS ──────────────────── */}
      <section className="bg-background">
        <Container className="grid items-center gap-10 py-20 md:py-24 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-indigo">
            <Image
              src="/images/home/pm-lobby.webp"
              alt={t.pm.alt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.pm.heading}</h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground">
              {t.pm.body}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/rfp-writer" className={cn(buttonVariants({ size: "lg" }), "active:scale-[0.98]")}>
                {t.pm.write} <ArrowRight className="size-4" />
              </Link>
              <Link href="/for-property-managers" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "active:scale-[0.98]")}>
                {t.pm.how}
              </Link>
            </div>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {t.pm.landlord}{" "}
              <Link href="/sign-up?role=landlord" className="font-medium text-teal-700 hover:underline">
                {t.pm.landlordCta}
              </Link>
            </p>
          </div>
        </Container>
      </section>

      {/* ──────────────────── REALTORS ──────────────────── */}
      <section className="border-t border-border bg-card">
        <Container className="grid items-center gap-10 py-16 md:py-20 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border">
            <Image
              src="/images/photos/keys-in-door.webp"
              alt={t.realtors.alt}
              fill
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-teal-700">{t.realtors.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{t.realtors.heading}</h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t.realtors.body}
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              <li className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-teal-700" /> {t.realtors.quotes}</li>
              <li className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-teal-700" /> {t.realtors.name}</li>
              <li className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-teal-700" /> {fmt(t.realtors.free, { n: 5, price: PRICING.realtorAnnual })}</li>
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up?role=real_estate_agent" className={cn(buttonVariants({ size: "lg" }), "active:scale-[0.98]")}>
                {t.realtors.build} <ArrowRight className="size-4" />
              </Link>
              <Link href="/for/real-estate" className={buttonVariants({ size: "lg", variant: "outline" })}>
                {t.realtors.how}
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* ──────────── RECENT PROJECTS · SUPPLIERS · REAL ESTATE & ADS ──────────── */}
      <HomeRecentProjects />
      <HomeSuppliers />
      <HomeMarketplaceTeaser />
      <HomeAncillary />

      {/* ──────────────────── PRICING ──────────────────── */}
      <section className="border-t border-border bg-secondary/40">
        <Container className="grid gap-12 py-20 md:py-24 lg:grid-cols-[1fr_420px] lg:items-start">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.pricing.heading}</h2>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              {fmt(t.pricing.body, { annual: PRICING.proAnnual, monthly: PRICING.proMonthly })}
              {medianAward ? fmt(t.pricing.median, { amount: money(medianAward, lang) }) : ""}
            </p>
            <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="grid grid-cols-[1fr_64px_88px] items-center border-b border-border px-5 py-3 text-sm font-semibold sm:grid-cols-[1fr_100px_120px]">
                <span />
                <span className="text-center text-muted-foreground">{t.pricing.free}</span>
                <span className="text-center text-indigo">{t.pricing.pro}</span>
              </div>
              {COMPARE.map(([key, free, pro]) => (
                <div key={key} className="grid grid-cols-[1fr_64px_88px] items-center px-5 py-3 text-sm sm:grid-cols-[1fr_100px_120px]">
                  <span className={cn(!free && "font-semibold")}>{t.compare[key]}</span>
                  <span className="flex justify-center">
                    {free ? <Check className="size-4 text-teal-700" strokeWidth={3} /> : <Minus className="size-4 text-muted-foreground/40" />}
                  </span>
                  <span className="flex justify-center">{pro && <Check className="size-4 text-indigo" strokeWidth={3} />}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_64px_88px] items-center border-t border-border bg-secondary/50 px-5 py-4 text-sm font-semibold sm:grid-cols-[1fr_100px_120px]">
                <span>{t.pricing.price}</span>
                <span className="text-center">{fmt(t.money.amount, { n: 0 })}</span>
                <span className="text-center text-indigo">{fmt(t.money.perMonthShort, { n: PRICING.proMonthly })}</span>
              </div>
            </div>
            <div className="mt-8 divide-y divide-border border-y border-border">
              {t.faqs.map((f, i) => (
                <details key={f.q} open={i === 0} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span className="font-mono text-lg text-teal-700 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-indigo p-8 text-white shadow-xl shadow-indigo/20">
            <div className="text-sm text-teal-300">{t.pricing.cardEyebrow}</div>
            <div className="mt-3 flex items-end gap-2">
              <MarketPrice
                cad={PRICING.proAnnual}
                per="year"
                numberClassName="font-heading text-6xl font-extrabold leading-none tracking-tight"
                perClassName="pb-1.5 text-sm text-indigo-100/70"
              />
            </div>
            <UsdHint cad={PRICING.proAnnual} per="year" className="mt-2 text-teal-300" />
            <ul className="mt-7 space-y-3 text-sm text-indigo-100">
              {COMPARE.filter(([, , pro]) => pro).map(([key]) => (
                <li key={key} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-teal-300" strokeWidth={3} />
                  {t.compare[key]}
                </li>
              ))}
            </ul>
            <Link href={proAnnual} className={cn(buttonVariants({ size: "lg", variant: "accent" }), "mt-8 w-full active:scale-[0.98]")}>
              {fmt(t.pricing.lockIn, { price: PRICING.proAnnual })} <ArrowRight className="size-4" />
            </Link>
            <Link href={proMonthly} className="mt-3 block text-center text-sm font-medium text-teal-300 hover:underline">
              {fmt(t.pricing.monthly, { price: PRICING.proMonthly })}
            </Link>
            <p className="mt-4 text-center text-xs text-indigo-100/55">{t.pricing.cancel}</p>
          </div>
        </Container>
      </section>

      <div className="border-b border-border bg-secondary/60">
        <Container className="py-5">
          <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
            <b className="font-semibold text-ink-2">{disclaimer.split(".")[0]}.</b>
            {disclaimer.slice(disclaimer.indexOf(".") + 1)}
          </p>
        </Container>
      </div>
    </>
  );
}

/** "Closing soonest" rows in the hero card. */
function HeroRows({ rows }: { rows: RfpListItem[] }) {
  const lang = getLang();
  const t = getT("home").hero;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.slug}>
          <Link href={`/rfps/${r.slug}`} className="group flex items-start justify-between gap-4 py-3.5">
            <div className="min-w-0">
              <div className="font-mono text-[11px] uppercase tracking-wide text-teal-700">
                {r.categories[0] ? tradeName(r.categories[0], lang) : t.commercial} · {r.regionName ? regionName(r.regionName, lang) : t.canada}
              </div>
              <div className="mt-1 line-clamp-2 font-medium group-hover:text-teal-700">{r.title}</div>
            </div>
            <DeadlineStamp deadline={r.deadline} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
