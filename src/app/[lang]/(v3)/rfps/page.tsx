import type { Metadata } from "next";
import Image from "next/image";
import { ReferBanner } from "@/components/public/refer-banner";
import { EmailCapture } from "@/components/public/email-capture";
import { DigestBand } from "@/components/v3-pages/digest";
import { PriceLine } from "@/components/v3-pages/price";
import { SubmitSelect } from "@/components/v3-pages/submit-select";
import { listRfps, withPublicRfpPhotos } from "@/lib/data/rfps";
import { getOpenRfpCounts } from "@/lib/data/rfp-counts";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { awardTotals, winnersFromRfps } from "@/lib/data/winners";
import { hasActiveTradeAccess } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { boardStats, compactDollars, daysUntil, isPastContract, parseAward } from "@/lib/data/fomo";
import { isGcPackage } from "@/lib/gc/packages";
import { provinceFirst, regionCountry, rfpMarket } from "@/lib/visitor-geo";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { publicTenderSource } from "@/lib/tenders/sources";
import { buyerFromSummary } from "@/lib/seo/rfp-meta";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import type { RfpListItem } from "@/lib/data/types";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";

const PAGE_SIZE = 30;
const AWARDED_PREVIEW = 9;
const SIDEBAR_TRADES = 11;
const HERO_IMG = "/images/photos/site-crew-deck.webp";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang: Locale = hasLocale(raw) ? raw : "en";
  const t = getDictionary(lang).board.meta;
  const { country } = await getVisitorCountry();
  const open = (await getOpenRfpCounts(null, undefined, country).catch(() => ({ totalOpen: 0 }))).totalOpen;
  return {
    // Live count + "free" in the title: searchers compare boards on volume and price.
    title: open > 0 ? plural(open, t.titleCount, { n: lang === "en" ? String(open) : formatNumber(open, lang) }) : t.title,
    description: fmt(t.description, { lead: open > 0 ? plural(open, t.lead) : t.leadNone }),
    alternates: alternatesFor(lang, "/rfps"),
  };
}

type Country = "ca" | "us" | "all";
type Closing = "all" | "today" | "tomorrow" | "week" | "later";
type Source = "all" | "public" | "pm";

/** "$498,992" / "498 992 $". */
function dollars(n: number, lang: Locale): string {
  const s = formatNumber(Math.round(n), lang === "es" ? "en" : lang);
  return lang === "fr" ? `${s} $` : `$${s}`;
}

const LockIcon = ({ size = 16, stroke = "#4B4F6B" }: { size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="2" aria-hidden><rect x="3" y="7" width="10" height="7" rx="2" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
);

export default async function RfpsPage({
  searchParams,
  params,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("board");
  const v = getT("v3Pages").board;
  const lang = getLang();
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  const trade = (name: string) => tradeName(name, lang);
  const sp = await searchParams;
  const [allRfps, board, categories, allRegions, propertyTypes, access, visitor] = await Promise.all([
    listRfps(
      {
        category: sp.category,
        region: sp.region,
        propertyType: sp.propertyType,
        q: sp.q,
        sort: (sp.sort as "closing" | "newest") ?? "closing",
      },
      { photos: false },
    ),
    listAllRfpsCached().catch(() => [] as RfpListItem[]),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
    hasActiveTradeAccess(),
    getVisitorCountry(),
  ]);
  const market = visitor.country;

  // Country: the visitor's market by default (U.S. visitors see U.S. work
  // first, Canadians Canadian), switchable with the tabs. A region filter
  // already picks a place, so it shows every country.
  const country: Country =
    sp.country === "ca" || sp.country === "us" || sp.country === "all"
      ? sp.country
      : sp.region
        ? "all"
        : market === "US" ? "us" : "ca";
  const closing: Closing = (["today", "tomorrow", "week", "later"] as const).find((c) => c === sp.closing) ?? "all";
  const source: Source = sp.source === "public" || sp.source === "pm" ? sp.source : "all";
  const inCountry = (c: Country) => (r: RfpListItem) => c === "all" || (rfpMarket(r) === "US") === (c === "us");
  const inSource = (r: RfpListItem) => source === "all" || (r.sourceType === "public_source") === (source === "public");
  const inClosing = (r: RfpListItem) => {
    if (closing === "all") return true;
    const d = daysUntil(r.deadline);
    if (d === null) return closing === "later";
    if (closing === "today") return d <= 0;
    if (closing === "tomorrow") return d === 1;
    if (closing === "week") return d <= 7;
    return d > 7;
  };
  const rfps = allRfps.filter(inCountry(country)).filter(inSource);
  const openIn = (c: Country) => allRfps.filter((r) => r.status === "open" && inCountry(c)(r)).length;

  // Every number here is counted from the listings; the award total is the
  // same one /contract-winners shows.
  const locked = isSupabaseConfigured() ? !access : false;
  const stats = boardStats(rfps);
  // Award totals for this country only (never Canada + U.S. added together).
  const awards = awardTotals(winnersFromRfps(country === "all" ? board : board.filter(inCountry(country))));
  // Country-first, then province/state-first: the visitor's own province leads
  // ("Ontario first, then the rest of Canada") unless they picked a region.
  const localProvince = !sp.region && country !== "all" && (country === "us") === (market === "US") ? visitor.province : null;
  const open = provinceFirst(rfps.filter((r) => r.status === "open"), localProvince, (r) => r.province);
  // Region pickers list the chosen country's regions.
  const regions = country === "all" ? allRegions : allRegions.filter((r) => (regionCountry(r) === "US") === (country === "us"));
  const past = rfps.filter((r) => r.status !== "open" && isPastContract(r));
  const otherClosed = rfps.filter((r) => r.status !== "open" && !isPastContract(r));
  const showAwarded = sp.view === "awarded";
  const gcOpen = open.filter(isGcPackage);
  const showGc = sp.view === "gc";
  const pageNum = Math.max(1, Number(sp.page) || 1);
  const listing = (showAwarded ? [...past, ...otherClosed] : showGc ? gcOpen : open).filter(showAwarded ? () => true : inClosing);
  const pages = Math.max(1, Math.ceil(listing.length / PAGE_SIZE));
  const visible = listing.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);
  const recent = !showAwarded && !showGc ? past.slice(0, AWARDED_PREVIEW) : [];
  const hydrated = await withPublicRfpPhotos([...visible, ...recent]);
  const pageItems = hydrated.slice(0, visible.length);
  const recentItems = hydrated.slice(visible.length);

  // URL helpers: every filter is a link or a GET form, so the board works without JS and stays crawlable.
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, val]) => val && k !== "page") as [string, string][]);
    for (const [k, val] of Object.entries(patch)) {
      if (val == null) q.delete(k);
      else q.set(k, val);
    }
    const qs = q.toString();
    return L(qs ? `/rfps?${qs}` : "/rfps");
  };
  const pageHref = (n: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, val]) => val) as [string, string][]);
    q.set("page", String(n));
    return L(`/rfps?${q.toString()}`);
  };
  const clearAll = href({ category: null, region: null, propertyType: null, q: null, closing: null, source: null });

  // Sidebar: open listings per trade in this country (not narrowed by the trade filter, so you can switch).
  const tradeCounts = new Map<string, number>();
  for (const r of board) {
    if (r.status !== "open" || !inCountry(country)(r)) continue;
    for (const c of r.categories) tradeCounts.set(c, (tradeCounts.get(c) ?? 0) + 1);
  }
  const topTrades = categories
    .map((c) => ({ ...c, n: tradeCounts.get(c.name) ?? 0 }))
    .filter((c) => c.n > 0 || c.slug === sp.category)
    .sort((a, b) => b.n - a.n)
    .slice(0, SIDEBAR_TRADES);
  const maxTrade = Math.max(1, ...topTrades.map((c) => c.n));

  const category = sp.category ? categories.find((c) => c.slug === sp.category) : undefined;
  const region = sp.region ? regions.find((r) => r.slug === sp.region) : undefined;
  const propertyType = sp.propertyType ? propertyTypes.find((p) => p.slug === sp.propertyType) : undefined;
  const chips: { kind: string; label: string; href: string }[] = [];
  if (category) chips.push({ kind: v.chips.category, label: trade(category.name), href: href({ category: null }) });
  if (region) chips.push({ kind: v.chips.region, label: regionName(region.name, lang), href: href({ region: null }) });
  if (propertyType) chips.push({ kind: v.chips.propertyType, label: propertyTypeName(propertyType.name, lang), href: href({ propertyType: null }) });
  if (sp.q) chips.push({ kind: v.chips.q, label: sp.q, href: href({ q: null }) });
  if (closing !== "all") chips.push({ kind: v.chips.closing, label: v.windows[closing], href: href({ closing: null }) });
  if (source !== "all") chips.push({ kind: v.chips.source, label: source === "public" ? v.filters.sourcePublic : v.filters.sourcePm, href: href({ source: null }) });
  const hasFilters = chips.length > 0;

  const tabs = [
    { key: "open", label: t.tabs.open, count: open.length, href: href({ view: null }), active: !showAwarded && !showGc, show: true },
    { key: "gc", label: t.tabs.gc, count: gcOpen.length, href: href({ view: "gc" }), active: showGc, show: gcOpen.length > 0 || showGc },
    { key: "awarded", label: t.tabs.awarded, count: past.length + otherClosed.length, href: href({ view: "awarded" }), active: showAwarded, show: true },
  ].filter((x) => x.show);

  const countryWord = t.country[country];
  const proHref = L(signUpHrefForPlan("pro", "monthly"));
  const keep = (names: string[]) =>
    names.filter((k) => sp[k]).map((k) => <input key={k} type="hidden" name={k} value={sp[k]} />);

  // Digest band: the visitor's filter, preselected.
  const digestTrades = [{ value: "", label: v.search.allTrades }, ...categories.map((c) => ({ value: c.slug, label: trade(c.name) }))];
  const digestAreas: { label: string; region?: string; country?: "ca" | "us" }[] = [
    { label: v.search.allCanada, country: "ca" },
    { label: v.search.allUs, country: "us" },
    ...regions.map((r) => ({ label: regionName(r.name, lang), region: r.slug })),
  ];
  const digestArea = region ? digestAreas.findIndex((a) => a.region === region.slug) : country === "us" ? 1 : 0;

  const row = (r: RfpListItem) => {
    const isOpen = r.status === "open";
    const d = isOpen ? daysUntil(r.deadline) : null;
    const tone = !isOpen ? "past" : d !== null && d <= 0 ? "today" : d === 1 ? "tomorrow" : "later";
    const award = !isOpen && isPastContract(r) ? parseAward(r.summary) : null;
    const src = r.sourceType === "public_source" ? publicTenderSource(r.slug) : null;
    const portal = src ? (t.detail.sources[src.key]?.portal ?? src.portal).replace(/^(the|le|la|les|el|los|las) /i, "") : null;
    const kind = isGcPackage(r) ? v.row.gc : !isOpen && award ? v.row.award : src ? v.row.publicTender : v.row.pmRfp;
    const buyer = buyerFromSummary(r.summary) ?? (src ? null : v.row.pmBuyer);
    const where = regionName(r.city ? `${r.city}${r.province ? `, ${r.province}` : ""}` : (r.regionName ?? r.province ?? ""), lang);
    const left = !isOpen
      ? award ? v.row.awarded : v.row.closed
      : d === null ? v.row.noDate : d <= 0 ? v.row.today : d === 1 ? v.row.tomorrow : fmt(v.row.daysLeft, { n: num(d) });
    const mon = r.deadline ? formatDate(r.deadline, lang, { month: "short" }) : "";
    const day = r.deadline ? String(Number(r.deadline.slice(8, 10))) : "—";
    const link = L(`/rfps/${r.slug}`);
    return (
      <article key={r.slug} className="vp-row">
        <div className={`vp-date ${tone}`}>
          <span className="mo">{isOpen ? fmt(v.row.closes, { mon }) : mon}</span>
          <span className="n">{day}</span>
          <span className="l">{left}</span>
        </div>
        <div className="vp-row-main">
          <div className="vp-row-tags">
            {r.categories[0] && <span className="vp-tag">{trade(r.categories[0])}</span>}
            <span className="vp-kind">{portal ? `${kind} · ${portal}` : kind}</span>
          </div>
          <h3 className="vp-row-title"><a href={link}>{r.title}</a></h3>
          <div className="vp-row-meta">
            {buyer && (
              <span><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#4B4F6B" strokeWidth="1.8" aria-hidden><path d="M2.5 14V4.5L8 2l5.5 2.5V14M6 14v-3.5h4V14M1.5 14h13" /></svg>{buyer}</span>
            )}
            {where && (
              <span><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#4B4F6B" strokeWidth="1.8" aria-hidden><path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 00-9 0c0 3.6 4.5 7.8 4.5 7.8z" /><circle cx="8" cy="6.5" r="1.6" /></svg>{where}</span>
            )}
          </div>
        </div>
        <div className="vp-row-side">
          {award ? (
            <div>
              <div className="vp-kicker">{v.row.value}</div>
              <div className="vp-row-val">{award.amount ? dollars(award.amount, lang) : "—"}</div>
              {award.winner && <div className="vp-row-win">{fmt(v.row.wonBy, { winner: award.winner })}</div>}
            </div>
          ) : locked && isOpen ? (
            <div>
              <div className="vp-kicker"><LockIcon size={13} />{v.row.locked}</div>
              <div className="vp-shim shim" aria-hidden><span style={{ width: "100%" }} /><span style={{ width: "82%" }} /><span style={{ width: "58%" }} /></div>
            </div>
          ) : (
            <div className="vp-kicker">{isOpen ? v.row.unlocked : v.row.closedNote}</div>
          )}
          <div className="vp-row-ctas">
            {locked && isOpen && (
              <a href={proHref} className="vp-save" aria-label={v.row.save} title={v.row.save}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#1B1D3A" strokeWidth="1.8" aria-hidden><path d="M4 2h8v12l-4-3-4 3z" /></svg>
              </a>
            )}
            <a href={link} className="vp-view">{v.row.view} <span className="go" aria-hidden>→</span></a>
          </div>
        </div>
      </article>
    );
  };

  // Numbered pages around the current one.
  const pageList: number[] = [];
  const from = Math.max(1, Math.min(pageNum - 4, pages - 8));
  for (let p = from; p <= Math.min(pages, from + 8); p++) pageList.push(p);

  return (
    <>
      <div className="v3-top">
        <section className="v3-wrap vp-hero">
          <div className="vp-hero-main">
            <div className="vp-eyebrow"><span className="vp-ping" aria-hidden><span className="ping" /><span /></span>{fmt(v.eyebrow, { country: countryWord })}</div>
            <h1 className="vp-h1">{t.hero.title}</h1>
            <p className="vp-lead">{t.hero.body}</p>
            <nav aria-label={t.country.aria} className="vp-ctabs">
              {(["ca", "us", "all"] as const).map((c) => (
                <a key={c} href={href({ country: c })} aria-current={country === c ? "page" : undefined}>
                  {t.country[c]}<span className="c">{num(openIn(c))}</span>
                </a>
              ))}
            </nav>
          </div>
          <div className="vp-hero-card zoom">
            <Image src={HERO_IMG} alt="" fill priority sizes="(max-width: 1023px) 100vw, 480px" className="kb vp-hero-img" />
            <div className="vp-hero-shade" />
            <div className="vp-hero-stats">
              <div className="big">{num(openIn(country))}</div>
              <div className="sub">{v.openIn[country]}</div>
              <div className="two">
                <div><span className="n">{num(stats.closingThisWeek)}</span><div className="l">{v.closing7}</div></div>
                <div>
                  <a href={L("/contract-winners")} className="n nu">{awards.value > 0 ? compactDollars(awards.value, lang) : num(stats.pastContracts)}</a>
                  <div className="l">{awards.value > 0 ? plural(awards.contracts, v.awarded, { n: num(awards.contracts) }) : t.stats.pastAwards}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="v3-wrap vp-searchwrap">
          <form action={L("/rfps")} method="get" className="vp-pillform">
            {keep(["country", "view", "sort", "propertyType", "closing", "source"])}
            <label className="vp-pf first">
              <span>{v.search.trade}</span>
              <select name="category" defaultValue={sp.category ?? ""}>
                <option value="">{v.search.allTrades}</option>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{trade(c.name)}</option>)}
              </select>
            </label>
            <label className="vp-pf">
              <span>{v.search.area}</span>
              <select name="region" defaultValue={sp.region ?? ""}>
                <option value="">{v.search.allRegions}</option>
                {regions.map((r) => <option key={r.slug} value={r.slug}>{regionName(r.name, lang)}</option>)}
              </select>
            </label>
            <label className="vp-pf grow">
              <span>{v.search.keyword}</span>
              <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={v.search.placeholder} />
            </label>
            <button type="submit" className="vp-pf-go">{v.search.submit}</button>
          </form>
        </div>
      </div>

      <section className="v3-wrap">
        <div className="vp-bar">
          <div className="vp-bar-l">
            <nav aria-label={t.tabs.aria} className="vp-tabs">
              {tabs.map((tab) => (
                <a key={tab.key} href={tab.href} aria-current={tab.active ? "page" : undefined} className={tab.active ? "on" : "lift"}>
                  {tab.label}<span className="c">{num(tab.count)}</span>
                </a>
              ))}
            </nav>
            <span className="vp-count">
              <b>{plural(listing.length, t.count, { n: num(listing.length) })}</b>
              {pages > 1 && fmt(t.pageOf, { page: num(pageNum), pages: num(pages) })}
            </span>
          </div>
          <div className="vp-bar-r">
            {locked && (
              <span className="vp-lockline"><LockIcon />{t.locked.previews} <a href={L("/pricing")}>{t.locked.unlock}</a></span>
            )}
            <form action={L("/rfps")} method="get" className="vp-sort">
              {keep(["country", "view", "category", "region", "propertyType", "q", "closing", "source"])}
              <label>
                <span>{v.sort}</span>
                <SubmitSelect name="sort" defaultValue={sp.sort === "newest" ? "newest" : "closing"}>
                  <option value="closing">{t.sort.closing}</option>
                  <option value="newest">{t.sort.newest}</option>
                </SubmitSelect>
              </label>
              <noscript><button type="submit">{v.filters.apply}</button></noscript>
            </form>
          </div>
        </div>

        <div className="vp-grid">
          <div className="vp-filters">
            <input type="checkbox" id="vp-ft" className="vp-ft-cb v3-sr" />
            <label htmlFor="vp-ft" className="vp-filters-toggle">{v.filters.title}{hasFilters && <span className="c">{num(chips.length)}</span>}</label>
            <aside className="vp-aside">
              <div className="vp-aside-head">
                <h2>{v.filters.title}</h2>
                <a href={clearAll}>{v.filters.clear}</a>
              </div>

              {!showAwarded && (
                <div>
                  <div className="v3-label">{v.filters.closing}</div>
                  <div className="vp-wins">
                    {(["all", "today", "tomorrow", "week", "later"] as const).map((w) => (
                      <a key={w} href={href({ closing: w === "all" ? null : w })} aria-current={closing === w ? "true" : undefined}>{v.windows[w]}</a>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="v3-label">{v.filters.category}</div>
                <div className="vp-trades">
                  {topTrades.map((c) => {
                    const on = c.slug === sp.category;
                    return (
                      <a key={c.slug} href={href({ category: on ? null : c.slug })} aria-current={on ? "true" : undefined} className="fbtn">
                        <span className="nm">{trade(c.name)}</span><span className="ct">{num(c.n)}</span>
                        <span className="tr"><span style={{ width: `${Math.max(5, Math.round((c.n / maxTrade) * 100))}%` }} /></span>
                      </a>
                    );
                  })}
                </div>
                <a href={L("/trades")} className="vp-more">{fmt(v.filters.seeAllTrades, { n: num(categories.length) })}</a>
              </div>

              <div>
                <div className="v3-label">{v.filters.source}</div>
                <div className="vp-checks">
                  {(["public", "pm"] as const).map((s) => {
                    const checked = source === "all" || source === s;
                    // Unticking one leaves the other; ticking back shows both.
                    const next = checked ? (source === "all" ? (s === "public" ? "pm" : "public") : "all") : "all";
                    return (
                      <a key={s} href={href({ source: next === "all" ? null : next })} role="checkbox" aria-checked={checked}>
                        <span className="bx" aria-hidden>{checked && <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#FFFFFF" strokeWidth="2.5"><path d="M2.5 7.5l3 3 6-6.5" /></svg>}</span>
                        {s === "public" ? v.filters.sourcePublic : v.filters.sourcePm}
                      </a>
                    );
                  })}
                </div>
              </div>

              <form action={L("/rfps")} method="get" className="vp-aside-form">
                {keep(["country", "view", "category", "q", "sort", "closing", "source"])}
                <label>
                  <span className="v3-label">{v.filters.region}</span>
                  <SubmitSelect name="region" defaultValue={sp.region ?? ""}>
                    <option value="">{v.search.allRegions}</option>
                    {regions.map((r) => <option key={r.slug} value={r.slug}>{regionName(r.name, lang)}</option>)}
                  </SubmitSelect>
                </label>
                <a href={L("/regions")} className="vp-more">{fmt(v.filters.browseRegions, { n: num(regions.length) })}</a>
                <label>
                  <span className="v3-label">{v.filters.propertyType}</span>
                  <SubmitSelect name="propertyType" defaultValue={sp.propertyType ?? ""}>
                    <option value="">{v.filters.allPropertyTypes}</option>
                    {propertyTypes.map((p) => <option key={p.slug} value={p.slug}>{propertyTypeName(p.name, lang)}</option>)}
                  </SubmitSelect>
                </label>
                <noscript><button type="submit" className="v3-pill navy">{v.filters.apply}</button></noscript>
              </form>

              <a className="vp-promo blk" href={proHref}>
                <span className="v3-label mint">{v.promo.eyebrow}</span>
                <span className="t">{v.promo.title}</span>
                <span className="p"><PriceLine tpl={v.promo.price} cad={{ monthly: PRICING.proMonthly, annual: PRICING.proAnnual }} lang={lang} /></span>
                <span className="b">{v.promo.cta}</span>
              </a>
            </aside>
          </div>

          <div className="vp-results">
            {hasFilters && (
              <div className="vp-chips">
                {chips.map((c) => (
                  <a key={c.kind} href={c.href} aria-label={fmt(v.chips.remove, { kind: c.kind, label: c.label })}>
                    <span>{c.kind}: <b>{c.label}</b></span>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#1B1D3A" strokeWidth="3" aria-hidden><path d="M3 3l10 10M13 3L3 13" /></svg>
                  </a>
                ))}
              </div>
            )}

            {pageItems.length > 0 ? (
              <>
                <div className="vp-rows">
                  {pageItems.slice(0, 5).map(row)}
                  <DigestBand
                    t={v.digest}
                    lang={lang}
                    trades={digestTrades}
                    areas={digestAreas}
                    defaultTrade={category?.slug}
                    defaultArea={digestArea < 0 ? 0 : digestArea}
                  />
                  {pageItems.slice(5).map(row)}
                </div>
                {pages > 1 && (
                  <nav aria-label={t.pagination.aria} className="vp-pages">
                    <span className="lbl">{fmt(v.page, { page: num(pageNum), pages: num(pages) })}</span>
                    <div className="nums">
                      {pageList.map((p) => (
                        <a key={p} href={pageHref(p)} aria-current={p === pageNum ? "page" : undefined}>{num(p)}</a>
                      ))}
                    </div>
                    <div className="pn">
                      {pageNum > 1 && <a href={pageHref(pageNum - 1)} className="prev">{v.prev}</a>}
                      {pageNum < pages && <a href={pageHref(pageNum + 1)} className="next">{v.next}</a>}
                    </div>
                  </nav>
                )}
              </>
            ) : (
              <div className="vp-empty fadeup">
                <div className="z" aria-hidden>0</div>
                <div>
                  <div className="v3-label">{v.empty.eyebrow}</div>
                  <h2 className="h">{showAwarded ? t.empty.awarded : showGc ? t.empty.gc : v.empty.title}</h2>
                  <p className="b">{hasFilters ? v.empty.body : t.empty.unfiltered}</p>
                  <div className="ctas">
                    {hasFilters && <a href={clearAll} className="v3-pill navy">{v.empty.clear}</a>}
                    <a href={L(`/sign-up?role=trade${category ? `&category=${category.slug}` : ""}`)} className="vp-ghost">{v.empty.email}</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {recentItems.length > 0 && (
        <section className="vp-awards">
          <div className="v3-wrap vp-awards-in">
            <div className="vp-awards-head">
              <div>
                <div className="v3-eyebrow mint">{t.recent.eyebrow}</div>
                <h2 className="vp-h2 light">{t.recent.title}</h2>
              </div>
              <p>
                {t.recent.body}{" "}
                <a href={href({ view: "awarded" })}>{plural(past.length, t.recent.all, { n: num(past.length) })} →</a>
              </p>
            </div>
            <div className="vp-awards-grid">
              {recentItems.map((r) => {
                const a = parseAward(r.summary);
                return (
                  <a key={r.slug} className="vp-award blk" href={L(`/rfps/${r.slug}`)}>
                    <span className="hd"><span className="tg">{r.categories[0] ? trade(r.categories[0]) : t.tabs.awarded}</span><span className="dt">{r.deadline ? formatDate(r.deadline, lang) : ""}</span></span>
                    <span className="val">{a.amount ? dollars(a.amount, lang) : "—"} <span className="cur">{rfpMarket(r) === "US" ? "USD" : "CAD"}</span></span>
                    <span className="ti">{r.title}</span>
                    {a.winner && <span className="ft">{fmt(v.awardsWonBy, { winner: a.winner })}{buyerFromSummary(r.summary) ? ` · ${buyerFromSummary(r.summary)}` : ""}</span>}
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="v3-wrap vp-refer v3-tw">
        <ReferBanner variant="subtle" />
      </div>

      <section className="vp-mint">
        <div className="v3-wrap vp-mint-in">
          <div className="big">{num(stats.closingThisWeek)}</div>
          <div>
            <h2 className="h">{v.mint.title}</h2>
            <p className="b"><PriceLine tpl={v.mint.body} cad={{ monthly: PRICING.proMonthly, annual: PRICING.proAnnual }} lang={lang} w="22em" /></p>
          </div>
          <div className="ctas">
            <a href={proHref} className="v3-pill ink">{v.mint.start}</a>
            <a href={L("/sign-up?role=trade")} className="vp-ghost ink">{v.mint.join}</a>
          </div>
        </div>
      </section>

      <div className="v3-sticky">
        <div className="v3-sticky-in">
          <span className="v3-dot d" style={{ width: 10, height: 10 }} />
          <div className="txt">
            <b>{fmt(v.sticky.open[country], { n: num(openIn(country)) })}</b>{" "}
            <span className="c">{fmt(v.sticky.closing, { n: num(stats.closingThisWeek) })}</span>
          </div>
          <a href={L("/sign-up?role=property_manager")} className="v3-pill ghost">{v.sticky.post}</a>
          <a href={proHref} className="v3-pill mint">{v.sticky.cta}</a>
        </div>
      </div>

      <EmailCapture
        trade={category ? trade(category.name) : null}
        region={region ? regionName(region.name, lang) : null}
        categorySlug={category?.slug}
        regionSlug={region?.slug}
        signedInHint={access}
      />
    </>
  );
}
