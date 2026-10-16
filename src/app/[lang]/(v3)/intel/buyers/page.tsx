import type { Metadata } from "next";
import { loadIntel } from "@/lib/intel/load";
import { buyerIndex, currencyOfCountry } from "@/lib/intel/model";
import { indexTeaser, intelView } from "@/lib/intel/view";
import { loadIntelViewer } from "@/lib/intel/viewer";
import { intelNoindexMeta } from "@/lib/intel/meta";
import { setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { SimplePage } from "@/components/v3/simple";
import { IndexBody, IntelNav } from "@/components/intel/views";

type SP = Promise<Record<string, string | undefined>>;
const PATH = "/intel/buyers";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  return intelNoindexMeta(l, getDictionary(l).intel.buyers.metaTitle, PATH);
}

export default async function IntelBuyers({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const sp = await searchParams;
  const { ctx, intel, country } = await loadIntelViewer({ lang, countryParam: sp.country, view: sp.view, next: PATH });
  const t = ctx.t;
  const { awards, refs } = await loadIntel();
  const rows = buyerIndex(awards, refs, country);
  const view = intelView(rows, intel, (r) => indexTeaser(country, r, (x) => ("name" in x ? x.name : "")));
  return (
    <SimplePage lang={lang} current={null} group="company" crumbs={[{ label: t.crumb, href: "/intel" }]} tabs={false} aside={false} title={t.buyers.h1} lead={fmt(t.buyers.lead, { country: t.country[country] })}>
      <IntelNav ctx={ctx} current="buyers" />
      <IndexBody kind="buyers" view={view} ctx={ctx} currency={currencyOfCountry(country)} csvHref={`/api/intel/csv?view=buyers&country=${country.toLowerCase()}`} />
    </SimplePage>
  );
}
