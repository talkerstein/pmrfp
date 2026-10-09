import type { Metadata } from "next";
import { isUsState } from "@/lib/geo";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BidHelpCard } from "@/components/public/bid-help-card";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { SaveButton } from "@/components/dashboard/save-button";
import { ExpressInterestDialog } from "@/components/forms/express-interest-dialog";
import { BidChecklist } from "@/components/public/bid-checklist";
import { GcPackageCta } from "@/components/public/gc-package-cta";
import { AwardIntelCard } from "@/components/public/award-intel-card";
import { SponsorSlot } from "@/components/sponsors/sponsor-slot";
import { ListingMatches } from "@/components/public/listing-matches";
import { EmailCapture } from "@/components/public/email-capture";
import { PaywallPlans } from "@/components/v3-pages/paywall-plans";
import { PriceLine } from "@/components/v3-pages/price";
import { winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { getFullRfp, getRfpTeaser } from "@/lib/data/rfps";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { getSession, hasActiveTradeAccess } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { publicTenderSource } from "@/lib/tenders/sources";
import { awardNoticeUrl } from "@/lib/tenders/awards";
import { closedArchiveAward, closedArchiveNoticeUrl } from "@/lib/tenders/closed-archive";
import { daysUntil, parseAward } from "@/lib/data/fomo";
import { tradePhotoForName } from "@/lib/photos";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { isIndexableRfp } from "@/lib/seo/rfp-indexing";
import { buyerFromSummary, cleanTenderTitle, clip, placeLabel } from "@/lib/seo/rfp-meta";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getBidCheckBySlug } from "@/lib/bid-check/data";
import { getOpenRfpCounts } from "@/lib/data/rfp-counts";
import { isGcPackage, sourceTypeLabel, tradeWords } from "@/lib/gc/packages";
import { getAwardById, listPackagesForAward } from "@/lib/gc/data";
import { getAwardIndex, intelFor } from "@/lib/data/award-intel";
import { pickSponsor, type SponsorContext } from "@/lib/sponsors/registry";
import { rfpMarket } from "@/lib/visitor-geo";
import { PRICING } from "@/lib/site";
import type { RfpListItem } from "@/lib/data/types";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt as fill, formatDate, formatNumber, plural } from "@/i18n/format";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang: raw, slug } = await params;
  const lang: Locale = hasLocale(raw) ? raw : "en";
  const t = getDictionary(lang).board.detail.meta;
  const rfp = await getRfpTeaser(slug);
  if (!rfp) return { title: t.notFound };
  // Full tender name + city in the title (what searchers type), buyer and
  // closing date up front in the description (what bidders check first).
  const name = cleanTenderTitle(rfp.title);
  const place = placeLabel(rfp.city, rfp.province ? regionName(rfp.province, lang) : null);
  // Not clipped short on purpose: tender-name queries match words late in the title.
  const title = place ? fill(t.titlePlace, { title: clip(name, 110), place }) : clip(name, 110);
  const buyer = buyerFromSummary(rfp.summary);
  const who = buyer ? fill(t.descBuyer, { buyer }) : t.descPm;
  const closes = rfp.deadline
    ? fill(rfp.status === "open" ? t.descCloses : t.descClosed, { date: fmt(rfp.deadline, lang) })
    : "";
  const lead = fill(t.descTender, { who, where: place ? fill(t.descWhere, { place }) : "" });
  const description = clip(`${lead}${closes} ${clip(name, 90).replace(/[.…]$/, "")}.${t.descTail}`, 300);
  return {
    title,
    description,
    // ?view=locked and tracking params were being indexed as duplicates.
    alternates: alternatesFor(lang, `/rfps/${rfp.slug}`),
    ...(isIndexableRfp(rfp) ? {} : { robots: { index: false, follow: true } }),
  };
}

function fmt(d: string | null, lang: Locale) {
  return d ? formatDate(d, lang, { month: "long", day: "numeric", year: "numeric" }) : "—";
}

const LockIcon = ({ size = 16, stroke = "#1B1D3A" }: { size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="2.2" aria-hidden><rect x="3" y="7" width="10" height="7" rx="2" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
);
const Bookmark = ({ stroke = "#91F2CF" }: { stroke?: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="2" aria-hidden><path d="M4 2h8v12l-4-3-4 3z" /></svg>
);
const LOCKED_ICONS = [
  "M4 2.5h7l3 3V15.5H4zM6.5 8h5M6.5 11h5",
  "M9 2.5v8M5.5 7.5L9 11l3.5-3.5M3 14.5h12",
  "M9 9a3 3 0 100-6 3 3 0 000 6zM3 15.5c.6-3 3-4.5 6-4.5s5.4 1.5 6 4.5",
];

export default async function RfpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await setLangFrom(params);
  const t = getT("board").detail;
  const tb = getT("board");
  const v = getT("v3Pages").detail;
  const lang = getLang();
  const L = (p: string) => localizePath(p, lang);
  // Counts: raw in English (as before), grouped the local way elsewhere.
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  // "$120,000 CAD" from award summaries: as-is in English, "120 000 $ CAD" in French, "$120,000 CAD" in Spanish.
  const money = (val: string) => {
    if (lang === "en") return val;
    const n = Number(val.replace(/[^\d]/g, ""));
    return n ? fill(t.moneyCad, { n: formatNumber(n, lang) }) : val;
  };
  const budget = (n: number | null | undefined) =>
    n == null ? "—" : lang === "en" ? n.toLocaleString() : formatNumber(n, lang);
  const trade = (name: string) => tradeName(name, lang);
  const { slug } = await params;
  const sp = await searchParams;
  const teaser = await getRfpTeaser(slug);
  if (!teaser) notFound();

  const configured = isSupabaseConfigured();
  const session = await getSession();
  const access = await hasActiveTradeAccess();
  const forceLocked = sp.view === "locked";
  const showFull = configured ? access : !forceLocked;
  const full = showFull ? await getFullRfp(slug) : null;

  // Match-proof before the paywall: real liquidity in their region before
  // asking them to pay. Count queries on the public teaser view only.
  let regionMatchCount = 0;
  let totalOpenCount = 0;
  if (!showFull) {
    const counts = await getOpenRfpCounts(teaser.regionName, teaser.slug);
    totalOpenCount = counts.totalOpen;
    regionMatchCount = counts.regionMatchCount;
  }
  const teaserIsOpen = teaser.status === "open";
  const isPublicTender = teaser.sourceType === "public_source";
  const tenderSource = publicTenderSource(teaser.slug);
  // Issuer, portal, bid label and credit line in the visitor's language (English: the lib as-is).
  const source = { ...tenderSource, ...t.sources[tenderSource.key] };
  const portalName = source.portal.replace(/^(the|le|la|les|el|los|las) /i, "");
  // Quebec SEAO notices are published in French; say so to Google and screen readers.
  const noticeLang = isPublicTender && tenderSource.key === "seao" ? "fr" : undefined;
  // Past public contracts aren't biddable: show who won and for how much, never a paywall or a "bid" button.
  const isAward = isPublicTender && tenderSource.past;
  const awardUrl = !isAward
    ? null
    : tenderSource.key === "awards"
      ? awardNoticeUrl(teaser.slug.split("-cba-").pop() ?? "")
      : (full?.sourceUrl ?? null);
  const award = isAward ? parseAward(teaser.summary) : null;
  // Past its deadline but not an award notice: say so plainly and point at what's open.
  const isClosed = !isAward && !teaserIsOpen;
  // A real closed tender from the buyer's historical open data: official
  // notice for everyone (nothing to bid on), plus the real award if one exists.
  const closedArchive = isClosed && isPublicTender && Boolean(tenderSource.closedArchive);
  const closedNotice = closedArchive ? closedArchiveNoticeUrl(teaser.slug) : null;
  const closedAward = closedArchive ? closedArchiveAward(teaser.summary) : null;
  const locked = !isAward && !isClosed && !(showFull && full);
  const bidCheck = !isAward && !isClosed ? await getBidCheckBySlug(teaser.slug) : null;
  const upgradeHref = session ? "/dashboard/billing?plan=pro&interval=monthly" : signUpHrefForPlan("pro", "monthly");
  const annualHref = session ? "/dashboard/billing?plan=pro&interval=annual" : signUpHrefForPlan("pro", "annual");
  const bidChecklist = bidCheck ? (
    <BidChecklist check={bidCheck} locked={!showFull} proHref={upgradeHref} translated={isPublicTender && tenderSource.key === "seao"} />
  ) : null;
  // The board (cached): "the next one" on award pages, similar open RFPs everywhere.
  const [boardRfps, categories, regions] = await Promise.all([
    listAllRfpsCached().catch(() => [] as RfpListItem[]),
    getCategories().catch(() => []),
    getRegions().catch(() => []),
  ]);
  const sameTrade = (r: RfpListItem) => teaser.categories.some((c) => r.categories.includes(c));
  const similarOpen = boardRfps.filter((r) => r.status === "open" && sameTrade(r)).length;
  const similar = boardRfps
    .filter((r) => r.status === "open" && r.slug !== teaser.slug && sameTrade(r))
    .sort((a, b) => Number(b.regionName === teaser.regionName) - Number(a.regionName === teaser.regionName) || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
    .slice(0, 4);
  // Every named winner has a profile now (one-award ones are noindexed there).
  const winnerName = award?.winner ?? closedAward?.winner ?? null;
  const winnerPage = winnerName ? winnersFromRfps(boardRfps, 1).find((w) => winnerKey(w.name) === winnerKey(winnerName)) : undefined;
  const closedAwardListing = closedAward ? boardRfps.find((r) => r.slug.endsWith(closedAward.listingSuffix)) : undefined;
  const isGc = isGcPackage(teaser);
  const [gcAward, awardPackages] = await Promise.all([
    isGc ? getAwardById(teaser.awardedRfpId) : Promise.resolve(null),
    isAward ? listPackagesForAward(teaser.slug) : Promise.resolve([]),
  ]);
  const closesLabel = isGc ? t.facts.quotesDue : t.facts.closes;
  const dateLabel = isAward ? t.facts.awarded : isClosed ? t.facts.closed : closesLabel;
  // "What this job is worth": open tenders only; the numbers render for members only.
  const intel = !isAward && !isClosed ? intelFor(teaser, await getAwardIndex()) : null;
  const intelCard = intel ? (
    <AwardIntelCard intel={showFull ? intel : { scope: intel.scope, trade: intel.trade, count: intel.count }} locked={!showFull} upgradeHref={upgradeHref} />
  ) : null;

  const firstTrade = teaser.categories[0];
  const tradeSlug = firstTrade ? categories.find((c) => c.name === firstTrade)?.slug : undefined;
  const regionSlug = teaser.regionName ? regions.find((r) => r.name === teaser.regionName)?.slug : undefined;
  const heroPhoto = teaser.photoUrls[0] ? { src: teaser.photoUrls[0], alt: "" } : tradePhotoForName(firstTrade);
  const noticeKind = isAward ? t.kind.award : isGc ? t.kind.gc : isPublicTender ? t.kind.public : t.kind.private;
  const place =
    [teaser.city, teaser.province && regionName(teaser.province, lang)].filter(Boolean).join(", ") ||
    (teaser.regionName ? regionName(teaser.regionName, lang) : teaser.regionName);
  const buyer = buyerFromSummary(teaser.summary) ?? (isGc ? t.facts.gc : isPublicTender ? null : t.facts.pm);
  const sourceLabel = isPublicTender ? portalName : isGc ? t.facts.gc : t.facts.pm;
  const days = !isAward && !isClosed ? daysUntil(teaser.deadline) : null;
  const soon = days === null || days < 0 || days > 7 ? null : days;
  const daysLeft = soon === null ? null : soon === 0 ? t.daysLeft.today : soon === 1 ? t.daysLeft.tomorrow : fill(t.daysLeft.n, { n: soon });
  const closesIn = soon === null ? null : soon === 0 ? t.closesIn.today : soon === 1 ? t.closesIn.tomorrow : fill(t.closesIn.n, { n: soon });
  const status = isAward ? t.facts.awarded : isClosed ? t.facts.closed : closesIn ?? (teaser.deadline ? fill(v.closesOn, { date: formatDate(teaser.deadline, lang, { month: "short", day: "numeric" }) }) : t.facts.ongoing);
  const shortTitle = clip(cleanTenderTitle(teaser.title), 60);

  const sponsorCtx: SponsorContext = {
    placement: "rfp_detail",
    categories: teaser.categories,
    market: rfpMarket(teaser),
    publicTender: isPublicTender,
    seed: teaser.slug,
  };
  const sponsorName = pickSponsor(sponsorCtx)?.sponsor.name;
  const monthlyEnabled = Boolean(process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY);

  const facts = [
    { k: dateLabel, v: teaser.deadline ? fmt(teaser.deadline, lang) : t.facts.ongoing, hi: true },
    { k: t.side.trade, v: teaser.categories.length ? teaser.categories.map(trade).join(", ") : t.facts.notSpecified },
    { k: t.side.region, v: teaser.regionName ? regionName(teaser.regionName, lang) : t.facts.notSpecified },
    { k: t.facts.location, v: place || t.facts.notSpecified },
    { k: t.side.propertyType, v: teaser.propertyTypeName ? propertyTypeName(teaser.propertyTypeName, lang) : t.facts.notSpecified },
    { k: t.facts.source, v: sourceLabel },
  ];

  // Primary action, by state.
  const bidHref = showFull && full && isPublicTender ? full.sourceUrl : null;
  const saveLink = (cls: string, stroke?: string) => (
    <a href={L(upgradeHref)} className={cls}><Bookmark stroke={stroke} />{v.save}</a>
  );

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: tb.hero.eyebrow, path: L("/rfps") },
          ...(firstTrade && tradeSlug ? [{ name: trade(firstTrade), path: L(`/rfps?category=${tradeSlug}`) }] : []),
          { name: shortTitle, path: L(`/rfps/${teaser.slug}`) },
        ])}
      />
      <div className="v3-top">
        <section className="v3-wrap vp-dhero">
          <nav aria-label={t.breadcrumb.aria} className="vp-crumbs">
            <a href={L("/rfps")}>{t.breadcrumb.board}</a><span aria-hidden>/</span>
            {firstTrade && (
              <>
                <a href={tradeSlug ? L(`/rfps?category=${tradeSlug}`) : L("/rfps")}>{trade(firstTrade)}</a><span aria-hidden>/</span>
              </>
            )}
            {teaser.regionName && regionSlug && (
              <>
                <a href={L(`/rfps?region=${regionSlug}`)}>{regionName(teaser.regionName, lang)}</a><span aria-hidden>/</span>
              </>
            )}
            <span className="cur" lang={noticeLang}>{shortTitle}</span>
          </nav>

          {!configured && (
            <div className="vp-demo">
              <b>{t.demo.title}</b>{" "}
              {showFull ? (
                <>{t.demo.fullView} <a href={L(`/rfps/${slug}?view=locked`)}>{t.demo.seeLocked}</a>.</>
              ) : (
                <>{t.demo.lockedView} <a href={L(`/rfps/${slug}`)}>{t.demo.seeFull}</a>.</>
              )}
            </div>
          )}

          <div className="vp-dhero-grid">
            <div className="vp-dhero-main">
              <div className="vp-dtags">
                {teaser.categories.map((c) => <span key={c} className="mint">{trade(c)}</span>)}
                {place && <span className="navy">{place}</span>}
                <span className="line">{noticeKind}</span>
                {isGc && <span className="line">{sourceTypeLabel(teaser.sourceType, teaser.slug, lang)}</span>}
                {teaser.isDemo && <span className="line">{t.kind.sample.replace(/^·\s*/, "")}</span>}
              </div>
              <h1 lang={noticeLang} className="vp-dh1">{teaser.title}</h1>
              <dl className="vp-dfacts">
                {buyer && <div><dt>{v.buyer}</dt><dd>{buyer}</dd></div>}
                <div><dt>{t.facts.source}</dt><dd>{sourceLabel}</dd></div>
                <div><dt>{t.facts.reference}</dt><dd className="ref">{teaser.reference ?? t.facts.notPublished}</dd></div>
              </dl>
              <div className="vp-dctas">
                {isAward ? (
                  awardUrl ? <a href={awardUrl} target="_blank" rel="noopener noreferrer" className="v3-pill mint vp-big">{t.award.official} ↗</a> : <a href={L(annualHref)} className="v3-pill mint vp-big">{t.award.cta}</a>
                ) : closedNotice ? (
                  <a href={closedNotice} target="_blank" rel="noopener noreferrer" className="v3-pill mint vp-big">{t.closedArchive.official} ↗</a>
                ) : isClosed ? (
                  <a href={L(annualHref)} className="v3-pill mint vp-big">{t.closed.cta}</a>
                ) : locked ? (
                  <>
                    <a href={L(upgradeHref)} className="v3-pill mint vp-big vp-ic"><LockIcon />{v.unlock}</a>
                    {saveLink("vp-ghost light vp-ic")}
                    <span className="vp-dnote">{v.saveNote}</span>
                  </>
                ) : (
                  <>
                    {bidHref ? (
                      <a href={bidHref} target="_blank" rel="noopener noreferrer" className="v3-pill mint vp-big">{source.bidLabel} ↗</a>
                    ) : full && !isPublicTender ? (
                      <span className="v3-tw vp-tw-btn"><ExpressInterestDialog rfpId={full.id} rfpTitle={full.title} /></span>
                    ) : null}
                    {full && <span className="v3-tw vp-tw-btn"><SaveButton rfpId={full.id} /></span>}
                  </>
                )}
              </div>
            </div>

            <div className="vp-dcard zoom">
              <Image src={heroPhoto.src} alt={heroPhoto.alt} fill priority sizes="(max-width: 1023px) 100vw, 480px" className="kb vp-hero-img" />
              <div className="vp-dcard-shade" />
              {teaser.deadline && (
                <div className="vp-float float">
                  <div className="mo">{dateLabel} · {formatDate(teaser.deadline, lang, { month: "short", year: "numeric" })}</div>
                  <div className="n">{Number(teaser.deadline.slice(8, 10))}</div>
                </div>
              )}
              <div className="vp-dcard-foot">
                <div className="st">
                  {!isAward && !isClosed && <span className="vp-ping lg" aria-hidden><span className="ping" /><span /></span>}
                  <span>{status}</span>
                </div>
                <p>
                  {teaser.deadline ? `${fmt(teaser.deadline, lang)}. ` : ""}
                  {isPublicTender && !isAward ? v.directToIssuer : isAward ? v.awardNote : v.viaPmrfp}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="v3-wrap">
        <dl className="vp-strip">
          {facts.map((f) => (
            <div key={f.k} className={f.hi ? "hi" : undefined}>
              <dt>{f.k}</dt>
              <dd>{f.v}{f.hi && daysLeft ? <span className="dl"> · {daysLeft}</span> : null}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="v3-wrap vp-dgrid">
        <div className="vp-dmain">
          {isGc && (
            <p className="vp-note teal">
              <b>{t.gcNote.title}</b>{" "}{t.gcNote.collecting}
              {firstTrade ? fill(t.gcNote.quotesTrade, { trade: tradeWords(trade(firstTrade)) }) : t.gcNote.quotes}
              {teaser.gcProjectName ? <>{t.gcNote.forProject}<b>{teaser.gcProjectName}</b></> : null}
              {t.gcNote.end}
              {gcAward && (
                <>
                  {t.gcNote.partOf}
                  <a href={L(`/rfps/${gcAward.slug}`)}>{gcAward.title}</a>
                  {gcAward.winner ? fill(t.gcNote.wonBy, { winner: gcAward.winner }) : ""}
                  {gcAward.value ? fill(t.gcNote.value, { value: money(gcAward.value) }) : ""}
                  {t.gcNote.end}
                </>
              )}
            </p>
          )}
          {full?.status === "awarded" && <p className="vp-note ok"><b>{t.status.awardedTitle}</b> {t.status.awardedBody}</p>}
          {full?.status === "closed" && <p className="vp-note"><b>{t.status.closedTitle}</b> {t.status.closedBody}</p>}

          {teaser.summary && (
            <>
              <div className="vp-dsec-head">
                {locked && <span className="pill">{v.freePreview}</span>}
                <span className="v3-label">{v.description}</span>
              </div>
              <div className={`vp-desc${locked ? " fade" : ""}`}>
                <p lang={noticeLang}>{teaser.summary}</p>
              </div>
            </>
          )}

          {teaser.photoUrls.length > 0 && (
            <div className="vp-photos">
              {teaser.photoUrls.slice(0, 6).map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className={i === 0 ? "first" : undefined}>
                  <Image src={u} alt={fill(t.photos.alt, { n: i + 1 })} fill sizes={i === 0 ? "(min-width: 1024px) 800px, 100vw" : "(min-width: 1024px) 280px, 33vw"} className="vp-img" />
                </a>
              ))}
              {teaser.photoUrls.length > 6 && <p className="more">{plural(teaser.photoUrls.length - 6, t.photos.more)}</p>}
            </div>
          )}

          {isAward ? (
            <div className="vp-awardbox">
              {award?.winner && (
                <div className="vp-winner">
                  <div className="v3-label">{t.award.wonBy}</div>
                  <div className="nm">
                    {winnerPage ? <a href={L(`/contract-winners/${winnerPage.slug}`)}>{award.winner}</a> : award.winner}
                  </div>
                  {award.value && <div className="val">{money(award.value)}</div>}
                  {winnerPage && winnerPage.awards.length > 1 && <a href={L(`/contract-winners/${winnerPage.slug}`)} className="all">{fill(t.award.allWins, { n: num(winnerPage.awards.length) })} →</a>}
                </div>
              )}
              {awardPackages.length > 0 && (
                <div className="vp-winner">
                  <div className="v3-label">{t.award.hiringSubs}</div>
                  <ul className="vp-pkgs">
                    {awardPackages.map((p) => (
                      <li key={p.slug}>
                        <a href={L(`/rfps/${p.slug}`)}>{p.title}</a>
                        {p.deadline && <span>{fill(t.award.quotesDue, { date: fmt(p.deadline, lang) })}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <h2 className="vp-h3">
                {t.award.gone}{" "}
                {similarOpen > 0
                  ? plural(similarOpen, t.award.similar, {
                      n: num(similarOpen),
                      trade: firstTrade
                        ? fill(t.award.tradePhrase, { trade: lang === "en" ? firstTrade.toLowerCase() : tradeWords(trade(firstTrade)) })
                        : t.award.tradeFallback,
                    })
                  : t.award.nextWontWait}
              </h2>
              <p className="vp-p">{t.award.pitch}</p>
              <div className="vp-row-btns">
                <a href={L(annualHref)} className="v3-pill navy">{t.award.cta}</a>
                {similarOpen > 0 && firstTrade && <a href={L(tradeSlug ? `/rfps?category=${tradeSlug}` : "/rfps")} className="vp-textlink">{t.award.seeOpen} →</a>}
              </div>
              <p className="vp-attr">{source.attribution}</p>
            </div>
          ) : closedArchive ? (
            <div className="vp-closedbox">
              <h2 className="vp-h3">{fill(t.closed.title, { date: fmt(teaser.deadline, lang) })}</h2>
              {closedAward ? (
                <div className="vp-winner">
                  <div className="v3-label">{t.closedArchive.awardedTo}</div>
                  <div className="nm">
                    {winnerPage ? <a href={L(`/contract-winners/${winnerPage.slug}`)}>{closedAward.winner}</a> : closedAward.winner}
                  </div>
                  {closedAward.value && <div className="val">{money(closedAward.value)}</div>}
                  <div className="vp-row-btns">
                    <a href={closedAward.noticeUrl} target="_blank" rel="noopener noreferrer" className="vp-textlink">{t.closedArchive.awardNotice} ↗</a>
                    {closedAwardListing && <a href={L(`/rfps/${closedAwardListing.slug}`)} className="vp-textlink">{t.closedArchive.awardListing} →</a>}
                  </div>
                </div>
              ) : (
                <p className="vp-p">{t.closedArchive.noAward}</p>
              )}
              <p className="vp-p">{t.closed.body}</p>
              <div className="vp-row-btns">
                {closedNotice && <a href={closedNotice} target="_blank" rel="noopener noreferrer" className="v3-pill navy">{t.closedArchive.official} ↗</a>}
                <a href={L(annualHref)} className="vp-textlink">{t.closed.cta} →</a>
                <a href={L("/rfps")} className="vp-textlink">{t.closed.seeOpen} →</a>
              </div>
              <p className="vp-attr">{source.attribution}</p>
            </div>
          ) : showFull && full ? (
            <div className="vp-full">
              {(bidChecklist || intelCard) && (
                <div className="v3-tw vp-tw-stack">
                  {bidChecklist}
                  {intelCard}
                </div>
              )}
              <Block title={t.full.scope} body={full.scope} />
              <Block title={t.full.requirements} body={full.requirements} />
              {full.budgetPublic && (full.budgetMin || full.budgetMax) ? (
                <section className="vp-block">
                  <h2>{t.full.budget}</h2>
                  <p>{fill(t.full.budgetRange, { min: budget(full.budgetMin), max: budget(full.budgetMax), currency: isUsState(full.province) ? "USD" : "CAD" })}</p>
                </section>
              ) : null}
              <Block title={t.full.submission} body={full.submissionInstructions} />
              <section className="vp-block">
                <h2>{t.full.contact}</h2>
                <p>
                  {full.contactVisibility === "public_contact"
                    ? [full.contactName, full.contactEmail, full.contactPhone].filter(Boolean).join(" · ") || t.full.afterSignIn
                    : full.contactVisibility === "anonymous_until_interest_approved"
                      ? t.full.afterApproval
                      : t.full.mediated}
                </p>
              </section>
              {isPublicTender && full.sourceUrl && (
                <div className="vp-block">
                  <a href={full.sourceUrl} target="_blank" rel="noopener noreferrer" className="v3-pill navy">{fill(t.full.openNotice, { portal: source.portal })} ↗</a>
                  <p className="vp-attr">{source.attribution}</p>
                </div>
              )}
              <div className="v3-tw"><TrustDisclaimer /></div>
            </div>
          ) : isClosed ? (
            <div className="vp-closedbox">
              <h2 className="vp-h3">
                {fill(t.closed.title, { date: fmt(teaser.deadline, lang) })}{" "}
                {regionMatchCount > 0 && teaser.regionName
                  ? plural(regionMatchCount, t.closed.region, { n: num(regionMatchCount), region: regionName(teaser.regionName, lang) })
                  : totalOpenCount > 0
                    ? plural(totalOpenCount, t.closed.total, { n: num(totalOpenCount) })
                    : ""}
              </h2>
              <p className="vp-p">{t.closed.body}</p>
              <div className="vp-row-btns">
                <a href={L(annualHref)} className="v3-pill navy">{t.closed.cta}</a>
                <a href={L("/rfps")} className="vp-textlink">{t.closed.seeOpen} →</a>
              </div>
              {isPublicTender && <p className="vp-attr">{source.attribution}</p>}
            </div>
          ) : (
            <>
              <div className="vp-pay">
                <div className="vp-pay-top">
                  <div>
                    <div className="v3-label mint vp-ic"><LockIcon size={15} stroke="#91F2CF" />Trade Pro</div>
                    <h2 className="vp-pay-h">{v.paywall.title}</h2>
                    <p className="vp-pay-p">{v.paywall.body}</p>
                  </div>
                  <div className="vp-locked">
                    {v.paywall.items.map((name, i) => (
                      <div key={name} className="it">
                        <span className="ic" aria-hidden><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#91F2CF" strokeWidth="1.8"><path d={LOCKED_ICONS[i]} /></svg></span>
                        <span><b>{name}</b><span className="shim" aria-hidden style={{ animationDelay: `${i * 0.4}s` }}><span style={{ width: ["46%", "34%", "52%"][i] }} /><span style={{ width: ["28%", "40%", "20%"][i] }} /></span></span>
                        <LockIcon size={15} stroke="#C9CCE6" />
                      </div>
                    ))}
                  </div>
                </div>
                <PaywallPlans t={v.paywall.plans} lang={lang} monthlyEnabled={monthlyEnabled} hrefs={{ monthly: upgradeHref, annual: annualHref }}>
                  {saveLink("vp-ghost light vp-ic")}
                  <span className="vp-pay-note">
                    <PriceLine tpl={monthlyEnabled ? v.priceBoth : v.priceAnnual} cad={{ monthly: PRICING.proMonthly, annual: PRICING.proAnnual }} lang={lang} />
                    <br />
                    <a href={L("/pricing")}>{v.paywall.seePricing}</a> · <a href={L("/sign-up?role=trade")}>{v.paywall.joinFree}</a> {v.paywall.decideLater}
                  </span>
                </PaywallPlans>
              </div>

              {(bidChecklist || intelCard) && (
                <div className="vp-two v3-tw">
                  {bidChecklist && <div className="vp-tw-card">{bidChecklist}</div>}
                  {intelCard && <div className="vp-tw-card">{intelCard}</div>}
                </div>
              )}
            </>
          )}

          {isPublicTender && !isAward && !isClosed && (
            <div className="v3-tw vp-tw-gap">
              <BidHelpCard rfpSlug={teaser.slug} rfpTitle={teaser.title} trade={firstTrade} portal={tenderSource.portal} />
            </div>
          )}

          {isPublicTender && (
            <div className="vp-info">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#4B4F6B" strokeWidth="1.8" aria-hidden><circle cx="10" cy="10" r="8" /><path d="M10 9v5M10 6v.5" /></svg>
              <div>
                {isAward ? (
                  <><b>{t.publicNote.pastTitle}</b> {fill(t.publicNote.pastBody, { issuer: source.issuer })}</>
                ) : closedArchive ? (
                  <><b>{t.closedArchive.noteTitle}</b> {fill(t.closedArchive.noteBody, { issuer: source.issuer })}</>
                ) : (
                  <><b>{t.publicNote.openTitle}</b> {fill(t.publicNote.openBody, { issuer: source.issuer, portal: source.portal })}</>
                )}{" "}
                {!isAward && !(showFull && full) && source.attribution}
              </div>
            </div>
          )}
        </div>

        <aside className="vp-daside">
          <div className="vp-closecard">
            <div className="hd">
              <span className="v3-label">{dateLabel}</span>
              {closesIn && <span className="badge">{closesIn}</span>}
            </div>
            <div className="dt">{teaser.deadline ? fmt(teaser.deadline, lang) : t.facts.ongoing}</div>
            {isAward ? (
              awardUrl && <a href={awardUrl} target="_blank" rel="noopener noreferrer" className="v3-pill navy vp-block-btn">{t.award.official} ↗</a>
            ) : closedArchive ? (
              <>
                {closedNotice && <a href={closedNotice} target="_blank" rel="noopener noreferrer" className="v3-pill navy vp-block-btn">{t.closedArchive.official} ↗</a>}
                <p className="nt">{t.side.closedNote}</p>
              </>
            ) : showFull && full ? (
              <div className="vp-tw-col">
                {isPublicTender ? (
                  full.sourceUrl && <a href={full.sourceUrl} target="_blank" rel="noopener noreferrer" className="v3-pill navy vp-block-btn">{source.bidLabel} ↗</a>
                ) : (
                  <span className="v3-tw"><ExpressInterestDialog rfpId={full.id} rfpTitle={full.title} /></span>
                )}
                <span className="v3-tw"><SaveButton rfpId={full.id} /></span>
              </div>
            ) : (
              <>
                <a href={L(isClosed ? annualHref : upgradeHref)} className="v3-pill navy vp-block-btn">{isClosed ? t.side.alerts : t.side.unlock}</a>
                {!isClosed && saveLink("vp-ghost vp-block-btn vp-ic", "#1B1D3A")}
                <p className="nt">{isClosed ? t.side.closedNote : t.side.unlockNote}</p>
              </>
            )}
          </div>

          {(similar.length > 0 || regionMatchCount > 0) && (
            <div className="vp-similar">
              <div className="v3-label mint">{v.similar.eyebrow}</div>
              {!showFull && regionMatchCount > 0 && teaser.regionName ? (
                <div className="cnt">
                  <span className="n">{num(regionMatchCount + (teaserIsOpen ? 1 : 0))}</span>
                  <span>{plural(regionMatchCount + (teaserIsOpen ? 1 : 0), v.similar.region, { region: regionName(teaser.regionName, lang) })}</span>
                </div>
              ) : similarOpen > 0 && firstTrade ? (
                <div className="cnt">
                  <span className="n">{num(similarOpen)}</span>
                  <span>{plural(similarOpen, v.similar.trade, { trade: trade(firstTrade) })}</span>
                </div>
              ) : null}
              <div className="list">
                {similar.map((r) => {
                  const d = daysUntil(r.deadline);
                  const tone = d !== null && d <= 0 ? "today" : d === 1 ? "tomorrow" : "later";
                  return (
                    <a key={r.slug} className="blk" href={L(`/rfps/${r.slug}`)}>
                      <span className={`dd ${tone}`}>
                        <span className="mo">{r.deadline ? formatDate(r.deadline, lang, { month: "short" }) : ""}</span>
                        <span className="n">{r.deadline ? Number(r.deadline.slice(8, 10)) : "—"}</span>
                      </span>
                      <span>
                        <span className="tg">
                          {[r.categories[0] ? trade(r.categories[0]) : null, r.regionName ? regionName(r.regionName, lang) : null].filter(Boolean).join(" · ")}
                          {d !== null && ` · ${d <= 0 ? v.similar.today : d === 1 ? v.similar.tomorrow : fill(v.similar.daysLeft, { n: num(d) })}`}
                        </span>
                        <span className="ti">{r.title}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
              {firstTrade && <a href={L(tradeSlug ? `/rfps?category=${tradeSlug}` : "/rfps")} className="all">{fill(v.similar.all, { trade: trade(firstTrade) })}</a>}
            </div>
          )}

          {isAward && award?.winner && <div className="v3-tw"><GcPackageCta awardSlug={teaser.slug} /></div>}
          <div className="v3-tw"><SponsorSlot ctx={sponsorCtx} /></div>
          {!isAward && (
            <div className="v3-tw vp-matches">
              <ListingMatches
                listing={{ categories: teaser.categories, regionName: teaser.regionName, province: teaser.province, market: rfpMarket(teaser) }}
                seed={teaser.slug}
                exclude={sponsorName ? [sponsorName] : undefined}
              />
            </div>
          )}
        </aside>
      </section>

      {!(showFull && full) && (
        <section className="vp-mint">
          <div className="v3-wrap vp-mint-in two">
            <div>
              <div className="v3-eyebrow ink">{v.adds.eyebrow}</div>
              <h2 className="h">{isPublicTender ? v.adds.titlePublic : v.adds.titlePrivate}</h2>
              <p className="b">{isPublicTender ? v.adds.bodyPublic : v.adds.bodyPrivate}</p>
            </div>
            <div className="ctas">
              <a href={L(annualHref)} className="v3-pill ink">{v.adds.start}</a>
              {!isAward && !isClosed && saveLink("vp-ghost ink", "#1B1D3A")}
              <div className="pl"><PriceLine tpl={monthlyEnabled ? v.priceBoth : v.priceAnnual} cad={{ monthly: PRICING.proMonthly, annual: PRICING.proAnnual }} lang={lang} /></div>
            </div>
          </div>
        </section>
      )}

      <div className="v3-sticky">
        <div className="v3-sticky-in">
          <span className="v3-dot d" style={{ width: 10, height: 10 }} />
          <div className="txt ell">
            <b>{shortTitle}{buyer ? ` · ${buyer}.` : "."}</b>{" "}
            <span className="c">{status}{teaser.deadline && !isAward && !isClosed ? `, ${formatDate(teaser.deadline, lang, { month: "long", day: "numeric" })}.` : "."}</span>
          </div>
          {isAward || isClosed ? (
            <a href={L(tradeSlug ? `/rfps?category=${tradeSlug}` : "/rfps")} className="v3-pill mint">{t.closed.seeOpen} →</a>
          ) : locked ? (
            <>
              {saveLink("v3-pill ghost vp-ic d")}
              <a href={L(upgradeHref)} className="v3-pill mint">{v.unlockArrow}</a>
            </>
          ) : bidHref ? (
            <a href={bidHref} target="_blank" rel="noopener noreferrer" className="v3-pill mint">{source.bidLabel} ↗</a>
          ) : null}
        </div>
      </div>

      <EmailCapture
        trade={firstTrade ? trade(firstTrade) : null}
        region={teaser.regionName ? regionName(teaser.regionName, lang) : null}
        signedInHint={Boolean(session)}
      />
    </>
  );
}

function Block({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <section className="vp-block">
      <h2>{title}</h2>
      <p className="pre">{body}</p>
    </section>
  );
}
