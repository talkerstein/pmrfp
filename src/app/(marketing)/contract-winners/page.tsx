import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { listWinners } from "@/lib/data/winners";
import { compactDollars } from "@/lib/data/fomo";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { cn } from "@/lib/utils";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Who Wins Public Property Contracts in Canada",
  description:
    "The companies winning public building, maintenance and service contracts across Canada — how many, for how much, and from which buyers. Compiled from official award notices.",
  alternates: { canonical: "/contract-winners" },
};

export default async function ContractWinnersPage() {
  const winners = await listWinners();
  const contracts = winners.reduce((s, w) => s + w.awards.length, 0);
  const value = winners.reduce((s, w) => s + w.totalValue, 0);

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Contract winners", path: "/contract-winners" },
        ])}
      />

      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-16">
          <span className="eyebrow flex items-center gap-2 text-teal-300">
            <Trophy className="size-3.5" /> Public award notices · Canada
          </span>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Who wins public property contracts in Canada.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-indigo-100/75">
            The companies that keep winning building, maintenance and service contracts — how often, for how much, and
            from which buyers. Every figure comes from an official award notice.
          </p>
          <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-6">
            {[
              [String(winners.length), "Repeat winners"],
              [contracts.toLocaleString("en-CA"), "Contracts"],
              [value ? compactDollars(value) : "—", "Awarded"],
            ].map(([v, k]) => (
              <div key={k}>
                <dd className="text-3xl font-extrabold text-white sm:text-4xl">{v}</dd>
                <dt className="mt-1 font-mono text-[11px] uppercase tracking-widest text-teal-300">{k}</dt>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container className="py-12">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[1fr_110px_130px_130px] gap-4 border-b border-border bg-secondary/60 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Company</span>
            <span className="text-right">Contracts</span>
            <span className="text-right">Total value</span>
            <span className="text-right">Most recent</span>
          </div>
          <ol>
            {winners.map((w, i) => (
              <li key={w.slug} className="border-b border-border last:border-b-0">
                <Link
                  href={`/contract-winners/${w.slug}`}
                  className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-teal-50/60 md:grid-cols-[1fr_110px_130px_130px]"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-3">
                      <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
                      <span className="truncate font-semibold group-hover:text-teal-700">{w.name}</span>
                    </div>
                    {w.categories.length > 0 && (
                      <p className="mt-0.5 truncate pl-10 text-xs text-muted-foreground">{w.categories.slice(0, 3).join(" · ")}</p>
                    )}
                  </div>
                  <span className="text-right text-sm md:text-base">
                    <span className="font-semibold">{w.awards.length}</span>
                    <span className="text-muted-foreground md:hidden"> contracts</span>
                  </span>
                  <span className="hidden text-right font-semibold text-indigo md:block">{w.totalValue ? compactDollars(w.totalValue) : "—"}</span>
                  <span className="hidden text-right text-sm text-muted-foreground md:block">
                    {w.latest ? new Date(`${w.latest.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", year: "numeric", timeZone: "UTC" }) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl bg-indigo p-8 text-white md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">These companies heard about the work first.</h2>
            <p className="mt-2 text-indigo-100/80">
              Trade Pro emails you the day a tender in your trade posts — full scope, buyer contact, closing date.
            </p>
          </div>
          <Link href={signUpHrefForPlan("pro", "monthly")} className={cn(buttonVariants({ size: "lg", variant: "accent" }), "shrink-0")}>
            Start Trade Pro — ${PRICING.proMonthly}/mo <ArrowRight className="size-4" />
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Only companies with two or more public awards on record are listed. Compiled from award notices published
          under the Open Government Licences of Canada, Toronto and Nova Scotia, and SEAO (Données Québec, CC BY 4.0).
          Listing implies no affiliation with PMRFP.
        </p>
      </Container>
    </>
  );
}
