import type { Metadata } from "next";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { provinceSlug } from "@/lib/data/price-benchmarks";
import { loadIntel, INTEL_PATH } from "@/lib/intel/load";
import { buyerIndex, companyIndex, intelCoverage, marketIndex } from "@/lib/intel/model";
import { loadIntelViewer } from "@/lib/intel/viewer";
import { intelDay } from "@/lib/intel/format";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SimplePage } from "@/components/v3/simple";
import { Facts, H2, IntelCta, IntelNav } from "@/components/intel/views";

type SP = Promise<Record<string, string | undefined>>;

const CHECKOUT = ["success", "unavailable", "error", "org", "portal"] as const;

/** The public face of Award Intelligence: indexed, real coverage numbers, no gated data. */
export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: SP }): Promise<Metadata> {
  const { lang } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).intel.landing;
  const sp = await searchParams;
  return {
    title: { absolute: t.metaTitle },
    description: t.metaDescription,
    alternates: alternatesFor(l, INTEL_PATH),
    // ?country= / ?checkout= views are the same page.
    ...(sp.country || sp.checkout ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function IntelLanding({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const sp = await searchParams;
  const viewer = await loadIntelViewer({ lang, countryParam: sp.country, view: sp.view, next: INTEL_PATH });
  const { ctx, country } = viewer;
  const t = ctx.t;
  const tl = t.landing;
  const L = (p: string) => localizePath(p, lang);
  const num = (x: number) => formatNumber(x, lang);
  const { awards, refs, today } = await loadIntel();
  const cov = intelCoverage(awards, refs, country, today);
  const other = country === "US" ? "CA" : "US";
  const topCompany = companyIndex(awards, country)[0];
  const topBuyer = buyerIndex(awards, refs, country)[0];
  const topMarket = marketIndex(awards, country)[0];
  const checkout = CHECKOUT.find((c) => c === sp.checkout);
  const home = getT("v3Pages").simple.home;
  let no = 0;

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: home, path: L("/") }, { name: t.crumb, path: L(INTEL_PATH) }])} />
      <SimplePage lang={lang} current={null} group="company" crumbs={[]} tabs={false} aside={false} title={tl.h1} lead={tl.lead}>
        <IntelNav ctx={ctx} current="home" />
        {checkout && <div className={checkout === "success" ? "in-ok" : "in-warn"} data-checkout={checkout}>{t.checkout[checkout]}</div>}

        <H2 no={++no} id="coverage">{tl.sec.coverage}</H2>
        {cov.awards > 0 ? (
          <>
            <Facts
              items={[
                { k: tl.stat.awards, v: num(cov.awards) },
                { k: tl.stat.companies3, v: num(cov.companies3) },
                { k: tl.stat.buyers3, v: num(cov.buyers3) },
                { k: tl.stat.markets, v: num(cov.markets) },
              ]}
            />
            <Facts items={[{ k: tl.stat.renewals12, v: num(cov.renewals12), s: `${num(cov.renewals24)} ${tl.stat.renewals24}` }]} />
            {cov.renewalsByTrade.length > 0 && (
              <p className="small" data-list="renewals-by-trade">
                {tl.byTrade}: {cov.renewalsByTrade.map((r) => `${tradeName(r.trade, lang)} (${num(r.items)})`).join(" · ")}
              </p>
            )}
            {cov.historyFrom && <p className="small muted">{fmt(tl.since, { date: intelDay(cov.historyFrom, lang) })}</p>}
          </>
        ) : (
          <div className="s-callout" data-empty="coverage">
            <p>{country === "US" ? tl.us : fmt(t.empty, { country: t.country[country] })}</p>
          </div>
        )}
        <p className="small"><a href={L(`${INTEL_PATH}?country=${other.toLowerCase()}`)}>{fmt(t.otherCountryLink, { country: t.country[other] })} →</a></p>

        <H2 no={++no} id="what">{tl.sec.what}</H2>
        <div className="in-feat">
          {(["companies", "buyers", "renewals", "markets", "csv"] as const).map((k) => (
            <div key={k}>
              <div className="t">{tl.features[k].title}</div>
              <p>{tl.features[k].body}</p>
            </div>
          ))}
        </div>
        {(topCompany || topBuyer || topMarket) && (
          <div className="s-links">
            <span className="small muted">{tl.try}:</span>
            <a href={L("/intel/renewals")}>{t.nav.renewals} →</a>
            {topCompany && <a href={L(`/intel/companies/${topCompany.slug}`)}>{topCompany.name} →</a>}
            {topBuyer && <a href={L(`/intel/buyers/${topBuyer.slug}`)}>{topBuyer.name} →</a>}
            {topMarket && <a href={L(`/intel/markets/${topMarket.tradeSlug}/${provinceSlug(topMarket.province)}`)}>{`${tradeName(topMarket.trade, lang)} · ${regionName(topMarket.province, lang)}`} →</a>}
          </div>
        )}

        <H2 no={++no} id="price">{tl.sec.price}</H2>
        {ctx.cta.launch && <span className="in-tag">{t.cta.launch}</span>}
        <div className="in-plans">
          <div><div className="p">{fmt(t.cta.monthly, { price: ctx.cta.monthly.price })}</div></div>
          <div><div className="p">{fmt(t.cta.annual, { price: ctx.cta.annual.price })}</div><p className="small muted">{t.cta.saving}</p></div>
        </div>
        <p className="in-note">{t.cta.separate}</p>
        <IntelCta ctx={ctx} />

        <H2 no={++no} id="report">{tl.sec.report}</H2>
        <div className="s-callout">
          <p>{tl.reportBody}</p>
          <p><a href={L("/contact?topic=market-report")}>{tl.reportLink} →</a></p>
        </div>

        <H2 no={++no} id="sources">{tl.sec.sources}</H2>
        <div className="s-callout"><p>{tl.sources}</p></div>
        <div className="s-links">
          <a href={L("/contract-winners")}>{getT("gcHub").subs.winners} →</a>
          <a href={L("/benchmarks")}>{getT("benchmarks").crumb} →</a>
          <a href={L("/reports/contract-winners")}>{getT("benchmarks").page.reports} →</a>
        </div>
      </SimplePage>
    </>
  );
}
