import type { Metadata } from "next";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { listRfps } from "@/lib/data/rfps";
import { winnersFromRfps } from "@/lib/data/winners";
import { JURISDICTION } from "@/lib/data/contracts-report";
import { getCategories } from "@/lib/data/taxonomy";
import { money, torontoToday } from "@/lib/data/monthly-winners-load";
import { HUB_DAYS, HUB_PAGE_SIZE, filterWins, hubFilterOptions, hubTotals, hubWins, openPackages, sourceKeys } from "@/lib/gc/hub";
import { AWARD_LICENCES, officialNotices } from "@/lib/gc/official";
import { gcPostPath } from "@/lib/gc/packages";
import { slugify } from "@/lib/tenders/shared";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary, type Messages } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";
import { LevelBadge } from "@/components/karma/level-badge";
import { FeaturedContributors } from "@/components/karma/level-stairs";
import { packageLevels } from "@/lib/karma/data";
import { inCountry, parseCountryParam, provinceFirst } from "@/lib/visitor-geo";
import { getVisitorCountry } from "@/lib/visitor-geo.server";

export const revalidate = 3600;

const PATH = "/gc-hub";

type SP = Promise<Record<string, string | undefined>>;

/** Award feed key → licence line key in the reports namespace. */
const SOURCE_TEXT: Record<string, keyof Messages["reports"]["sources"]> = {
  awards: "canadabuys",
  seao: "seao",
  "toronto-awards": "toronto",
  "ns-awards": "ns",
};

export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: SP }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).gcHub.meta;
  const sp = await searchParams;
  // Filtered and paged views are the same page sliced: keep them out of the index.
  const sliced = Boolean(sp.trade || sp.province || (sp.page && sp.page !== "1"));
  return {
    title: { absolute: t.title },
    description: t.description,
    alternates: alternatesFor(l, PATH),
    ...(sliced ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function GcHubPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const t = getT("gcHub");
  const home = getT("v3Pages").simple.home;
  const jurT = getT("partners").report.jurisdictions;
  const srcT = getT("reports").sources;
  const L = (p: string) => localizePath(p, lang);
  const n = (x: number) => formatNumber(x, lang);
  const day = (d: string) => formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "short", day: "numeric", year: "numeric" });
  const sp = await searchParams;

  // Country-first: wins and GC packages from the visitor's country only
  // (?country=ca|us views the other), their province/state's packages first.
  const [board, categories, visitor] = await Promise.all([
    listRfps().catch(() => []),
    getCategories().catch(() => []),
    getVisitorCountry({ param: sp.country }),
  ]);
  const rfps = inCountry(board, visitor.country);
  const all = hubWins(rfps, winnersFromRfps(rfps, 1), { today: torontoToday() });
  const packages = provinceFirst(openPackages(rfps), visitor.province, (p) => p.province);
  const pkgLevels = await packageLevels(packages.slice(0, 20).map((p) => p.slug));
  const totals = hubTotals(all);
  const options = hubFilterOptions(all);

  // Filters arrive as slugs; anything unknown is ignored rather than 404ing.
  const tradeCat = sp.trade ? categories.find((c) => c.slug === sp.trade) ?? null : null;
  const province = sp.province ? options.provinces.find(([p]) => slugify(p) === sp.province)?.[0] ?? null : null;
  const filtered = filterWins(all, { trade: tradeCat?.name, province });
  const pages = Math.max(1, Math.ceil(filtered.length / HUB_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const rows = filtered.slice((page - 1) * HUB_PAGE_SIZE, page * HUB_PAGE_SIZE);
  const notices = await officialNotices(rows.map((r) => r.slug));
  const keep = (p: number) => {
    const q = new URLSearchParams();
    if (tradeCat) q.set("trade", tradeCat.slug);
    if (province) q.set("province", slugify(province));
    if (parseCountryParam(sp.country)) q.set("country", sp.country!.toLowerCase());
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return L(qs ? `${PATH}?${qs}` : PATH);
  };
  const tradeOptions = options.trades.flatMap(([name, count]) => {
    const cat = categories.find((c) => c.name === name);
    return cat ? [{ cat, count }] : [];
  });
  const proHref = signUpHrefForPlan("pro", "monthly");
  const keys = sourceKeys(all);
  const portalRows = keys.some((k) => k === "toronto-awards" || k === "ns-awards");
  let no = 0;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: t.crumb, path: L(PATH) },
        ])}
      />
      <SimplePage lang={lang} current={null} group="company" crumbs={[]} tabs={false} aside={false} title={t.title} lead={t.lead}>
        <div className="s-facts">
          <div><div className="k">{fmt(t.stats.wins, { days: HUB_DAYS })}</div><div className="v" data-stat="wins">{n(totals.awards)}</div></div>
          <div><div className="k">{t.stats.companies}</div><div className="v" data-stat="companies">{n(totals.companies)}</div></div>
          <div><div className="k">{t.stats.packages}</div><div className="v" data-stat="packages">{n(packages.length)}</div></div>
        </div>

        <SH2 no={++no} id="packages">{t.sec.packages}</SH2>
        <p>{t.packages.intro}</p>
        {packages.length ? (
          <>
            <ul className="s-table" data-list="packages">
              {packages.slice(0, 20).map((p) => (
                <li key={p.slug}>
                  <span className="code" aria-hidden>{p.deadline ? Number(p.deadline.slice(8, 10)) : "—"}</span>
                  <span>
                    <a className="nm" href={L(`/rfps/${p.slug}`)}>{p.title}</a>
                    {pkgLevels.has(p.slug) && <span style={{ display: "block", margin: "4px 0" }}><LevelBadge level={pkgLevels.get(p.slug)} /></span>}
                    <span className="wt">
                      {[p.categories[0] ? tradeName(p.categories[0], lang) : null, p.regionName ? regionName(p.regionName, lang) : null, p.gcProjectName ? fmt(t.packages.project, { name: p.gcProjectName }) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {p.deadline && <span className="lic">{fmt(t.packages.quotesDue, { date: day(p.deadline) })}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="small"><a href={L("/rfps?view=gc")}>{t.packages.all} →</a></p>
          </>
        ) : (
          <div className="s-callout" data-empty="packages">
            <p>{t.packages.none}</p>
            <p><a href={L(gcPostPath())}>{t.gc.cta} →</a></p>
          </div>
        )}
        {/* Reputation perk: level 4-5 companies, rotated daily. Hidden until one exists. */}
        <FeaturedContributors />

        <SH2 no={++no} id="wins">{t.sec.wins}</SH2>
        <p>{fmt(t.wins.intro, { days: HUB_DAYS })}</p>
        <form method="get" action={L(PATH)} className="g-filter">
          <label className="s-fld">
            <span>{t.wins.trade}</span>
            <select name="trade" defaultValue={tradeCat?.slug ?? ""}>
              <option value="">{t.wins.allTrades}</option>
              {tradeOptions.map(({ cat, count }) => (
                <option key={cat.slug} value={cat.slug}>{`${tradeName(cat.name, lang)} (${n(count)})`}</option>
              ))}
            </select>
          </label>
          <label className="s-fld">
            <span>{t.wins.province}</span>
            <select name="province" defaultValue={province ? slugify(province) : ""}>
              <option value="">{t.wins.allProvinces}</option>
              {options.provinces.map(([p, count]) => (
                <option key={p} value={slugify(p)}>{`${regionName(p, lang)} (${n(count)})`}</option>
              ))}
            </select>
          </label>
          <button type="submit">{t.wins.apply}</button>
          {(tradeCat || province) && <a className="clr" href={L(PATH)}>{t.wins.clear}</a>}
        </form>

        {filtered.length ? (
          <>
            <p className="g-count">
              {pages > 1
                ? fmt(t.wins.range, { from: n((page - 1) * HUB_PAGE_SIZE + 1), to: n((page - 1) * HUB_PAGE_SIZE + rows.length), n: n(filtered.length) })
                : plural(filtered.length, t.wins.count, { n: n(filtered.length) })}
            </p>
            <div className="s-dtw">
              <table className="s-dt" data-list="wins">
                <thead>
                  <tr>
                    <th scope="col">{t.wins.colContractor}</th>
                    <th scope="col">{t.wins.colContract}</th>
                    <th scope="col" className="r">{t.wins.colValue}</th>
                    <th scope="col">{t.wins.colDate}</th>
                    <th scope="col">{t.wins.colSource}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => {
                    const notice = notices.get(w.slug);
                    return (
                      <tr key={w.slug}>
                        <td className="nm">{w.winnerSlug ? <a href={L(`/contract-winners/${w.winnerSlug}`)}>{w.winner}</a> : w.winner}</td>
                        <td>
                          <a href={L(`/rfps/${w.slug}`)}>{w.title}</a>
                          <span className="sub">
                            {[w.buyer, w.categories.slice(0, 2).map((c) => tradeName(c, lang)).join(", ") || null, w.province ? regionName(w.province, lang) : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </td>
                        <td className="r">{w.amount ? money(w.amount, lang) : t.wins.notDisclosed}</td>
                        <td>{day(w.date)}</td>
                        <td>
                          {jurT[w.jurisdiction] ?? w.jurisdiction}
                          {notice && (
                            <span className="sub">
                              <a href={notice.url} target="_blank" rel="noopener noreferrer">{notice.exact ? t.wins.official : t.wins.portal}</a>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <nav className="g-pager" aria-label={t.sec.wins}>
                {page > 1 ? <a href={keep(page - 1)} rel="prev">{t.wins.newer}</a> : <span />}
                {page < pages ? <a href={keep(page + 1)} rel="next">{t.wins.older}</a> : <span />}
              </nav>
            )}
          </>
        ) : (
          <p className="s-note" data-empty="wins">{fmt(t.wins.none, { days: HUB_DAYS })}</p>
        )}

        <div className="g-cta">
          <div className="eb">{t.sec.subs}</div>
          <h3 className="hd">{t.subs.title}</h3>
          <p>{t.subs.body}</p>
          <div className="acts">
            <a href={L(proHref)} className="btn mint lg">{fmt(t.subs.cta, { price: PRICING.proMonthly })}</a>
            <a href={L("/contract-winners")} className="lnk">{t.subs.winners} →</a>
          </div>
        </div>

        <SH2 no={++no} id="post">{t.sec.gc}</SH2>
        <p className="intro">{t.gc.title}</p>
        <ol className="g-steps">
          {t.gc.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <p className="small muted">{t.gc.free}</p>
        <div className="g-acts">
          <a href={L(gcPostPath())} className="btn navy lg">{t.gc.cta}</a>
          <a href={L("/for/general-contractors")}>{t.gc.more} →</a>
        </div>

        <SH2 no={++no} id="sources">{t.sec.sources}</SH2>
        <div className="s-callout">
          <p>{t.sources.body}</p>
          {portalRows && <p>{t.sources.portalNote}</p>}
        </div>
        {keys.length > 0 && (
          <ul className="s-table">
            {keys.map((k, i) => (
              <li key={k}>
                <span className="code" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="nm">{jurT[JURISDICTION[k] ?? k] ?? JURISDICTION[k] ?? k}</span>
                  {SOURCE_TEXT[k] && <span className="wt">{srcT[SOURCE_TEXT[k]]}</span>}
                  {AWARD_LICENCES[k] && <span className="lic"><a href={AWARD_LICENCES[k]} rel="license noopener" target="_blank">{AWARD_LICENCES[k]}</a></span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {[...new Set(all.map((w) => w.attribution))].map((a) => <p key={a} className="small muted">{a}</p>)}

        <div className="s-links">
          <a href={L("/contract-winners")}>{t.subs.winners} →</a>
          <a href={L("/reports/contract-winners")}>{getT("reports").crumbIndex} →</a>
          <a href={L("/rfps")}>{getT("v3Pages").simple.browse}</a>
        </div>
      </SimplePage>
    </>
  );
}
