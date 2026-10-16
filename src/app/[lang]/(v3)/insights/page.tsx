import type { Metadata } from "next";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getSession } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { provinceFirst } from "@/lib/visitor-geo";
import { loadMarketIndex } from "@/lib/insights/load";
import { insightsUi } from "@/lib/insights/ui-copy";
import { fmtFor } from "@/lib/insights/copy";
import { INSIGHTS_PATH, insightsMarketPath } from "@/lib/insights/paths";
import { getT, setLangFrom } from "@/i18n/server";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { regionName, tradeName } from "@/i18n/terms";
import { SimplePage } from "@/components/v3/simple";

type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: SP }): Promise<Metadata> {
  const { lang } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const t = insightsUi(l).market;
  const sp = await searchParams;
  const any = (await loadMarketIndex("CA")).length + (await loadMarketIndex("US")).length;
  return {
    title: { absolute: `${t.indexTitle} | PMRFP` },
    description: t.indexLead,
    alternates: alternatesFor(l, INSIGHTS_PATH),
    // ?country= is the same page sliced; an index with nothing in it stays out.
    ...(any === 0 || sp.country ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Country-first list of the monthly market pages that have enough records to be worth reading. */
export default async function InsightsIndex({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const sp = await searchParams;
  const t = insightsUi(lang).market;
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  const session = isSupabaseConfigured() ? await getSession() : null;
  const visitor = await getVisitorCountry({ param: sp.country, session });
  const country = visitor.country;
  const entries = provinceFirst(await loadMarketIndex(country), visitor.province ?? null, (e) => e.province);
  const other = country === "US" ? "CA" : "US";

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: home, path: L("/") }, { name: t.crumb, path: L(INSIGHTS_PATH) }])} />
      <SimplePage lang={lang} current={null} group="company" crumbs={[]} tabs={false} aside={false} title={t.indexTitle} lead={t.indexLead}>
        <p className="small">
          <a href={L(`${INSIGHTS_PATH}?country=${other}`)}>{fmtFor(lang).place(null, other)} →</a>
        </p>
        {entries.length === 0 ? (
          <div className="s-callout"><p>{t.none}</p></div>
        ) : (
          <ul data-list="markets">
            {entries.map((e) => (
              <li key={`${e.trade.slug}${e.province}`}>
                <a href={L(insightsMarketPath(e.trade.slug, e.province))}>{tradeName(e.trade.name, lang)} · {regionName(e.province, lang)}</a>
                <span className="small muted"> · {t.records(e.records)}</span>
              </li>
            ))}
          </ul>
        )}
      </SimplePage>
    </>
  );
}
