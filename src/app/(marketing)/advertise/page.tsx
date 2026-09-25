import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import {
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  HardHat,
  Inbox,
  Landmark,
  LayoutDashboard,
  Layers,
  Mail,
  MousePointerClick,
  Package,
  ShieldCheck,
  Tag,
  Target,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection, SectionHeading } from "@/components/public/section";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { EmailPlacementMock, TenderPageMock } from "@/components/advertise/sponsor-mock";
import {
  ANNUAL_MONTHS_BILLED,
  FOUNDING_PARTNERS,
  SPONSOR_PACKAGES,
  cad,
  type SponsorPackage,
} from "@/components/advertise/packages";
import { getCategories, getRegions, type CategoryOption, type RegionOption } from "@/lib/data/taxonomy";
import { getPlatformStats, type PlatformStats } from "@/lib/data/stats";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { boardStats, compactDollars, isPastContract, type BoardStats } from "@/lib/data/fomo";
import type { RfpListItem } from "@/lib/data/types";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { SponsorEnquiryForm, SponsorEnquiryFromUrl } from "./enquiry-form";

// Reach numbers come from the live board, which refreshes daily.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Advertise to Commercial Trades",
  description:
    "Sponsor PMRFP and reach the trades bidding on commercial property work in Canada and the U.S. Matched to trade, clearly labelled, clicks reported monthly.",
  alternates: { canonical: "/advertise" },
};

/**
 * Sells sponsorships. Delivery is the existing sponsor system
 * (lib/sponsors/registry.ts, SponsorSlot, /go/<id> click counting,
 * /admin/sponsors for the monthly report). Every number on this page is
 * computed from the live board: no traffic, open-rate or visitor figures,
 * and a count too small to impress is swapped for a different one.
 */

/** Public buyers the board pulls from every morning (same list as the homepage). */
const SOURCES = ["CanadaBuys", "SAM.gov", "City of Toronto", "Québec SEAO", "Nova Scotia", "Yukon"];

const AUDIENCES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Package,
    title: "Suppliers and distributors",
    body: "Electrical, HVAC, plumbing, roofing and janitorial supply. Reach trades while they price the materials for a job.",
  },
  {
    icon: Truck,
    title: "Equipment dealers and rental",
    body: "Lifts, plows, compressors and site equipment, in front of crews gearing up for the work they bid on.",
  },
  {
    icon: ShieldCheck,
    title: "Insurance, bonding and surety",
    body: "Public tenders often ask for bid bonds and proof of insurance. Be there when a trade reads those requirements.",
  },
  {
    icon: Landmark,
    title: "Lenders and payments",
    body: "Equipment finance, working capital and card processing for trades taking on bigger contracts.",
  },
  {
    icon: AppWindow,
    title: "Software for trades",
    body: "Estimating, scheduling, field service and invoicing tools, shown to the trades they were built for.",
  },
  {
    icon: HardHat,
    title: "Staffing",
    body: "Skilled labour and crew staffing for trades that win more work than they can crew.",
  },
];

const PRINCIPLES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Target,
    title: "Relevant only",
    body: "An electrical supplier shows on electrical pages and in electricians' emails. If a page has nothing to do with what you sell, you're not on it.",
  },
  {
    icon: Layers,
    title: "One sponsor per slot",
    body: "One card per page, one row per email. No banner grids, no row of logos fighting for attention.",
  },
  {
    icon: Tag,
    title: "Clearly labelled",
    body: "Every placement carries a “Sponsored” label. Trades trust the board because ads never pose as listings.",
  },
  {
    icon: MousePointerClick,
    title: "Clicks tracked, reported monthly",
    body: "Each click runs through a tracked link and lands on your site with UTM tags, so you see the visits in your own analytics too.",
  },
];

const PLACEMENTS: { icon: LucideIcon; name: string; where: string; packages: string }[] = [
  {
    icon: Layers,
    name: "Trade pages",
    where: "The page for each trade, and for each trade in each city.",
    packages: "All packages",
  },
  {
    icon: FileText,
    name: "Tender and RFP pages",
    where: "The sidebar beside the scope, on every matching tender.",
    packages: "All packages",
  },
  {
    icon: LayoutDashboard,
    name: "Trade dashboard",
    where: "What members in that trade see when they sign in.",
    packages: "Trade Spotlight, Founding Partner",
  },
  {
    icon: Mail,
    name: "Daily match email",
    where: "Sent to Trade Pro members the morning a matching tender posts.",
    packages: "All packages",
  },
  {
    icon: Inbox,
    name: "Weekly tender digest",
    where: "A weekly roundup of new tenders in each member's trade.",
    packages: "Founding Partner",
  },
];

const FAQ = [
  {
    q: "Who sees my brand?",
    a: "Trades and service companies using PMRFP to find commercial property work: people reading trade and tender pages, members on their dashboard, and trades opening their match and digest emails. You only appear to the trades in your package.",
  },
  {
    q: "How does relevance work?",
    a: "Each sponsor is matched to trades. An electrical supplier appears on electrical pages and closely related ones such as lighting and EV charging, and in those trades' emails. If nothing on a page fits a sponsor, no sponsor is shown.",
  },
  {
    q: "What reporting do I get?",
    a: "A monthly report of clicks by placement (trade pages, tender pages, dashboard, emails) and by trade. Every link carries UTM tags (utm_source=pmrfp), so the visits also show up in your own analytics. We report clicks we can count. We don't sell impressions or estimates.",
  },
  {
    q: "Can I pick my trade?",
    a: "Yes. Tell us the trade you want. There is one Spotlight sponsor per trade, first come first served. If yours is taken, we'll tell you what's open.",
  },
  {
    q: "How do Founding Partners and Spotlights share space?",
    a: "A Trade Spotlight sponsor always holds its own trade. Founding Partners appear across every other trade, and in the weekly tender digest, which Spotlights don't include.",
  },
  {
    q: "What does the “Sponsored” label look like?",
    a: "Like the samples on this page: one card or one email row, with a small “Sponsored” label above your logo and message. Links are marked as sponsored for search engines. Sponsors never appear on a company's own profile, or on sign-up, pricing or billing pages.",
  },
  {
    q: "Can I cancel?",
    a: "Yes. Monthly plans cancel any time, and your spot runs to the end of the month you've paid for. Paying for a year up front costs 10 months instead of 12. Founding Partner pricing is locked for 12 months.",
  },
];

interface ReachStat {
  value: string;
  label: string;
  href: string;
}

const num = (n: number) => n.toLocaleString("en-CA");

/** Up to four live numbers. A count too small to impress is left out, not shown. */
function reachStats(board: BoardStats, platform: PlatformStats, categories: number, regions: RegionOption[]): ReachStat[] {
  const out: ReachStat[] = [];
  if (board.open >= 10) out.push({ value: num(board.open), label: "open tenders and RFPs right now", href: "/rfps" });
  if (categories >= 10) out.push({ value: num(categories), label: "trade categories, each with its own pages", href: "/trades" });
  if (regions.length >= 10) {
    const us = regions.some((r) => r.slug === "united-states" || r.slug.startsWith("us-") || r.country === "USA");
    out.push({ value: num(regions.length), label: us ? "regions across Canada and the U.S." : "regions across Canada", href: "/regions" });
  }
  if (board.awardedValue >= 1_000_000) {
    out.push({ value: compactDollars(board.awardedValue), label: "in past public contracts on the board", href: "/rfps?view=awarded" });
  } else if (platform.rfpsPostedLast30Days >= 25) {
    out.push({ value: num(platform.rfpsPostedLast30Days), label: "tenders and RFPs posted in the last 30 days", href: "/rfps" });
  }
  if (platform.tradesListed >= 100) out.push({ value: num(platform.tradesListed), label: "trade companies listed", href: "/directory" });
  if (out.length < 2) out.push({ value: String(SOURCES.length), label: "public tender sources, checked every morning", href: "/rfps" });
  return out.slice(0, 4);
}

/** Trades with the most open work right now, for the Trade Spotlight pitch. */
function busiestTrades(rfps: RfpListItem[], categories: CategoryOption[]) {
  const open = rfps.filter((r) => r.status === "open" && !isPastContract(r));
  return categories
    .map((c) => ({ slug: c.slug, name: c.name, open: open.filter((r) => r.categories.includes(c.name)).length }))
    .filter((t) => t.open >= 3)
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
    .slice(0, 8);
}

export default async function AdvertisePage() {
  const [rfps, categories, regions, platform] = await Promise.all([
    listAllRfpsCached().catch(() => [] as RfpListItem[]),
    getCategories(),
    getRegions(),
    getPlatformStats().catch((): PlatformStats => ({ rfpsPostedLast30Days: 0, tradesListed: 0 })),
  ]);
  const reach = reachStats(boardStats(rfps), platform, categories.length, regions);
  const busiest = busiestTrades(rfps, categories);
  const lowest = Math.min(...SPONSOR_PACKAGES.map((p) => p.monthly));

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Advertise", path: "/advertise" },
        ])}
      />
      <JsonLd data={faqSchema(FAQ)} />

      {/* ───────────────────────────── HERO ───────────────────────────── */}
      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.06)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 size-[640px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(145,242,207,.14), transparent 62%)" }}
        />
        <Container className="relative z-10 grid items-center gap-12 py-16 md:py-20 lg:grid-cols-[1.1fr_.9fr] lg:py-24">
          <div>
            <Eyebrow className="text-teal-300">Sponsor {SITE.name}</Eyebrow>
            <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.06] tracking-tight text-white md:text-5xl lg:text-[3.35rem]">
              Reach the trades bidding on commercial property work.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-indigo-100/80">
              {`Electricians, HVAC contractors, roofers, cleaners and other trades use ${SITE.name} to find public tenders and property-manager RFPs in their trade and region. Put your brand beside the work they're pricing.`}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="#enquire" className={cn(buttonVariants({ size: "lg", variant: "accent" }), "active:scale-[0.98]")}>
                Ask about a spot <ArrowRight className="size-4" />
              </Link>
              <Link
                href="#packages"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white active:scale-[0.98]",
                )}
              >
                See packages
              </Link>
            </div>
            <p className="mt-6 text-sm text-indigo-100/60">
              From {cad(lowest)} a month. One sponsor per trade.
            </p>
          </div>
          <TenderPageMock />
        </Container>
      </section>

      {/* ─────────────────────── SOURCES ─────────────────────── */}
      <section className="border-b border-border bg-secondary/40">
        <Container className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:gap-10">
          <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Tenders pulled every morning from
          </p>
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-2">
            {SOURCES.map((s) => (
              <li key={s} className="font-heading text-base font-semibold tracking-tight text-indigo/60">
                {s}
              </li>
            ))}
            <li className="text-sm text-muted-foreground">+ property managers</li>
          </ul>
        </Container>
      </section>

      {/* ─────────────────────── LIVE REACH ─────────────────────── */}
      {reach.length > 0 && (
        <section className="border-b border-border bg-background">
          <Container className="py-10">
            <div className={cn("grid grid-cols-2 gap-y-6 md:divide-x md:divide-border", reach.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4")}>
              {reach.map((s) => (
                <Link key={s.label} href={s.href} className="group pr-3 md:px-8 md:first:pl-0">
                  <div className="font-heading text-3xl font-extrabold tracking-tight text-indigo sm:text-4xl">{s.value}</div>
                  <div className="mt-1 flex items-start gap-1 text-sm text-muted-foreground group-hover:text-teal-700">
                    {s.label}
                    <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </Link>
              ))}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Live from the board, refreshed hourly. We don&apos;t quote traffic estimates. Sponsors get a monthly
              report of real clicks.
            </p>
          </Container>
        </section>
      )}

      {/* ─────────────────────── WHO IT'S FOR ─────────────────────── */}
      <section className="bg-background">
        <Container className="py-16 sm:py-20">
          <SectionHeading
            eyebrow="Who it's for"
            title="Built for companies that sell to trades"
            description="If electricians, HVAC techs, roofers, plumbers or cleaning crews buy from you, this is where they look for their next job."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ─────────────────────── HOW PLACEMENTS WORK ─────────────────────── */}
      <section className="bg-secondary/40">
        <Container className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="How placements work"
              title="Relevant, labelled, one at a time"
              description="Sponsors sit inside the pages and emails trades already use to find work, matched to what they do."
            />
            <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {PRINCIPLES.map(({ icon: Icon, title, body }) => (
                <div key={title}>
                  <Icon className="size-5 text-teal-600" />
                  <h3 className="mt-3 text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
          <EmailPlacementMock />
        </Container>
      </section>

      {/* ─────────────────────── WHERE YOU APPEAR ─────────────────────── */}
      <section className="bg-background">
        <Container className="py-16 sm:py-20">
          <SectionHeading
            eyebrow="Where you appear"
            title="On the pages and emails trades use to find work"
          />
          <div className={cn("mt-10 grid gap-6", busiest.length >= 4 && "lg:grid-cols-[1.35fr_1fr]")}>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {PLACEMENTS.map(({ icon: Icon, name, where, packages }) => (
                <li key={name} className="flex gap-4 p-5 sm:p-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-indigo">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-6">
                    <div>
                      <h3 className="text-base font-semibold">{name}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{where}</p>
                    </div>
                    <p className="mt-2 shrink-0 font-mono text-[11px] uppercase tracking-wide text-teal-700 sm:mt-1 sm:text-right">
                      {packages}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {busiest.length >= 4 && (
              <div className="rounded-2xl border border-border bg-card p-6 sm:p-7">
                <p className="eyebrow text-muted-foreground">Open right now, by trade</p>
                <ul className="mt-3 divide-y divide-border">
                  {busiest.map((t) => (
                    <li key={t.slug}>
                      <Link href={`/trades/${t.slug}`} className="group flex items-center justify-between gap-4 py-3 text-sm">
                        <span className="font-medium text-foreground group-hover:text-teal-700">{t.name}</span>
                        <span className="font-mono tabular-nums text-indigo">{num(t.open)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  Open tenders and RFPs on the board. A Trade Spotlight appears on the tender pages in its trade.
                </p>
              </div>
            )}
          </div>
        </Container>
      </section>

      {/* ─────────────────────── PACKAGES ─────────────────────── */}
      <section id="packages" className="scroll-mt-24 border-t border-border bg-secondary/40">
        <Container className="py-16 sm:py-20">
          <SectionHeading
            eyebrow="Packages"
            title="Pick your spot"
            description="Billed monthly in Canadian dollars. Pay for a year up front and get two months free."
          />
          <div className="mt-10 grid max-w-4xl items-stretch gap-6 md:grid-cols-2">
            {SPONSOR_PACKAGES.map((p) => (
              <PackageCard key={p.id} p={p} />
            ))}
          </div>
          <ul className="mt-8 grid gap-x-8 gap-y-2 text-sm text-foreground/90 sm:grid-cols-2">
            {[
              "One sponsor per trade, first come first served.",
              "Live within one business day of getting your logo and copy.",
              "Monthly plans cancel any time.",
              "Prices in CAD, plus applicable taxes.",
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-teal-600" />
                {line}
              </li>
            ))}
          </ul>
          {FOUNDING_PARTNERS.length > 0 && (
            <div className="mt-12 border-t border-border pt-8">
              <p className="eyebrow text-muted-foreground">Founding partners</p>
              <ul className="mt-4 flex flex-wrap items-center gap-x-10 gap-y-4">
                {FOUNDING_PARTNERS.map((f) => (
                  <li key={f.name}>
                    <a href={f.url} target="_blank" rel="sponsored noopener" className="flex items-center gap-3 text-sm font-semibold text-indigo hover:text-teal-700">
                      <Image src={f.logo} alt="" width={40} height={40} className="size-10 rounded-lg border border-border bg-white object-contain p-1" />
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Container>
      </section>

      {/* ─────────────────────── ENQUIRE ─────────────────────── */}
      <section id="enquire" className="scroll-mt-24 bg-background">
        <Container className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[.85fr_1.15fr] lg:gap-16">
          <div>
            <Eyebrow>Enquire</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Ask about a spot</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Tell us what you sell and who you want to reach. We&apos;ll reply with the trades still open,
              and a mock-up of your placement.
            </p>
            <h3 className="mt-8 text-sm font-semibold">What we need to go live</h3>
            <ul className="mt-3 space-y-2 text-sm text-foreground/90">
              {[
                "Your logo",
                "A headline and one or two sentences",
                "Button text and the page clicks should land on",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-teal-600" />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">Not sure what to say? We can draft the copy with you.</p>
            <p className="mt-8 text-sm text-muted-foreground">
              Rather email?{" "}
              <a href={`mailto:${SITE.email}?subject=Sponsorship`} className="font-medium text-teal-700 hover:underline">
                {SITE.email}
              </a>
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-indigo/5 sm:p-8">
            <Suspense fallback={<SponsorEnquiryForm />}>
              <SponsorEnquiryFromUrl />
            </Suspense>
          </div>
        </Container>
      </section>

      {/* ─────────────────────── FAQ ─────────────────────── */}
      <section className="border-t border-border bg-secondary/40">
        <Container size="narrow" className="py-16 sm:py-20">
          <SectionHeading eyebrow="FAQ" title="Sponsorship questions" />
          <div className="mt-8">
            <Accordion>
              {FAQ.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
                  <AccordionContent>
                    <p className="leading-relaxed text-muted-foreground">{item.a}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Container>
      </section>

      <CTASection
        title="Own your trade on PMRFP."
        description="One sponsor per trade, first come first served. Tell us what you sell and we'll show you what's open."
        primaryHref="#enquire"
        primaryLabel="Ask about a spot"
        secondaryHref="/rfps"
        secondaryLabel="See the board"
      />
    </>
  );
}

function PackageCard({ p }: { p: SponsorPackage }) {
  const featured = p.id === "founding";
  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-2xl border p-7 sm:p-8",
        featured ? "border-indigo bg-indigo text-white shadow-2xl shadow-indigo/25" : "border-border bg-card",
      )}
    >
      {featured && (
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-teal-300/20 blur-2xl" />
      )}
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <h3 className={cn("text-lg font-semibold", featured && "text-white")}>{p.name}</h3>
          {p.note && (
            <span className="shrink-0 rounded-full bg-teal-300 px-2.5 py-0.5 text-xs font-semibold text-indigo">{p.note}</span>
          )}
        </div>
        <p className={cn("mt-2 text-sm leading-relaxed", featured ? "text-indigo-100/75" : "text-muted-foreground")}>
          {p.summary}
        </p>
        <div className="mt-6 flex items-baseline gap-1.5">
          <span className="font-heading text-4xl font-semibold tracking-tight">{cad(p.monthly)}</span>
          <span className={cn("text-sm", featured ? "text-indigo-100/70" : "text-muted-foreground")}>CAD / month</span>
        </div>
        <p className={cn("mt-1 text-xs font-medium", featured ? "text-teal-300" : "text-teal-700")}>
          or {cad(p.monthly * ANNUAL_MONTHS_BILLED)} a year, two months free
        </p>
        <ul className="mt-6 flex-1 space-y-3">
          {p.features.map((f) => (
            <li key={f} className={cn("flex gap-2 text-sm", featured ? "text-indigo-100" : "text-foreground")}>
              <Check className={cn("mt-0.5 size-4 shrink-0", featured ? "text-teal-300" : "text-teal-600")} />
              {f}
            </li>
          ))}
        </ul>
        <Link
          href={`/advertise?package=${p.id}#enquire`}
          className={cn(buttonVariants({ size: "lg", variant: featured ? "accent" : "outline" }), "mt-8 w-full")}
        >
          Ask about {p.name}
        </Link>
      </div>
    </div>
  );
}
