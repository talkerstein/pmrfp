import type { Metadata } from "next";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { buildMonthlyReport, MIN_MONTHLY_AWARDS } from "@/lib/data/monthly-winners";
import { REPORTS_PATH, loadMonthly, money, monthLabel } from "@/lib/data/monthly-winners-load";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { SH2, SimplePage } from "@/components/v3/simple";
import { ByMarket } from "@/components/geo/by-market";

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).reports.index;
  return { title: { absolute: t.metaTitle }, description: t.metaDescription, alternates: alternatesFor(l, REPORTS_PATH) };
}

export default async function MonthlyReportsIndex({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const t = getT("reports");
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  const n = (x: number) => formatNumber(x, lang);
  const { awards, months } = await loadMonthly();
  const rows = months.map(({ month }) => ({ month, r: buildMonthlyReport(awards, month).totals }));
  const base = SITE.url.replace(/\/$/, "");

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: t.crumbReports, path: L("/reports/public-building-contracts") },
          { name: t.crumbIndex, path: L(REPORTS_PATH) },
        ])}
      />
      {rows.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: t.index.title,
            itemListElement: rows.map((x, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${base}${L(`${REPORTS_PATH}/${x.month}`)}`,
              name: monthLabel(x.month, lang),
            })),
          }}
        />
      )}
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: t.crumbReports, href: "/reports/public-building-contracts" }]}
        tabs={false}
        aside={false}
        title={t.index.title}
        lead={t.index.lead}
      >
        <SH2 no={1}>{t.crumbIndex}</SH2>
        {/* Country-first: say plainly that these are Canadian reports to a U.S. visitor. */}
        <ByMarket ca={null} us={<p className="s-note">{t.index.usNote}</p>} />
        {rows.length ? (
          <div className="s-dtw">
            <table className="s-dt">
              <thead>
                <tr>
                  <th scope="col">{t.index.colMonth}</th>
                  <th scope="col" className="r">{t.index.colAwards}</th>
                  <th scope="col" className="r">{t.index.colValue}</th>
                  <th scope="col" className="r">{t.index.colWinners}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ month, r }) => (
                  <tr key={month}>
                    <td className="nm"><a href={L(`${REPORTS_PATH}/${month}`)}>{monthLabel(month, lang)}</a></td>
                    <td className="r">{n(r.awards)}</td>
                    <td className="r">{money(r.value, lang)}</td>
                    <td className="r">{n(r.winners)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{t.index.empty}</p>
        )}
        <p className="small muted">{fmt(t.index.rule, { n: MIN_MONTHLY_AWARDS })}</p>
        <div className="s-links">
          <a href={L("/reports/public-building-contracts")}>{t.index.allTime} →</a>
          <a href={L("/contract-winners")}>{t.links.winners} →</a>
        </div>
      </SimplePage>
    </>
  );
}
