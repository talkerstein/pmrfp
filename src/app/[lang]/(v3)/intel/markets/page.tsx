import type { Metadata } from "next";
import { loadIntel } from "@/lib/intel/load";
import { currencyOfCountry, marketIndex } from "@/lib/intel/model";
import { intelView } from "@/lib/intel/view";
import { loadIntelViewer } from "@/lib/intel/viewer";
import { intelNoindexMeta } from "@/lib/intel/meta";
import { setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SimplePage } from "@/components/v3/simple";
import { IndexBody, IntelNav } from "@/components/intel/views";

type SP = Promise<Record<string, string | undefined>>;
const PATH = "/intel/markets";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  return intelNoindexMeta(l, getDictionary(l).intel.markets.metaTitle, PATH);
}

export default async function IntelMarkets({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const sp = await searchParams;
  const { ctx, intel, country } = await loadIntelViewer({ lang, countryParam: sp.country, view: sp.view, next: PATH });
  const t = ctx.t;
  const { awards } = await loadIntel();
  const rows = marketIndex(awards, country);
  // Teaser: the count and the busiest market's name (trade × place), no numbers per market.
  const view = intelView(rows, intel, (r) => ({
    country,
    total: r.length,
    example: r[0] ? { name: `${tradeName(r[0].trade, lang)} · ${regionName(r[0].province, lang)}`, awards: r[0].awards } : null,
  }));
  return (
    <SimplePage lang={lang} current={null} group="company" crumbs={[{ label: t.crumb, href: "/intel" }]} tabs={false} aside={false} title={t.markets.h1} lead={fmt(t.markets.lead, { country: t.country[country] })}>
      <IntelNav ctx={ctx} current="markets" />
      <IndexBody kind="markets" view={view} ctx={ctx} currency={currencyOfCountry(country)} csvHref={`/api/intel/csv?view=markets&country=${country.toLowerCase()}`} />
    </SimplePage>
  );
}
