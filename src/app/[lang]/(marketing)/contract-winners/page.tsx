import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, Trophy } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { awardTotals, listWinners } from "@/lib/data/winners";
import { compactDollars } from "@/lib/data/fomo";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).partners.winners.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/contract-winners") };
}

export default async function ContractWinnersPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("partners").winners;
  const crumbs = getT("partners").crumbs;
  const winners = await listWinners();
  const { contracts, value } = awardTotals(winners);

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: crumbs.home, path: localizePath("/", lang) },
          { name: crumbs.winners, path: localizePath("/contract-winners", lang) },
        ])}
      />

      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-16">
          <span className="eyebrow flex items-center gap-2 text-teal-300">
            <Trophy className="size-3.5" /> {t.eyebrow}
          </span>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {t.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-indigo-100/75">
            {t.body}
          </p>
          <Link
            href="/reports/public-building-contracts"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-teal-300 hover:text-teal-200"
          >
            {t.reportLink} <ArrowRight className="size-3.5" />
          </Link>
          <Link
            href="/toronto-contracts"
            className="ml-6 mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-teal-300 hover:text-teal-200"
          >
            City of Toronto awards <ArrowRight className="size-3.5" />
          </Link>
          <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-6">
            {[
              [String(winners.length), t.stats.repeat],
              [formatNumber(contracts, lang), t.stats.contracts],
              [value ? compactDollars(value, lang) : "—", t.stats.awarded],
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
            <span>{t.cols.company}</span>
            <span className="text-right">{t.cols.contracts}</span>
            <span className="text-right">{t.cols.total}</span>
            <span className="text-right">{t.cols.recent}</span>
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
                      <p className="mt-0.5 truncate pl-10 text-xs text-muted-foreground">{w.categories.slice(0, 3).map((c) => tradeName(c, lang)).join(" · ")}</p>
                    )}
                  </div>
                  <span className="text-right text-sm md:text-base">
                    <span className="font-semibold">{w.awards.length}</span>
                    <span className="text-muted-foreground md:hidden">{t.contractsSuffix}</span>
                  </span>
                  <span className="hidden text-right font-semibold text-indigo md:block">{w.totalValue ? compactDollars(w.totalValue, lang) : "—"}</span>
                  <span className="hidden text-right text-sm text-muted-foreground md:block">
                    {w.latest ? formatDate(`${w.latest.slice(0, 10)}T12:00:00Z`, lang, { month: "short", year: "numeric" }) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl bg-indigo p-8 text-white md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t.ctaTitle}</h2>
            <p className="mt-2 text-indigo-100/80">
              {t.ctaBody}
            </p>
          </div>
          <Link href={signUpHrefForPlan("pro", "monthly")} className={cn(buttonVariants({ size: "lg", variant: "accent" }), "shrink-0")}>
            {fmt(t.ctaButton, { price: PRICING.proMonthly })} <ArrowRight className="size-4" />
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          {t.footnote}
        </p>
      </Container>
    </>
  );
}
