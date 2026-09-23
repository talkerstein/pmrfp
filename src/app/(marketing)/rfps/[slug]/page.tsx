import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin, FileText, Building2, DollarSign, ExternalLink, Landmark } from "lucide-react";
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
import { parseAward } from "@/lib/data/fomo";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rfp = await getRfpTeaser(slug);
  if (!rfp) return { title: "Opportunity not found" };
  return {
    title: `${rfp.title} — RFP Opportunity`,
    description: rfp.summary ?? "Commercial property RFP opportunity on PMRFP.",
  };
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "—";
}

export default async function RfpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
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
  // only public board data (listRfps = rfp_public view) — no RLS-gated fields.
  //
  // listRfps() deliberately returns EVERY RFP, closed included, so the public
  // board can render past-deadline ones grayed out. Using that raw count here
  // meant this banner claimed "N open commercial RFPs right now" by counting
  // closed ones too — live, unrelated to any deploy, confirmed on a fully
  // closed board still claiming open regional matches (external audit,
  // 2026-09-17). Filter to status === "open" before counting anything.
  let regionMatchCount = 0;
  let totalOpenCount = 0;
  if (!showFull) {
    const allRfps = await listRfps();
    const openRfps = allRfps.filter((r) => r.status === "open");
    totalOpenCount = openRfps.length;
    if (teaser.regionName) {
      regionMatchCount = openRfps.filter(
        (r) => r.regionName === teaser.regionName && r.slug !== teaser.slug,
      ).length;
    }
  }
  // The "+1" below only makes sense if the RFP being viewed is itself open —
  // a closed listing shouldn't count toward its own region's "open" total.
  const teaserIsOpen = teaser.status === "open";
  const isPublicTender = teaser.sourceType === "public_source";
  const tenderSource = publicTenderSource(teaser.slug);
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
  // "The next one": how many OPEN tenders exist right now in the same trade.
  const boardRfps = isAward ? await listRfps() : [];
  const similarOpen = boardRfps.filter((r) => r.status === "open" && teaser.categories.some((c) => r.categories.includes(c))).length;
  // Winner's company page, when they have 2+ awards on record.
  const winnerPage = award?.winner
    ? winnersFromRfps(boardRfps).find((w) => winnerKey(w.name) === winnerKey(award.winner!))
    : undefined;

  return (
    <Container className="py-10">
      <Link href="/rfps" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to opportunities
      </Link>

      {!configured && (
        <div className="mt-4 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 p-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Demo preview.</strong>{" "}
          {showFull ? (
            <>You&apos;re seeing the full Trade Pro member view.{" "}
              <Link href={`/rfps/${slug}?view=locked`} className="text-teal-700 underline">See the visitor (locked) view</Link>.</>
          ) : (
            <>You&apos;re seeing the visitor (locked) view.{" "}
              <Link href={`/rfps/${slug}`} className="text-teal-700 underline">See the full member view</Link>.</>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {teaser.categories.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
            {teaser.propertyTypeName && <Badge variant="outline">{teaser.propertyTypeName}</Badge>}
            {teaser.isDemo && <Badge variant="outline" className="border-dashed">Sample</Badge>}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{teaser.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {teaser.regionName && <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {teaser.regionName}</span>}
            <span className="flex items-center gap-1.5"><CalendarClock className="size-4" /> {isAward ? `Awarded ${fmt(teaser.deadline)}` : isClosed ? `Closed ${fmt(teaser.deadline)}` : teaser.deadline ? `Closes ${fmt(teaser.deadline)}` : "Ongoing — no fixed closing date"}</span>
          </div>

          {isPublicTender && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
              <Landmark className="mt-0.5 size-4 shrink-0" />
              <span>
                {isAward ? (
                  <>
                    <strong className="text-foreground">Past public contract.</strong> Already awarded by{" "}
                    {tenderSource.issuer} — listed so trades can see what this kind of work sells for and who wins
                    it. It did not go through PMRFP.
                  </>
                ) : (
                  <>
                    <strong className="text-foreground">Public tender.</strong> Issued by {tenderSource.issuer} and
                    published on {tenderSource.portal}. PMRFP collects the tenders that fit commercial trades — bids
                    go directly to the issuer, not through PMRFP.
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
              <strong>This RFP has been awarded.</strong> Watch for similar opportunities on the
              feed — or post your own RFP if you have a project.
            </div>
          )}
          {full?.status === "closed" && (
            <div className="mt-6 rounded-lg border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
              <strong>This RFP is closed.</strong> No vendor was awarded the work through PMRFP.
            </div>
          )}

          {teaser.summary && <p className="mt-6 text-lg leading-relaxed text-foreground/90">{teaser.summary}</p>}

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
                      alt={`Property photo ${i + 1}`}
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
                  + {teaser.photoUrls.length - 6} more photo{teaser.photoUrls.length - 6 === 1 ? "" : "s"}
                </p>
              )}
            </div>
          )}

          {isAward ? (
            <div className="mt-8 rounded-xl border border-teal-400/50 bg-teal-100/30 p-6">
              {award?.winner && (
                <div className="mb-5 rounded-lg border border-border bg-card p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Won by</div>
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
                      See all {winnerPage.awards.length} contracts they&apos;ve won →
                    </Link>
                  )}
                  {award.value && <div className="mt-1 text-3xl font-extrabold tracking-tight text-indigo">{award.value}</div>}
                </div>
              )}
              <h2 className="text-lg font-semibold tracking-tight">
                This contract is gone.{" "}
                {similarOpen > 0
                  ? `${similarOpen} open ${teaser.categories[0]?.toLowerCase() ?? "trade"} tender${similarOpen === 1 ? " is" : "s are"} live right now.`
                  : "The next one won't wait either."}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Trade Pro emails you the day a new public tender in your trade and region is posted, with the
                direct link, full scope and buyer contact — so you&apos;re bidding on the next contract, not
                reading about who won the last one.
              </p>
              <Link
                href={session ? "/dashboard/billing?plan=pro&interval=annual" : signUpHrefForPlan("pro")}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-indigo-700"
              >
                Get tender alerts for my trade
              </Link>
              {similarOpen > 0 && teaser.categories[0] && (
                <Link href="/rfps" className="ml-3 mt-4 inline-flex text-sm font-medium text-teal-700 hover:underline">
                  See the open ones →
                </Link>
              )}
              <p className="mt-4 text-xs text-muted-foreground">{tenderSource.attribution}</p>
            </div>
          ) : showFull && full ? (
            <div className="mt-8 space-y-8">
              <Block title="Project scope" body={full.scope} />
              <Block title="Requirements" body={full.requirements} />
              {(full.budgetPublic && (full.budgetMin || full.budgetMax)) && (
                <Section2 title="Budget range" icon={<DollarSign className="size-4" />}>
                  ${full.budgetMin?.toLocaleString() ?? "—"} – ${full.budgetMax?.toLocaleString() ?? "—"} CAD
                </Section2>
              )}
              <Block title="Submission instructions" body={full.submissionInstructions} />
              <Section2 title="Contact" icon={<Building2 className="size-4" />}>
                {full.contactVisibility === "public_contact" ? (
                  <span>{[full.contactName, full.contactEmail, full.contactPhone].filter(Boolean).join(" · ") || "Provided after sign-in"}</span>
                ) : full.contactVisibility === "anonymous_until_interest_approved" ? (
                  <span>Contact details are revealed after the property manager approves your interest.</span>
                ) : (
                  <span>This opportunity is mediated by PMRFP — express interest to connect.</span>
                )}
              </Section2>
              {isPublicTender && full.sourceUrl && (
                <div>
                  <a
                    href={full.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-indigo-700"
                  >
                    Open the official notice on {tenderSource.portal} <ExternalLink className="size-4" />
                  </a>
                  <p className="mt-3 text-xs text-muted-foreground">{tenderSource.attribution}</p>
                </div>
              )}
              <TrustDisclaimer />
            </div>
          ) : isClosed ? (
            <div className="mt-8 rounded-xl border border-border bg-secondary/40 p-6">
              <h2 className="text-lg font-semibold tracking-tight">
                This one closed on {fmt(teaser.deadline)}.{" "}
                {regionMatchCount > 0 && teaser.regionName
                  ? `${regionMatchCount} open RFP${regionMatchCount === 1 ? " is" : "s are"} live in ${teaser.regionName} right now.`
                  : totalOpenCount > 0
                    ? `${totalOpenCount} open RFPs are live right now.`
                    : ""}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Trade Pro emails you the day a new RFP in your trade and region is posted, so you see the
                next one while it&apos;s still open.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={session ? "/dashboard/billing?plan=pro&interval=annual" : signUpHrefForPlan("pro")}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-indigo-700"
                >
                  Get alerts for my trade
                </Link>
                <Link href="/rfps" className="text-sm font-medium text-teal-700 hover:underline">
                  See what&apos;s open →
                </Link>
              </div>
              {isPublicTender && <p className="mt-4 text-xs text-muted-foreground">{tenderSource.attribution}</p>}
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              {totalOpenCount > 0 && (
                <div className="rounded-xl border border-teal-400/50 bg-teal-100/30 p-5">
                  <p className="text-sm font-semibold text-foreground">
                    {regionMatchCount > 0 && teaser.regionName
                      ? `${regionMatchCount + (teaserIsOpen ? 1 : 0)} open commercial RFPs in ${teaser.regionName} right now`
                      : `${totalOpenCount} open commercial RFPs on PMRFP right now`}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Trade Pro members get the full scope and contacts for every one, plus an email
                    the day a new one matches their trade.
                  </p>
                </div>
              )}
              {isPublicTender && (
                <div className="rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    This tender is public. What Trade Pro adds: every public tender that fits your trade in
                    one place, a daily email when a new one is posted in your region, and the direct link,
                    full scope and buyer contact for each — instead of checking government bid portals yourself.
                  </p>
                  <p className="mt-2 text-xs">{tenderSource.attribution}</p>
                </div>
              )}
              <LockedContentPanel signedIn={Boolean(session)} />
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <Meta label="Region" value={teaser.regionName ?? "—"} />
            <Meta label="Property type" value={teaser.propertyTypeName ?? "—"} />
            <Meta label={isAward ? "Awarded" : isClosed ? "Closed" : "Closes"} value={fmt(teaser.deadline)} />
            {isAward && awardUrl ? (
              <div className="pt-2">
                <a
                  href={awardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
                >
                  Official award notice <ExternalLink className="size-4" />
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
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-indigo-700"
                    >
                      {tenderSource.bidLabel} <ExternalLink className="size-4" />
                    </a>
                  )
                ) : (
                  <ExpressInterestDialog rfpId={full.id} rfpTitle={full.title} />
                )}
                <SaveButton rfpId={full.id} />
              </div>
            ) : (
              <div className="pt-2">
                <FileText className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {isClosed
                    ? "This RFP is closed. Trade Pro members get alerted to new ones in their trade and region."
                    : "Full details, documents, and the ability to express interest are available to Trade Pro members."}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </Container>
  );
}

function Block({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground/90">{body}</p>
    </div>
  );
}

function Section2({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">{icon} {title}</h2>
      <div className="mt-2 leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
