import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordFooter } from "@/components/public/record-footer";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { loadBuyers } from "@/lib/buyers/load";
import { BUYERS_PATH, findBuyerPage, isIndexableBuyer } from "@/lib/buyers/model";
import { AND, buyerFaq, commercialOf, platformList } from "@/lib/buyers/faq";
import { compactDollars } from "@/lib/data/fomo";
import { benchmarkPath, insightsMarketPath } from "@/lib/insights/paths";
import { publicTenderSource } from "@/lib/tenders/sources";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";

export const revalidate = 3600;

export async function generateStaticParams() {
  return []; // rendered on first visit, then cached — no build-time prebuild (DB-load incident 2026-10-09)
}

type Params = Promise<{ lang: string; province: string; slug: string }>;

const day = (d: string | null, lang: Locale) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, province, slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).buyers;
  const p = findBuyerPage((await loadBuyers()).pages, province, slug);
  if (!p) return { title: t.index.h1, robots: { index: false } };
  const platform = platformList(p.buyer.platforms, t, AND[l] ?? "and") || t.index.unknown.toLowerCase();
  return {
    title: fmt(t.meta.buyerTitle, { name: p.buyer.name }),
    description: fmt(t.meta.buyerDescription, { name: p.buyer.name, province: regionName(p.province, l), platform }),
    alternates: alternatesFor(l, p.path),
    // Only pages with PMRFP data beyond the link are indexed; link-and-tips pages stay out.
    ...(isIndexableBuyer(p) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function BuyerPageView({ params }: { params: Params }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("buyers");
  const mp = getT("majorProjects");
  const home = getT("v3Pages").simple.home;
  const L = (path: string) => localizePath(path, lang);
  const { province: provSlug, slug } = await params;
  const { pages, categories } = await loadBuyers();
  const p = findBuyerPage(pages, provSlug, slug);
  if (!p) notFound();

  const b = p.buyer;
  const name = b.name;
  const province = regionName(p.province, lang);
  const and = AND[lang] ?? "and";
  const platform = platformList(b.platforms, t, and);
  const commercial = commercialOf(p);
  const faq = buyerFaq(p, t, lang);
  const tradeBySlug = new Map(categories.map((c) => [c.slug, c.name]));
  const trades = p.awards.tradeSlugs.map((s) => ({ slug: s, name: tradeBySlug.get(s) })).filter((x): x is { slug: string; name: string } => Boolean(x.name)).slice(0, 3);
  const alertsHref = `${L("/sign-up")}?next=${encodeURIComponent(`${L("/rfps")}?q=${name}`)}`;
  const intelHref = L(p.intelSlug ? `/intel/buyers/${p.intelSlug}` : "/intel");
  const credits = new Set<string>();
  for (const o of p.openBids) credits.add(publicTenderSource(o.slug).attribution);
  for (const a of p.awards.recent) credits.add(publicTenderSource(a.slug).attribution);
  let no = 0;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: t.page.crumb, path: L(BUYERS_PATH) },
          { name, path: L(p.path) },
        ])}
      />
      <JsonLd data={faqSchema(faq)} />
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: t.page.crumb, href: BUYERS_PATH }]}
        tabs={false}
        aside={false}
        title={name}
        lead={fmt(t.page.lead, { type: t.groupSingular[b.group].replace(/^./, (c) => c.toUpperCase()), province })}
      >
        <div className="s-facts">
          <div><div className="k">{t.page.facts.platform}</div><div className="v" data-stat="platform">{platform || t.index.unknown}</div></div>
          <div><div className="k">{t.page.facts.awards}</div><div className="v" data-stat="awards">{formatNumber(p.awards.count, lang)}</div></div>
          <div><div className="k">{t.page.facts.open}</div><div className="v" data-stat="open">{formatNumber(p.openBids.length, lang)}</div></div>
        </div>

        {p.fromBoard && <p className="small muted" style={{ marginTop: 18 }}>{t.page.fromBoard}</p>}

        <SH2 no={++no} id="where">{fmt(t.page.whereTitle, { name })}</SH2>
        <p>{platform ? fmt(t.page.whereBody, { name, platform }) : fmt(t.page.whereUnknown, { name })}</p>
        <div className="s-dtw">
          <table className="s-dt" data-list="where">
            <tbody>
              {b.tendersUrl && (
                <tr>
                  <th scope="row">{t.page.official}</th>
                  <td><a className="ext" href={b.tendersUrl} target="_blank" rel="noopener noreferrer nofollow" data-link="official">{b.tendersUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></td>
                </tr>
              )}
              {b.portalUrl && (
                <tr>
                  <th scope="row">{fmt(t.page.portal, { platform: t.platforms[b.platforms.find((k) => k !== "own-site") ?? "own-site"] })}</th>
                  <td><a className="ext" href={b.portalUrl} target="_blank" rel="noopener noreferrer nofollow" data-link="portal">{b.portalUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></td>
                </tr>
              )}
              {b.email && (
                <tr>
                  <th scope="row">{t.page.email}</th>
                  <td><a href={`mailto:${b.email}`}>{b.email}</a></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {commercial.length > 0 && <p className="small muted" data-flag="link-only">{fmt(t.page.linkOnly, { platform: platformList(commercial, t, and) })}</p>}
        {b.checkedOn && <p className="small muted">{fmt(t.page.checked, { date: day(b.checkedOn, lang) })}</p>}

        <SH2 no={++no} id="register">{t.page.registerTitle}</SH2>
        {(b.platforms.length ? b.platforms.slice(0, 3) : (["unknown"] as const)).map((k) => (
          <div key={k} data-tips={k}>
            {b.platforms.length > 1 && <h3>{t.platforms[k as keyof typeof t.platforms]}</h3>}
            <ol>
              {t.tips[k].map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>
        ))}
        <p className="small muted">{t.page.tipsNote}</p>

        <SH2 no={++no} id="open">{fmt(t.page.openTitle, { name })}</SH2>
        {p.openBids.length ? (
          <ul className="s-table" data-list="open">
            {p.openBids.map((r) => (
              <li key={r.slug}>
                <span className="code" aria-hidden>{r.deadline ? Number(r.deadline.slice(8, 10)) : "—"}</span>
                <span>
                  <a className="nm" href={L(`/rfps/${r.slug}`)}>{r.title}</a>
                  {r.deadline && <span className="lic">{fmt(t.page.openCloses, { date: day(r.deadline, lang) })}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{fmt(t.page.openNone, { name })}</p>
        )}

        <SH2 no={++no} id="awards">{fmt(t.page.awardsTitle, { name })}</SH2>
        {p.awards.count ? (
          <>
            <p data-stat="award-summary">
              {fmt(p.awards.valued ? t.page.awardsSummary : t.page.awardsSummaryNoValue, {
                n: formatNumber(p.awards.count, lang),
                first: day(p.awards.first, lang),
                last: day(p.awards.last, lang),
                valued: formatNumber(p.awards.valued, lang),
                value: compactDollars(p.awards.totalValue, lang),
              })}
            </p>
            {p.awards.topWinners.length > 0 && (
              <>
                <h3>{t.page.topWinners}</h3>
                <ul className="s-table" data-list="winners">
                  {p.awards.topWinners.map((w) => (
                    <li key={w.name}>
                      <span className="code" aria-hidden>{w.awards}</span>
                      <span>
                        {w.publicSlug ? <a className="nm" href={L(`/contract-winners/${w.publicSlug}`)}>{w.name}</a> : <span className="nm">{w.name}</span>}
                        <span className="lic">{[fmt(t.page.winnerAwards, { n: formatNumber(w.awards, lang) }), w.value ? compactDollars(w.value, lang) : null].filter(Boolean).join(" · ")}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {p.awards.individuals > 0 && <p className="small muted">{fmt(t.page.individuals, { n: formatNumber(p.awards.individuals, lang) })}</p>}
            <h3>{t.page.recent}</h3>
            <ul className="s-table" data-list="awards">
              {p.awards.recent.map((a) => (
                <li key={a.slug}>
                  <span className="code" aria-hidden>{Number(a.date.slice(8, 10))}</span>
                  <span>
                    <a className="nm" href={L(`/rfps/${a.slug}`)}>{a.title}</a>
                    <span className="lic">{[day(a.date, lang), a.winner, a.amount ? compactDollars(a.amount, lang) : null].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">{fmt(t.page.awardsNone, { name })}</p>
        )}

        <div className="g-cta" data-cta="intel">
          <h3 className="hd">{t.page.intelTitle}</h3>
          <p>{fmt(t.page.intelBody, { name })}</p>
          <div className="acts">
            <a href={intelHref} className="btn mint lg">{t.page.intelBtn}</a>
          </div>
        </div>

        {p.municipality && p.projectsTotal > 0 && (
          <>
            <SH2 no={++no} id="projects">{fmt(t.page.projectsTitle, { place: p.municipality })}</SH2>
            <p className="small muted">{fmt(t.page.projectsBody, { place: p.municipality })}</p>
            <ul className="s-table" data-list="projects">
              {p.projects.map((r) => (
                <li key={r.slug}>
                  <span className="code" aria-hidden>{(mp.statuses[r.status as keyof typeof mp.statuses] ?? r.status).slice(0, 1)}</span>
                  <span>
                    <a className="nm" href={L(`/major-projects/${r.slug}`)}>{r.name}</a>
                    <span className="lic">{[mp.statuses[r.status as keyof typeof mp.statuses] ?? r.status, r.value ? compactDollars(r.value, lang) : null, mp.sourceNames[r.source] ?? null].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="small"><a href={L(`/major-projects?province=${p.provinceSlug}`)}>{fmt(t.page.projectsMore, { n: formatNumber(p.projectsTotal, lang), province })} →</a></p>
          </>
        )}

        {trades.length > 0 && (
          <>
            <SH2 no={++no} id="insights">{t.page.insightsTitle}</SH2>
            <ul data-list="insights">
              {trades.map((tr) => (
                <li key={tr.slug}>
                  <a href={L(benchmarkPath(tr.slug, p.province))}>{fmt(t.page.benchmark, { trade: tradeName(tr.name, lang), province })}</a>
                  {" · "}
                  <a href={L(insightsMarketPath(tr.slug, p.province))}>{fmt(t.page.insight, { trade: tradeName(tr.name, lang), province })}</a>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="g-cta" data-cta="alerts">
          <h3 className="hd">{fmt(t.page.alertsTitle, { name })}</h3>
          <p>{fmt(t.page.alertsBody, { name, province })}</p>
          <div className="acts">
            <a href={alertsHref} className="btn mint lg">{t.page.alertsBtn}</a>
          </div>
        </div>

        <SH2 no={++no} id="faq">{t.page.faqTitle}</SH2>
        <dl data-list="faq">
          {faq.map((x) => (
            <div key={x.q}>
              <dt><b>{x.q}</b></dt>
              <dd>{x.a}</dd>
            </div>
          ))}
        </dl>

        <SH2 no={++no} id="sources">{t.page.sourcesTitle}</SH2>
        <p className="small muted">{t.page.sourcesBody}</p>
        <RecordFooter credits={credits} lang={lang} kind="other" path={p.path} refId={`${p.provinceSlug}/${b.slug}`} />

        <div className="s-links">
          <a href={L(BUYERS_PATH)}>{t.page.back} →</a>
          <a href={L(`${BUYERS_PATH}#${p.provinceSlug}`)}>{province} →</a>
        </div>
      </SimplePage>
    </>
  );
}
