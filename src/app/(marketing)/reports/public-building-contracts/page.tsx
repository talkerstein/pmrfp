import type { Metadata } from "next";
import Link from "next/link";
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

export const revalidate = 3600;

const PATH = "/reports/public-building-contracts";

export const metadata: Metadata = {
  title: "Who Wins Public Building Contracts in Canada: Data Report",
  description:
    "A year of public building and property contracts in Canada: how many, for how much, and how concentrated. Compiled from official award notices (CanadaBuys, Quebec SEAO, City of Toronto, Nova Scotia). Updated daily, free to cite.",
  alternates: { canonical: PATH },
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;
/** "$1.36B" — two decimals so the page matches the figures quoted in press pitches. */
const headlineDollars = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : compactDollars(n));
const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }) : "—";

export default async function ContractsReportPage() {
  const rfps = await listRfps();
  const r = buildContractsReport(rfps);
  const winnerPage = new Map(winnersFromRfps(rfps).map((w) => [winnerKey(w.name), w.slug]));
  const url = `${SITE.url}${PATH}`;
  const period = `${fmtDate(r.period.from)} to ${fmtDate(r.period.to)}`;
  const citation = `PMRFP, "Who wins public building contracts in Canada" (${url}), compiled from official award notices, accessed ${new Date().toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}.`;
  const linkHtml = `<a href="${url}">Public building contracts in Canada (PMRFP data)</a>`;
  const maxJur = Math.max(1, ...r.jurisdictions.map((j) => j.value));

  const findings = [
    [`${r.top5pct.share}%`, `of the dollars went to the top 5% of winners (${r.top5pct.count} companies).`],
    [`${r.top10Share}%`, "went to just ten companies."],
    [r.singleWinners.toLocaleString("en-CA"), `companies won exactly one contract. The door is wider than it looks.`],
    [String(r.multiJurisdiction), `companies won in more than one jurisdiction.`],
  ];

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Contract winners", path: "/contract-winners" },
          { name: "Report", path: PATH },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "Public building and property contracts in Canada",
          description:
            "Award notices for public building, maintenance and property-service contracts in Canada (federal CanadaBuys, Quebec SEAO, City of Toronto, Nova Scotia): contract, winning company, published value, date and trade. Compiled and updated daily by PMRFP from official open data.",
          url,
          isAccessibleForFree: true,
          creator: { "@type": "Organization", name: SITE.name, url: SITE.url },
          temporalCoverage: r.period.from && r.period.to ? `${r.period.from}/${r.period.to}` : undefined,
          spatialCoverage: "Canada",
          keywords: ["public procurement", "construction contracts", "tenders", "Canada", "contract awards"],
          license: "https://open.canada.ca/en/open-government-licence-canada",
          distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${url}/contracts.csv` }],
        }}
      />

      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-16">
          <span className="eyebrow flex items-center gap-2 text-teal-300">
            <FileBarChart className="size-3.5" /> Data report · updated daily
          </span>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Who wins public building contracts in Canada.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-indigo-100/75">
            {r.contracts.toLocaleString("en-CA")} awarded contracts for building, maintenance and property services,{" "}
            {headlineDollars(r.totalValue)} in published value, {r.winners.toLocaleString("en-CA")} different winners. {period}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`${PATH}/contracts.csv`} className={cn(buttonVariants({ variant: "accent" }), "active:scale-[0.98]")}>
              <Download className="size-4" /> Download the data (CSV)
            </a>
            <a href="#cite" className={cn(buttonVariants({ variant: "outline" }), "border-white/25 bg-transparent text-white hover:bg-white/10")}>
              Cite this report
            </a>
          </div>
        </Container>
      </section>

      <Container className="py-14">
        <h2 className="text-2xl font-bold tracking-tight">Key findings</h2>
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
            {r.everywhere.length === 1 ? "Only one company" : `Only ${r.everywhere.length} companies`} won contracts in every
            jurisdiction:{" "}
            {r.everywhere.map((w, i) => (
              <span key={w.name}>
                {i > 0 && ", "}
                <strong className="text-foreground">{w.name}</strong> ({w.contracts} contracts, {compactDollars(w.value)})
              </span>
            ))}
            .
          </p>
        )}
      </Container>

      <section className="bg-secondary/40">
        <Container className="grid gap-12 py-14 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">By jurisdiction</h2>
            <div className="mt-6 space-y-4">
              {r.jurisdictions.map((j) => (
                <div key={j.jurisdiction}>
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-medium">{j.jurisdiction}</span>
                    <span className="text-muted-foreground">
                      {compactDollars(j.value)} · {j.contracts} contracts · {j.winners} winners
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
            <h2 className="text-2xl font-bold tracking-tight">By trade</h2>
            <table className="mt-6 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Trade</th>
                  <th className="pb-2 text-right font-medium">Contracts</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {r.byTrade.slice(0, 12).map((t) => (
                  <tr key={t.trade} className="border-b border-border last:border-0">
                    <td className="py-2">{t.trade}</td>
                    <td className="py-2 text-right">{t.contracts}</td>
                    <td className="py-2 text-right">{compactDollars(t.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">A contract can count toward more than one trade.</p>
          </div>
        </Container>
      </section>

      <Container className="grid gap-12 py-14 lg:grid-cols-2">
        {[
          { title: "Largest winners by value", rows: r.topByValue },
          { title: "Most contracts won", rows: r.topByCount },
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
                      <span className="block text-xs text-muted-foreground">{w.jurisdictions.join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {money(w.value)}
                      <span className="block text-xs text-muted-foreground">{w.contracts} contract{w.contracts === 1 ? "" : "s"}</span>
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
          <h2 className="text-2xl font-bold tracking-tight">Methodology</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Sources: award notices published as open data by the Government of Canada (CanadaBuys), Quebec&apos;s SEAO, the City
              of Toronto and the Province of Nova Scotia, collected daily by {SITE.name}. Only contracts for building, maintenance
              and property services are included (construction and renovation, roofing, HVAC, electrical, plumbing, snow and
              grounds, janitorial, waste and similar trades), so this is the building-and-property slice of public procurement, not
              all of it.
            </p>
            <p>
              Dollar figures use each notice&apos;s published award value; {r.withValue.toLocaleString("en-CA")} of{" "}
              {r.contracts.toLocaleString("en-CA")} notices publish one. Winners are grouped across spelling and legal-suffix
              variants (&quot;Co. Ltd.&quot;, &quot;Company Limited&quot;). Individuals are counted in the totals but never named.
              The median published award is {r.medianAward ? money(r.medianAward) : "—"}.
            </p>
            <p>
              Licences: Open Government Licence – Canada, Open Government Licence – Toronto, Open Government Licence – Nova
              Scotia, and SEAO data under CC BY 4.0 (Secrétariat du Conseil du trésor du Québec, Données Québec).
            </p>
          </div>

          <div id="cite" className="mt-10 scroll-mt-24 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Cite this report</h2>
            <p className="mt-2 text-sm text-muted-foreground">Free to use with attribution. Please link to this page.</p>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-secondary px-4 py-3 text-xs leading-relaxed">{citation}</pre>
            <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-secondary px-4 py-3 font-mono text-xs">{linkHtml}</pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Press questions or a custom cut of the data: <a href={`mailto:${SITE.email}`} className="text-teal-700 underline">{SITE.email}</a>
            </p>
          </div>
        </Container>
      </section>

      <Container className="flex flex-col items-start justify-between gap-6 py-14 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Want to be on the winning side?</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Every open tender behind these numbers is on the {SITE.name} board. Trade Pro emails you the morning a matching one posts.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={signUpHrefForPlan("pro", "annual")} className={buttonVariants()}>
            Start Trade Pro <ArrowRight className="size-4" />
          </Link>
          <Link href="/contract-winners" className={buttonVariants({ variant: "outline" })}>
            All contract winners
          </Link>
        </div>
      </Container>
    </>
  );
}
