import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  LayoutGrid,
  Lock,
  Search,
  Send,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { VideoLoop } from "@/components/public/video-loop";
import { buttonVariants } from "@/components/ui/button";
import { COPY, PRICING, SITE } from "@/lib/site";
import { getCategories } from "@/lib/data/taxonomy";
import { listRfps } from "@/lib/data/rfps";
import { cn } from "@/lib/utils";

// The RFP board now refreshes daily from the public-tender feed; without
// this the page was frozen at build time and showed stale open counts
// (and the sitemap missed every new tender) until the next deploy.
export const revalidate = 3600;

const PROBLEMS = [
  { n: "01", t: "Scattered RFPs", d: "RFPs are scattered across emails, portals, networks, and referrals with no single place to watch." },
  { n: "02", t: "Hard-to-reach buyers", d: "Property managers keep private preferred-vendor lists that newcomers simply can't see." },
  { n: "03", t: "Manual vendor hunts", d: "Owners and managers lose hours chasing down qualified, insured, available trades." },
  { n: "04", t: "Missed follow-ups", d: "Good leads die in inboxes — with no structured way to track interest and outcomes." },
];

const PROPERTY_TYPES = [
  { name: "Condominiums", sub: "High-rise & low-rise", img: "/images/property-condominium.jpg", grad: "from-indigo to-indigo-500" },
  { name: "Commercial Office", sub: "Towers & business parks", img: "/images/property-office.jpg", grad: "from-indigo-500 to-periwinkle" },
  { name: "Retail Plazas", sub: "Strip malls & centres", img: "/images/property-retail.jpg", grad: "from-periwinkle to-indigo-400" },
  { name: "Apartments", sub: "Multi-residential", img: "/images/property-apartment.jpg", grad: "from-indigo to-periwinkle" },
  { name: "Industrial", sub: "Warehouse & logistics", img: "/images/property-industrial.jpg", grad: "from-indigo-700 to-indigo-500" },
];

const STEPS = [
  { step: "STEP 01", icon: Building2, t: "Get listed", d: "Build your company profile — categories, regions, insurance — and show up in the trade directory property managers search.", more: "Build your profile", href: "/sign-up" },
  { step: "STEP 02", icon: Search, t: "Browse RFPs", d: "One board of building projects, filtered to your trade and region. Save the fits and get alerts when new ones land.", more: "Browse RFPs", href: "/rfps" },
  { step: "STEP 03", icon: Send, t: "Bid on the fit", d: "Put your name on the RFPs that match — experience, availability, done. Track every submission in one place.", more: "See how it works", href: "/for-trades" },
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
  "Verified vendor badge for your website",
  "Early-bird annual rate, locked in when you join",
];

const FAQS = [
  { q: "Does PMRFP guarantee work?", a: "No. PMRFP lists projects and trades. We don't guarantee contracts, bid success, or responses." },
  { q: "Can I cancel anytime?", a: "Yes. You can cancel from the Stripe billing portal at any time — your membership stays active until the end of your billing period." },
  { q: "Which regions does PMRFP cover?", a: "Wherever there's demand. We're live in major metros and expanding — pick your regions when you join, and if yours is still being built out you can get on the founding list and we'll alert you as trades come online." },
  { q: "Can property managers post for free?", a: "Yes. Posting RFPs and browsing the vendor directory is free for property managers, builders, and owners." },
  { q: "What if I only serve one region?", a: "That's fine. Choose the exact regions and categories you cover and you'll only be matched to relevant work." },
];

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

  return (
    <>
      {/* ===================== HERO ===================== */}
      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10">
          <div className="grid items-center gap-14 py-20 lg:grid-cols-[1.04fr_.96fr] lg:py-28">
            <div>
              <span className="eyebrow inline-flex items-center gap-2 text-teal-300">
                <span className="h-px w-5 bg-teal-300" /> Now live in the GTA · Your region next
              </span>
              <h1 className="mt-5 text-balance text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-5xl xl:text-6xl">
                Post commercial property RFPs <span className="text-teal-300">free</span>. Vetted
                trades bid to win them.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-indigo-100/75">
                {SITE.name} is the RFP board for commercial and residential buildings. Post a
                project, or get listed and bid.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/sign-up?role=property_manager"
                  className={buttonVariants({ size: "lg", variant: "accent" })}
                >
                  Post a project — free <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/sign-up"
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white",
                  )}
                >
                  Join as a Trade Company
                </Link>
              </div>
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
                    <span className="font-mono text-[11px] text-muted-foreground">Example projects</span>
                  </div>
                  {[
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
              ["Now live", "Greater Toronto Area"],
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
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-indigo sm:text-4xl">{categories.length}</div>
              <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Trade categories</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-indigo sm:text-4xl">GTA</div>
              <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Primary market</div>
            </div>
          </div>
        </Container>
      </section>

      {/* ===================== PROBLEM ===================== */}
      <section className="bg-background">
        <Container className="py-20">
          <div className="max-w-2xl">
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Commercial property work runs on who you already know.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Opportunities move through preferred-vendor lists, referrals, and fragmented RFP
              channels. If you&apos;re not already in the room, you never hear about the work.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROBLEMS.map((p) => (
              <div
                key={p.n}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="font-mono text-xs font-medium text-periwinkle">{p.n}</div>
                <h3 className="mt-4 text-lg font-semibold">{p.t}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{p.d}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ===================== PROPERTY TYPES ===================== */}
      <section className="bg-secondary/40">
        <Container className="py-20">
          <div className="max-w-2xl">
            <Eyebrow>What we cover</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Commercial and residential property work, all in one place.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              From rental communities and high-rise condos to retail plazas and office towers,{" "}
              {SITE.name} connects the buildings that need work with the trades who do it.
            </p>
          </div>
          <div className="mt-11 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {PROPERTY_TYPES.map(({ name, sub, img, grad }) => (
              <div
                key={name}
                className={cn(
                  "group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-sm transition-transform hover:-translate-y-1.5",
                  grad,
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt={`${name} — commercial property`}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-indigo/90 via-indigo/35 to-transparent" />
                <div className="relative p-5">
                  <div className="font-semibold">{name}</div>
                  <div className="mt-1 font-mono text-[11px] text-teal-300">{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ===================== APPROACH (teal band) ===================== */}
      <section className="bg-teal-300">
        <Container className="py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="eyebrow inline-flex items-center gap-2 text-indigo">
              <span className="h-px w-5 bg-indigo" /> What {SITE.name} does
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-indigo sm:text-4xl">
              A focused place to get found and follow the work.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-indigo/70">
              Property managers post projects free. Trades get listed, browse the board, and bid.
              The PM picks who to hire.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map(({ step, icon: Icon, t, d, more, href }) => (
              <Link
                key={t}
                href={href}
                className="group rounded-2xl border border-transparent bg-card p-8 shadow-sm transition-all hover:-translate-y-1.5 hover:shadow-lg"
              >
                <div className="font-mono text-xs tracking-widest text-periwinkle">{step}</div>
                <span className="mt-3.5 flex size-13 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <Icon className="size-6" />
                </span>
                <h3 className="mt-5 text-xl font-semibold">{t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{d}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600">
                  {more} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
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
                  ? "Posted by property managers, builders, and owners. Filter by trade to see what’s open in your region — full scope and contacts unlock with membership."
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
            {board.map((r) => (
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
              One plan. One flat price.
            </h2>
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-lg leading-relaxed text-muted-foreground">
                Early Trade Pro membership is{" "}
                <b className="text-foreground">${PRICING.proAnnual} CAD per year</b> — your listing
                in the trade directory, full access to posted RFPs, and the ability to bid on the
                ones that match.
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
                  href="/sign-up"
                  className={cn(buttonVariants({ size: "lg", variant: "accent" }), "mt-7 w-full")}
                >
                  Join {SITE.name} <ArrowRight className="size-4" />
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
            Get listed before your <span className="text-teal-300">competitors</span> do.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-100/70">
            Join the early trade members building visibility on the commercial property
            opportunity network.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/sign-up" className={buttonVariants({ size: "lg", variant: "accent" })}>
              Join as a Trade Company <ArrowRight className="size-4" />
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
