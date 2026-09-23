import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  BellRing,
  FileSearch,
  Flame,
  Hand,
  LayoutGrid,
  Lock,
  Minus,
  Radar,
  Trophy,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { VideoLoop } from "@/components/public/video-loop";
import { RfpCard } from "@/components/public/rfp-card";
import { buttonVariants } from "@/components/ui/button";
import { COPY, PRICING, SITE } from "@/lib/site";
import { getCategories } from "@/lib/data/taxonomy";
import { listRfps } from "@/lib/data/rfps";
import { boardStats, closingLabel, compactDollars, daysUntil, isPastContract, parseAward } from "@/lib/data/fomo";
import { cn } from "@/lib/utils";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";

// The RFP board now refreshes daily from the public-tender feed; without
// this the page was frozen at build time and showed stale open counts
// (and the sitemap missed every new tender) until the next deploy.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} — Commercial Property RFPs & Public Tenders in Canada` },
  description:
    "Open commercial property contracts across Canada — snow removal, HVAC, roofing, cleaning, electrical and more — from property managers and public buyers, updated daily. Trades get listed free; property managers post free.",
  alternates: { canonical: "/" },
};

// Every line here must stay true of Trade Pro (see rfp-alerts cron,
// LockedContentPanel, express-interest). No "appear higher" claims.
const PRO_BENEFITS = [
  {
    icon: Radar,
    t: "Every open tender, one board",
    d: "CanadaBuys, City of Toronto, Quebec SEAO and Yukon tenders plus property-manager RFPs — checked every morning, filtered to your trade and region.",
  },
  {
    icon: BellRing,
    t: "An email the day a match posts",
    d: "Daily alerts for your trade and region. Stop refreshing four government portals and hoping you didn't miss one.",
  },
  {
    icon: FileSearch,
    t: "Full scope, documents and the buyer",
    d: "Requirements, budget, submission instructions, attachments and contact details on every listing — everything you need to price it.",
  },
  {
    icon: Hand,
    t: "Put your name on property-manager RFPs",
    d: "Express interest in one click. The property manager sees your company profile, insurance and trades.",
  },
];

const COMPARE: [string, boolean, boolean][] = [
  ["Company profile in the trade directory", true, true],
  ["Website badge that links to your profile", true, true],
  ["Open RFP titles, regions and closing dates", true, true],
  ["Weekly tender digest email", true, true],
  ["Full scope, documents and buyer contact", false, true],
  ["Daily email the day a matching RFP posts", false, true],
  ["Express interest on property-manager RFPs", false, true],
];

const TRADE_POINTS = [
  "Build a credible, searchable company profile",
  "Get listed in the commercial vendor directory",
  "Monitor RFPs matched to your trade & region",
  "Bid and track every submission",
];
const PM_POINTS = [
  "Post a project in one short form — free",
  "Reach relevant trades by category & region",
  "Compare interested companies in one place",
  "Keep your name & building private until you're ready",
];

const PRICE_FEATURES = [
  "Company profile & directory listing",
  "Full RFP access",
  "Save RFPs",
  "Bid on RFPs",
  "Alerts for matching RFPs",
  "Website badge that links to your profile",
  "Early-bird annual rate, locked in when you join",
];

const FAQS = [
  { q: "Does PMRFP guarantee work?", a: "No. PMRFP lists projects and trades. We don't guarantee contracts, bid success, or responses." },
  { q: "Can I cancel anytime?", a: "Yes. You can cancel from the Stripe billing portal at any time — your membership stays active until the end of your billing period." },
  { q: "Which regions does PMRFP cover?", a: "Wherever there's demand. We're live in major metros and expanding — pick your regions when you join, and if yours is still being built out you can get on the founding list and we'll alert you as trades come online." },
  { q: "Can property managers post for free?", a: "Yes. Posting RFPs and browsing the vendor directory is free for property managers, builders, and owners." },
  { q: "What if I only serve one region?", a: "That's fine. Choose the exact regions and categories you cover and you'll only be matched to relevant work." },
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
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function HomePage() {
  const [categories, rfps] = await Promise.all([getCategories(), listRfps()]);
  const board = rfps.slice(0, 6);
  // listRfps() returns closed RFPs too (they stay on the board as proof of
  // activity), so a raw length is NOT an "open" count. Count status === "open"
  // — the same rule the board and detail pages use — or the homepage claims
  // projects are live that closed weeks ago (external audit, 2026-09-17).
  const openCount = rfps.filter((r) => r.status === "open").length;
  const chips = categories.slice(0, 6);
  // Everything below is counted from real listings — no example numbers.
  const stats = boardStats(rfps);
  // Still biddable (closes tomorrow or later), soonest first, English-language
  // notices ahead of SEAO's French ones, and spread across regions so the
  // homepage doesn't read as one city's board.
  const closingSoon = spread(
    rfps
      .filter((r) => r.status === "open" && (daysUntil(r.deadline) ?? -1) >= 1)
      .sort((a, b) => Number(isFrench(a)) - Number(isFrench(b)) || (a.deadline ?? "").localeCompare(b.deadline ?? "")),
    (r) => r.regionName ?? "",
  );
  const heroRows = closingSoon.slice(0, 3);
  const openBoard = closingSoon.length >= 3 ? closingSoon.slice(0, 6) : board;
  // Awards a trade can picture winning: $50K–$2M, most recent first, one per source.
  const bigAwards = spread(
    rfps
      .filter((r) => {
        const amount = parseAward(r.summary).amount ?? 0;
        return (
          isPastContract(r) && !isFrench(r) && !/\bdesign\b/i.test(r.title) &&
          amount >= 50_000 && amount <= 2_000_000
        );
      })
      .sort((a, b) => (b.deadline ?? "").localeCompare(a.deadline ?? "")),
    (r) => r.slug.match(/-(cba|tora|nsa|qca)-/)?.[1] ?? "",
  ).slice(0, 3);
  // Median real award value (past public contracts) — the ROI anchor.
  const awardAmounts = rfps
    .map((r) => (isPastContract(r) ? parseAward(r.summary).amount : null))
    .filter((n): n is number => typeof n === "number" && n > 0)
    .sort((a, b) => a - b);
  const medianAward = awardAmounts.length >= 25 ? awardAmounts[Math.floor(awardAmounts.length / 2)] : null;
  // Below ~10 open listings the live-count headline undersells; keep the PM pitch.
  const live = stats.open >= 10;

  return (
    <>
      {/* ===================== HERO ===================== */}
      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10">
          <div className="grid items-center gap-14 py-20 lg:grid-cols-[1.04fr_.96fr] lg:py-28">
            <div>
              <span className="eyebrow inline-flex items-center gap-2 text-teal-300">
                <span className="h-px w-5 bg-teal-300" />{" "}
                {live ? "Live across Canada · Updated daily" : "Now live in the GTA · Your region next"}
              </span>
              {live ? (
                <h1 className="mt-5 text-balance text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-5xl xl:text-6xl">
                  <span className="text-teal-300">{stats.open}</span> commercial property contracts
                  are open for bids right now.
                </h1>
              ) : (
                <h1 className="mt-5 text-balance text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-5xl xl:text-6xl">
                  Post commercial property RFPs <span className="text-teal-300">free</span>. Vetted
                  trades bid to win them.
                </h1>
              )}
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-indigo-100/75">
                {live
                  ? "Snow, HVAC, roofing, cleaning, electrical and more — public tenders and property-manager RFPs on one board. Trade Pro gets you the full scope, the buyer's contact, and an email the day a new one in your trade posts."
                  : `${SITE.name} is the RFP board for commercial and residential buildings. Post a project, or get listed and bid.`}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={live ? signUpHrefForPlan("pro", "monthly") : "/sign-up?role=property_manager"}
                  className={buttonVariants({ size: "lg", variant: "accent" })}
                >
                  {live ? `Start Trade Pro — $${PRICING.proMonthly}/mo` : "Post a project — free"} <ArrowRight className="size-4" />
                </Link>
                <Link
                  href={live ? "/rfps" : "/sign-up"}
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white",
                  )}
                >
                  {live ? "See what's open" : "Join as a Trade Company"}
                </Link>
              </div>
              {live && (
                <p className="mt-4 text-sm text-indigo-100/75">
                  Or{" "}
                  <Link href={signUpHrefForPlan("pro", "annual")} className="font-semibold text-teal-300 hover:underline">
                    lock in ${PRICING.proAnnual}/yr
                  </Link>{" "}
                  before it rises to $399 · Cancel anytime ·{" "}
                  <Link href="/sign-up?role=trade" className="underline decoration-white/30 hover:text-white">
                    free listing
                  </Link>
                </p>
              )}
              {live && (
                <p className="mt-2 text-sm text-indigo-100/75">
                  Property manager?{" "}
                  <Link href="/sign-up?role=property_manager" className="font-semibold text-teal-300 hover:underline">
                    Post a project free →
                  </Link>
                </p>
              )}
              <p className="mt-6 flex max-w-md items-start gap-2 text-[13px] leading-relaxed text-indigo-100/55">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-400" />
                {SITE.name} lists projects and trades — we don&apos;t guarantee contracts,
                responses, or revenue.
              </p>
            </div>

            {/* Browser mock — opportunity board */}
            <div className="relative">
              <div className="browser-mock overflow-hidden rounded-xl border border-white/15 bg-white shadow-2xl">
                <div className="flex items-center gap-2 border-b border-border bg-secondary px-4 py-3">
                  <span className="flex gap-1.5">
                    <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                  </span>
                  <span className="ml-2 rounded-full border border-border bg-white px-3 py-1 font-mono text-[11px] text-muted-foreground">
                    pmrfp.com/rfps
                  </span>
                </div>
                <div className="bg-secondary/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-semibold text-foreground">RFP Board</h4>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {heroRows.length === 3 ? "Live · closing soonest" : "Example projects"}
                    </span>
                  </div>
                  {heroRows.length === 3 && heroRows.map((r) => {
                    const soon = closingLabel(daysUntil(r.deadline));
                    return (
                      <Link
                        key={r.slug}
                        href={`/rfps/${r.slug}`}
                        className="mb-2.5 block rounded-lg border border-border bg-white p-3.5 transition-colors last:mb-0 hover:border-teal-300"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-[10.5px] uppercase tracking-wide text-teal-600">
                            {r.categories[0] ?? "Commercial"}
                          </span>
                          <span className={cn(
                            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase",
                            soon ? "bg-warning/10 text-warning" : "bg-teal-50 text-teal-700",
                          )}>
                            {soon ? <Flame className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
                            {soon ?? "Open"}
                          </span>
                        </div>
                        <div className="line-clamp-2 font-semibold text-foreground">{r.title}</div>
                        <div className="mt-2 flex gap-4 font-mono text-[11.5px] text-muted-foreground">
                          <span>{r.regionName ?? "Canada"}</span>
                          <span>Closes {formatDeadline(r.deadline)}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {heroRows.length < 3 && [
                    { cat: "Electrical", title: "Condominium Electrical Maintenance Contract", meta: ["Toronto · Condo", "Example listing"], status: "open" as const },
                    { cat: "Snow Removal", title: "Commercial Plaza Snow Removal Services", meta: ["Mississauga · Retail", "Example listing"], status: "soon" as const },
                    { cat: "HVAC", title: "Apartment Building HVAC Preventive Maintenance", meta: [] as string[], status: "locked" as const },
                  ].map((r) => (
                    <div
                      key={r.title}
                      className={cn(
                        "mb-2.5 rounded-lg border border-border p-3.5 transition-colors last:mb-0 hover:border-teal-300",
                        r.status === "locked" ? "bg-secondary" : "bg-white",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[10.5px] uppercase tracking-wide text-teal-600">
                          {r.cat}
                        </span>
                        {r.status === "locked" ? (
                          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                            Locked
                          </span>
                        ) : (
                          <span className={cn(
                            "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase",
                            r.status === "soon" ? "bg-warning/10 text-warning" : "bg-teal-50 text-teal-700",
                          )}>
                            <span className="size-1.5 rounded-full bg-current" />
                            {r.status === "soon" ? "Closing" : "Open"}
                          </span>
                        )}
                      </div>
                      <div className={cn("font-semibold", r.status === "locked" ? "text-muted-foreground" : "text-foreground")}>
                        {r.title}
                      </div>
                      {r.meta.length > 0 ? (
                        <div className="mt-2 flex gap-4 font-mono text-[11.5px] text-muted-foreground">
                          {r.meta.map((m) => <span key={m}>{m}</span>)}
                        </div>
                      ) : (
                        <div className="mt-2.5 flex items-center gap-2 border-t border-dashed border-border pt-2.5 font-mono text-[11.5px] text-muted-foreground">
                          <Lock className="size-3.5 text-periwinkle" /> Subscribe to view full opportunity
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ticker */}
          <div className="grid grid-cols-2 gap-px border-t border-white/10 sm:grid-cols-4">
            {[
              live ? ["Coverage", "Canada-wide · updated daily"] : ["Now live", "Greater Toronto Area"],
              ["Focus", "Commercial property"],
              ["For trades", "Directory + RFP access"],
              ["Membership", `$${PRICING.proAnnual} / year`],
            ].map(([k, v]) => (
              <div key={k} className="py-6 pr-6">
                <div className="font-mono text-[11px] uppercase tracking-widest text-teal-300">{k}</div>
                <div className="mt-1.5 font-semibold text-white">{v}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ===================== TRUST BAND ===================== */}
      <section className="border-b border-border bg-background">
        <Container className="py-12">
          <div className="mx-auto grid max-w-4xl grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-indigo sm:text-4xl">{openCount > 0 ? openCount : rfps.length}</div>
              <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {openCount > 0 ? "Open RFPs" : "Recent RFPs"}
              </div>
            </div>
            {live ? (
              <div>
                <div className="flex items-center justify-center gap-1.5 text-3xl font-extrabold tracking-tight text-indigo sm:text-4xl">
                  <Flame className="size-7 text-warning" /> {stats.closingThisWeek}
                </div>
                <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Close in the next 7 days</div>
              </div>
            ) : (
              <div>
                <div className="text-3xl font-extrabold tracking-tight text-indigo sm:text-4xl">{categories.length}</div>
                <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Trade categories</div>
              </div>
            )}
            {stats.awardedValue > 0 ? (
              <div>
                <div className="text-3xl font-extrabold tracking-tight text-indigo sm:text-4xl">{compactDollars(stats.awardedValue)}</div>
                <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  Awarded in {stats.pastContracts.toLocaleString("en-CA")} past contracts
                </div>
              </div>
            ) : (
              <div>
                <div className="text-3xl font-extrabold tracking-tight text-indigo sm:text-4xl">GTA</div>
                <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Primary market</div>
              </div>
            )}
          </div>
        </Container>
      </section>

      {/* ===================== WHAT TRADE PRO GETS YOU ===================== */}
      <section className="bg-background">
        <Container className="py-20">
          <div className="max-w-2xl">
            <Eyebrow>Trade Pro</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Stop finding out about the work after it&apos;s awarded.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Most commercial work goes to whoever heard about it first. Trade Pro makes that you.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {PRO_BENEFITS.map(({ icon: Icon, t, d }) => (
              <div key={t} className="flex gap-4 rounded-xl border border-border bg-card p-6">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Also on {SITE.name}, free for everyone: who won and for how much on{" "}
            {stats.pastContracts > 0 ? stats.pastContracts.toLocaleString("en-CA") : "hundreds of"} past public contracts,
            and free bid help on public tenders.
          </p>
        </Container>
      </section>

      {/* ===================== ROI ===================== */}
      {medianAward && (
        <section className="bg-teal-300">
          <Container className="grid items-center gap-8 py-14 md:grid-cols-[1.3fr_1fr]">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-indigo sm:text-3xl">
                The median public contract on our board sold for {compactDollars(medianAward)}.
              </h2>
              <p className="mt-3 text-lg text-indigo/75">
                Trade Pro is ${PRICING.proAnnual} a year. One small win covers it many times over.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link href={signUpHrefForPlan("pro", "annual")} className={buttonVariants({ size: "lg" })}>
                Lock in ${PRICING.proAnnual}/yr <ArrowRight className="size-4" />
              </Link>
            </div>
          </Container>
        </section>
      )}

      {/* ===================== FREE vs TRADE PRO ===================== */}
      <section className="bg-secondary/40">
        <Container className="py-20">
          <div className="max-w-2xl">
            <Eyebrow>Free vs Trade Pro</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Free gets you seen. Pro gets you the work.
            </h2>
          </div>
          <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-[1fr_72px_96px] items-center border-b border-border bg-secondary/60 px-5 py-3 text-sm font-semibold sm:grid-cols-[1fr_120px_140px]">
              <span />
              <span className="text-center">Free</span>
              <span className="text-center text-indigo">Trade Pro</span>
            </div>
            {COMPARE.map(([label, free, pro]) => (
              <div
                key={label}
                className="grid grid-cols-[1fr_72px_96px] items-center border-b border-border px-5 py-3.5 text-sm last:border-b-0 sm:grid-cols-[1fr_120px_140px]"
              >
                <span className={cn(!free && "font-medium")}>{label}</span>
                <span className="flex justify-center">
                  {free ? <Check className="size-4 text-teal-600" strokeWidth={3} /> : <Minus className="size-4 text-muted-foreground/50" />}
                </span>
                <span className="flex justify-center">
                  {pro && <Check className="size-4 text-indigo" strokeWidth={3} />}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_72px_96px] items-center gap-y-3 border-t border-border bg-secondary/40 px-5 py-4 sm:grid-cols-[1fr_120px_140px]">
              <span className="text-sm font-semibold">Price</span>
              <span className="text-center text-sm font-semibold">$0</span>
              <span className="text-center text-sm font-semibold text-indigo">
                ${PRICING.proMonthly}/mo
                <span className="block text-xs font-normal text-muted-foreground">or ${PRICING.proAnnual}/yr</span>
              </span>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={signUpHrefForPlan("pro", "monthly")} className={buttonVariants({ size: "lg" })}>
              Start Trade Pro — ${PRICING.proMonthly}/mo <ArrowRight className="size-4" />
            </Link>
            <Link href="/sign-up?role=trade" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Start free
            </Link>
            <span className="text-sm text-muted-foreground">Cancel anytime. Access runs to the end of your billing period.</span>
          </div>
        </Container>
      </section>

      {/* ===================== OPPORTUNITY BOARD ===================== */}
      <section className="bg-background">
        <Container className="py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <Eyebrow>RFP board</Eyebrow>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                {openCount > 0 ? "Open commercial property RFPs." : "Recent commercial property RFPs."}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                {openCount > 0
                  ? "Closing soonest first — from property managers, owners and public buyers across Canada. Filter by trade to see what’s open in your region."
                  : "No projects are open right now — these recently closed RFPs show the kind of work property managers post. Save your trade and region to hear about future matches."}
              </p>
            </div>
            <Link href="/rfps" className={buttonVariants({ variant: "outline" })}>
              View all RFPs <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <Link
              href="/rfps"
              className="inline-flex items-center gap-2 rounded-full border border-indigo bg-indigo px-4 py-2 text-sm font-medium text-white"
            >
              <LayoutGrid className="size-3.5" /> All trades
            </Link>
            {chips.map((c) => (
              <Link
                key={c.slug}
                href={`/trades/${c.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-teal-300 hover:bg-teal-50"
              >
                <span className="size-1.5 rounded-full bg-teal-500" /> {c.name}
              </Link>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {openBoard.map((r) => (
              <Link
                key={r.slug}
                href={`/rfps/${r.slug}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-teal-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-teal-600">
                    {r.categories[0] ?? "Commercial"}
                  </span>
                  {r.status === "open" ? (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 font-mono text-[10px] uppercase text-teal-700">
                      Open
                    </span>
                  ) : (
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      Closed
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-base font-semibold leading-snug group-hover:text-teal-700">
                  {r.title}
                </h3>
                {r.summary && (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {r.summary}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 font-mono text-[11px]">
                  <div>
                    <div className="text-muted-foreground">Region</div>
                    <div className="mt-0.5 font-semibold text-foreground">{r.regionName ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Property</div>
                    <div className="mt-0.5 font-semibold text-foreground">{r.propertyTypeName ?? "Commercial"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{r.status === "open" ? "Deadline" : "Closed"}</div>
                    <div className="mt-0.5 font-semibold text-foreground">{formatDeadline(r.deadline)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Access</div>
                    <div className="mt-0.5 flex items-center gap-1 font-semibold text-periwinkle">
                      <Lock className="size-3" /> Members
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-secondary/40 px-6 py-5">
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {openCount > 0
                ? "Full scope, contacts & documents unlock with membership"
                : "Free profile now — RFP access when projects match your trade"}
            </span>
            <Link href="/pricing" className={buttonVariants()}>
              {openCount > 0 ? "Subscribe to see full RFPs" : "See pricing"} <ArrowRight className="size-4" />
            </Link>
          </div>
        </Container>
      </section>

      {/* ===================== ALREADY AWARDED (real award notices) ===================== */}
      {bigAwards.length === 3 && (
        <section className="bg-indigo text-white">
          <Container className="py-20">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <span className="eyebrow inline-flex items-center gap-2 text-teal-300">
                  <Trophy className="size-3.5" /> Already awarded
                </span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Someone else won these.
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-indigo-100/75">
                  Real public contracts from the past year — who won, and for how much. The next
                  ones are on the board now. Get listed and you&apos;ll see them while they&apos;re
                  still open.
                </p>
              </div>
              <Link href="/rfps?view=awarded" className="text-sm font-semibold text-teal-300 hover:underline">
                See all {stats.pastContracts.toLocaleString("en-CA")} awarded contracts →
              </Link>
            </div>
            <div className="mt-8 grid gap-4 text-foreground md:grid-cols-3">
              {bigAwards.map((r) => (
                <RfpCard key={r.slug} rfp={r} locked />
              ))}
            </div>
            <div className="mt-8">
              <Link href="/sign-up" className={buttonVariants({ size: "lg", variant: "accent" })}>
                Get alerts for the next one <ArrowRight className="size-4" />
              </Link>
            </div>
          </Container>
        </section>
      )}

      {/* ===================== AUDIENCE SPLIT ===================== */}
      <section className="bg-secondary/40">
        <Container className="grid gap-6 py-20 lg:grid-cols-2">
          {/* Trades */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative flex h-44 items-end overflow-hidden bg-indigo p-6">
              <VideoLoop
                src="/video/audience-trades.mp4"
                poster="/images/audience-trades.jpg"
                alt="Trade contractor on a commercial job site"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-indigo via-indigo/60 to-indigo/25" />
              <span className="relative font-mono text-[11px] uppercase tracking-wide text-teal-300">
                For trade companies
              </span>
            </div>
            <div className="p-8">
              <h3 className="text-2xl font-bold tracking-tight">
                Get found by the buildings that need your trade.
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{COPY.tradeValue}</p>
              <ul className="mt-6 space-y-3">
                {TRADE_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up" className={cn(buttonVariants({ size: "lg" }), "mt-7")}>
                Join as a Trade Company <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          {/* PMs */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative flex h-44 items-end overflow-hidden bg-indigo p-6">
              <VideoLoop
                src="/video/audience-pm.mp4"
                poster="/images/audience-pm.jpg"
                alt="Property manager reviewing a building portfolio"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-indigo via-indigo/60 to-indigo/25" />
              <span className="relative font-mono text-[11px] uppercase tracking-wide text-teal-300">
                For property managers, builders &amp; owners
              </span>
            </div>
            <div className="p-8">
              <h3 className="text-2xl font-bold tracking-tight">
                Find the right vendor without the runaround.
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{COPY.pmValue}</p>
              <ul className="mt-6 space-y-3">
                {PM_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <Link
                href="/for-property-managers"
                className={cn(buttonVariants({ size: "lg", variant: "accent" }), "mt-7")}
              >
                Post an RFP <ArrowRight className="size-4" />
              </Link>
              <Link href="/rfp-writer" className="ml-4 mt-7 inline-block text-sm font-semibold text-teal-700 hover:underline">
                Or write one in 2 minutes →
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* ===================== PRICING ===================== */}
      <section className="bg-background">
        <Container className="py-20">
          <div className="max-w-2xl">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Lock in ${PRICING.proAnnual}/yr before it goes to $399.
            </h2>
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-lg leading-relaxed text-muted-foreground">
                Early-bird Trade Pro is{" "}
                <b className="text-foreground">${PRICING.proAnnual} CAD per year</b>, or ${PRICING.proMonthly}/month.
                The annual rate rises to $399 once we reach 100 members — join before then and
                your rate is locked in.
              </p>
              <div className="mt-7 divide-y divide-border border-y border-border">
                {FAQS.map((f, i) => (
                  <details key={f.q} open={i === 0} className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                      {f.q}
                      <span className="font-mono text-lg text-teal-600 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-indigo p-9 text-white shadow-2xl">
              <div className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-teal-300/20 blur-2xl" />
              <div className="relative">
                <div className="font-mono text-xs uppercase tracking-widest text-teal-300">
                  Early-bird pricing
                </div>
                <div className="mt-2.5 text-2xl font-semibold text-white">Trade Pro · Annual</div>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-6xl font-extrabold leading-none tracking-tight text-white">
                    ${PRICING.proAnnual}
                  </span>
                  <span className="pb-2.5 font-mono text-[13px] text-teal-300">CAD</span>
                  <span className="pb-2 text-sm text-indigo-100/70">/ year</span>
                </div>
                <ul className="mt-7 space-y-3">
                  {PRICE_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-indigo-100">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-300/20 text-teal-300">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={signUpHrefForPlan("pro", "annual")}
                  className={cn(buttonVariants({ size: "lg", variant: "accent" }), "mt-7 w-full")}
                >
                  Lock in ${PRICING.proAnnual}/yr <ArrowRight className="size-4" />
                </Link>
                <Link
                  href={signUpHrefForPlan("pro", "monthly")}
                  className="mt-3 block text-center text-sm font-medium text-teal-300 hover:underline"
                >
                  Or start monthly at ${PRICING.proMonthly}/mo
                </Link>
                <p className="mt-3 text-center text-xs text-indigo-100/55">
                  Cancel anytime · Access runs to the end of your billing period
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ===================== DISCLAIMER STRIP ===================== */}
      <div className="border-y border-border bg-secondary/60">
        <Container className="flex items-start gap-3 py-5">
          <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
            <b className="font-semibold text-ink-2">{COPY.disclaimer.split(".")[0]}.</b>
            {COPY.disclaimer.slice(COPY.disclaimer.indexOf(".") + 1)}
          </p>
        </Container>
      </div>

      {/* ===================== FINAL CTA ===================== */}
      <section className="grid-tex grid-tex-center relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-24 text-center">
          <span className="eyebrow inline-flex items-center gap-2 text-teal-300">
            <span className="h-px w-5 bg-teal-300" /> Get started
          </span>
          <h2 className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {stats.closingThisWeek > 0 ? (
              <>
                <span className="text-teal-300">{stats.closingThisWeek}</span> contracts close this week.
                Are you bidding?
              </>
            ) : (
              <>
                Get listed before your <span className="text-teal-300">competitors</span> do.
              </>
            )}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-100/70">
            Trade Pro puts every one that fits your trade in your inbox, with the full scope and the
            buyer&apos;s contact. ${PRICING.proMonthly}/month, cancel anytime.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={signUpHrefForPlan("pro", "monthly")} className={buttonVariants({ size: "lg", variant: "accent" })}>
              Start Trade Pro <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/sign-up?role=property_manager"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white",
              )}
            >
              Post a project — free
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
