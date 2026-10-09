import type { Metadata } from "next";
import { FoundingRegionNotice } from "@/components/public/founding-region-notice";
import { DirectoryList, LIST_PATH, PER_PAGE, listHref, paginate, vendorCard } from "@/components/home-v3/directory-list";
import { V3PriceParts } from "@/components/home-v3/chrome";
import { JsonLd, itemListSchema } from "@/lib/seo/jsonld";
import { listVendors } from "@/lib/data/directory";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { getRegionLiquidityBySlug } from "@/lib/data/liquidity";
import { getVisitorListCounts } from "@/lib/data/list-counts";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { provinceFirst, regionCountry, regionsInCountry } from "@/lib/visitor-geo";
import { tradePhotoForName } from "@/lib/photos";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).directory.meta;
  return {
    title: t.title,
    description: t.description,
    // Filtered views (?category=, ?region=, ?q=, ?page=) are the same page to Google.
    alternates: alternatesFor(l, "/directory"),
  };
}

export default async function DirectoryPage({
  searchParams,
  params,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const all = getT("v3Pages").list;
  const t = all.trades;
  const meta = getT("directory").meta;
  const sp = await searchParams;
  const hasFilters = Boolean(sp.category || sp.region || sp.propertyType || sp.verified || sp.q);
  const sort = sp.sort === "alpha" ? "alpha" : "featured";

  // Country-first: one country's companies (a picked region decides it, else
  // ?country=, else the visitor's), the visitor's province/state first.
  const allRegions = await getRegions();
  const pickedRegion = sp.region ? allRegions.find((r) => r.slug === sp.region) : undefined;
  const where = await getVisitorCountry({ param: sp.country });
  const country = pickedRegion ? regionCountry(pickedRegion) : where.country;
  const regions = regionsInCountry(allRegions, country);
  const [found, allVendors, categories, propertyTypes, counts] = await Promise.all([
    listVendors({ category: sp.category, region: sp.region, propertyType: sp.propertyType, verified: Boolean(sp.verified), q: sp.q, sort, country }),
    // Unfiltered pool: hero stats and chip counts stay stable while the list filters.
    hasFilters ? listVendors({ country }) : Promise.resolve(null),
    getCategories(),
    getPropertyTypes(),
    getVisitorListCounts(country),
  ]);
  const vendors = sort === "alpha" ? found : provinceFirst(found, country === where.country ? where.province : null, (v) => v.province);
  const pool = allVendors ?? vendors;

  const activeRegion = sp.region ? regions.find((r) => r.slug === sp.region) ?? null : null;
  const regionLiq = activeRegion ? await getRegionLiquidityBySlug(activeRegion.slug) : null;
  const showFounding = !!activeRegion && !!regionLiq && regionLiq.tier !== "active";

  // Paid placement must still be RELEVANT (audit F06): the featured card comes
  // from the filtered results, so a sponsor only shows when it matches.
  const feat = vendors.find((v) => v.featured) ?? null;
  const rows = vendors.filter((v) => v.slug !== feat?.slug);
  const { page, pages, slice } = paginate(rows, sp.page);

  const countByName = new Map<string, number>();
  for (const v of pool) for (const c of v.categories) countByName.set(c, (countByName.get(c) ?? 0) + 1);
  const activeCats = categories
    .map((c) => ({ ...c, count: countByName.get(c.name) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const keep = { category: sp.category, region: sp.region, propertyType: sp.propertyType, verified: sp.verified, sort: sp.sort === "alpha" ? "alpha" : undefined, country: sp.country };
  const n = (x: number) => formatNumber(x, lang);
  const featCard = feat
    ? {
        href: `/directory/${feat.slug}`,
        img: tradePhotoForName(feat.categories[0]).src,
        badge: feat.platinum ? all.platinum : all.featured,
        badge2: feat.yearsInBusiness ? `${n(feat.yearsInBusiness)} ${all.yrs}` : feat.verified ? all.verified : null,
        tags: feat.categories.map((c) => tradeName(c, lang)).join(" · "),
        name: feat.name,
        loc: [feat.city, feat.province].filter((x): x is string => Boolean(x)).map((x) => regionName(x, lang)).join(", "),
        desc: feat.shortDescription,
      }
    : null;

  return (
    <>
      <JsonLd
        data={itemListSchema(
          meta.listName,
          vendors.slice(0, 50).map((v) => ({ name: v.name, path: localizePath(`/directory/${v.slug}`, lang) })),
        )}
      />
      <DirectoryList
        lang={lang}
        type="trades"
        t={all}
        eyebrow={t.eyebrow}
        h1={t.h1}
        h1Size={68}
        sub={t.sub}
        stats={[
          { n: n(pool.length), l: t.stats.companies },
          { n: n(activeCats.length), l: t.stats.categories },
          { n: n(regions.length), l: t.stats.regions },
        ]}
        search={{ q: sp.q ?? "", placeholder: t.searchPh, button: t.searchBtn, keep }}
        ctas={[{ href: "/sign-up?role=property_manager", label: t.cta1 }, { href: "/sign-up?role=trade", label: t.cta2 }]}
        tabs={{ trades: pool.length, suppliers: counts.suppliers, winners: counts.winners, jobs: counts.jobs, talent: counts.talent }}
        filters={[
          { name: "category", label: all.filters.category, value: sp.category ?? "", options: [{ value: "", label: all.filters.allCategories }, ...categories.map((c) => ({ value: c.slug, label: tradeName(c.name, lang) }))] },
          { name: "region", label: all.filters.region, value: sp.region ?? "", options: [{ value: "", label: all.filters.allRegions }, ...regions.map((r) => ({ value: r.slug, label: regionName(r.name, lang) }))] },
          { name: "propertyType", label: all.filters.propertyType, value: sp.propertyType ?? "", options: [{ value: "", label: all.filters.allPropertyTypes }, ...propertyTypes.map((p) => ({ value: p.slug, label: propertyTypeName(p.name, lang) }))] },
          { name: "sort", label: all.sort.label, value: sort, options: [{ value: "featured", label: all.sort.featured }, { value: "alpha", label: all.sort.alpha }] },
        ]}
        verified={Boolean(sp.verified)}
        filterButton={t.apply}
        filterKeep={{ q: sp.q }}
        chips={
          activeCats.length
            ? {
                label: t.chipsLabel,
                items: [
                  { name: t.allChip, n: pool.length, href: "/directory", on: !sp.category },
                  ...activeCats.map((c) => ({ name: tradeName(c.name, lang), n: c.count, href: `/directory?category=${c.slug}`, on: sp.category === c.slug })),
                ],
              }
            : null
        }
        notice={
          showFounding && activeRegion ? (
            <FoundingRegionNotice
              regionName={activeRegion.name}
              regionSlug={activeRegion.slug}
              reason="no_supply_directory"
              role="property_manager"
              province={activeRegion.province ?? undefined}
              country={activeRegion.country}
            />
          ) : null
        }
        featured={
          vendors.length
            ? { title: t.featTitle, card: featCard, slotPrice: <V3PriceParts lang={lang} cad={PRICING.featuredAnnual} suffix={all.slot.price} />, slotHref: signUpHrefForPlan("featured", "annual") }
            : null
        }
        list={
          rows.length || feat
            ? {
                title: t.listTitle,
                cards: slice.map((v) => vendorCard(v, lang, all)),
                cardCta: all.viewProfile,
                band: { eyebrow: t.bandEyebrow, head: t.bandHead, text: t.bandText, cta: { href: "/sign-up?role=trade", label: t.bandCta }, big: lang === "fr" ? "0 $" : "$0" },
                page,
                pages,
                total: rows.length,
                perPage: PER_PAGE,
                pageHref: (p) => listHref(LIST_PATH.trades, { ...keep, q: sp.q, page: p }),
              }
            : null
        }
        noMatch={!rows.length && !feat ? { clearHref: "/directory" } : null}
        empty={null}
        close={{ eyebrow: t.closeEyebrow, head: t.closeHead, text: t.closeText, cta1: { href: "/pricing", label: t.closeCta1 }, cta2: { href: "/sign-up?role=trade", label: t.closeCta2 } }}
        sticky={{ a: fmt(t.stickyA, { n: n(pool.length) }), b: t.stickyB, cta1: { href: "/sign-up?role=trade", label: t.stickyCta1 }, cta2: { href: "/sign-up?role=property_manager", label: t.stickyCta2 } }}
      />
    </>
  );
}
