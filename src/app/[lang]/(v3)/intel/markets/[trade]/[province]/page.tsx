import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { provinceFromSlug } from "@/lib/data/price-benchmarks";
import { loadIntel, intelMarketPath } from "@/lib/intel/load";
import { marketShare } from "@/lib/intel/model";
import { intelView, marketTeaser } from "@/lib/intel/view";
import { loadIntelViewer } from "@/lib/intel/viewer";
import { intelNoindexMeta } from "@/lib/intel/meta";
import { setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SimplePage } from "@/components/v3/simple";
import { IntelNav, MarketBody } from "@/components/intel/views";

type Params = Promise<{ lang: string; trade: string; province: string }>;
type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, trade, province } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const { categories } = await loadIntel();
  const prov = provinceFromSlug(province);
  const name = categories.find((c) => c.slug === trade)?.name ?? trade;
  return intelNoindexMeta(l, fmt(getDictionary(l).intel.market.metaTitle, { trade: tradeName(name, l), province: prov ? regionName(prov, l) : province }), intelMarketPath(trade, province));
}

/** Market share for one trade in one province/state. The place fixes the country (and currency). */
export default async function IntelMarket({ params, searchParams }: { params: Params; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const { trade, province: provSlug } = await params;
  const sp = await searchParams;
  const province = provinceFromSlug(provSlug);
  if (!province) notFound();
  const { awards, today } = await loadIntel();
  const m = marketShare(awards, trade, province, today);
  if (!m) notFound();
  const path = intelMarketPath(trade, provSlug);
  const { ctx, intel } = await loadIntelViewer({ lang, countryParam: m.country, view: sp.view, next: path });
  const t = ctx.t;
  const newest = awards.find((a) => a.country === m.country && a.province === province && a.tradeSlugs.includes(trade)) ?? null;
  const view = intelView(m, intel, (x) => marketTeaser(x, newest));
  const vars = { trade: tradeName(m.trade, lang), province: regionName(province, lang) };
  return (
    <SimplePage
      lang={lang}
      current={null}
      group="company"
      crumbs={[{ label: t.crumb, href: "/intel" }, { label: t.nav.markets, href: "/intel/markets" }]}
      tabs={false}
      aside={false}
      title={fmt(t.market.h1, vars)}
      lead={fmt(t.market.lead, vars)}
    >
      <IntelNav ctx={ctx} current="markets" />
      <MarketBody view={view} ctx={ctx} csvHref={`/api/intel/csv?view=market&trade=${encodeURIComponent(trade)}&province=${encodeURIComponent(provSlug)}`} />
    </SimplePage>
  );
}
