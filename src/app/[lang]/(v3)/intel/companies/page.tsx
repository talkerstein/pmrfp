import type { Metadata } from "next";
import { loadIntel } from "@/lib/intel/load";
import { companyIndex, currencyOfCountry } from "@/lib/intel/model";
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
const PATH = "/intel/companies";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  return intelNoindexMeta(l, getDictionary(l).intel.companies.metaTitle, PATH);
}

export default async function IntelCompanies({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const sp = await searchParams;
  const { ctx, intel, country } = await loadIntelViewer({ lang, countryParam: sp.country, view: sp.view, next: PATH });
  const t = ctx.t;
  const { awards } = await loadIntel();
  const rows = companyIndex(awards, country);
  const view = intelView(rows, intel, (r) => indexTeaser(country, r, (x) => ("name" in x ? x.name : "")));
  return (
    <SimplePage lang={lang} current={null} group="company" crumbs={[{ label: t.crumb, href: "/intel" }]} tabs={false} aside={false} title={t.companies.h1} lead={fmt(t.companies.lead, { country: t.country[country] })}>
      <IntelNav ctx={ctx} current="companies" />
      <IndexBody kind="companies" view={view} ctx={ctx} currency={currencyOfCountry(country)} csvHref={`/api/intel/csv?view=companies&country=${country.toLowerCase()}`} />
    </SimplePage>
  );
}
