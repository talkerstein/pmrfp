import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadIntel, intelCompanyPath } from "@/lib/intel/load";
import { companyProfile, linkBuyers } from "@/lib/intel/model";
import { companyTeaser, intelView } from "@/lib/intel/view";
import { loadIntelViewer } from "@/lib/intel/viewer";
import { intelNoindexMeta } from "@/lib/intel/meta";
import { setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { SimplePage } from "@/components/v3/simple";
import { CompanyBody, IntelNav } from "@/components/intel/views";

type Params = Promise<{ lang: string; slug: string }>;
type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, slug } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const { awards } = await loadIntel();
  const name = awards.find((a) => a.winnerSlug === slug)?.winner ?? slug;
  return intelNoindexMeta(l, fmt(getDictionary(l).intel.company.metaTitle, { name }), intelCompanyPath(slug));
}

/** Competitor profile (Intel). Everyone else gets counts, one example award and a blurred table. */
export default async function IntelCompany({ params, searchParams }: { params: Params; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const { slug } = await params;
  const sp = await searchParams;
  const path = intelCompanyPath(slug);
  const { ctx, intel, country } = await loadIntelViewer({ lang, countryParam: sp.country, view: sp.view, next: path });
  const { awards, refs, today } = await loadIntel();
  const profile = companyProfile(awards, slug, country, today);
  if (!profile) notFound();
  profile.buyers = linkBuyers(profile.buyers, refs, country);
  const t = ctx.t;
  const view = intelView(profile, intel, companyTeaser);
  return (
    <SimplePage
      lang={lang}
      current={null}
      group="company"
      crumbs={[{ label: t.crumb, href: "/intel" }, { label: t.nav.companies, href: "/intel/companies" }]}
      tabs={false}
      aside={false}
      title={profile.name}
      lead={fmt(t.company.lead, { name: profile.name, country: t.country[country] })}
    >
      <IntelNav ctx={ctx} current="companies" />
      <CompanyBody view={view} ctx={ctx} csvHref={`/api/intel/csv?view=company&slug=${encodeURIComponent(slug)}&country=${country.toLowerCase()}`} />
    </SimplePage>
  );
}
