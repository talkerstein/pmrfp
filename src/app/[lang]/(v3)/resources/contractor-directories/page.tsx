import type { Metadata } from "next";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";
import { SH2, SimplePage } from "@/components/v3/simple";

/** Bump when the list is re-checked against each service's public pages. */
const UPDATED = "2026-10-08";

type Dir = ReturnType<typeof getDictionary>["agencies"]["directories"];
type ItemKey = keyof Dir["items"];
type GroupKey = keyof Dir["groups"];

/** Grouped by use, not ranked. PMRFP sits with the B2B networks where it fits. */
const GROUPS: [GroupKey, [ItemKey, string, string][]][] = [
  ["maps", [
    ["gbp", "Google Business Profile", "https://www.google.com/business/"],
    ["bing", "Bing Places for Business", "https://www.bingplaces.com/"],
    ["apple", "Apple Business Connect", "https://businessconnect.apple.com/"],
  ]],
  ["local", [
    ["yelp", "Yelp for Business", "https://business.yelp.com/"],
    ["bbb", "Better Business Bureau (BBB)", "https://www.bbb.org/"],
    ["yp", "Yellow Pages (Canada)", "https://www.yellowpages.ca/"],
    ["chamber", "Local chamber of commerce", ""],
  ]],
  ["home", [
    ["homestars", "HomeStars", "https://homestars.com/"],
    ["houzz", "Houzz", "https://www.houzz.com/"],
    ["angi", "Angi", "https://www.angi.com/"],
    ["thumbtack", "Thumbtack", "https://www.thumbtack.com/"],
  ]],
  ["b2b", [
    ["buildingconnected", "BuildingConnected (Autodesk)", "https://www.buildingconnected.com/"],
    ["constructconnect", "ConstructConnect", "https://www.constructconnect.com/"],
    ["pmrfp", "PMRFP", "/directory"],
    ["associations", "Trade and construction associations", ""],
  ]],
];

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).agencies.directories.meta;
  return { title: { absolute: t.title }, description: t.description, alternates: alternatesFor(l, "/resources/contractor-directories") };
}

export default async function ContractorDirectoriesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("agencies").directories;
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  const date = new Date(`${UPDATED}T12:00:00Z`).toLocaleDateString(lang === "fr" ? "fr-CA" : lang === "es" ? "es" : "en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const path = L("/resources/contractor-directories");
  const base = SITE.url.replace(/\/$/, "");
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: t.title,
          description: t.meta.description,
          inLanguage: lang,
          datePublished: UPDATED,
          dateModified: UPDATED,
          mainEntityOfPage: `${base}${path}`,
          author: { "@type": "Organization", name: SITE.name, url: base },
          publisher: { "@type": "Organization", name: SITE.name, url: base },
        }}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: t.crumbResources, path: L("/resources") },
          { name: t.crumb, path },
        ])}
      />
      <SimplePage lang={lang} current={null} group="company" crumbs={[{ label: t.crumbResources, href: "/resources" }]} tabs={false} title={t.title} lead={t.lead}>
        <p className="s-meta"><time dateTime={UPDATED}>{fmt(t.updated, { date })}</time></p>
        <p className="small muted">{t.tip}</p>
        {GROUPS.map(([g, items], gi) => (
          <section key={g}>
            <SH2 no={gi + 1}>{t.groups[g].name}</SH2>
            <p>{t.groups[g].intro}</p>
            <ul className="s-table">
              {items.map(([k, name, url], i) => {
                const it = t.items[k];
                const internal = url.startsWith("/");
                return (
                  <li key={k}>
                    <span className="code" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                    <span>
                      <span className="nm">
                        {!url ? name : internal ? <a href={L(url)}>{name}</a> : <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>}
                      </span>
                      <span className="wt">{it.note}</span>
                      <span className="lic">{t.colCost}: {it.cost} · {t.colWhere}: {it.where}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <div className="s-callout"><p>{t.method}</p></div>
        <div className="s-links">
          <a href={L("/for-agencies")}>{getT("agencies").forAgencies.crumb} →</a>
          <a href={L("/resources")}>{t.crumbResources} →</a>
        </div>
      </SimplePage>
    </>
  );
}
