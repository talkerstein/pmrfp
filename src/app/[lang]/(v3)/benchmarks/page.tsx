import type { Metadata } from "next";
import { redirect } from "next/navigation";
import "@/components/benchmarks/benchmarks.css";
import { DigestSignupBlock } from "@/components/growth/digest-signup-block";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { CA_PROVINCES, US_STATE_NAMES } from "@/lib/geo";
import { provinceFromSlug, provinceSlug } from "@/lib/data/price-benchmarks";
import { BENCHMARKS_PATH, benchmarkPath, loadBenchmarkData, shortPrice } from "@/lib/data/price-benchmarks-load";
import { getSession } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { parseCountryParam, provinceFirst } from "@/lib/visitor-geo";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";

type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: SP }): Promise<Metadata> {
  const { lang } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).benchmarks.meta;
  const sp = await searchParams;
  const { combos } = await loadBenchmarkData();
  // Indexed once at least one benchmark has a real range; ?country= views are the same page sliced.
  const thin = !combos.some((c) => c.enough) || Boolean(sp.country);
  return {
    title: { absolute: t.indexTitle },
    description: t.indexDescription,
    alternates: alternatesFor(l, BENCHMARKS_PATH),
    ...(thin ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function BenchmarksIndex({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const sp = await searchParams;
  const L = (p: string) => localizePath(p, lang);
  const { combos, categories } = await loadBenchmarkData();

  // The picker is a plain GET form: send it to the benchmark's own URL.
  if (sp.trade && sp.province) {
    const cat = categories.find((c) => c.slug === sp.trade);
    const prov = provinceFromSlug(sp.province);
    if (cat && prov) redirect(L(benchmarkPath(cat.slug, prov)));
  }

  const t = getT("benchmarks");
  const ti = t.index;
  const home = getT("v3Pages").simple.home;
  const n = (x: number) => formatNumber(x, lang);
  const configured = isSupabaseConfigured();
  const session = configured ? await getSession() : null;
  const pro = configured ? Boolean(session?.hasTradeAccess) : sp.view !== "locked";
  // Country-first: one country's benchmarks (?country= views the other), the visitor's province first.
  const visitor = await getVisitorCountry({ param: sp.country, session });
  const country = visitor.country;
  const other = country === "US" ? "CA" : "US";
  const slugOf = new Map(categories.map((c) => [c.name, c.slug]));
  const rows = provinceFirst(
    combos.filter((c) => c.country === country && slugOf.has(c.trade)),
    visitor.province,
    (c) => c.province,
  );
  const places = country === "US" ? US_STATE_NAMES : [...CA_PROVINCES];
  const tradesWithData = new Set(rows.map((c) => c.trade));
  const tradeOptions = categories.filter((c) => tradesWithData.has(c.name));
  const selectedProvince = visitor.province && places.includes(visitor.province) ? provinceSlug(visitor.province) : "";
  const countryHref = (c: "CA" | "US") => L(`${BENCHMARKS_PATH}?country=${c.toLowerCase()}`);
  let no = 0;

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: home, path: L("/") }, { name: t.crumb, path: L(BENCHMARKS_PATH) }])} />
      <SimplePage lang={lang} current={null} group="company" crumbs={[]} tabs={false} aside={false} title={ti.h1} lead={ti.lead}>
        <p className="intro">{ti.intro}</p>

        <SH2 no={++no} id="pick">{ti.sec.pick}</SH2>
        <form method="get" action={L(BENCHMARKS_PATH)} className="g-filter">
          <label className="s-fld">
            <span>{ti.pickTrade}</span>
            <select name="trade" defaultValue="" required>
              <option value="" disabled>{ti.anyTrade}</option>
              {(tradeOptions.length ? tradeOptions : categories).map((c) => (
                <option key={c.slug} value={c.slug}>{tradeName(c.name, lang)}</option>
              ))}
            </select>
          </label>
          <label className="s-fld">
            <span>{ti.pickProvince}</span>
            <select name="province" defaultValue={selectedProvince} required>
              <option value="" disabled>{ti.anyProvince}</option>
              {places.map((p) => (
                <option key={p} value={provinceSlug(p)}>{regionName(p, lang)}</option>
              ))}
            </select>
          </label>
          {parseCountryParam(sp.country) && <input type="hidden" name="country" value={country.toLowerCase()} />}
          <button type="submit">{ti.go}</button>
        </form>

        <SH2 no={++no} id="table">{ti.sec.table}</SH2>
        {rows.length ? (
          <div className="s-dtw">
            <table className="s-dt" data-list="benchmarks">
              <thead>
                <tr>
                  <th scope="col">{ti.colTrade}</th>
                  <th scope="col">{ti.colProvince}</th>
                  <th scope="col" className="r">{ti.colAwards}</th>
                  <th scope="col" className="r">{ti.colMedian}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={`${c.trade}|${c.province}`}>
                    <td className="nm"><a href={L(benchmarkPath(slugOf.get(c.trade)!, c.province))}>{tradeName(c.trade, lang)}</a></td>
                    <td>{regionName(c.province, lang)}</td>
                    <td className="r">{n(c.valued)}</td>
                    <td className="r">
                      {!c.enough ? (
                        <span className="bm-muted">{ti.notEnough}</span>
                      ) : pro && c.median !== null ? (
                        shortPrice(c.median, c.currency, lang)
                      ) : (
                        <span className="bm-muted">{ti.ready} · {ti.locked}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="s-callout" data-empty="benchmarks"><p>{fmt(ti.none, { country: t.country[country] })}</p></div>
        )}
        <p className="small"><a href={countryHref(other)}>{fmt(ti.other, { country: t.country[other] })} →</a></p>

        <SH2 no={++no} id="how">{ti.sec.how}</SH2>
        <div className="s-callout">
          <p>{ti.howBody}</p>
          <p>{t.method.stats}</p>
          <p>{t.method.caveat}</p>
        </div>

        <DigestSignupBlock source="benchmarks" />

        <div className="s-links">
          <a href={L("/gc-hub")}>{t.page.gcHub} →</a>
          <a href={L("/contract-winners")}>{getT("gcHub").subs.winners} →</a>
          <a href={L("/reports/contract-winners")}>{t.page.reports} →</a>
        </div>
      </SimplePage>
    </>
  );
}
