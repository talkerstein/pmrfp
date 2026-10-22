import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/follows/follows.css";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { loadBuyers } from "@/lib/buyers/load";
import { BUYERS_PATH, PROVINCE_NAMES, provinceSlugOf } from "@/lib/buyers/model";
import { inProvince, provinceDirectory, provinceList, provincePath, PROVINCE_GROUPS } from "@/lib/buyers/province";
import { getBuyerPermissionSnapshot } from "@/lib/buyers/permissions-data";
import { getManagedPagesSnapshot } from "@/lib/towns/managed-data";
import { buyerKey, permissionFor } from "@/lib/towns/managed";
import { buyerDisplayName } from "@/lib/towns/claimable";
import { getRegions } from "@/lib/data/taxonomy";
import { FREE_FOLLOW_LIMIT } from "@/lib/follows/rules";
import { ProvinceBuyerList, type ProvinceListLabels } from "@/components/follows/province-list";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_TAG, hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { regionName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";

export const revalidate = 86400;

export async function generateStaticParams() {
  // Rendered on first visit, then cached (ISR), like the buyer pages under it.
  return [];
}

type Params = Promise<{ lang: string; province: string }>;

const provinceOf = (slug: string) => Object.values(PROVINCE_NAMES).find((n) => provinceSlugOf(n) === slug) ?? null;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, province: slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const province = provinceOf(slug);
  if (!province) return { robots: { index: false } };
  const t = getDictionary(l).follows.province;
  const name = regionName(province, l);
  const total = (await loadBuyers()).pages.filter((p) => p.provinceSlug === slug).length;
  return {
    title: fmt(t.metaTitle, { province: name, inProvince: inProvince(province, l, name) }),
    description: fmt(t.metaDescription, { inProvince: inProvince(province, l, name), n: formatNumber(total, l) }),
    alternates: alternatesFor(l, provincePath(slug)),
  };
}

/**
 * Every town and public buyer in one province (/buyers/<province>), grouped
 * by kind, with search and badges (Verified, Listed with permission, N open
 * bids) and a Follow button per row. Built from the shared snapshots: the
 * buyer pages (board + census + directory), managed pages and permissions.
 * Indexable (it lists every buyer page in the province, the index of the
 * town pages under it) and in the sitemap.
 */
export default async function ProvinceBuyersPage({ params }: { params: Params }) {
  await setLangFrom(params);
  const lang = getLang();
  const { province: slug } = await params;
  const province = provinceOf(slug);
  if (!province) notFound();
  const t = getT("follows").province;
  const tb = getT("follows").button;
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  const [{ pages }, managed, registry, regions] = await Promise.all([loadBuyers(), getManagedPagesSnapshot(), getBuyerPermissionSnapshot(), getRegions().catch(() => [])]);
  const dir = provinceDirectory(pages, slug, {
    managed: (p) => managed.has(buyerKey(p.provinceSlug, p.buyer.slug)),
    listed: (p) => permissionFor(registry, p.buyer.slug, p.buyer.provinceCode)?.status === "yes",
    name: (p) => buyerDisplayName(p, lang),
  });
  if (!dir || !dir.total) notFound();
  const name = regionName(province, lang);
  const regionSlug = regions.find((r) => r.slug === slug)?.slug ?? null;
  const others = provinceList(pages).filter((p) => p.provinceSlug !== slug);
  const labels: ProvinceListLabels = {
    searchLabel: t.searchLabel,
    searchPlaceholder: t.searchPlaceholder,
    openOnly: t.openOnly,
    shown: t.shown,
    none: t.none,
    groups: Object.fromEntries(PROVINCE_GROUPS.map((g) => [g, t.groups[g]])) as ProvinceListLabels["groups"],
    verified: t.badges.verified,
    listed: t.badges.listed,
    open: t.badges.open,
    population: t.population,
    follow: tb.follow,
    following: tb.following,
    followAria: tb.followAria,
    unfollowAria: tb.unfollowAria,
    limit: fmt(tb.limit, { limit: FREE_FOLLOW_LIMIT }),
    upgrade: tb.upgrade,
    role: tb.role,
    error: tb.error,
    unavailable: tb.unavailable,
    usage: tb.usage,
  };
  let no = 0;
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: t.crumb, path: L(BUYERS_PATH) },
          { name, path: L(provincePath(slug)) },
        ])}
      />
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: t.crumb, href: BUYERS_PATH }]}
        tabs={false}
        aside={false}
        title={fmt(t.title, { inProvince: inProvince(province, lang, name) })}
        lead={fmt(t.lead, { n: formatNumber(dir.total, lang), inProvince: inProvince(province, lang, name) })}
      >
        <div className="s-facts">
          <div><div className="k">{t.stats.buyers}</div><div className="v" data-stat="buyers">{formatNumber(dir.total, lang)}</div></div>
          <div><div className="k">{t.stats.open}</div><div className="v" data-stat="open">{formatNumber(dir.withOpen, lang)}</div></div>
          <div><div className="k">{t.stats.verified}</div><div className="v" data-stat="verified">{formatNumber(dir.verified, lang)}</div></div>
        </div>
        <p className="small muted" style={{ marginTop: 18 }}>{fmt(t.followHint, { limit: FREE_FOLLOW_LIMIT })}</p>

        <SH2 no={++no} id="buyers">{t.stats.buyers}</SH2>
        <ProvinceBuyerList
          items={dir.items}
          provinceSlug={slug}
          regionSlug={regionSlug}
          lang={lang}
          locale={LOCALE_TAG[lang]}
          upgradeHref={L("/pricing")}
          labels={labels}
        />

        {others.length > 0 && (
          <>
            <SH2 no={++no} id="provinces">{t.other}</SH2>
            <ul className="pv-provinces" data-list="provinces">
              {others.map((p) => (
                <li key={p.provinceSlug}>
                  <a href={L(provincePath(p.provinceSlug))}>{regionName(p.province, lang)}</a> <span className="n">({formatNumber(p.total, lang)})</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="s-links">
          <a href={L(BUYERS_PATH)}>{t.all} →</a>
        </div>
      </SimplePage>
    </>
  );
}
