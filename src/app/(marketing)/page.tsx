import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Flame,
  Minus,
  Trophy,
} from "lucide-react";
import { Container } from "@/components/container";
import { RfpCard } from "@/components/public/rfp-card";
import { ByMarket } from "@/components/geo/by-market";
import { UsdHint } from "@/components/geo/usd-hint";
import { rfpMarket } from "@/lib/visitor-geo";
import type { RfpListItem } from "@/lib/data/types";
import { buttonVariants } from "@/components/ui/button";
import { COPY, PRICING, SITE } from "@/lib/site";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { listAllRfpsCached, listQualifyingCombos, openCountsByTradeRegion, regionTree } from "@/lib/data/trade-city";
import { JobFinder, type FinderPlace } from "@/components/public/job-finder";
import { winnersFromRfps } from "@/lib/data/winners";
import { boardStats, closingLabel, compactDollars, daysUntil, isPastContract, parseAward } from "@/lib/data/fomo";
import { cn } from "@/lib/utils";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";

// The RFP board refreshes daily from the public-tender feed; without this the
// page was frozen at build time and showed stale open counts until a deploy.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} — Commercial Property RFPs & Public Tenders in Canada and the US` },
  description:
    "Open commercial property contracts across Canada and the U.S. — snow removal, HVAC, roofing, cleaning, electrical and more — from property managers and public buyers, updated daily. Trades get listed free; property managers post free.",
  alternates: { canonical: "/" },
};

/** Public buyers the board pulls from every morning (see /api/cron/public-tenders). */

// Every row must stay true of Trade Pro (rfp-alerts cron, LockedContentPanel,
// express-interest). No "appear higher" claims.
const COMPARE: [string, boolean, boolean][] = [
  ["Company profile in the trade directory", true, true],
  ["Website badge that links to your profile", true, true],
  ["Open RFP titles, regions and closing dates", true, true],
  ["Weekly tender digest email", true, true],
  ["Full scope, documents and buyer contact", false, true],
  ["Daily email the day a matching RFP posts", false, true],
  ["Express interest on property-manager RFPs", false, true],
];

/** Photo tiles: one per headline trade, each with its live open count. */
const TRADE_TILES = [
  { slug: "roofing", img: "/images/home/hero-roofing.webp", alt: "Roofers installing a new membrane on a commercial flat roof" },
  { slug: "snow-removal", img: "/images/home/trade-snow.webp", alt: "Plow truck clearing a condominium parking lot before dawn" },
  { slug: "hvac", img: "/images/home/trade-hvac.webp", alt: "HVAC technician servicing a rooftop unit" },
  { slug: "electrical", img: "/images/home/trade-electrical.webp", alt: "Electrician testing a distribution panel" },
  { slug: "cleaning-janitorial", img: "/images/home/trade-cleaning.webp", alt: "Cleaning crew polishing an office lobby floor at night" },
];

const FAQS = [
  { q: "Does PMRFP guarantee work?", a: "No. PMRFP lists projects and trades. We don't guarantee contracts, bid success, or responses." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from the billing portal at any time. Your membership stays active until the end of your billing period." },
  { q: "Where do the public tenders come from?", a: "Official open-data feeds, checked every morning: CanadaBuys, the City of Toronto, Quebec's SEAO and the Government of Yukon in Canada, and U.S. federal building and property work from SAM.gov. Bids go directly to the public buyer." },
  { q: "Can property managers post for free?", a: "Yes. Posting RFPs, using the RFP Writer and browsing the directory are free for property managers, builders and owners." },
];

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

function formatDeadline(d: string | null) {
  if (!d) return "Open";
  // timeZone: "UTC" pins server + client to the same day → no hydration mismatch.
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function HomePage() {
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
  const parentOf = new Map(tree.map((n) => [n.slug, n.parentSlug]));
  const finderPlaces: FinderPlace[] = regions.map((r) => {
    const parent = parentOf.get(r.slug) ?? null;
    const grand = parent ? parentOf.get(parent) ?? null : null;
    const us = r.slug === "united-states" || r.slug.startsWith("us-") || r.country === "USA";
    return { slug: r.slug, name: r.name, country: us ? "US" : "CA", level: !parent ? 0 : !grand ? 1 : 2 };
  });
  const finderTrades = categories
    .map((c) => ({ slug: c.slug, name: c.name }))
    .sort((a, b) => (openCounts[`${b.slug}|*`] ?? 0) - (openCounts[`${a.slug}|*`] ?? 0) || a.name.localeCompare(b.name));
  const livePages = combos.map((c) => `${c.category.slug}|${c.region.slug}`);
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
  const tiles = TRADE_TILES.map((t) => {
    const name = categories.find((c) => c.slug === t.slug)?.name ?? t.slug;
    const open = rfps.filter((r) => r.status === "open" && r.categories.includes(name)).length;
    return { ...t, name, open };
  });
  // Below ~10 open listings a live-count headline undersells; lead with the PM pitch.
  const live = stats.open >= 10;
  const proMonthly = signUpHrefForPlan("pro", "monthly");
  const proAnnual = signUpHrefForPlan("pro", "annual");

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
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-teal-300 opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-teal-300" />
              </span>
              {live ? "Live across Canada and the U.S., updated every morning" : "Now live in the GTA"}
            </p>
            <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.06] tracking-tight text-white md:text-5xl lg:text-[3.35rem] xl:text-[3.6rem]">
              {live ? (
                <>
                  <span className="text-teal-300">{stats.open}</span> commercial property contracts are open for bids.
                </>
              ) : (
                <>Post commercial property RFPs free. Vetted trades bid to win them.</>
              )}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-indigo-100/80">
              {live
                ? "Public tenders and property-manager RFPs on one board. Trade Pro emails you every match the day it posts."
                : `${SITE.name} is the RFP board for commercial and residential buildings.`}
            </p>
            {live ? (
              <div className="mt-9">
                {/* Relevance before payment: show this trade, this area, right now. */}
                <JobFinder trades={finderTrades} places={finderPlaces} counts={openCounts} livePages={livePages} />
                <p className="mt-4 text-sm text-indigo-100/70">
                  Want every match emailed the morning it posts?{" "}
                  <Link href={proMonthly} className="font-semibold text-teal-300 hover:underline">
                    Start Trade Pro, ${PRICING.proMonthly}/month
                  </Link>
                </p>
              </div>
            ) : (
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/sign-up?role=property_manager" className={cn(buttonVariants({ size: "lg", variant: "accent" }), "active:scale-[0.98]")}>
                  Post a project <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/rfps"
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white active:scale-[0.98]",
                  )}
                >
                  See what&apos;s open
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
                    <span className="font-heading text-sm font-semibold">Closing soonest</span>
                    <Link href="/rfps" className="text-xs font-medium text-teal-700 hover:underline">
                      All {stats.open} open
                    </Link>
                  </div>
                  <ByMarket ca={<HeroRows rows={heroRows} />} us={heroRowsUs.length ? <HeroRows rows={heroRowsUs} /> : undefined} />
                </div>
              </div>
            </div>
          )}
        </Container>
      </section>

      {/* ─────────────────────── LIVE NUMBERS ─────────────────────── */}
      <section className="border-b border-border bg-background">
        <Container className="grid grid-cols-2 divide-border py-10 md:grid-cols-4 md:divide-x">
          {[
            [String(stats.open), "open right now", "/rfps"],
            [String(stats.closingThisWeek), "close in the next 7 days", "/rfps"],
            [stats.awardedValue ? compactDollars(stats.awardedValue) : String(stats.pastContracts), "awarded in past contracts", "/rfps?view=awarded"],
            [String(winners.length), "companies won 2+ contracts", "/contract-winners"],
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
          <h2 className="sr-only">How PMRFP works</h2>
          <picture>
            <source media="(max-width: 767px)" srcSet="/images/home/how-it-works-tall.webp" />
            <img
              src="/images/home/how-it-works-wide.webp"
              width={1800}
              height={1018}
              loading="lazy"
              className="w-full rounded-2xl shadow-xl shadow-indigo/15"
              alt="How PMRFP works: 1. Every morning we collect open tenders from CanadaBuys, the City of Toronto, Quebec SEAO, Yukon and property managers. 2. They're matched to your trade and region. 3. You get an email the day one posts, with the full scope, documents and the buyer's contact. 4. You bid, and the buyer picks the winner."
            />
          </picture>
        </Container>
      </section>

      {/* ──────────────────── PICK YOUR TRADE (photo mosaic) ──────────────────── */}
      <section className="bg-background">
        <Container className="pt-20 md:pt-24">
          <h2 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">Pick your trade. See what&apos;s open.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2">
            {tiles.map((t, i) => (
              <Link
                key={t.slug}
                href={`/rfps?category=${t.slug}`}
                className={cn(
                  "group relative isolate flex min-h-56 flex-col justify-end overflow-hidden rounded-2xl bg-indigo p-6 text-white",
                  i === 0 && "sm:col-span-2 lg:col-span-1 lg:row-span-2 lg:min-h-[30rem]",
                )}
              >
                <Image
                  src={t.img}
                  alt={t.alt}
                  fill
                  sizes={i === 0 ? "(min-width: 1024px) 33vw, 100vw" : "(min-width: 1024px) 33vw, 50vw"}
                  className="-z-10 object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-indigo via-indigo/40 to-transparent" />
                <span className="text-xl font-semibold">{t.name}</span>
                <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-teal-300">
                  {t.open > 0 ? `${t.open} open now` : "See recent work"}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* ──────────────────── ALREADY AWARDED ──────────────────── */}
      {bigAwards.length === 3 && (
        <section className="bg-indigo text-white">
          <Container className="py-20 md:py-24">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-teal-300">
              <Trophy className="size-4" /> Already awarded
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Someone else won these.</h2>
            <p className="mt-4 max-w-xl text-lg text-indigo-100/75">
              Real public contracts from the past year. The next ones are on the board now.
            </p>
            <div className="mt-10 grid gap-4 text-foreground md:grid-cols-3">
              {bigAwards.map((r) => (
                <RfpCard key={r.slug} rfp={r} locked />
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href={proMonthly} className={cn(buttonVariants({ size: "lg", variant: "accent" }), "active:scale-[0.98]")}>
                Start Trade Pro <ArrowRight className="size-4" />
              </Link>
              <Link href="/contract-winners" className="text-sm font-semibold text-teal-300 hover:underline">
                See who wins the most
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
              alt="Property manager and contractor reviewing drawings in a condominium lobby"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Property manager? Write the RFP in two minutes.</h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Answer four questions and get a complete RFP: scope, insurance and WSIB requirements, and bid scoring.
              Post it free and qualified trades in your region see it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/rfp-writer" className={cn(buttonVariants({ size: "lg" }), "active:scale-[0.98]")}>
                Write an RFP <ArrowRight className="size-4" />
              </Link>
              <Link href="/for-property-managers" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "active:scale-[0.98]")}>
                How it works
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* ──────────────────── PRICING ──────────────────── */}
      <section className="border-t border-border bg-secondary/40">
        <Container className="grid gap-12 py-20 md:py-24 lg:grid-cols-[1fr_420px] lg:items-start">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Free gets you seen. Pro gets you every match, first.</h2>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Early-bird Trade Pro is ${PRICING.proAnnual} a year or ${PRICING.proMonthly} a month. The annual rate rises to
              $399 once we reach 100 members; join before then and your rate is locked in.
              {medianAward ? ` The median public contract on the board is ${compactDollars(medianAward)}.` : ""}
            </p>
            <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="grid grid-cols-[1fr_64px_88px] items-center border-b border-border px-5 py-3 text-sm font-semibold sm:grid-cols-[1fr_100px_120px]">
                <span />
                <span className="text-center text-muted-foreground">Free</span>
                <span className="text-center text-indigo">Trade Pro</span>
              </div>
              {COMPARE.map(([label, free, pro]) => (
                <div key={label} className="grid grid-cols-[1fr_64px_88px] items-center px-5 py-3 text-sm sm:grid-cols-[1fr_100px_120px]">
                  <span className={cn(!free && "font-semibold")}>{label}</span>
                  <span className="flex justify-center">
                    {free ? <Check className="size-4 text-teal-700" strokeWidth={3} /> : <Minus className="size-4 text-muted-foreground/40" />}
                  </span>
                  <span className="flex justify-center">{pro && <Check className="size-4 text-indigo" strokeWidth={3} />}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_64px_88px] items-center border-t border-border bg-secondary/50 px-5 py-4 text-sm font-semibold sm:grid-cols-[1fr_100px_120px]">
                <span>Price</span>
                <span className="text-center">$0</span>
                <span className="text-center text-indigo">${PRICING.proMonthly}/mo</span>
              </div>
            </div>
            <div className="mt-8 divide-y divide-border border-y border-border">
              {FAQS.map((f, i) => (
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
            <div className="text-sm text-teal-300">Trade Pro · Annual · locked in before it rises to $399</div>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-heading text-6xl font-extrabold leading-none tracking-tight">${PRICING.proAnnual}</span>
              <span className="pb-1.5 text-sm text-indigo-100/70">CAD / year</span>
            </div>
            <UsdHint cad={PRICING.proAnnual} per="year" className="mt-2 text-teal-300" />
            <ul className="mt-7 space-y-3 text-sm text-indigo-100">
              {COMPARE.filter(([, , pro]) => pro).map(([label]) => (
                <li key={label} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-teal-300" strokeWidth={3} />
                  {label}
                </li>
              ))}
            </ul>
            <Link href={proAnnual} className={cn(buttonVariants({ size: "lg", variant: "accent" }), "mt-8 w-full active:scale-[0.98]")}>
              Lock in ${PRICING.proAnnual}/yr <ArrowRight className="size-4" />
            </Link>
            <Link href={proMonthly} className="mt-3 block text-center text-sm font-medium text-teal-300 hover:underline">
              Or go monthly at ${PRICING.proMonthly}
            </Link>
            <p className="mt-4 text-center text-xs text-indigo-100/55">Cancel anytime. Access runs to the end of your billing period.</p>
          </div>
        </Container>
      </section>

      <div className="border-b border-border bg-secondary/60">
        <Container className="py-5">
          <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
            <b className="font-semibold text-ink-2">{COPY.disclaimer.split(".")[0]}.</b>
            {COPY.disclaimer.slice(COPY.disclaimer.indexOf(".") + 1)}
          </p>
        </Container>
      </div>
    </>
  );
}

/** "Closing soonest" rows in the hero card. */
function HeroRows({ rows }: { rows: RfpListItem[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((r, i) => {
        const soon = closingLabel(daysUntil(r.deadline));
        return (
          <li key={r.slug} className="animate-rise" style={{ animationDelay: `${120 + i * 90}ms` }}>
            <Link href={`/rfps/${r.slug}`} className="group flex items-start justify-between gap-4 py-3.5">
              <div className="min-w-0">
                <div className="font-mono text-[11px] uppercase tracking-wide text-teal-700">
                  {r.categories[0] ?? "Commercial"} · {r.regionName ?? "Canada"}
                </div>
                <div className="mt-1 line-clamp-1 font-medium group-hover:text-teal-700">{r.title}</div>
              </div>
              <span
                className={cn(
                  "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  soon ? "bg-warning/10 text-warning" : "bg-secondary text-muted-foreground",
                )}
              >
                {soon && <Flame className="size-3" />}
                {soon ?? formatDeadline(r.deadline)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
