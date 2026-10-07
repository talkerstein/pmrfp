import type { Metadata } from "next";
import { DirectoryList, LIST_PATH, PER_PAGE, listHref, paginate, vendorCard } from "@/components/home-v3/directory-list";
import { V3PriceParts } from "@/components/home-v3/chrome";
import { JsonLd, itemListSchema } from "@/lib/seo/jsonld";
import { listVendors } from "@/lib/data/directory";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { getListCounts } from "@/lib/data/list-counts";
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
  const t = getDictionary(l).directory.suppliers;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/suppliers") };
}

export default async function SuppliersPage({
  searchParams,
  params,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const all = getT("v3Pages").list;
  const t = all.suppliers;
  const sp = await searchParams;
  const hasFilters = Boolean(sp.category || sp.region || sp.propertyType || sp.verified || sp.q);
  const sort = sp.sort === "alpha" ? "alpha" : "featured";
  const [suppliers, allSuppliers, categories, regions, propertyTypes, counts] = await Promise.all([
    listVendors({ orgType: "supplier", category: sp.category, region: sp.region, propertyType: sp.propertyType, verified: Boolean(sp.verified), q: sp.q, sort }),
    hasFilters ? listVendors({ orgType: "supplier" }) : Promise.resolve(null),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
    getListCounts(),
  ]);
  const pool = allSuppliers ?? suppliers;
  const feat = suppliers.find((v) => v.featured) ?? null;
  const rows = suppliers.filter((v) => v.slug !== feat?.slug);
  const { page, pages, slice } = paginate(rows, sp.page);
  const keep = { category: sp.category, region: sp.region, propertyType: sp.propertyType, verified: sp.verified, sort: sp.sort === "alpha" ? "alpha" : undefined };
  const n = (x: number) => formatNumber(x, lang);
  const serves = (regs: string[]) =>
    regs.length ? fmt(t.serves, { where: regs.length > 2 ? `${regionName(regs[0], lang)} + ${regs.length - 1}` : regs.map((r) => regionName(r, lang)).join(", ") }) : null;

  return (
    <>
      <JsonLd
        data={itemListSchema(
          t.listTitle,
          suppliers.slice(0, 50).map((v) => ({ name: v.name, path: localizePath(`/directory/${v.slug}`, lang) })),
        )}
      />
      <DirectoryList
        lang={lang}
        type="suppliers"
        t={all}
        eyebrow={t.eyebrow}
        h1={t.h1}
        h1Size={56}
        sub={t.sub}
        stats={[{ n: n(pool.length), l: t.stats.suppliers }]}
        search={{ q: sp.q ?? "", placeholder: t.searchPh, button: t.searchBtn, keep }}
        ctas={[{ href: "/sign-up?role=supplier", label: t.cta1 }, { href: "/for/suppliers", label: t.cta2 }]}
        tabs={{ trades: counts.trades, suppliers: pool.length, winners: counts.winners, jobs: counts.jobs, talent: counts.talent }}
        filters={[
          { name: "category", label: all.filters.category, value: sp.category ?? "", options: [{ value: "", label: all.filters.allCategories }, ...categories.map((c) => ({ value: c.slug, label: tradeName(c.name, lang) }))] },
          { name: "region", label: all.filters.region, value: sp.region ?? "", options: [{ value: "", label: all.filters.allRegions }, ...regions.map((r) => ({ value: r.slug, label: regionName(r.name, lang) }))] },
          { name: "propertyType", label: all.filters.propertyType, value: sp.propertyType ?? "", options: [{ value: "", label: all.filters.allPropertyTypes }, ...propertyTypes.map((p) => ({ value: p.slug, label: propertyTypeName(p.name, lang) }))] },
          { name: "sort", label: all.sort.label, value: sort, options: [{ value: "featured", label: all.sort.featured }, { value: "alpha", label: all.sort.alpha }] },
        ]}
        verified={Boolean(sp.verified)}
        filterButton={t.apply}
        filterKeep={{ q: sp.q }}
        chips={null}
        featured={
          suppliers.length
            ? {
                title: t.featTitle,
                card: feat
                  ? {
                      href: `/directory/${feat.slug}`,
                      img: tradePhotoForName(feat.categories[0]).src,
                      badge: feat.platinum ? all.platinum : all.featured,
                      badge2: feat.yearsInBusiness ? `${n(feat.yearsInBusiness)} ${all.yrs}` : feat.verified ? all.verified : null,
                      tags: feat.categories.map((c) => tradeName(c, lang)).join(" · "),
                      name: feat.name,
                      loc: [[feat.city, feat.province].filter((x): x is string => Boolean(x)).map((x) => regionName(x, lang)).join(", "), serves(feat.regions)].filter(Boolean).join(" · "),
                      desc: feat.shortDescription,
                    }
                  : null,
                slotPrice: <V3PriceParts lang={lang} cad={PRICING.featuredAnnual} suffix={all.slot.price} />,
                slotHref: signUpHrefForPlan("featured", "annual"),
              }
            : null
        }
        list={
          rows.length || feat
            ? {
                title: t.listTitle,
                cards: slice.map((v) => {
                  const c = vendorCard(v, lang, all);
                  // Suppliers: where they deliver reads before their trades.
                  return { ...c, tags: [serves(v.regions), c.tags].filter(Boolean).join(" · ") || null };
                }),
                cardCta: t.cardCta,
                band: { eyebrow: t.bandEyebrow, head: t.bandHead, text: t.bandText, cta: { href: "/sign-up?role=supplier", label: t.bandCta }, big: lang === "fr" ? "0 $" : "$0" },
                page,
                pages,
                total: rows.length,
                perPage: PER_PAGE,
                pageHref: (p) => listHref(LIST_PATH.suppliers, { ...keep, q: sp.q, page: p }),
              }
            : null
        }
        noMatch={!rows.length && !feat ? { clearHref: "/suppliers" } : null}
        empty={null}
        close={{ eyebrow: t.closeEyebrow, head: t.closeHead, text: t.closeText, cta1: { href: "/sign-up?role=supplier", label: t.closeCta1 }, cta2: { href: "/for/suppliers", label: t.closeCta2 } }}
        sticky={{ a: fmt(t.stickyA, { n: n(pool.length) }), b: t.stickyB, cta1: { href: "/sign-up?role=supplier", label: t.stickyCta1 }, cta2: { href: "/pricing", label: t.stickyCta2 } }}
      />
    </>
  );
}
