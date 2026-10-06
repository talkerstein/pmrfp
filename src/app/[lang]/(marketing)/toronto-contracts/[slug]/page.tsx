import type { Metadata } from "next";
import Link from "@/i18n/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, ExternalLink, Landmark, Trophy } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { TorontoAttribution } from "@/components/public/toronto-attribution";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getTorontoSupplier, TORONTO_DATASET_URL } from "@/lib/data/toronto-awards";
import { compactDollars } from "@/lib/data/fomo";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { cn } from "@/lib/utils";

export const revalidate = 86400;

export async function generateStaticParams() {
  return []; // rendered on first visit, then cached for a day (ISR)
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;
const day = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = await getTorontoSupplier(slug);
  if (!s) return { title: "Supplier not found" };
  const value = s.total ? ` (${compactDollars(s.total)})` : "";
  const years = s.first && s.latest ? ` ${s.first.slice(0, 4)}–${s.latest.slice(0, 4)}` : "";
  return {
    title: `${s.name}: City of Toronto contracts${value}`,
    description: `${s.name} won ${s.count} City of Toronto contract${s.count === 1 ? "" : "s"}${years}${
      s.total ? ` worth ${money(s.total)}` : ""
    }${s.topDivision ? `, mostly for ${s.topDivision}` : ""}. Award amounts, divisions and descriptions from TOBids open data.`,
    alternates: { canonical: `/toronto-contracts/${s.slug}` },
    ...(s.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function TorontoSupplierPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getTorontoSupplier(slug);
  if (!s) notFound();
  const disclosed = s.awards.filter((a) => a.amount);
  const average = disclosed.length ? s.total / s.count : null;
  const largest = disclosed.reduce<number>((m, a) => Math.max(m, a.amount ?? 0), 0);

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Ontario", path: "/ontario" },
          { name: "Toronto contract awards", path: "/toronto-contracts" },
          { name: s.name, path: `/toronto-contracts/${s.slug}` },
        ])}
      />

      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-14">
          <Link href="/toronto-contracts" className="text-sm text-indigo-100/70 hover:text-white">
            ← All City of Toronto suppliers
          </Link>
          <span className="eyebrow mt-6 flex items-center gap-2 text-teal-300">
            <Trophy className="size-3.5" /> City of Toronto contract awards
          </span>
          <h1 className="mt-3 max-w-4xl text-balance text-3xl font-extrabold tracking-tight text-white sm:text-5xl">{s.name}</h1>
          <p className="mt-4 max-w-2xl text-indigo-100/75">
            {s.count} award{s.count === 1 ? "" : "s"} from the City of Toronto
            {s.first && s.latest && s.first !== s.latest ? `, ${s.first.slice(0, 4)} to ${s.latest.slice(0, 4)}` : ""}
            {s.divisions.length ? `, across ${s.divisions.length} division${s.divisions.length === 1 ? "" : "s"}` : ""}.
          </p>
          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4">
            {[
              ["Awards", String(s.count)],
              ["Total awarded", s.total ? compactDollars(s.total) : "Not disclosed"],
              ["Largest award", largest ? compactDollars(largest) : "—"],
              ["Most recent", day(s.latest)],
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
          <Eyebrow>Award history</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {s.awards.length < s.count ? `The ${s.awards.length} most recent of ${s.count} awards` : `Every award to ${s.name}`}
          </h2>
          <ol className="mt-6 space-y-3">
            {s.awards.map((a, i) => (
              <li key={`${a.doc}-${i}`} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Landmark className="size-3.5" /> {a.division || "City of Toronto"}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {day(a.date)}</span>
                    {a.type && <span>{a.type}{a.doc ? ` ${a.doc}` : ""}</span>}
                    {a.wards > 0 && <span>{a.wards >= 25 ? "City-wide" : `${a.wards} ward${a.wards === 1 ? "" : "s"}`}</span>}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground">{a.description || "No description published."}</p>
                  {a.category && <p className="mt-1 text-xs text-muted-foreground">{a.category}</p>}
                </div>
                <div className={cn("shrink-0 text-right text-lg font-extrabold tracking-tight", a.amount ? "text-indigo" : "text-muted-foreground")}>
                  {a.amount ? money(a.amount) : "Not disclosed"}
                </div>
              </li>
            ))}
          </ol>
          <a
            href={TORONTO_DATASET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline"
          >
            Verify on Toronto Open Data <ExternalLink className="size-3.5" />
          </a>
          <TorontoAttribution className="mt-6" />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {s.divisions.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold">Divisions served</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {s.divisions.map((d) => (
                  <li key={d.name} className="flex justify-between gap-3">
                    <span className="min-w-0">{d.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {d.count}× {d.total ? `· ${compactDollars(d.total)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {average ? <p className="mt-4 text-xs text-muted-foreground">Average award: {compactDollars(average)}</p> : null}
            </div>
          )}

          <div className="rounded-xl bg-indigo p-6 text-white">
            <h2 className="text-lg font-semibold">Bid on the next one</h2>
            <p className="mt-2 text-sm leading-relaxed text-indigo-100/80">
              Open Ontario tenders and property-manager RFPs, filtered to your trade, in one feed.
            </p>
            <Link href="/ontario" className={cn(buttonVariants({ variant: "accent" }), "mt-4 w-full")}>
              Open Ontario RFPs <ArrowRight className="size-4" />
            </Link>
            <Link href={signUpHrefForPlan("pro", "monthly")} className="mt-3 block text-center text-sm text-teal-300 hover:text-teal-200">
              Get alerts with Pro (${PRICING.proMonthly}/mo)
            </Link>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Is this your company?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a free profile so property managers can find you alongside your public contract record.
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
