import { ExpressInterestDialog } from "@/components/forms/express-interest-dialog";
import { AskQuestionForm } from "@/components/towns/jobs/manage-forms";
import type { RespondState } from "@/lib/pm-jobs/server";
import type { TownListing } from "@/lib/town-jobs/public-data";
import { askDecision, townCta, townLabel, todayToronto } from "@/lib/town-jobs/rules";
import { getLang, getT } from "@/i18n/server";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";

/**
 * A public buyer's job on /rfps/[slug] (PMRFP for Towns, Part B2): free and
 * never behind the paywall. A quote request shows its details, the free
 * respond button, the public Q&A and the private "ask a question" box; a
 * formal tender mirror shows the summary and its official link (bids go
 * there: no response form). Both show their addenda and the closing date's
 * change history.
 */

export interface TownViewer {
  signedIn: boolean;
  userId: string | null;
  organizationId: string | null;
}

const day = (d: string | null | undefined, lang: Locale) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "long", day: "numeric", year: "numeric" }) : "—");

/** The listing's label ("Posted by the Town of X (verified)" / "Official tender, bid on bids&tenders"). */
export function townTag(listing: TownListing): string {
  const t = getT("townJobs").listing;
  const l = townLabel(listing.post);
  if (l.kind === "official") return fmt(t.official, { portal: l.portal ?? t.officialPortal });
  return fmt(l.verified ? t.posted : t.postedUnverified, { buyer: l.buyer || t.kind.quote_request });
}

/** The hero's buttons: respond free (quote request), or go to the official portal (mirror). */
export function TownHeroCtas({ listing, respond, viewer, slug, manageHref }: { listing: TownListing; respond: RespondState | null; viewer: TownViewer; slug: string; manageHref: string | null }) {
  const lang = getLang();
  const t = getT("townJobs").listing;
  const tr = getT("pmJobs").respond;
  const L = (p: string) => localizePath(p, lang);
  const p = listing.post;
  const cta = townCta(p, todayToronto());
  const portal = p.official_portal?.trim() || t.officialPortal;
  if (cta === "official" && p.official_url) {
    return (
      <>
        <a href={p.official_url} target="_blank" rel="noopener noreferrer nofollow" className="v3-pill mint vp-big" data-cta="official-tender">{fmt(t.officialBtn, { portal })} ↗</a>
        <span className="vp-dnote" data-town="mirror">{fmt(t.mirror, { buyer: p.buyer_name ?? "", portal })}</span>
      </>
    );
  }
  if (cta === "closed") return <span className="vp-dnote">{t.closed}</span>;
  if (manageHref) return <a href={L(manageHref)} className="v3-pill mint vp-big" data-cta="manage">{getT("townJobs").listing.ask.manage}</a>;
  return (
    <>
      {respond?.already ? (
        <a href={L("/dashboard/interests")} className="v3-pill mint vp-big">{tr.seeResponses}</a>
      ) : respond && respond.refusal === null ? (
        <span className="v3-tw vp-tw-btn" data-respond="town">
          <ExpressInterestDialog rfpId={respond.rfpId} rfpTitle={respond.title} currency={respond.currency} allowance={null} />
        </span>
      ) : !viewer.signedIn ? (
        <>
          <a href={L(`/sign-up?role=trade&next=${encodeURIComponent(L(`/rfps/${slug}`))}`)} className="v3-pill mint vp-big" data-cta="free-account">{t.signUp}</a>
          <a href={L(`/sign-in?next=${encodeURIComponent(L(`/rfps/${slug}`))}`)} className="vp-ghost light vp-ic">{t.signIn}</a>
        </>
      ) : null}
      <span className="vp-dnote" data-town="free">{t.free}</span>
    </>
  );
}

/** The side card's buttons (same rules as the hero). */
export function TownAsideCtas({ listing, respond, viewer, slug }: { listing: TownListing; respond: RespondState | null; viewer: TownViewer; slug: string }) {
  const lang = getLang();
  const t = getT("townJobs").listing;
  const tr = getT("pmJobs").respond;
  const L = (p: string) => localizePath(p, lang);
  const p = listing.post;
  const cta = townCta(p, todayToronto());
  const portal = p.official_portal?.trim() || t.officialPortal;
  if (cta === "official" && p.official_url) {
    return (
      <>
        <a href={p.official_url} target="_blank" rel="noopener noreferrer nofollow" className="v3-pill navy vp-block-btn">{fmt(t.officialBtn, { portal })} ↗</a>
        <p className="nt">{fmt(t.mirror, { buyer: p.buyer_name ?? "", portal })}</p>
      </>
    );
  }
  if (cta === "closed") return <p className="nt">{t.closed}</p>;
  return (
    <>
      {respond?.already ? (
        <a href={L("/dashboard/interests")} className="v3-pill navy vp-block-btn">{tr.seeResponses}</a>
      ) : respond && respond.refusal === null ? (
        <span className="v3-tw vp-block-btn"><ExpressInterestDialog rfpId={respond.rfpId} rfpTitle={respond.title} currency={respond.currency} allowance={null} /></span>
      ) : !viewer.signedIn ? (
        <a href={L(`/sign-up?role=trade&next=${encodeURIComponent(L(`/rfps/${slug}`))}`)} className="v3-pill navy vp-block-btn">{t.signUp}</a>
      ) : null}
      <p className="nt">{t.free}</p>
    </>
  );
}

/** The main column: the label, the details (quote request), addenda with the change history, and the public Q&A. */
export function TownListingBody({
  listing,
  viewer,
  slug,
  manageHref,
}: {
  listing: TownListing;
  viewer: TownViewer;
  slug: string;
  /** Set when the viewer belongs to the posting town (they manage it from their dashboard). */
  manageHref: string | null;
}) {
  const lang = getLang();
  const t = getT("townJobs").listing;
  const L = (p: string) => localizePath(p, lang);
  const p = listing.post;
  const mirror = p.post_kind === "tender_mirror";
  const portal = p.official_portal?.trim() || t.officialPortal;
  const money = (n: number) => n.toLocaleString(lang === "fr" ? "fr-CA" : lang === "es" ? "es-US" : "en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
  const ask = askDecision({
    signedIn: viewer.signedIn,
    job: { source_type: "public_buyer_direct", post_kind: p.post_kind, status: p.status, deadline: p.deadline, question_deadline: p.question_deadline, posted_by_user_id: null, posted_by_organization_id: null },
    userId: viewer.userId,
    organizationId: viewer.organizationId,
  });

  return (
    <div className="vp-full" data-town-listing={p.post_kind ?? ""}>
      <p className="vp-note teal" data-town-label={townLabel(p).kind}>
        <b>{townTag(listing)}</b>
        {mirror && p.official_url ? (
          <>
            {" · "}
            <a href={p.official_url} target="_blank" rel="noopener noreferrer nofollow" data-link="official-tender">{fmt(t.officialBtn, { portal })} ↗</a>
          </>
        ) : null}
        <br />
        {mirror ? fmt(t.mirror, { buyer: p.buyer_name ?? "", portal }) : t.free}
      </p>

      {!mirror && (
        <>
          <Block title={t.details.scope} body={p.scope} />
          <Block title={t.details.requirements} body={p.requirements} />
          {(p.budget_min || p.budget_max) ? (
            <section className="vp-block">
              <h2>{t.details.budget}</h2>
              <p>{fmt(t.details.budgetRange, { min: p.budget_min ? money(Number(p.budget_min)) : "—", max: p.budget_max ? money(Number(p.budget_max)) : "—" })}</p>
            </section>
          ) : null}
          <Block title={t.details.submission} body={p.submission_instructions} />
          <section className="vp-block">
            <h2>{t.details.contact}</h2>
            <p>{[p.contact_name, p.contact_email, p.contact_phone].filter(Boolean).join(" · ") || t.details.contactHidden}</p>
          </section>
        </>
      )}

      <section className="vp-block" id="addenda" data-list="addenda">
        <h2>{t.addenda.title}</h2>
        {listing.addenda.length === 0 ? (
          <p className="muted">{t.addenda.none}</p>
        ) : (
          listing.addenda.map((a) => (
            <div key={a.number} data-addendum={a.number} style={{ marginBottom: 12 }}>
              <p>
                <b>{fmt(t.addenda.number, { n: a.number })}</b> · <span className="small muted">{fmt(t.addenda.issued, { date: day(a.created_at, lang) })}</span>
              </p>
              <p className="pre">{a.body}</p>
              {a.official_url && (
                <p className="small"><a href={a.official_url} target="_blank" rel="noopener noreferrer nofollow">{t.addenda.document} ↗</a></p>
              )}
            </div>
          ))
        )}
        {listing.history.length > 0 && (
          <div data-list="deadline-history">
            <h3 className="vp-h3">{t.history.title}</h3>
            <p className="small muted">{fmt(t.history.original, { date: day(listing.history[0].from, lang) })}</p>
            <ul>
              {listing.history.map((h) => (
                <li key={h.number}>{fmt(t.history.row, { from: day(h.from, lang), to: day(h.to, lang), n: h.number, date: day(h.at, lang) })}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {!mirror && (
        <section className="vp-block" id="questions" data-list="qa">
          <h2>{t.qa.title}</h2>
          <p className="small muted">{t.qa.intro}</p>
          {listing.qa.length === 0 ? (
            <p className="muted">{t.qa.none}</p>
          ) : (
            <dl>
              {listing.qa.map((x) => (
                <div key={x.id} data-qa={x.id} style={{ marginBottom: 14 }}>
                  <dt><b>{t.qa.q}.</b> <span className="pre">{x.question}</span></dt>
                  <dd><b>{t.qa.a}.</b> <span className="pre">{x.answer}</span> <span className="small muted">({fmt(t.qa.answered, { date: day(x.answeredAt, lang) })})</span></dd>
                </div>
              ))}
            </dl>
          )}

          <h3 className="vp-h3">{t.ask.title}</h3>
          <p className="small muted">{p.question_deadline ? (ask === "deadline" ? fmt(t.ask.closed, { date: day(p.question_deadline, lang) }) : fmt(t.ask.until, { date: day(p.question_deadline, lang) })) : t.ask.untilClosing}</p>
          {manageHref ? (
            <p className="small">{t.ask.own} <a href={L(manageHref)}>{t.ask.manage} →</a></p>
          ) : ask === null ? (
            <AskQuestionForm rfpId={p.id} />
          ) : ask === "signin" ? (
            <p><a href={L(`/sign-in?next=${encodeURIComponent(L(`/rfps/${slug}`))}`)} className="v3-pill navy">{t.ask.signIn}</a></p>
          ) : null}
        </section>
      )}
    </div>
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
