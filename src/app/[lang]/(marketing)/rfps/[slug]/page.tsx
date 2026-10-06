import type { Metadata } from "next";
import Link from "@/i18n/link";
import { isUsState } from "@/lib/geo";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin, FileText, Building2, DollarSign, ExternalLink, HardHat, Hash, Landmark } from "lucide-react";
import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { LockedContentPanel } from "@/components/public/locked-content-panel";
import { winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { BidHelpCard } from "@/components/public/bid-help-card";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { SaveButton } from "@/components/dashboard/save-button";
import { ExpressInterestDialog } from "@/components/forms/express-interest-dialog";
import { getFullRfp, getRfpTeaser, listRfps } from "@/lib/data/rfps";
import { getSession, hasActiveTradeAccess } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { publicTenderSource } from "@/lib/tenders/sources";
import { awardNoticeUrl } from "@/lib/tenders/awards";
import { daysUntil, parseAward } from "@/lib/data/fomo";
import { tradePhotoForName } from "@/lib/photos";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { isIndexableRfp } from "@/lib/seo/rfp-indexing";
import { buyerFromSummary, cleanTenderTitle, clip, placeLabel } from "@/lib/seo/rfp-meta";
import { BidChecklist } from "@/components/public/bid-checklist";
import { getBidCheckBySlug } from "@/lib/bid-check/data";
import { getOpenRfpCounts } from "@/lib/data/rfp-counts";
import { GcPackageCta } from "@/components/public/gc-package-cta";
import { isGcPackage, sourceTypeLabel, tradeWords } from "@/lib/gc/packages";
import { getAwardById, listPackagesForAward } from "@/lib/gc/data";
import { getAwardIndex, intelFor } from "@/lib/data/award-intel";
import { AwardIntelCard } from "@/components/public/award-intel-card";
import { SponsorSlot } from "@/components/sponsors/sponsor-slot";
import { ListingMatches } from "@/components/public/listing-matches";
import { pickSponsor, type SponsorContext } from "@/lib/sponsors/registry";
import { rfpMarket } from "@/lib/visitor-geo";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
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

export default async function RfpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await setLangFrom(params);
  const t = getT("board").detail;
  const lang = getLang();
  // Counts: raw in English (as before), grouped the local way elsewhere.
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  // "$120,000 CAD" from award summaries: as-is in English, "120 000 $ CAD" in French, "$120,000 CAD" in Spanish.
  const money = (v: string) => {
    if (lang === "en") return v;
    const n = Number(v.replace(/[^\d]/g, ""));
    return n ? fill(t.moneyCad, { n: formatNumber(n, lang) }) : v;
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

  // Match-proof before the paywall (audit #2/#4/#10): show a locked-out trade
  // that real liquidity exists in their region BEFORE asking them to pay. Uses
  // only count queries on the public teaser view — no RLS-gated fields.
  //
  // Preserve the board's UTC deadline/null-date definition of "open", and
  // exclude this slug from regional matches without hydrating the whole board.
  let regionMatchCount = 0;
  let totalOpenCount = 0;
  if (!showFull) {
    const counts = await getOpenRfpCounts(teaser.regionName, teaser.slug);
    totalOpenCount = counts.totalOpen;
    regionMatchCount = counts.regionMatchCount;
  }
  // The "+1" below only makes sense if the RFP being viewed is itself open —
  // a closed listing shouldn't count toward its own region's "open" total.
  const teaserIsOpen = teaser.status === "open";
  const isPublicTender = teaser.sourceType === "public_source";
  const tenderSource = publicTenderSource(teaser.slug);
  // Issuer, portal, bid label and credit line in the visitor's language (English: the lib as-is).
  const source = { ...tenderSource, ...t.sources[tenderSource.key] };
  // Quebec SEAO notices are published in French; say so to Google and screen readers.
  const noticeLang = isPublicTender && tenderSource.key === "seao" ? "fr" : undefined;
  // Past public contracts (CanadaBuys award notices) aren't biddable — show who
  // won and for how much, never a paywall or a "bid" button.
  const isAward = isPublicTender && tenderSource.past;
  // Federal award pages derive from the slug; Quebec award links are only in
  // the full (member) row.
  const awardUrl = !isAward
    ? null
    : tenderSource.key === "awards"
      ? awardNoticeUrl(teaser.slug.split("-cba-").pop() ?? "")
      : (full?.sourceUrl ?? null);
  const award = isAward ? parseAward(teaser.summary) : null;
  // Past its deadline but not an award notice: say so plainly and point at
  // what's open — never ask someone to pay to read a listing they can't bid on.
  const isClosed = !isAward && !teaserIsOpen;
  // "Can my company bid?" — open RFPs only. Members get the full checklist.
  const bidCheck = !isAward && !isClosed ? await getBidCheckBySlug(teaser.slug) : null;
  const bidChecklist = bidCheck ? (
    <BidChecklist
      check={bidCheck}
      locked={!showFull}
      proHref={session ? "/dashboard/billing?plan=pro&interval=monthly" : signUpHrefForPlan("pro", "monthly")}
      translated={isPublicTender && tenderSource.key === "seao"}
    />
  ) : null;
  // "The next one": how many OPEN tenders exist right now in the same trade.
  const boardRfps = isAward ? await listRfps({}, { photos: false }) : [];
  const similarOpen = boardRfps.filter((r) => r.status === "open" && teaser.categories.some((c) => r.categories.includes(c))).length;
  // Winner's company page, when they have 2+ awards on record.
  const winnerPage = award?.winner
    ? winnersFromRfps(boardRfps).find((w) => winnerKey(w.name) === winnerKey(award.winner!))
    : undefined;
  // GC sub-trade packages: the award they belong to, and — on an award page —
  // the packages the winning contractor has posted for it.
  const isGc = isGcPackage(teaser);
  const [gcAward, awardPackages] = await Promise.all([
    isGc ? getAwardById(teaser.awardedRfpId) : Promise.resolve(null),
    isAward ? listPackagesForAward(teaser.slug) : Promise.resolve([]),
  ]);
  const closesLabel = isGc ? t.facts.quotesDue : t.facts.closes;
  // "What this job is worth": open tenders only; the numbers render for members only.
  const intel = !isAward && !isClosed ? intelFor(teaser, await getAwardIndex()) : null;
  const upgradeHref = session ? "/dashboard/billing?plan=pro&interval=monthly" : signUpHrefForPlan("pro", "monthly");
  const intelCard = intel ? (
    <AwardIntelCard
      intel={showFull ? intel : { scope: intel.scope, trade: intel.trade, count: intel.count }}
      locked={!showFull}
      upgradeHref={upgradeHref}
    />
  ) : null;
  // Notice header.
  const bannerPhoto = tradePhotoForName(teaser.categories[0]);
  const noticeKind = isAward ? t.kind.award : isGc ? t.kind.gc : isPublicTender ? t.kind.public : t.kind.private;
  const place =
    [teaser.city, teaser.province && regionName(teaser.province, lang)].filter(Boolean).join(", ") ||
    (teaser.regionName ? regionName(teaser.regionName, lang) : teaser.regionName);
  const days = !isAward && !isClosed ? daysUntil(teaser.deadline) : null;
  const soon = days === null || days < 0 || days > 7 ? null : days;
  const daysLeft = soon === null ? null : soon === 0 ? t.daysLeft.today : soon === 1 ? t.daysLeft.tomorrow : fill(t.daysLeft.n, { n: soon });
  const closesIn = soon === null ? null : soon === 0 ? t.closesIn.today : soon === 1 ? t.closesIn.tomorrow : fill(t.closesIn.n, { n: soon });

  const sponsorCtx: SponsorContext = {
    placement: "rfp_detail",
    categories: teaser.categories,
    market: rfpMarket(teaser),
    publicTender: isPublicTender,
    seed: teaser.slug,
  };
  // The sponsor already has its card; don't list it again under "who can do this job".
  const sponsorName = pickSponsor(sponsorCtx)?.sponsor.name;

  return (
    <Container className="py-10">
      <nav aria-label={t.breadcrumb.aria} className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/rfps" className="hover:text-foreground">{t.breadcrumb.board}</Link>
        <span aria-hidden>/</span>
        {teaser.categories[0] ? <span className="truncate">{trade(teaser.categories[0])}</span> : <span>{t.breadcrumb.listing}</span>}
      </nav>

      {!configured && (
        <div className="mt-4 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 p-3 text-sm text-muted-foreground">
          <strong className="text-foreground">{t.demo.title}</strong>{" "}
          {showFull ? (
            <>{t.demo.fullView}{" "}
              <Link href={`/rfps/${slug}?view=locked`} className="text-teal-700 underline">{t.demo.seeLocked}</Link>.</>
          ) : (
            <>{t.demo.lockedView}{" "}
              <Link href={`/rfps/${slug}`} className="text-teal-700 underline">{t.demo.seeFull}</Link>.</>
          )}
        </div>
      )}

      <header className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        {teaser.photoUrls.length === 0 && (
          <div className="relative h-28 bg-indigo sm:h-36">
            <Image src={bannerPhoto.src} alt={bannerPhoto.alt} fill priority sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover opacity-60" />
          </div>
        )}
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="text-teal-ink">{noticeKind}</span>
            {teaser.isDemo && <span>{t.kind.sample}</span>}
          </div>
          <h1 lang={noticeLang} className="mt-3 max-w-4xl font-heading text-2xl font-semibold leading-tight tracking-tight text-indigo sm:text-3xl">
            {teaser.title}
            {place && <span className="font-normal text-muted-foreground"> — {place}</span>}
          </h1>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {teaser.categories.map((c) => <Badge key={c} variant="secondary">{trade(c)}</Badge>)}
            {teaser.propertyTypeName && <Badge variant="outline">{propertyTypeName(teaser.propertyTypeName, lang)}</Badge>}
            {isGc && <Badge variant="outline" className="border-teal-400 text-teal-ink">{sourceTypeLabel(teaser.sourceType, teaser.slug, lang)}</Badge>}
          </div>
        </div>
        <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-4 [&>div]:border-border [&>div]:px-5 [&>div]:py-3.5 sm:[&>div]:px-7">
          <div className="border-b border-r sm:border-b-0">
            <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><Hash className="size-3" /> {t.facts.reference}</dt>
            <dd className="mt-1 truncate font-mono text-sm text-foreground">{teaser.reference ?? t.facts.notPublished}</dd>
          </div>
          <div className="border-b sm:border-b-0 sm:border-r">
            <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><Landmark className="size-3" /> {t.facts.source}</dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground">{isPublicTender ? source.portal.replace(/^(the|le|la|les|el|los|las) /, "") : isGc ? t.facts.gc : t.facts.pm}</dd>
          </div>
          <div className="border-r">
            <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><CalendarClock className="size-3" /> {isAward ? t.facts.awarded : isClosed ? t.facts.closed : closesLabel}</dt>
            <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
              {teaser.deadline ? fmt(teaser.deadline, lang) : t.facts.ongoing}
              {daysLeft && <span className="ml-1.5 text-teal-ink">· {daysLeft}</span>}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><MapPin className="size-3" /> {t.facts.location}</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{place ?? t.facts.notSpecified}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">

          {isPublicTender && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
              <Landmark className="mt-0.5 size-4 shrink-0" />
              <span>
                {isAward ? (
                  <>
                    <strong className="text-foreground">{t.publicNote.pastTitle}</strong>{" "}
                    {fill(t.publicNote.pastBody, { issuer: source.issuer })}
                  </>
                ) : (
                  <>
                    <strong className="text-foreground">{t.publicNote.openTitle}</strong>{" "}
                    {fill(t.publicNote.openBody, { issuer: source.issuer, portal: source.portal })}
                  </>
                )}
              </span>
            </p>
          )}

          {isGc && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-teal-300 bg-teal-50/60 p-3 text-sm text-muted-foreground">
              <HardHat className="mt-0.5 size-4 shrink-0 text-teal-600" />
              <span>
                <strong className="text-foreground">{t.gcNote.title}</strong>{" "}{t.gcNote.collecting}
                {teaser.categories[0] ? fill(t.gcNote.quotesTrade, { trade: tradeWords(trade(teaser.categories[0])) }) : t.gcNote.quotes}
                {teaser.gcProjectName ? <>{t.gcNote.forProject}<strong className="text-foreground">{teaser.gcProjectName}</strong></> : null}
                {t.gcNote.end}
                {gcAward && (
                  <>
                    {t.gcNote.partOf}
                    <Link href={`/rfps/${gcAward.slug}`} className="font-medium text-teal-700 hover:underline">
                      {gcAward.title}
                    </Link>
                    {gcAward.winner ? fill(t.gcNote.wonBy, { winner: gcAward.winner }) : ""}
                    {gcAward.value ? fill(t.gcNote.value, { value: money(gcAward.value) }) : ""}
                    {t.gcNote.end}
                  </>
                )}
              </span>
            </p>
          )}

          {isPublicTender && !isAward && !isClosed && (
            <div className="mt-4">
              <BidHelpCard
                rfpSlug={teaser.slug}
                rfpTitle={teaser.title}
                trade={teaser.categories[0]}
                portal={tenderSource.portal}
              />
            </div>
          )}

          {full?.status === "awarded" && (
            <div className="mt-6 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
              <strong>{t.status.awardedTitle}</strong> {t.status.awardedBody}
            </div>
          )}
          {full?.status === "closed" && (
            <div className="mt-6 rounded-lg border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
              <strong>{t.status.closedTitle}</strong> {t.status.closedBody}
            </div>
          )}

          {teaser.summary && <p lang={noticeLang} className="mt-6 text-lg leading-relaxed text-foreground/90">{teaser.summary}</p>}

          {teaser.photoUrls.length > 0 && (
            <div className="mt-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {teaser.photoUrls.slice(0, 6).map((u, i) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      i === 0
                        ? "relative col-span-2 row-span-2 aspect-[4/3] overflow-hidden rounded-lg border border-border bg-secondary/40 sm:col-span-2"
                        : "relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary/40"
                    }
                  >
                    <Image
                      src={u}
                      alt={fill(t.photos.alt, { n: i + 1 })}
                      fill
                      sizes={i === 0 ? "(min-width: 1024px) 800px, 100vw" : "(min-width: 1024px) 280px, 33vw"}
                      priority={i === 0}
                      className="object-cover transition-transform hover:scale-[1.02]"
                    />
                  </a>
                ))}
              </div>
              {teaser.photoUrls.length > 6 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {plural(teaser.photoUrls.length - 6, t.photos.more)}
                </p>
              )}
            </div>
          )}

          {isAward ? (
            <div className="mt-8 rounded-lg border border-teal-400/50 bg-teal-100/30 p-6">
              {award?.winner && (
                <div className="mb-5 rounded-lg border border-border bg-card p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.award.wonBy}</div>
                  <div className="mt-0.5 text-lg font-semibold">
                    {winnerPage ? (
                      <Link href={`/contract-winners/${winnerPage.slug}`} className="hover:text-teal-700 hover:underline">
                        {award.winner}
                      </Link>
                    ) : (
                      award.winner
                    )}
                  </div>
                  {winnerPage && (
                    <Link href={`/contract-winners/${winnerPage.slug}`} className="mt-1 inline-block text-xs font-medium text-teal-700 hover:underline">
                      {fill(t.award.allWins, { n: num(winnerPage.awards.length) })}
                    </Link>
                  )}
                  {award.value && <div className="mt-1 text-3xl font-extrabold tracking-tight text-indigo">{money(award.value)}</div>}
                </div>
              )}
              {awardPackages.length > 0 && (
                <div className="mb-5 rounded-lg border border-border bg-card p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t.award.hiringSubs}
                  </div>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {awardPackages.map((p) => (
                      <li key={p.slug}>
                        <Link href={`/rfps/${p.slug}`} className="font-medium text-teal-700 hover:underline">
                          {p.title}
                        </Link>
                        {p.deadline && <span className="text-muted-foreground">{fill(t.award.quotesDue, { date: fmt(p.deadline, lang) })}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <h2 className="text-lg font-semibold tracking-tight">
                {t.award.gone}{" "}
                {similarOpen > 0
                  ? plural(similarOpen, t.award.similar, {
                      n: num(similarOpen),
                      trade: teaser.categories[0]
                        ? fill(t.award.tradePhrase, {
                            trade: lang === "en" ? teaser.categories[0].toLowerCase() : tradeWords(trade(teaser.categories[0])),
                          })
                        : t.award.tradeFallback,
                    })
                  : t.award.nextWontWait}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t.award.pitch}
              </p>
              <Link
                href={session ? "/dashboard/billing?plan=pro&interval=annual" : signUpHrefForPlan("pro")}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-indigo-700"
              >
                {t.award.cta}
              </Link>
              {similarOpen > 0 && teaser.categories[0] && (
                <Link href="/rfps" className="ml-3 mt-4 inline-flex text-sm font-medium text-teal-700 hover:underline">
                  {t.award.seeOpen}
                </Link>
              )}
              <p className="mt-4 text-xs text-muted-foreground">{source.attribution}</p>
            </div>
          ) : showFull && full ? (
            <div className="mt-8 space-y-8">
              {bidChecklist}
              {intelCard}
              <Block title={t.full.scope} body={full.scope} />
              <Block title={t.full.requirements} body={full.requirements} />
              {(full.budgetPublic && (full.budgetMin || full.budgetMax)) && (
                <Section2 title={t.full.budget} icon={<DollarSign className="size-4" />}>
                  {fill(t.full.budgetRange, { min: budget(full.budgetMin), max: budget(full.budgetMax), currency: isUsState(full.province) ? "USD" : "CAD" })}
                </Section2>
              )}
              <Block title={t.full.submission} body={full.submissionInstructions} />
              <Section2 title={t.full.contact} icon={<Building2 className="size-4" />}>
                {full.contactVisibility === "public_contact" ? (
                  <span>{[full.contactName, full.contactEmail, full.contactPhone].filter(Boolean).join(" · ") || t.full.afterSignIn}</span>
                ) : full.contactVisibility === "anonymous_until_interest_approved" ? (
                  <span>{t.full.afterApproval}</span>
                ) : (
                  <span>{t.full.mediated}</span>
                )}
              </Section2>
              {isPublicTender && full.sourceUrl && (
                <div>
                  <a
                    href={full.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-indigo-700"
                  >
                    {fill(t.full.openNotice, { portal: source.portal })} <ExternalLink className="size-4" />
                  </a>
                  <p className="mt-3 text-xs text-muted-foreground">{source.attribution}</p>
                </div>
              )}
              <TrustDisclaimer />
            </div>
          ) : isClosed ? (
            <div className="mt-8 rounded-lg border border-border bg-secondary/40 p-6">
              <h2 className="text-lg font-semibold tracking-tight">
                {fill(t.closed.title, { date: fmt(teaser.deadline, lang) })}{" "}
                {regionMatchCount > 0 && teaser.regionName
                  ? plural(regionMatchCount, t.closed.region, { n: num(regionMatchCount), region: regionName(teaser.regionName, lang) })
                  : totalOpenCount > 0
                    ? plural(totalOpenCount, t.closed.total, { n: num(totalOpenCount) })
                    : ""}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t.closed.body}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={session ? "/dashboard/billing?plan=pro&interval=annual" : signUpHrefForPlan("pro")}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-indigo-700"
                >
                  {t.closed.cta}
                </Link>
                <Link href="/rfps" className="text-sm font-medium text-teal-700 hover:underline">
                  {t.closed.seeOpen}
                </Link>
              </div>
              {isPublicTender && <p className="mt-4 text-xs text-muted-foreground">{source.attribution}</p>}
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              {bidChecklist}
              {intelCard}
              {totalOpenCount > 0 && (
                <div className="rounded-lg border border-teal-400/50 bg-teal-100/30 p-5">
                  <p className="text-sm font-semibold text-foreground">
                    {regionMatchCount > 0 && teaser.regionName
                      ? plural(regionMatchCount + (teaserIsOpen ? 1 : 0), t.locked.region, {
                          n: num(regionMatchCount + (teaserIsOpen ? 1 : 0)),
                          region: regionName(teaser.regionName, lang),
                        })
                      : plural(totalOpenCount, t.locked.total, { n: num(totalOpenCount) })}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t.locked.proof}
                  </p>
                </div>
              )}
              {isPublicTender && (
                <div className="rounded-lg border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    {t.locked.publicPitch}
                  </p>
                  <p className="mt-2 text-xs">{source.attribution}</p>
                </div>
              )}
              <LockedContentPanel signedIn={Boolean(session)} />
            </div>
          )}
          {!isAward && (
            <ListingMatches
              className="mt-8"
              listing={{
                categories: teaser.categories,
                regionName: teaser.regionName,
                province: teaser.province,
                market: rfpMarket(teaser),
              }}
              seed={teaser.slug}
              exclude={sponsorName ? [sponsorName] : undefined}
            />
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="border-b border-border pb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {isAward ? t.facts.awarded : isClosed ? t.facts.closed : closesLabel}
              </div>
              <div className="mt-1 font-heading text-2xl font-semibold tabular-nums text-indigo">
                {teaser.deadline ? fmt(teaser.deadline, lang) : t.facts.ongoing}
              </div>
              {closesIn && <div className="mt-0.5 text-sm text-teal-ink">{closesIn}</div>}
            </div>
            <div className="space-y-3 py-4">
              <Meta label={t.side.region} value={teaser.regionName ? regionName(teaser.regionName, lang) : t.facts.notSpecified} />
              <Meta label={t.side.propertyType} value={teaser.propertyTypeName ? propertyTypeName(teaser.propertyTypeName, lang) : t.facts.notSpecified} />
              {teaser.categories.length > 0 && <Meta label={t.side.trade} value={teaser.categories.map(trade).join(", ")} />}
            </div>
            {isAward && awardUrl ? (
              <div className="pt-2">
                <a
                  href={awardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
                >
                  {t.award.official} <ExternalLink className="size-4" />
                </a>
              </div>
            ) : showFull && full ? (
              <div className="flex flex-col gap-2 pt-2">
                {isPublicTender ? (
                  full.sourceUrl && (
                    <a
                      href={full.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-indigo-700"
                    >
                      {source.bidLabel} <ExternalLink className="size-4" />
                    </a>
                  )
                ) : (
                  <ExpressInterestDialog rfpId={full.id} rfpTitle={full.title} />
                )}
                <SaveButton rfpId={full.id} />
              </div>
            ) : isAward ? null : (
              <div className="pt-2">
                <Link
                  href={upgradeHref}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <FileText className="size-4" />
                  {isClosed ? t.side.alerts : t.side.unlock}
                </Link>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {isClosed ? t.side.closedNote : t.side.unlockNote}
                </p>
              </div>
            )}
          </div>
          {/* Aimed at the winning contractor: post sub-trade packages for this job. */}
          {isAward && award?.winner && <GcPackageCta awardSlug={teaser.slug} />}
          <SponsorSlot ctx={sponsorCtx} />
        </aside>
      </div>
    </Container>
  );
}

function Block({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <section className="border-t border-border pt-6">
      <h2 className="font-heading text-lg font-semibold tracking-tight text-indigo">{title}</h2>
      <p className="mt-3 max-w-prose whitespace-pre-line leading-relaxed text-foreground/90">{body}</p>
    </section>
  );
}

function Section2({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight text-indigo">
        <span className="text-muted-foreground">{icon}</span> {title}
      </h2>
      <div className="mt-3 leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="text-right text-sm font-medium">{value}</div>
    </div>
  );
}
