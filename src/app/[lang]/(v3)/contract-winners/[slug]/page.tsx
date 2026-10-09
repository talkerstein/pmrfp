import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { listRfps } from "@/lib/data/rfps";
import { MIN_INDEXED_AWARDS, winnersFromRfps, type Winner } from "@/lib/data/winners";
import { compactDollars, daysUntil } from "@/lib/data/fomo";
import { money } from "@/lib/data/monthly-winners-load";
import { listPackagesForAwardSlugs } from "@/lib/gc/data";
import { officialNotices } from "@/lib/gc/official";
import { gcPostPath } from "@/lib/gc/packages";
import { publicTenderSource } from "@/lib/tenders/sources";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING, SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";
import { LevelBadge } from "@/components/karma/level-badge";
import { packageLevels } from "@/lib/karma/data";

export const revalidate = 3600;

export async function generateStaticParams() {
  return []; // rendered on first visit, then cached (ISR)
}

const day = (d: string | null, lang: Locale) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");

/**
 * Buyer, source label and licence line for one award in the visitor's language.
 * English (and any source without a translation) uses lib/tenders/sources as-is.
 */
function awardSourceCopy(a: Winner["awards"][number], lang: Locale) {
  const override = getDictionary(lang).board.detail.sources[publicTenderSource(a.slug).key];
  const en = getDictionary("en").sharedClient.labels.issuer;
  const local = getDictionary(lang).sharedClient.labels.issuer;
  const key = (Object.keys(en) as (keyof typeof en)[]).find((k) => en[k] === a.source);
  return {
    issuer: override?.issuer ?? a.issuer,
    attribution: override?.attribution ?? a.attribution,
    source: key ? local[key] : a.source,
  };
}

/** "Roofing, HVAC" -> "roofing, hvac" in English; French and Spanish keep acronyms ("toiture, CVC", "techado, HVAC"). */
function lowerTrades(names: string[], lang: Locale): string {
  const list = names.map((n) => tradeName(n, lang)).join(", ");
  if (lang === "en") return list.toLowerCase();
  return list
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLocaleLowerCase(lang)))
    .join(" ");
}

/** Every company with at least one published award has a profile (one-award ones noindexed). */
const load = cache(async (slug: string) => {
  const rfps = await listRfps().catch(() => []);
  const winner = winnersFromRfps(rfps, 1).find((w) => w.slug === slug) ?? null;
  return { rfps, winner };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string; lang: string }> }): Promise<Metadata> {
  const { slug, lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const dict = getDictionary(l);
  const t = dict.partners.winner.meta;
  const { winner: w } = await load(slug);
  if (!w) return { title: t.notFound, robots: { index: false } };
  const n = w.awards.length;
  const one = n < MIN_INDEXED_AWARDS;
  const issuers = [...new Set(w.awards.map((a) => awardSourceCopy(a, l).issuer))];
  const value = w.totalValue ? ` (${compactDollars(w.totalValue, l)})` : "";
  const vars = {
    name: w.name,
    n,
    value,
    worth: w.totalValue ? fmt(t.worth, { amount: money(w.totalValue, l) }) : "",
    issuers: issuers.slice(0, 2).join(t.and),
    trades: w.categories.length ? ` — ${lowerTrades(w.categories.slice(0, 3), l)}` : "",
  };
  const p = dict.gcHub.profile;
  return {
    title: fmt(one ? p.metaTitleOne : t.title, vars),
    description: fmt(one ? p.metaDescriptionOne : t.description, vars),
    alternates: alternatesFor(l, `/contract-winners/${w.slug}`),
    ...(one ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function WinnerPage({ params }: { params: Promise<{ slug: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("partners").winner;
  const p = getT("gcHub").profile;
  const crumbs = getT("partners").crumbs;
  const home = getT("v3Pages").simple.home;
  const L = (path: string) => localizePath(path, lang);
  const { slug } = await params;
  const { rfps, winner: w } = await load(slug);
  if (!w) notFound();

  const sources = w.awards.map((a) => awardSourceCopy(a, lang));
  const issuers = [...new Set(sources.map((s) => s.issuer))];
  const attributions = [...new Set(sources.map((s) => s.attribution))];
  const [notices, packages] = await Promise.all([
    officialNotices(w.awards.map((a) => a.slug)),
    listPackagesForAwardSlugs(w.awards.map((a) => a.slug)),
  ]);
  // Reputation level of the company behind each package (level 2+, poster stays anonymous).
  const pkgLevels = await packageLevels(packages.map((pk) => pk.slug));
  // Open work in the same trades — the "you could be bidding on this" hook.
  const open = rfps
    .filter((r) => r.status === "open" && (daysUntil(r.deadline) ?? 0) >= 0 && r.categories.some((c) => w.categories.includes(c)))
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  const proHref = signUpHrefForPlan("pro", "monthly");
  const lead = [t.eyebrow, w.categories.slice(0, 4).map((c) => tradeName(c, lang)).join(" · ")].filter(Boolean).join(" — ");
  let no = 0;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: crumbs.winners, path: L("/contract-winners") },
          { name: w.name, path: L(`/contract-winners/${w.slug}`) },
        ])}
      />
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: crumbs.winners, href: "/contract-winners" }]}
        tabs={false}
        aside={false}
        title={w.name}
        lead={lead}
      >
        <div className="s-facts">
          <div><div className="k">{t.stats.won}</div><div className="v" data-stat="won">{formatNumber(w.awards.length, lang)}</div></div>
          <div><div className="k">{t.stats.total}</div><div className="v">{w.totalValue ? compactDollars(w.totalValue, lang) : t.stats.notDisclosed}</div></div>
          <div><div className="k">{t.stats.recent}</div><div className="v">{day(w.latest, lang)}</div></div>
        </div>

        <SH2 no={++no} id="contracts">{fmt(t.listTitle, { name: w.name })}</SH2>
        <div className="s-dtw">
          <table className="s-dt" data-list="awards">
            <thead>
              <tr>
                <th scope="col">{p.colContract}</th>
                <th scope="col" className="r">{p.colValue}</th>
                <th scope="col">{p.colDate}</th>
                <th scope="col">{p.colNotice}</th>
              </tr>
            </thead>
            <tbody>
              {w.awards.map((a, i) => {
                const notice = notices.get(a.slug);
                return (
                  <tr key={a.slug}>
                    <td>
                      <a href={L(`/rfps/${a.slug}`)}>{a.title}</a>
                      <span className="sub">
                        {[sources[i].source, a.regionName && !a.source.includes(a.regionName) ? regionName(a.regionName, lang) : null, a.categories[0] ? tradeName(a.categories[0], lang) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td className="r">{a.amount ? money(a.amount, lang) : t.valueNotDisclosed}</td>
                    <td>{day(a.date, lang)}</td>
                    <td>{notice ? <a className="ext" href={notice.url} target="_blank" rel="noopener noreferrer">{notice.exact ? p.notice : p.portal}</a> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {packages.length > 0 && (
          <>
            <SH2 no={++no} id="packages">{p.packages}</SH2>
            <p className="small muted">{p.packagesIntro}</p>
            <ul className="s-table" data-list="packages">
              {packages.map((pk) => (
                <li key={pk.slug}>
                  <span className="code" aria-hidden>{pk.deadline ? Number(pk.deadline.slice(8, 10)) : "—"}</span>
                  <span>
                    <a className="nm" href={L(`/rfps/${pk.slug}`)}>{pk.title}</a>
                    {pkgLevels.has(pk.slug) && <span style={{ display: "block", margin: "4px 0" }}><LevelBadge level={pkgLevels.get(pk.slug)} /></span>}
                    {pk.deadline && <span className="lic">{fmt(getT("gcHub").packages.quotesDue, { date: day(pk.deadline, lang) })}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="g-gc" data-panel="gc">
          <h2 className="hd">{p.gcTitle}</h2>
          <p>{p.gcBody}</p>
          <div className="g-acts">
            <a href={L(gcPostPath(w.awards[0]?.slug))} className="btn navy lg">{p.gcCta}</a>
          </div>
          {w.awards.length > 1 && (
            <>
              <p className="small">{p.gcPick}</p>
              <ul>
                {w.awards.slice(0, 5).map((a) => (
                  <li key={a.slug}><a href={L(gcPostPath(a.slug))}>{a.title}</a></li>
                ))}
              </ul>
            </>
          )}
          <p className="small"><a href={L("/sign-up?role=trade")}>{p.listCta} →</a></p>
        </div>

        <SH2 no={++no} id="open">{p.open}</SH2>
        <div className="g-cta">
          <h3 className="hd">{open.length > 0 ? plural(open.length, t.open.title, { n: formatNumber(open.length, lang) }) : t.open.none}</h3>
          <p>{t.open.body}</p>
          <div className="acts">
            <a href={L(proHref)} className="btn mint lg">{fmt(t.open.cta, { price: PRICING.proMonthly })}</a>
            <a href={L("/gc-hub")} className="lnk">{p.hub} →</a>
          </div>
        </div>
        {open.length > 0 && (
          <ul className="s-table">
            {open.slice(0, 5).map((r) => (
              <li key={r.slug}>
                <span className="code" aria-hidden>{r.deadline ? Number(r.deadline.slice(8, 10)) : "—"}</span>
                <span>
                  <a className="nm" href={L(`/rfps/${r.slug}`)}>{r.title}</a>
                  {r.deadline && <span className="lic">{fmt(t.open.closes, { date: day(r.deadline, lang) })}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="small muted">{fmt(t.footnote, { issuers: issuers.join(", "), attributions: attributions.join(" "), site: SITE.name })}</p>

        <div className="s-links">
          <a href={L("/contract-winners")}>{getT("gcHub").subs.winners} →</a>
          <a href={L("/gc-hub")}>{getT("gcHub").links.hub} →</a>
        </div>
      </SimplePage>
    </>
  );
}
