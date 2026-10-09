import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import type { MonthlyReport, Tally } from "@/lib/data/monthly-winners";
import { REPORTS_PATH, loadMonthReport, money, monthLabel, pct, shortMoney } from "@/lib/data/monthly-winners-load";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary, type Messages } from "@/i18n/dictionaries";
import { LOCALE_TAG, hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";

export const revalidate = 86400;

type Params = Promise<{ lang: string; month: string }>;

/** Source label → licence text key + licence URL. */
const SOURCES: Record<string, { key: keyof Messages["reports"]["sources"]; licence: string }> = {
  "Federal (CanadaBuys)": { key: "canadabuys", licence: "https://open.canada.ca/en/open-government-licence-canada" },
  "Quebec (SEAO)": { key: "seao", licence: "https://creativecommons.org/licenses/by/4.0/" },
  "City of Toronto": { key: "toronto", licence: "https://open.toronto.ca/open-data-licence/" },
  "Nova Scotia": { key: "ns", licence: "https://novascotia.ca/opendata/licence.asp" },
};

const countryLabel = (r: MonthlyReport, t: Messages["reports"]) => (r.byCountry.some((c) => c.name === "US") ? t.countryBoth : t.countryCa);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, month } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const r = await loadMonthReport(month);
  if (!r) return { robots: { index: false } };
  const t = getDictionary(l).reports;
  const vars = {
    month: monthLabel(month, l),
    country: countryLabel(r, t),
    n: formatNumber(r.totals.awards, l),
    value: shortMoney(r.totals.value, l),
    winners: formatNumber(r.totals.winners, l),
  };
  return {
    title: { absolute: fmt(t.meta.title, vars) },
    description: fmt(t.meta.description, vars),
    alternates: alternatesFor(l, `${REPORTS_PATH}/${month}`),
  };
}

function TallyTable({ rows, head, label, lang }: { rows: Tally[]; head: string; label: (name: string) => React.ReactNode; lang: Locale }) {
  const t = getT("reports").col;
  return (
    <div className="s-dtw">
      <table className="s-dt">
        <thead>
          <tr>
            <th scope="col">{head}</th>
            <th scope="col" className="r">{t.awards}</th>
            <th scope="col" className="r">{t.value}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.name}>
              <td className="nm">{label(x.name)}</td>
              <td className="r">{formatNumber(x.awards, lang)}</td>
              <td className="r">{money(x.value, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MonthlyReportPage({ params }: { params: Params }) {
  const lang = await setLangFrom(params);
  const { month } = await params;
  const r = await loadMonthReport(month);
  if (!r) notFound();

  const t = getT("reports");
  const jurT = getT("partners").report.jurisdictions;
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  const n = (x: number) => formatNumber(x, lang);
  const day = (d: string) => formatDate(`${d}T12:00:00Z`, lang, { month: "short", day: "numeric", year: "numeric" });
  const jur = (j: string) => jurT[j] ?? j;
  const label = monthLabel(month, lang);
  const prevLabel = monthLabel(r.previous.month, lang);
  const country = countryLabel(r, t);
  const base = SITE.url.replace(/\/$/, "");
  const path = L(`${REPORTS_PATH}/${month}`);
  const url = `${base}${path}`;
  const csvUrl = `${base}${REPORTS_PATH}/${month}.csv`;
  const now = new Date();
  const updated = now.toISOString();
  const updatedLabel = now.toLocaleString(LOCALE_TAG[lang], { dateStyle: "long", timeStyle: "short", timeZone: "America/Toronto" });
  const h1 = fmt(t.h1, { country, month: label });
  const winnerCell = (name: string, slug: string | null) => (slug ? <a href={L(`/contract-winners/${slug}`)}>{name}</a> : name);

  // Summary: template sentences filled from the numbers above, nothing else.
  const sentences: string[] = [
    fmt(t.summary.lead, { month: label, n: n(r.totals.awards), value: money(r.totals.value, lang), winners: n(r.totals.winners) }),
  ];
  const undisclosed = r.totals.awards - r.totals.withValue;
  if (undisclosed > 0) sentences.push(fmt(t.summary.undisclosed, { n: n(undisclosed) }));
  const tv = r.topByValue[0];
  if (tv && tv.value > 0) sentences.push(fmt(tv.awards === 1 ? t.summary.topValueOne : t.summary.topValue, { name: tv.name, value: money(tv.value, lang), n: n(tv.awards) }));
  const tc = r.topByCount[0];
  if (tc && tc.awards > 1 && tc.name !== tv?.name) sentences.push(fmt(t.summary.topCount, { name: tc.name, n: n(tc.awards) }));
  const big = r.largest[0];
  if (big?.amount && big.buyer) sentences.push(fmt(t.summary.largest, { value: money(big.amount, lang), name: big.buyer }));
  if (r.change.awards != null)
    sentences.push(
      r.change.awards > 0
        ? fmt(t.summary.upAwards, { pct: pct(r.change.awards, lang), month: prevLabel })
        : r.change.awards < 0
          ? fmt(t.summary.downAwards, { pct: pct(r.change.awards, lang), month: prevLabel })
          : fmt(t.summary.flatAwards, { month: prevLabel }),
    );
  if (r.change.value != null && r.change.value !== 0)
    sentences.push(fmt(r.change.value > 0 ? t.summary.upValue : t.summary.downValue, { pct: pct(r.change.value, lang) }));

  const sources = r.bySource.map((s) => s.name);
  const hasQuebec = sources.includes("Quebec (SEAO)");
  const licences = [...new Set(sources.map((s) => SOURCES[s]?.licence).filter((x): x is string => Boolean(x)))];
  const citation = fmt(t.cite.text, {
    country,
    month: label,
    url,
    date: now.toLocaleDateString(LOCALE_TAG[lang], { month: "long", day: "numeric", year: "numeric", timeZone: "America/Toronto" }),
  });
  const signed = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${pct(v, lang)}`);
  let no = 0;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: t.crumbIndex, path: L(REPORTS_PATH) },
          { name: label, path },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: h1,
          description: sentences[0],
          inLanguage: lang,
          datePublished: `${r.period.to ?? `${month}-28`}`,
          dateModified: updated,
          mainEntityOfPage: url,
          author: { "@type": "Organization", name: SITE.name, url: base },
          publisher: { "@type": "Organization", name: SITE.name, url: base },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: h1,
          description: sentences.join(" "),
          url,
          inLanguage: lang,
          isAccessibleForFree: true,
          creator: { "@type": "Organization", name: SITE.name, url: base },
          dateModified: updated,
          temporalCoverage: `${month}-01/${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`,
          spatialCoverage: r.byCountry.map((c) => ({ "@type": "Place", name: t.country[c.name] ?? c.name })),
          variableMeasured: ["number of contract awards", "disclosed contract value (CAD)", "number of winning companies"],
          keywords: ["public procurement", "contract awards", "building maintenance", "construction", "Canada", label],
          license: licences.length === 1 ? licences[0] : licences,
          isBasedOn: sources.map((s) => (SOURCES[s] ? t.sources[SOURCES[s].key] : s)),
          distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: csvUrl }],
        }}
      />
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: t.crumbIndex, href: REPORTS_PATH }]}
        tabs={false}
        aside={false}
        title={h1}
        lead={t.eyebrow}
      >
        <p className="s-meta"><time dateTime={updated}>{fmt(t.updated, { date: updatedLabel })}</time></p>

        <SH2 no={++no} id="headline">{t.sec.headline}</SH2>
        <div className="s-facts">
          <div><div className="k">{t.stats.awards}</div><div className="v" data-stat="awards">{n(r.totals.awards)}</div></div>
          <div><div className="k">{t.stats.value}</div><div className="v" data-stat="value">{shortMoney(r.totals.value, lang)}</div></div>
          <div><div className="k">{t.stats.winners}</div><div className="v" data-stat="winners">{n(r.totals.winners)}</div></div>
        </div>
        <div className="s-summary">{sentences.map((s) => <p key={s}>{s}</p>)}</div>

        <SH2 no={++no} id="where">{t.sec.where}</SH2>
        <TallyTable rows={r.byCountry} head={t.col.country} label={(c) => t.country[c] ?? c} lang={lang} />
        {r.byRegion.length > 0 && <TallyTable rows={r.byRegion} head={t.col.region} label={(x) => regionName(x, lang)} lang={lang} />}
        <TallyTable rows={r.bySource} head={t.col.source2} label={jur} lang={lang} />

        {r.topByValue.length > 0 && (
          <>
            <SH2 no={++no} id="top-value">{t.sec.topValue}</SH2>
            <WinnerTable rows={r.topByValue} lang={lang} cell={winnerCell} />
          </>
        )}
        {r.topByCount.length > 0 && (
          <>
            <SH2 no={++no} id="top-count">{t.sec.topCount}</SH2>
            <WinnerTable rows={r.topByCount} lang={lang} cell={winnerCell} />
          </>
        )}

        <SH2 no={++no} id="trades">{t.sec.trades}</SH2>
        <TallyTable rows={r.byTrade} head={t.col.trade} label={(x) => tradeName(x, lang)} lang={lang} />

        {r.topBuyers.length > 0 && (
          <>
            <SH2 no={++no} id="buyers">{t.sec.buyers}</SH2>
            <TallyTable rows={r.topBuyers} head={t.col.buyer} label={(x) => x} lang={lang} />
          </>
        )}

        {r.largest.length > 0 && (
          <>
            <SH2 no={++no} id="largest">{t.sec.largest}</SH2>
            <div className="s-dtw">
              <table className="s-dt">
                <thead>
                  <tr>
                    <th scope="col">{t.col.contract}</th>
                    <th scope="col">{t.col.winner}</th>
                    <th scope="col" className="r">{t.col.value}</th>
                    <th scope="col">{t.col.date}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.largest.map((a) => (
                    <tr key={a.slug}>
                      <td>
                        <a href={L(`/rfps/${a.slug}`)}>{a.title}</a>
                        <span className="sub">{[a.buyer, jur(a.jurisdiction)].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="nm">{a.winner ? winnerCell(a.winner, a.winnerSlug) : t.individual}</td>
                      <td className="r">{a.amount ? money(a.amount, lang) : t.notDisclosed}</td>
                      <td>{day(a.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <SH2 no={++no} id="change">{fmt(t.sec.mom, { month: prevLabel })}</SH2>
        {r.previous.awards > 0 ? (
          <div className="s-dtw">
            <table className="s-dt">
              <thead>
                <tr>
                  <th scope="col">{t.col.metric}</th>
                  <th scope="col" className="r">{label}</th>
                  <th scope="col" className="r">{prevLabel}</th>
                  <th scope="col" className="r">{t.col.change}</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="nm">{t.stats.awards}</td><td className="r">{n(r.totals.awards)}</td><td className="r">{n(r.previous.awards)}</td><td className="r">{signed(r.change.awards)}</td></tr>
                <tr><td className="nm">{t.stats.value}</td><td className="r">{money(r.totals.value, lang)}</td><td className="r">{money(r.previous.value, lang)}</td><td className="r">{signed(r.change.value)}</td></tr>
                <tr><td className="nm">{t.stats.winners}</td><td className="r">{n(r.totals.winners)}</td><td className="r">{n(r.previous.winners)}</td><td className="r">—</td></tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p>{fmt(t.noPrev, { month: prevLabel })}</p>
        )}

        {hasQuebec && (
          <>
            <SH2 no={++no} id="quebec">{t.sec.quebec}</SH2>
            <p className="small muted">{t.quebecNone}</p>
          </>
        )}

        <SH2 no={++no} id="methodology">{t.sec.method}</SH2>
        <div className="s-callout">
          <p>{t.method.included}</p>
          <p>{t.method.excluded}</p>
          <p>{t.method.amounts}</p>
          <p>{t.method.names}</p>
        </div>
        <h3 className="s-h2 sm">{t.method.sources}</h3>
        <ul className="s-table">
          {sources.map((s, i) => {
            const src = SOURCES[s];
            return (
              <li key={s}>
                <span className="code" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="nm">{jur(s)}</span>
                  <span className="wt">{src ? t.sources[src.key] : s}</span>
                  {src && <span className="lic"><a href={src.licence} rel="license noopener" target="_blank">{src.licence}</a></span>}
                </span>
              </li>
            );
          })}
        </ul>
        {r.attributions.map((a) => <p key={a} className="small muted">{a}</p>)}
        <p><a href={`${REPORTS_PATH}/${month}.csv`} download>{t.method.csv} ↓</a></p>

        <SH2 no={++no} id="cite">{t.sec.cite}</SH2>
        <div className="s-cite">
          <code>{citation}</code>
          <p><a href={path}>{t.cite.link}</a>: <code>{url}</code></p>
        </div>

        <div className="s-links">
          <a href={L(REPORTS_PATH)}>{t.links.index} →</a>
          <a href={L("/contract-winners")}>{t.links.winners} →</a>
          <a href={L("/reports/public-building-contracts")}>{t.links.allTime} →</a>
        </div>
      </SimplePage>
    </>
  );
}

function WinnerTable({
  rows,
  lang,
  cell,
}: {
  rows: MonthlyReport["topByValue"];
  lang: Locale;
  cell: (name: string, slug: string | null) => React.ReactNode;
}) {
  const t = getT("reports").col;
  return (
    <div className="s-dtw">
      <table className="s-dt">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">{t.winner}</th>
            <th scope="col" className="r">{t.awards}</th>
            <th scope="col" className="r">{t.value}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => (
            <tr key={`${w.name}-${i}`}>
              <td>{i + 1}</td>
              <td className="nm">{cell(w.name, w.slug)}</td>
              <td className="r">{formatNumber(w.awards, lang)}</td>
              <td className="r">{money(w.value, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
