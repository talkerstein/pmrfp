import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadIntel, intelBuyerPath } from "@/lib/intel/load";
import { buyerProfile } from "@/lib/intel/model";
import { buyerTeaser, intelView } from "@/lib/intel/view";
import { loadIntelViewer } from "@/lib/intel/viewer";
import { intelNoindexMeta } from "@/lib/intel/meta";
import { setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { SimplePage } from "@/components/v3/simple";
import { BuyerBody, IntelNav } from "@/components/intel/views";

type Params = Promise<{ lang: string; slug: string }>;
type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, slug } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const { refs } = await loadIntel();
  const name = refs.find((r) => r.slug === slug)?.name ?? slug;
  return intelNoindexMeta(l, fmt(getDictionary(l).intel.buyer.metaTitle, { name }), intelBuyerPath(slug));
}

/**
 * Buyer profile (Intel). A buyer belongs to one country (U.S. buyer slugs end
 * in "-us"), so its page is always that country's data and currency.
 */
export default async function IntelBuyer({ params, searchParams }: { params: Params; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const { slug } = await params;
  const sp = await searchParams;
  const path = intelBuyerPath(slug);
  const { awards, refs } = await loadIntel();
  const ref = refs.find((r) => r.slug === slug);
  if (!ref) notFound();
  const { ctx, intel } = await loadIntelViewer({ lang, countryParam: ref.country, view: sp.view, next: path });
  const profile = buyerProfile(awards, ref);
  const t = ctx.t;
  const view = intelView(profile, intel, buyerTeaser);
  return (
    <SimplePage
      lang={lang}
      current={null}
      group="company"
      crumbs={[{ label: t.crumb, href: "/intel" }, { label: t.nav.buyers, href: "/intel/buyers" }]}
      tabs={false}
      aside={false}
      title={profile.name}
      lead={fmt(t.buyer.lead, { name: profile.name, country: t.country[ref.country] })}
    >
      <IntelNav ctx={ctx} current="buyers" />
      <BuyerBody view={view} ctx={ctx} csvHref={`/api/intel/csv?view=buyer&slug=${encodeURIComponent(slug)}&country=${ref.country.toLowerCase()}`} />
    </SimplePage>
  );
}
