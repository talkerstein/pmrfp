import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, CalendarDays, Landmark, Trophy } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { listRfps } from "@/lib/data/rfps";
import { winnersFromRfps } from "@/lib/data/winners";
import { compactDollars, daysUntil } from "@/lib/data/fomo";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { GcPackageCta } from "@/components/public/gc-package-cta";

export const revalidate = 3600;

export async function generateStaticParams() {
  return []; // rendered on first visit, then cached (ISR)
}

const money = (n: number) => `$${n.toLocaleString("en-CA")}`;
const fmt = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

async function load(slug: string) {
  const rfps = await listRfps();
  const winner = winnersFromRfps(rfps).find((w) => w.slug === slug) ?? null;
  return { rfps, winner };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { winner: w } = await load(slug);
  if (!w) return { title: "Contract winner not found" };
  const n = w.awards.length;
  const title = `${w.name} — ${n} public contracts won${w.totalValue ? ` (${compactDollars(w.totalValue)})` : ""}`;
  const description = `${w.name} won ${n} public contracts${w.totalValue ? ` worth ${money(w.totalValue)}` : ""} from ${w.issuers.slice(0, 2).join(" and ")}${w.categories.length ? ` — ${w.categories.slice(0, 3).join(", ").toLowerCase()}` : ""}. See every award, value and date.`;
  return { title, description, alternates: { canonical: `/contract-winners/${w.slug}` } };
}

export default async function WinnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { rfps, winner: w } = await load(slug);
  if (!w) notFound();

  const disclosed = w.awards.filter((a) => a.amount);
  const average = disclosed.length ? Math.round(w.totalValue / disclosed.length) : null;
  // Open work in the same trades — the "you could be bidding on this" hook.
  const open = rfps
    .filter((r) => r.status === "open" && (daysUntil(r.deadline) ?? 0) >= 0 && r.categories.some((c) => w.categories.includes(c)))
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Contract winners", path: "/contract-winners" },
          { name: w.name, path: `/contract-winners/${w.slug}` },
        ])}
      />

      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-14">
          <Link href="/contract-winners" className="text-sm text-indigo-100/70 hover:text-white">
            ← All contract winners
          </Link>
          <span className="eyebrow mt-6 flex items-center gap-2 text-teal-300">
            <Trophy className="size-3.5" /> Public contract winner
          </span>
          <h1 className="mt-3 max-w-4xl text-balance text-3xl font-extrabold tracking-tight text-white sm:text-5xl">{w.name}</h1>
          {w.categories.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {w.categories.slice(0, 6).map((c) => (
                <span key={c} className="rounded-full bg-white/10 px-3 py-1 text-sm text-indigo-100">{c}</span>
              ))}
            </div>
          )}
          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4">
            {[
              ["Contracts won", String(w.awards.length)],
              ["Total value", w.totalValue ? compactDollars(w.totalValue) : "Not disclosed"],
              ["Average contract", average ? compactDollars(average) : "—"],
              ["Most recent", fmt(w.latest)],
            ].map(([k, v]) => (
              <div key={k} className="bg-indigo p-5">
                <dt className="font-mono text-[11px] uppercase tracking-widest text-teal-300">{k}</dt>
                <dd className="mt-1.5 text-2xl font-bold text-white">{v}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container className="grid gap-10 py-12 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Eyebrow>Every award on record</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Contracts won by {w.name}</h2>
          <ol className="mt-6 space-y-3">
            {w.awards.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/rfps/${a.slug}`}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all hover:border-teal-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Landmark className="size-3.5" /> {a.source}</span>
                      <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {fmt(a.date)}</span>
                      {a.regionName && !a.source.includes(a.regionName) && <span>{a.regionName}</span>}
                    </div>
                    <h3 className="mt-1.5 font-semibold leading-snug group-hover:text-teal-700">{a.title}</h3>
                    {a.categories[0] && <Badge variant="secondary" className="mt-2">{a.categories[0]}</Badge>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn("text-xl font-extrabold tracking-tight", a.amount ? "text-indigo" : "text-muted-foreground")}>
                      {a.amount ? money(a.amount) : "Value not disclosed"}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>

          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            Compiled from public award notices published by {w.issuers.join(", ")}. {w.attributions.join(" ")} These
            contracts were awarded directly by the public buyer — not through {SITE.name}. Listing here is not an
            endorsement and implies no affiliation with {SITE.name}.
          </p>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl bg-indigo p-6 text-white">
            <h2 className="text-lg font-semibold">
              {open.length > 0 ? `${open.length} tender${open.length === 1 ? "" : "s"} like these ${open.length === 1 ? "is" : "are"} open right now` : "Bid on the next one"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-indigo-100/80">
              Trade Pro emails you the day a new tender in your trade and region is posted — with the full scope and
              the buyer&apos;s contact — so you&apos;re bidding, not reading about who won.
            </p>
            <Link href={signUpHrefForPlan("pro", "monthly")} className={cn(buttonVariants({ variant: "accent" }), "mt-4 w-full")}>
              Start Trade Pro — ${PRICING.proMonthly}/mo <ArrowRight className="size-4" />
            </Link>
            {open.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-white/15 pt-4 text-sm">
                {open.slice(0, 5).map((r) => (
                  <li key={r.slug}>
                    <Link href={`/rfps/${r.slug}`} className="line-clamp-2 text-indigo-100 hover:text-white hover:underline">
                      {r.title}
                    </Link>
                    <span className="text-xs text-teal-300">Closes {fmt(r.deadline)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* The winner may need subs — their latest award prefills the first package. */}
          <GcPackageCta awardSlug={w.awards[0]?.slug ?? null} title="Won one of these contracts?" />

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Building2 className="size-4" /> Is this your company?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Get a free {SITE.name} profile so property managers can find you, and a badge for your website.
            </p>
            <Link href="/sign-up?role=trade" className={cn(buttonVariants({ variant: "outline" }), "mt-4 w-full")}>
              Claim a free profile
            </Link>
          </div>
        </aside>
      </Container>
    </>
  );
}
