import type { Metadata } from "next";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { loadBuyers } from "@/lib/buyers/load";
import { BUYERS_PATH, directoryIndex, isIndexableBuyer, pageKind } from "@/lib/buyers/model";
import { indexablePages } from "@/lib/towns/page-data";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { regionName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";
import { FOR_PUBLIC_BUYERS_PATH } from "@/lib/buyers/source-links";
import { inProvince, provinceList, provincePath } from "@/lib/buyers/province";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).buyers.meta;
  return { title: t.indexTitle, description: t.indexDescription, alternates: alternatesFor(l, BUYERS_PATH) };
}

/** "Where every buyer posts bids": Canadian public buyers by province, then by type. */
export default async function BuyersIndex({ params }: { params: Promise<{ lang: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("buyers");
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  const { pages: all } = await loadBuyers();
  // Every municipality has a page; the index lists the researched buyers plus the towns with bids or a verified buyer.
  const shownTowns = new Set(await indexablePages(all.filter((p) => pageKind(p) === "town")));
  const pages = all.filter((p) => pageKind(p) !== "town" || shownTowns.has(p));
  const hiddenTowns = all.length - pages.length;
  const index = directoryIndex(pages);
  // Every province page (/buyers/<province>) lists all its towns and buyers, shown here or not.
  const provinces = provinceList(all);
  const allIn = new Map(provinces.map((p) => [p.provinceSlug, p.total]));
  const tf = getT("follows").index;
  let no = 0;
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: home, path: L("/") }, { name: t.index.crumb, path: L(BUYERS_PATH) }])} />
      <SimplePage lang={lang} current={null} group="company" crumbs={[]} tabs={false} aside={false} title={t.index.h1} lead={fmt(t.index.lead, { n: formatNumber(pages.length, lang) })}>
        <p className="small muted" data-flag="link-only">{t.index.note}</p>
        {hiddenTowns > 0 && <p className="small muted" data-flag="towns">{fmt(getT("towns").page.townsNote, { n: formatNumber(hiddenTowns, lang) })}</p>}
        <p className="small" data-cta="list-your-tenders"><a href={L(FOR_PUBLIC_BUYERS_PATH)}>{t.index.listYours} →</a></p>
        <nav className="s-links" aria-label={tf.provinces} data-list="provinces">
          {provinces.map((p) => (
            <a key={p.provinceSlug} href={L(provincePath(p.provinceSlug))}>{regionName(p.province, lang)} ({formatNumber(p.total, lang)})</a>
          ))}
        </nav>
        {index.map((p) => (
          <section key={p.provinceSlug} data-province={p.provinceSlug}>
            <SH2 no={++no} id={p.provinceSlug}>{fmt(t.index.provinceHead, { province: regionName(p.province, lang) })}</SH2>
            <p className="small muted">
              {fmt(t.index.count, { n: formatNumber(p.total, lang) })} ·{" "}
              <a href={L(provincePath(p.provinceSlug))} data-link="province">{fmt(tf.provinceLink, { n: formatNumber(allIn.get(p.provinceSlug) ?? p.total, lang), inProvince: inProvince(p.province, lang, regionName(p.province, lang)) })} →</a>
            </p>
            {p.groups.map((g) => (
              <div key={g.group} data-group={g.group}>
                <h3>{t.groups[g.group]}</h3>
                <ul className="s-table" data-list="buyers">
                  {g.buyers.map((b) => {
                    const platforms = b.buyer.platforms.map((k) => t.platforms[k]).join(" · ");
                    return (
                      <li key={b.path}>
                        <span className="code" aria-hidden>{b.buyer.name.slice(0, 1)}</span>
                        <span>
                          <a className="nm" href={L(b.path)}>{b.buyer.name}</a>
                          <span className="lic">
                            {platforms || t.index.unknown}
                            {isIndexableBuyer(b) ? ` · ${t.index.withData}` : ""}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </SimplePage>
    </>
  );
}
