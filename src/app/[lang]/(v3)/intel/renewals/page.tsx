import type { Metadata } from "next";
import { CA_PROVINCES, US_STATE_NAMES } from "@/lib/geo";
import { provinceFromSlug, provinceSlug } from "@/lib/data/price-benchmarks";
import { INTEL_RENEWALS_PATH, loadIntel } from "@/lib/intel/load";
import { RADAR_HORIZONS, RENEWAL_TRADES, parseHorizon, renewalCounts, renewalRadar } from "@/lib/intel/model";
import { intelView, renewalTeaser } from "@/lib/intel/view";
import { loadIntelViewer } from "@/lib/intel/viewer";
import { intelNoindexMeta } from "@/lib/intel/meta";
import { setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { regionName, tradeName } from "@/i18n/terms";
import { SimplePage } from "@/components/v3/simple";
import { IntelNav, RenewalsBody } from "@/components/intel/views";

type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  return intelNoindexMeta(l, getDictionary(l).intel.renewals.metaTitle, INTEL_RENEWALS_PATH);
}

/** Renewal radar: recurring-service contracts likely to be re-tendered, filterable, CSV. */
export default async function IntelRenewals({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const sp = await searchParams;
  const { ctx, intel, country } = await loadIntelViewer({ lang, countryParam: sp.country, view: sp.view, next: INTEL_RENEWALS_PATH });
  const t = ctx.t;
  const tr = t.renewals;
  const { awards, refs, categories, today } = await loadIntel();

  const trade = RENEWAL_TRADES.some((x) => x.slug === sp.trade) ? sp.trade! : null;
  const province = sp.province ? provinceFromSlug(sp.province) : null;
  const provinceHere = province && (country === "US" ? US_STATE_NAMES.includes(province) : (CA_PROVINCES as readonly string[]).includes(province)) ? province : null;
  const buyerRef = sp.buyer ? refs.find((r) => r.slug === sp.buyer && r.country === country) ?? null : null;
  const horizon = parseHorizon(sp.h);
  const items = renewalRadar(awards, { country, today, trade, province: provinceHere, buyer: buyerRef?.key ?? (sp.buyer ? "__none__" : null), horizon });

  // Filter options: only buyers that have recurring contracts on the radar in this country.
  const radarBuyers = new Map<string, string>();
  for (const it of renewalRadar(awards, { country, today, horizon: "all" })) {
    const ref = it.award.buyerKey ? refs.find((r) => r.country === country && r.key === it.award.buyerKey) : null;
    if (ref) radarBuyers.set(ref.slug, ref.name);
  }
  const tradeLabel = (slug: string) => tradeName(categories.find((c) => c.slug === slug)?.name ?? slug, lang);
  const places = country === "US" ? US_STATE_NAMES : [...CA_PROVINCES];

  const qs = new URLSearchParams();
  qs.set("view", "renewals");
  qs.set("country", country.toLowerCase());
  if (trade) qs.set("trade", trade);
  if (provinceHere) qs.set("province", provinceSlug(provinceHere));
  if (buyerRef) qs.set("buyer", buyerRef.slug);
  qs.set("h", String(horizon));

  const view = intelView(items, intel, (x) => renewalTeaser(country, x, renewalCounts(x)));
  return (
    <SimplePage lang={lang} current={null} group="company" crumbs={[{ label: t.crumb, href: "/intel" }]} tabs={false} aside={false} title={tr.h1} lead={tr.lead}>
      <IntelNav ctx={ctx} current="renewals" />
      <form method="get" action={localizePath(INTEL_RENEWALS_PATH, lang)} className="g-filter">
        <label className="s-fld">
          <span>{tr.filter.trade}</span>
          <select name="trade" defaultValue={trade ?? ""}>
            <option value="">{tr.filter.anyTrade}</option>
            {RENEWAL_TRADES.map((x) => <option key={x.slug} value={x.slug}>{tradeLabel(x.slug)}</option>)}
          </select>
        </label>
        <label className="s-fld">
          <span>{tr.filter.province}</span>
          <select name="province" defaultValue={provinceHere ? provinceSlug(provinceHere) : ""}>
            <option value="">{tr.filter.anyProvince}</option>
            {places.map((p) => <option key={p} value={provinceSlug(p)}>{regionName(p, lang)}</option>)}
          </select>
        </label>
        {/* The buyer list is a public list of buyer names (no numbers), so it's the same for everyone. */}
        <label className="s-fld">
          <span>{tr.filter.buyer}</span>
          <select name="buyer" defaultValue={buyerRef?.slug ?? ""}>
            <option value="">{tr.filter.anyBuyer}</option>
            {[...radarBuyers.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        </label>
        <label className="s-fld">
          <span>{tr.filter.horizon}</span>
          <select name="h" defaultValue={String(horizon)}>
            {[...RADAR_HORIZONS.map(String), "all"].map((h) => <option key={h} value={h}>{tr.horizon[h as keyof typeof tr.horizon]}</option>)}
          </select>
        </label>
        {sp.country && <input type="hidden" name="country" value={country.toLowerCase()} />}
        <button type="submit">{tr.filter.go}</button>
      </form>
      <RenewalsBody view={view} ctx={ctx} csvHref={`/api/intel/csv?${qs.toString()}`} />
    </SimplePage>
  );
}
