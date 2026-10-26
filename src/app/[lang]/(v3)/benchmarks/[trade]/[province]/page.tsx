import { gateKit } from "@/components/trial/gate-kit";
import type { Metadata } from "next";
import { RecordFooter } from "@/components/public/record-footer";
import { BidAlertBox } from "@/components/growth/bid-alert-box";
import { localizeCredits } from "@/lib/data-credits";
import { notFound } from "next/navigation";
import "@/components/benchmarks/benchmarks.css";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { SITE, PRICING } from "@/lib/site";
import { JURISDICTION } from "@/lib/data/contracts-report";
import { AWARD_LICENCES } from "@/lib/gc/official";
import { MIN_USABLE_AMOUNT, benchmarkView, type BenchmarkAward, type BenchmarkRow, type CityCount, type Currency } from "@/lib/data/price-benchmarks";
import { BENCHMARKS_PATH, benchmarkPath, loadBenchmark, loadBenchmarkData, loadCityBenchmark, priceLabel, shortPrice } from "@/lib/data/price-benchmarks-load";
import { getSession } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { upgradeInterval } from "@/lib/billing/checkout-flow";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary, type Messages } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";
import { SponsorSlot } from "@/components/sponsors/sponsor-slot";
import { FreeGate } from "@/components/growth/free-gate";
import { gateBenchmarkView } from "@/lib/growth/gate";

type Params = Promise<{ lang: string; trade: string; province: string }>;
type SP = Promise<Record<string, string | undefined>>;

/** Award feed key → licence line key in the reports namespace. */
const SOURCE_TEXT: Record<string, keyof Messages["reports"]["sources"]> = {
  awards: "canadabuys",
  seao: "seao",
  "toronto-awards": "toronto",
  "ns-awards": "ns",
};

const day = (d: string, lang: Locale) => formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "short", day: "numeric", year: "numeric" });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, trade, province } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const r = await loadBenchmark(trade, province);
  if (!r) return { robots: { index: false } };
  const t = getDictionary(l).benchmarks.meta;
  const b = r.benchmark;
  const vars = { trade: tradeName(r.category.name, l), province: regionName(r.province, l), n: formatNumber(b.total, l) };
  return {
    title: { absolute: fmt(t.title, vars) },
    description: fmt(t.description, vars),
    alternates: alternatesFor(l, benchmarkPath(r.category.slug, r.province)),
    // Indexed only with a real range behind it (5+ valued awards); thinner pages stay out.
    ...(b.enough ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function BenchmarkPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const { trade: tradeSlug, province: provSlug } = await params;
  const sp = await searchParams;
  const r = await loadBenchmark(tradeSlug, provSlug);
  if (!r) notFound();

  const t = getT("benchmarks");
  const tp = t.page;
  const home = getT("v3Pages").simple.home;
  const jurT = getT("partners").report.jurisdictions;
  const srcT = getT("reports").sources;
  const L = (p: string) => localizePath(p, lang);
  const n = (x: number) => formatNumber(x, lang);
  const b = r.benchmark;
  const price = (x: number) => priceLabel(x, b.currency, lang);
  const trade = tradeName(r.category.name, lang);
  const province = regionName(r.province, lang);
  const countryName = t.country[b.country];

  // Trade Pro sees the numbers. Demo mode (no Supabase) shows them unless ?view=locked / ?view=signed-out.
  const configured = isSupabaseConfigured();
  const session = configured ? await getSession() : null;
  const pro = configured ? Boolean(session?.hasTradeAccess) : sp.view !== "locked" && sp.view !== "signed-out";
  // Free-account gate: signed out (crawlers too) = summary only; the gated lists are not in the data.
  const signedIn = configured ? Boolean(session) : sp.view !== "signed-out";
  const view = gateBenchmarkView(benchmarkView(b, pro), signedIn);
  const askInterval = upgradeInterval(Boolean(process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY));
  const upgradeHref = session ? `/dashboard/billing?plan=pro&interval=${askInterval}` : signUpHrefForPlan("pro", askInterval);
  // Trial-first: an eligible company starts its free trial in one click and comes back here unlocked.
  const gate = await gateKit(session, { returnPath: benchmarkPath(r.category.slug, r.province), paidHref: upgradeHref });

  const path = L(benchmarkPath(r.category.slug, r.province));
  const base = SITE.url.replace(/\/$/, "");
  const url = `${base}${path}`;
  const vars = { trade, province, from: day(b.from, lang), to: day(b.to, lang) };
  const stats = view.pro ? view.data.stats : null;

  // Summary: template sentences filled from the numbers, nothing else.
  const sentences = [fmt(tp.summaryLead, { ...vars, total: n(b.total), valued: n(b.valued) })];
  if (b.undisclosed > 0) sentences.push(fmt(tp.summaryUndisclosed, { n: n(b.undisclosed) }));
  if (stats) sentences.push(fmt(tp.summaryRange, { p25: price(stats.p25), p75: price(stats.p75), median: price(stats.median) }));
  if (view.pro && view.data.outliers > 0) sentences.push(plural(view.data.outliers, tp.summaryOutliers, { n: n(view.data.outliers) }));

  // Cross-links: other trades here, this trade elsewhere in the same country (never across the border).
  const { combos, categories } = await loadBenchmarkData();
  const slugOf = new Map(categories.map((c) => [c.name, c.slug]));
  const otherTrades = combos.filter((c) => c.province === r.province && c.trade !== r.category.name && c.total > 0 && slugOf.has(c.trade)).slice(0, 10);
  const otherPlaces = combos.filter((c) => c.trade === r.category.name && c.province !== r.province && c.country === b.country && c.total > 0).slice(0, 10);

  const sourceKeys = b.sourceKeys;
  const licences = [...new Set(sourceKeys.map((k) => AWARD_LICENCES[k]).filter((x): x is string => Boolean(x)))];
  const csvHref = `/api/benchmarks/csv?trade=${encodeURIComponent(r.category.slug)}&province=${encodeURIComponent(provSlug)}`;
  let no = 0;

  const awardRow = (a: BenchmarkAward | BenchmarkRow, showOutlier: boolean) => (
    <tr key={a.slug}>
      <td>
        <a href={L(`/rfps/${a.slug}`)}>{a.title}</a>
        <span className="sub">{[a.buyer, a.city ? regionName(a.city, lang) : null].filter(Boolean).join(" · ")}</span>
      </td>
      <td className="nm">{a.winner ? (a.winnerSlug ? <a href={L(`/contract-winners/${a.winnerSlug}`)}>{a.winner}</a> : a.winner) : <span className="bm-muted">{tp.individual}</span>}</td>
      <td className="r">
        {a.amount !== null ? price(a.amount) : <span className="bm-muted">{tp.notDisclosed}</span>}
        {showOutlier && "outlier" in a && a.outlier && <span className="bm-flag">{tp.outlier}</span>}
      </td>
      <td>{day(a.date, lang)}</td>
      <td>{a.noticeUrl ? <a className="ext" href={a.noticeUrl} target="_blank" rel="noopener noreferrer">{a.noticeExact ? tp.official : tp.portal}</a> : "—"}</td>
    </tr>
  );
  const awardHead = (
    <thead>
      <tr>
        <th scope="col">{tp.col.contract}</th>
        <th scope="col">{tp.col.winner}</th>
        <th scope="col" className="r">{tp.col.value}</th>
        <th scope="col">{tp.col.date}</th>
        <th scope="col">{tp.col.notice}</th>
      </tr>
    </thead>
  );
  const locked = (
    <div className="bm-lock" data-locked="range">
      <div className="hd">{tp.lockedTitle}</div>
      <div className="blur" aria-hidden><span /><span /><span /></div>
      <p>{fmt(tp.lockedBody, { n: n(b.valued), trade, province })}</p>
      <div className="acts">
        {gate.btn("benchmark", tp.lockedCta, "btn mint lg", { plansClassName: "lnk" })}
        <span className="small muted">{fmt(tp.lockedNote, { price: PRICING.proMonthly })}</span>
      </div>
    </div>
  );

  // Range bar on a log scale between the lowest and highest award.
  const bar = stats && stats.max > stats.min
    ? (() => {
        const lo = Math.log10(stats.min);
        const span = Math.log10(stats.max) - lo;
        const pos = (v: number) => `${(((Math.log10(v) - lo) / span) * 100).toFixed(2)}%`;
        return (
          <div className="bm-bar" aria-hidden>
            <div className="track">
              <span className="box" style={{ left: pos(stats.p25), right: `calc(100% - ${pos(stats.p75)})` }} />
              <span className="med" style={{ left: pos(stats.median) }} />
            </div>
            <div className="ends"><span>{shortPrice(stats.min, b.currency, lang)}</span><span>{shortPrice(stats.max, b.currency, lang)}</span></div>
          </div>
        );
      })()
    : null;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: t.crumb, path: L(BENCHMARKS_PATH) },
          { name: `${trade} · ${province}`, path },
        ])}
      />
      {b.enough && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: fmt(getDictionary(lang).benchmarks.meta.title, { trade, province }),
            // Counts only: the prices are Trade Pro data and never go into markup.
            description: sentences[0],
            url,
            inLanguage: lang,
            isAccessibleForFree: false,
            creator: { "@type": "Organization", name: SITE.name, url: base },
            temporalCoverage: `${b.from}/${b.to}`,
            spatialCoverage: { "@type": "Place", name: `${province}, ${countryName}` },
            variableMeasured: [`contract award value (${b.currency})`, "number of contract awards", "25th, 50th and 75th percentile award value"],
            keywords: ["public procurement", "contract awards", "price benchmark", r.category.name, r.province, b.country === "US" ? "United States" : "Canada"],
            license: licences.length === 1 ? licences[0] : licences,
            isBasedOn: sourceKeys.map((k) => (SOURCE_TEXT[k] ? srcT[SOURCE_TEXT[k]] : k)),
          }}
        />
      )}
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: t.crumb, href: BENCHMARKS_PATH }]}
        tabs={false}
        aside={false}
        title={fmt(tp.h1, { trade, province })}
        lead={fmt(tp.lead, { trade, province })}
      >
        <div className="s-facts">
          <div><div className="k">{tp.stats.awards}</div><div className="v" data-stat="valued">{n(b.valued)}</div></div>
          <div>
            <div className="k">{stats ? tp.stats.range : tp.stats.total}</div>
            <div className="v" data-stat={stats ? "range" : "total"}>{stats ? `${shortPrice(stats.p25, b.currency, lang)} – ${shortPrice(stats.p75, b.currency, lang)}` : n(b.total)}</div>
          </div>
          <div><div className="k">{stats ? tp.stats.median : tp.stats.period}</div><div className="v">{stats ? shortPrice(stats.median, b.currency, lang) : `${formatDate(`${b.from}T12:00:00Z`, lang, { month: "short", year: "numeric" })} – ${formatDate(`${b.to}T12:00:00Z`, lang, { month: "short", year: "numeric" })}`}</div></div>
        </div>
        <div className="s-summary">{sentences.map((s) => <p key={s}>{s}</p>)}</div>
        {!b.enough && <div className="s-callout" data-empty="range"><p>{b.total ? fmt(tp.notEnough, { n: n(b.valued) }) : fmt(tp.noAwards, { trade, province })}</p></div>}

        {b.enough && (
          <>
            <SH2 no={++no} id="range">{tp.sec.range}</SH2>
            {stats ? (
              <>
                {bar}
                <div className="s-dtw">
                  <table className="s-dt" data-table="stats">
                    <thead><tr><th scope="col">{tp.col.stat}</th><th scope="col" className="r">{tp.col.value}</th></tr></thead>
                    <tbody>
                      <tr><td className="nm">{tp.stat.min}</td><td className="r">{price(stats.min)}</td></tr>
                      <tr><td className="nm">{tp.stat.p25}</td><td className="r">{price(stats.p25)}</td></tr>
                      <tr><td className="nm">{tp.stat.median}</td><td className="r">{price(stats.median)}</td></tr>
                      <tr><td className="nm">{tp.stat.p75}</td><td className="r">{price(stats.p75)}</td></tr>
                      <tr><td className="nm">{tp.stat.max}</td><td className="r">{price(stats.max)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              locked
            )}
          </>
        )}

        {view.gated && b.total > 0 && <FreeGate kind="benchmark" path={benchmarkPath(r.category.slug, r.province)} />}

        {b.total > 0 && !view.gated && (
          <>
            <SH2 no={++no} id="awards">{view.pro ? tp.sec.awards : tp.sec.examples}</SH2>
            <div className="s-dtw">
              <table className="s-dt bm-wide" data-list="awards">
                {awardHead}
                <tbody>{view.pro ? view.data.awards.map((a) => awardRow(a, true)) : view.data.examples.map((a) => awardRow(a, false))}</tbody>
              </table>
            </div>
            {view.pro ? (
              <p className="small"><a href={csvHref} download>{tp.csv} ↓</a></p>
            ) : (
              b.total > view.data.examples.length && <p className="small muted">{plural(b.total, tp.examplesNote, { shown: n(view.data.examples.length), n: n(b.total) })}</p>
            )}
          </>
        )}

        {view.data.topBuyers.length > 0 && (
          <>
            <SH2 no={++no} id="buyers">{tp.sec.buyers}</SH2>
            <div className="s-dtw">
              <table className="s-dt" data-list="buyers">
                <thead>
                  <tr>
                    <th scope="col">{tp.col.buyer}</th>
                    <th scope="col" className="r">{tp.col.awards}</th>
                    {view.pro && <th scope="col" className="r">{tp.col.total}</th>}
                  </tr>
                </thead>
                <tbody>
                  {view.pro
                    ? view.data.topBuyers.map((x) => (
                        <tr key={x.name}>
                          <td className="nm">{x.name}</td>
                          <td className="r">{n(x.awards)}</td>
                          <td className="r">{price(x.value)}</td>
                        </tr>
                      ))
                    : view.data.topBuyers.map((x) => (
                        <tr key={x.name}>
                          <td className="nm">{x.name}</td>
                          <td className="r">{n(x.awards)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {b.total > 0 && !view.gated && (
          <>
            <SH2 no={++no} id="winners">{tp.sec.winners}</SH2>
            {view.pro ? (
              view.data.topWinners.length > 0 ? (
                <div className="s-dtw">
                  <table className="s-dt" data-list="winners">
                    <thead><tr><th scope="col">#</th><th scope="col">{tp.col.winner}</th><th scope="col" className="r">{tp.col.awards}</th><th scope="col" className="r">{tp.col.total}</th></tr></thead>
                    <tbody>
                      {view.data.topWinners.map((w, i) => (
                        <tr key={w.name}>
                          <td>{i + 1}</td>
                          <td className="nm">{w.slug ? <a href={L(`/contract-winners/${w.slug}`)}>{w.name}</a> : w.name}</td>
                          <td className="r">{n(w.awards)}</td>
                          <td className="r">{price(w.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null
            ) : (
              <div className="s-callout" data-locked="winners"><p>{tp.winnersLocked}</p><p>{gate.btn("benchmark", tp.lockedCta + " →", "btn mint", { plansClassName: "lnk" })}</p></div>
            )}
          </>
        )}

        {view.data.cities.length > 0 && (
          <>
            <SH2 no={++no} id="cities">{tp.sec.cities}</SH2>
            <CityTable trade={r.category.name} province={r.province} cities={view.data.cities} pro={view.pro} currency={b.currency} lang={lang} labels={tp} />
            <p className="small muted">{tp.citiesNote}</p>
          </>
        )}

        {!view.gated && (
          <>
            <SH2 no={++no} id="methodology">{tp.sec.method}</SH2>
            <div className="s-callout">
              <p>{fmt(t.method.window, vars)}</p>
              <p>{fmt(t.method.included, vars)}</p>
              <p>{fmt(t.method.excluded, { min: priceLabel(MIN_USABLE_AMOUNT, b.currency, lang) })}</p>
              <p>{t.method.stats}</p>
              <p>{t.method.caveat}</p>
              <p>{t.method.names}</p>
            </div>
          </>
        )}
        {sourceKeys.length > 0 && (
          <>
            <h3 className="s-h2 sm">{tp.sec.sources}</h3>
            <ul className="s-table">
              {sourceKeys.map((k, i) => (
                <li key={k}>
                  <span className="code" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <span className="nm">{jurT[JURISDICTION[k] ?? k] ?? JURISDICTION[k] ?? k}</span>
                    {SOURCE_TEXT[k] && <span className="wt">{srcT[SOURCE_TEXT[k]]}</span>}
                    {AWARD_LICENCES[k] && <span className="lic"><a href={AWARD_LICENCES[k]} rel="license noopener" target="_blank">{AWARD_LICENCES[k]}</a></span>}
                  </span>
                </li>
              ))}
            </ul>
            {localizeCredits(b.attributions, lang).map((a) => <p key={a} className="small muted">{a}</p>)}
          </>
        )}
        <BidAlertBox source="benchmark" province={r.province} trades={[r.category.slug]} signedIn={Boolean(session)} />
        <RecordFooter credits={[]} lang={lang} kind="benchmark" path={`/benchmarks/${tradeSlug}/${provSlug}`} className="mt-2" />

        {(otherTrades.length > 0 || otherPlaces.length > 0) && (
          <>
            <SH2 no={++no} id="more">{tp.sec.more}</SH2>
            {otherTrades.length > 0 && (
              <>
                <h3 className="s-h2 sm">{fmt(tp.otherTrades, { province })}</h3>
                <div className="bm-links">
                  {otherTrades.map((c) => <a key={c.trade} href={L(benchmarkPath(slugOf.get(c.trade)!, c.province))}>{`${tradeName(c.trade, lang)} (${n(c.valued)})`}</a>)}
                </div>
              </>
            )}
            {otherPlaces.length > 0 && (
              <>
                <h3 className="s-h2 sm">{fmt(tp.otherPlaces, { trade, country: countryName })}</h3>
                <div className="bm-links">
                  {otherPlaces.map((c) => <a key={c.province} href={L(benchmarkPath(r.category.slug, c.province))}>{`${regionName(c.province, lang)} (${n(c.valued)})`}</a>)}
                </div>
              </>
            )}
          </>
        )}

        {/* The trade × province sponsor (lib/sponsors), below the content, labelled "Sponsored". */}
        <SponsorSlot
          className="mt-8 max-w-md"
          ctx={{ placement: "benchmark", market: b.country, province: r.province, categories: [r.category.slug], seed: `${r.category.slug}|${r.province}` }}
        />

        <div className="s-links">
          <a href={L(BENCHMARKS_PATH)}>{tp.index} →</a>
          <a href={L(`/gc-hub?trade=${r.category.slug}`)}>{tp.gcHub} →</a>
          <a href={L("/reports/contract-winners")}>{tp.reports} →</a>
        </div>
      </SimplePage>
    </>
  );
}

/** Per-city sub-benchmarks (a city needs 5 valued awards of its own for a range). */
async function CityTable({
  trade,
  province,
  cities,
  pro,
  currency,
  lang,
  labels,
}: {
  trade: string;
  province: string;
  cities: CityCount[];
  pro: boolean;
  currency: Currency;
  lang: Locale;
  labels: Messages["benchmarks"]["page"];
}) {
  // City numbers are computed only for Pro viewers; free viewers get counts.
  const rows = await Promise.all(
    cities.slice(0, 10).map(async (c) => ({ ...c, stats: pro && c.enough ? (await loadCityBenchmark(trade, province, c.city)).stats : null })),
  );
  const t = getT("benchmarks").index;
  return (
    <div className="s-dtw">
      <table className="s-dt" data-list="cities">
        <thead>
          <tr>
            <th scope="col">{labels.col.city}</th>
            <th scope="col" className="r">{t.colAwards}</th>
            <th scope="col" className="r">{labels.stats.range}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.city}>
              <td className="nm">{regionName(c.city, lang)}</td>
              <td className="r">{formatNumber(c.valued, lang)}</td>
              <td className="r">
                {c.stats
                  ? `${shortPrice(c.stats.p25, currency, lang)} – ${shortPrice(c.stats.p75, currency, lang)}`
                  : c.enough
                    ? <span className="bm-muted">{t.locked}</span>
                    : <span className="bm-muted">{t.notEnough}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
