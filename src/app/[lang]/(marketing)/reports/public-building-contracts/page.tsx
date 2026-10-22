import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, Download, FileBarChart } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { listRfps } from "@/lib/data/rfps";
import { buildContractsReport } from "@/lib/data/contracts-report";
import { winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { compactDollars } from "@/lib/data/fomo";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_TAG, hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";

export const revalidate = 86400;

const PATH = "/reports/public-building-contracts";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).partners.report.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, PATH) };
}

const NBSP = "\u00a0";
/** "$1,591,087" in English and Spanish (U.S. style), "1 591 087 $" in French. */
const money = (n: number, lang: Locale) =>
  lang === "fr"
    ? `${formatNumber(Math.round(n), lang)}${NBSP}$`
    : lang === "es"
      ? `$${formatNumber(Math.round(n), lang)}`
      : `$${Math.round(n).toLocaleString("en-CA")}`;
/**
 * "$1.36B" — two decimals so the page matches the figures quoted in press pitches. French: "1,36 G$".
 * Spanish: "$1,360 M" (same precision, in millions: "billón" means a million million in Spanish).
 */
const headlineDollars = (n: number, lang: Locale) => {
  if (n < 1e9) return compactDollars(n, lang);
  if (lang === "fr") return `${(n / 1e9).toFixed(2).replace(".", ",")}${NBSP}G$`;
  if (lang === "es") return `$${formatNumber(Math.round(n / 1e7) * 10, lang)}${NBSP}M`;
  return `$${(n / 1e9).toFixed(2)}B`;
};
/** "63.7%" in English and Spanish, "63,7 %" in French. */
const pct = (n: number, lang: Locale) =>
  lang === "fr" ? `${formatNumber(n, lang)}${NBSP}%` : lang === "es" ? `${formatNumber(n, lang)}%` : `${n}%`;
const fmtDate = (d: string | null, lang: Locale) =>
  d ? formatDate(`${d}T12:00:00Z`, lang, { month: "long", year: "numeric" }) : "—";

export default async function ContractsReportPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("partners").report;
  const crumbs = getT("partners").crumbs;
  const num = (n: number) => formatNumber(n, lang);
  const jur = (j: string) => t.jurisdictions[j] ?? j;
  const rfps = await listRfps();
  const r = buildContractsReport(rfps);
  const winnerPage = new Map(winnersFromRfps(rfps).map((w) => [winnerKey(w.name), w.slug]));
  const url = `${SITE.url}${localizePath(PATH, lang)}`;
  const period = fmt(t.period, { from: fmtDate(r.period.from, lang), to: fmtDate(r.period.to, lang) });
  const citation = fmt(t.citation, {
    url,
    date: new Date().toLocaleDateString(LOCALE_TAG[lang], { month: "long", day: "numeric", year: "numeric" }),
  });
  const linkHtml = `<a href="${url}">${t.linkText}</a>`;
  const maxJur = Math.max(1, ...r.jurisdictions.map((j) => j.value));

  const findings = [
    [pct(r.top5pct.share, lang), fmt(t.findings.top5, { n: r.top5pct.count })],
    [pct(r.top10Share, lang), t.findings.top10],
    [num(r.singleWinners), t.findings.single],
    [String(r.multiJurisdiction), t.findings.multi],
  ];

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: crumbs.home, path: localizePath("/", lang) },
          { name: crumbs.winners, path: localizePath("/contract-winners", lang) },
          { name: crumbs.report, path: localizePath(PATH, lang) },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: t.dataset.name,
          description: t.dataset.description,
          url,
          isAccessibleForFree: true,
          creator: { "@type": "Organization", name: SITE.name, url: SITE.url },
          temporalCoverage: r.period.from && r.period.to ? `${r.period.from}/${r.period.to}` : undefined,
          spatialCoverage: "Canada",
          keywords: ["public procurement", "construction contracts", "tenders", "Canada", "contract awards"],
          license: "https://open.canada.ca/en/open-government-licence-canada",
          distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE.url}${PATH}/contracts.csv` }],
        }}
      />

      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-16">
          <span className="eyebrow flex items-center gap-2 text-teal-300">
            <FileBarChart className="size-3.5" /> {t.eyebrow}
          </span>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {t.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-indigo-100/75">
            {fmt(t.lead, {
              contracts: num(r.contracts),
              value: headlineDollars(r.totalValue, lang),
              winners: num(r.winners),
              period,
            })}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`${PATH}/contracts.csv`} className={cn(buttonVariants({ variant: "accent" }), "active:scale-[0.98]")}>
              <Download className="size-4" /> {t.download}
            </a>
            <a href="#cite" className={cn(buttonVariants({ variant: "outline" }), "border-white/25 bg-transparent text-white hover:bg-white/10")}>
              {t.cite}
            </a>
          </div>
        </Container>
      </section>

      <Container className="py-14">
        <h2 className="text-2xl font-bold tracking-tight">{t.findingsTitle}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {findings.map(([big, text]) => (
            <div key={text} className="rounded-2xl border border-border bg-card p-6">
              <div className="font-heading text-4xl font-extrabold tracking-tight text-indigo">{big}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        {r.everywhere.length > 0 && (
          <p className="mt-6 max-w-3xl text-muted-foreground">
            {plural(r.everywhere.length, t.everywhere)}
            {t.everywhere.after}
            {r.everywhere.map((w, i) => (
              <span key={w.name}>
                {i > 0 && ", "}
                <strong className="text-foreground">{w.name}</strong>
                {fmt(t.everywhere.item, { contracts: w.contracts, value: compactDollars(w.value, lang) })}
              </span>
            ))}
            {t.everywhere.end}
          </p>
        )}
      </Container>

      <section className="bg-secondary/40">
        <Container className="grid gap-12 py-14 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t.byJurisdiction}</h2>
            <div className="mt-6 space-y-4">
              {r.jurisdictions.map((j) => (
                <div key={j.jurisdiction}>
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-medium">{jur(j.jurisdiction)}</span>
                    <span className="text-muted-foreground">
                      {fmt(t.jurisdictionLine, { value: compactDollars(j.value, lang), contracts: j.contracts, winners: j.winners })}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 rounded-full bg-border">
                    <div className="h-2.5 rounded-full bg-indigo" style={{ width: `${Math.max(2, (j.value / maxJur) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t.byTrade}</h2>
            <table className="mt-6 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">{t.cols.trade}</th>
                  <th className="pb-2 text-right font-medium">{t.cols.contracts}</th>
                  <th className="pb-2 text-right font-medium">{t.cols.value}</th>
                </tr>
              </thead>
              <tbody>
                {r.byTrade.slice(0, 12).map((row) => (
                  <tr key={row.trade} className="border-b border-border last:border-0">
                    <td className="py-2">{tradeName(row.trade, lang)}</td>
                    <td className="py-2 text-right">{row.contracts}</td>
                    <td className="py-2 text-right">{compactDollars(row.value, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">{t.tradeNote}</p>
          </div>
        </Container>
      </section>

      <Container className="grid gap-12 py-14 lg:grid-cols-2">
        {[
          { title: t.topByValue, rows: r.topByValue },
          { title: t.topByCount, rows: r.topByCount },
        ].map(({ title, rows }) => (
          <div key={title}>
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            <ol className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
              {rows.map((w, i) => {
                const slug = winnerPage.get(winnerKey(w.name!));
                return (
                  <li key={w.key} className="flex items-baseline gap-3 px-5 py-3 text-sm">
                    <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      {slug ? (
                        <Link href={`/contract-winners/${slug}`} className="font-medium hover:text-teal-700 hover:underline">
                          {w.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{w.name}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">{w.jurisdictions.map(jur).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {money(w.value, lang)}
                      <span className="block text-xs text-muted-foreground">{plural(w.contracts, t.contractCount)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </Container>

      <section className="border-t border-border bg-secondary/40">
        <Container size="narrow" className="py-14">
          <h2 className="text-2xl font-bold tracking-tight">{t.methodTitle}</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              {fmt(t.method.sources, { site: SITE.name })}
            </p>
            <p>
              {fmt(t.method.values, {
                withValue: num(r.withValue),
                contracts: num(r.contracts),
                median: r.medianAward ? money(r.medianAward, lang) : "—",
              })}
            </p>
            <p>
              {t.method.licences}
            </p>
          </div>

          <div id="cite" className="mt-10 scroll-mt-24 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">{t.citeTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t.citeNote}</p>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-secondary px-4 py-3 text-xs leading-relaxed">{citation}</pre>
            <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-secondary px-4 py-3 font-mono text-xs">{linkHtml}</pre>
            <p className="mt-3 text-sm text-muted-foreground">
              {t.press}<a href={`mailto:${SITE.email}`} className="text-teal-700 underline">{SITE.email}</a>
            </p>
          </div>
        </Container>
      </section>

      <Container className="flex flex-col items-start justify-between gap-6 py-14 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t.ctaTitle}</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            {fmt(t.ctaBody, { site: SITE.name })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={signUpHrefForPlan("pro", "annual")} className={buttonVariants()}>
            {t.ctaStart} <ArrowRight className="size-4" />
          </Link>
          <Link href="/contract-winners" className={buttonVariants({ variant: "outline" })}>
            {t.ctaAll}
          </Link>
        </div>
      </Container>
    </>
  );
}
