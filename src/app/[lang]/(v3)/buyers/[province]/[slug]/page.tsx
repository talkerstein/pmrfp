import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordFooter } from "@/components/public/record-footer";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { loadBuyers } from "@/lib/buyers/load";
import { BUYERS_PATH, findBuyerPage, pageKind } from "@/lib/buyers/model";
import { AND, buyerFaq, commercialOf, joinList, platformList } from "@/lib/buyers/faq";
import { buyerOffice } from "@/lib/buyers/office";
import { postedOn } from "@/lib/buyers/posting";
import { portalName } from "@/lib/gc/packages";
import { compactDollars } from "@/lib/data/fomo";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { benchmarkPath, insightsMarketPath } from "@/lib/insights/paths";
import { publicTenderSource } from "@/lib/tenders/sources";
import { buyerPageCta } from "@/lib/buyers/permissions";
import { cityByBuyer } from "@/lib/tenders/city-sources";
import { listYourTendersHref } from "@/lib/buyers/source-links";
import { buyerDisplayName } from "@/lib/towns/claimable";
import { townType } from "@/lib/towns/data";
import { nearbyOpenBids, placeOf } from "@/lib/towns/nearby";
import { buyerPageExtras, followRegionSlug } from "@/lib/towns/page-data";
import { ClaimCta, ManagedRows, TownWidgetCode, UpcomingPurchases, VerifiedBadge } from "@/components/towns/blocks";
import { TownPageView } from "@/components/towns/town-page";
import { FollowBlock } from "@/components/follows/blocks";
import { provincePath } from "@/lib/buyers/province";
import { inSentence } from "@/lib/towns/names";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";

export const revalidate = 86400;

export async function generateStaticParams() {
  // Rendered on first visit, then cached (ISR): no build-time prebuild of the
  // ~3,800 buyer and town pages (DB-load incident 2026-10-09, build budget).
  return [];
}

type Params = Promise<{ lang: string; province: string; slug: string }>;

const day = (d: string | null, lang: Locale) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, province, slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).buyers;
  const p = findBuyerPage((await loadBuyers()).pages, province, slug);
  if (!p) return { title: t.index.h1, robots: { index: false } };
  const { indexable } = await buyerPageExtras(p);
  // Only pages with PMRFP data beyond the link (or a verified buyer, or permission) are indexed; the rest stay out.
  const robots = indexable ? {} : { robots: { index: false, follow: true } };
  if (pageKind(p) === "town" && p.town) {
    const tt = getDictionary(l).towns.meta;
    const name = buyerDisplayName(p, l);
    return {
      title: fmt(tt.townTitle, { name }),
      description: fmt(tt.townDescription, { name, type: townType(p.town, l).toLowerCase(), province: regionName(p.province, l) }),
      alternates: alternatesFor(l, p.path),
      ...robots,
    };
  }
  const platform = platformList(p.buyer.platforms, t, AND[l] ?? "and") || t.index.unknown.toLowerCase();
  return {
    title: fmt(t.meta.buyerTitle, { name: p.buyer.name }),
    description: fmt(t.meta.buyerDescription, { name: p.buyer.name, province: regionName(p.province, l), platform }),
    alternates: alternatesFor(l, p.path),
    ...robots,
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
  // PMRFP for Towns: who manages the page and whether the buyer said yes, from the shared snapshots.
  const { key, managed, permission } = await buyerPageExtras(p);

  // A municipality only Statistics Canada knows (no research yet): its own town page.
  if (pageKind(p) === "town" && p.town) {
    const place = placeOf(p, lang);
    const [rfps, regionSlug] = await Promise.all([listAllRfpsCached().catch(() => []), followRegionSlug(p)]);
    const nearby = nearbyOpenBids(rfps, { province: p.province, place, exclude: new Set(p.openBids.map((o) => o.slug)) });
    return <TownPageView page={p} name={buyerDisplayName(p, lang)} place={place} managed={managed} permission={permission} nearby={nearby} regionSlug={regionSlug} />;
  }

  const b = p.buyer;
  const name = b.name;
  // "Follow": the region picked at sign-up when a signed-out visitor follows.
  const regionSlug = await followRegionSlug(p);
  const province = regionName(p.province, lang);
  const and = AND[lang] ?? "and";
  const platform = platformList(b.platforms, t, and);
  // "Where it posts" without a platform on file: its official bids page, else where its notices on PMRFP were posted.
  const ld = getT("listDepth");
  const posted = postedOn(p).map((portal) => portalName(portal, lang));
  const whereText = platform
    ? fmt(t.page.whereBody, { name, platform })
    : b.tendersUrl
      ? fmt(ld.where.official, { name })
      : posted.length
        ? fmt(ld.where.postedOn, { name, portal: joinList(posted, and) })
        : fmt(t.page.whereUnknown, { name });
  const platformFact = platform || (b.tendersUrl ? t.page.official : posted.length ? joinList(posted, and) : t.index.unknown);
  // Free office details we hold (website, procurement inbox, phone); a verified buyer's own rows come from ManagedRows.
  const office = buyerOffice(b, null);
  const commercial = commercialOf(p);
  const faq = buyerFaq(p, t, lang);
  const tradeBySlug = new Map(categories.map((c) => [c.slug, c.name]));
  const trades = p.awards.tradeSlugs.map((s) => ({ slug: s, name: tradeBySlug.get(s) })).filter((x): x is { slug: string; name: string } => Boolean(x.name)).slice(0, 3);
  const intelHref = L(p.intelSlug ? `/intel/buyers/${p.intelSlug}` : "/intel");
  // The city flow: a buyer that said yes gets the "Listed with permission"
  // card; one that said no gets nothing new (the plain links, as before);
  // everyone else gets the "list your tenders free" link (and, unless the
  // page is managed already, "Claim this page free").
  const city = cityByBuyer(b.slug);
  const tt = getT("towns").page;
  const cta = buyerPageCta(permission);
  const listedWithPermission = cta === "listed";
  const officialPosting = (city?.list.kind === "platform" ? city.list.portalUrl : null) ?? b.portalUrl ?? b.tendersUrl;
  const showListYours = cta === "invite";
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
          { name: province, path: L(provincePath(p.provinceSlug)) },
          { name, path: L(p.path) },
        ])}
      />
      <JsonLd data={faqSchema(faq)} />
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: t.page.crumb, href: BUYERS_PATH }, { label: province, href: provincePath(p.provinceSlug) }]}
        tabs={false}
        aside={false}
        title={name}
        lead={
          p.town?.population != null
            ? fmt(tt.leadPopulation, { type: townType(p.town, lang), province, n: formatNumber(p.town.population, lang) })
            : fmt(t.page.lead, { type: t.groupSingular[b.group].replace(/^./, (c) => c.toUpperCase()), province })
        }
      >
        <div className="s-facts">
          <div><div className="k">{t.page.facts.platform}</div><div className="v" data-stat="platform">{platformFact}</div></div>
          <div><div className="k">{t.page.facts.awards}</div><div className="v" data-stat="awards">{formatNumber(p.awards.count, lang)}</div></div>
          <div><div className="k">{t.page.facts.open}</div><div className="v" data-stat="open">{formatNumber(p.openBids.length, lang)}</div></div>
        </div>

        {managed && <div style={{ marginTop: 18 }}><VerifiedBadge managed={managed} name={managed.organizationName || buyerDisplayName(p, lang)} /></div>}
        {p.fromBoard && <p className="small muted" style={{ marginTop: 18 }}>{t.page.fromBoard}</p>}

        <SH2 no={++no} id="where">{fmt(t.page.whereTitle, { name })}</SH2>
        <p data-where={platform ? "platform" : b.tendersUrl ? "official" : posted.length ? "posted-on" : "unknown"}>{whereText}</p>
        <div className="s-dtw">
          <table className="s-dt" data-list="where">
            <tbody>
              {managed && <ManagedRows managed={managed} />}
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
              {office?.website && (
                <tr>
                  <th scope="row">{ld.office.website}</th>
                  <td><a className="ext" href={office.website} target="_blank" rel="noopener noreferrer nofollow" data-link="website">{office.website.replace(/^https?:\/\/(www\.)?/, "")}</a></td>
                </tr>
              )}
              {(b.email ?? office?.procurementEmail) && (
                <tr>
                  <th scope="row">{t.page.email}</th>
                  <td><a href={`mailto:${b.email ?? office?.procurementEmail}`}>{b.email ?? office?.procurementEmail}</a></td>
                </tr>
              )}
              {office?.phone && (
                <tr>
                  <th scope="row">{ld.office.phone}</th>
                  <td><a href={`tel:${office.phone.replace(/[^0-9+]/g, "")}`} data-office="phone">{office.phone}</a></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {commercial.length > 0 && <p className="small muted" data-flag="link-only">{fmt(t.page.linkOnly, { platform: platformList(commercial, t, and) })}</p>}
        {b.checkedOn && <p className="small muted">{fmt(t.page.checked, { date: day(b.checkedOn, lang) })}</p>}
        {listedWithPermission && (
          <div className="s-callout" data-permission="yes">
            <p>
              <b>{fmt(t.page.permission.listed, { name })}</b>
              {permission?.grantedOn ? ` (${fmt(t.page.permission.since, { date: day(permission.grantedOn, lang) })})` : ""}
            </p>
            <p>{city?.list.kind === "platform" ? fmt(t.page.permission.platform, { name, platform: t.platforms[city.list.platform] }) : t.page.permission.own}</p>
            {officialPosting && (
              <p><a className="ext" href={officialPosting} target="_blank" rel="noopener noreferrer nofollow" data-link="official-posting">{t.page.permission.view} ↗</a></p>
            )}
          </div>
        )}
        {showListYours && (
          <p className="small" data-cta="list-your-tenders">
            <a href={L(listYourTendersHref({ buyerSlug: b.slug, provinceCode: b.provinceCode }))}>{t.page.listYours} →</a>
          </p>
        )}
        {/* A buyer that said no gets nothing new; a managed page is already claimed. */}
        {!managed && cta !== "none" && <ClaimCta name={buyerDisplayName(p, lang)} buyerKey={key} />}

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
        {managed && managed.upcoming.length > 0 && <UpcomingPurchases managed={managed} no={++no} />}

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

        {/* Follow: new bids from this buyer by email (free: 3 buyers, weekly; Trade Pro: unlimited). */}
        <FollowBlock page={p} name={inSentence(buyerDisplayName(p, lang), lang)} regionSlug={regionSlug} kind={b.group === "municipality" ? "town" : "buyer"} />

        {managed && (
          <>
            <SH2 no={++no} id="widget">{tt.widgetTitle}</SH2>
            <TownWidgetCode provinceSlug={p.provinceSlug} slug={b.slug} lang={lang} title={tt.widgetTitle} body={tt.widgetBody} />
          </>
        )}

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
          <a href={L(provincePath(p.provinceSlug))}>{province} →</a>
        </div>
      </SimplePage>
    </>
  );
}
