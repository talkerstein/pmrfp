"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "@/i18n/link";
import { useLang } from "@/i18n/provider";
import { fmt, formatDate } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";
import { startTrialAction } from "@/lib/entitlement/actions";
import type { ProjectMemberDetails } from "@/lib/growth/gate";

/**
 * The viewer-specific parts of /major-projects/[slug], resolved in the browser.
 *
 * The page is ISR (revalidate 24 h) and renders the signed-out version for
 * everybody. It must not read cookies()/headers(): that throws
 * DYNAMIC_SERVER_USAGE on a static page and the route returns 500. A signed-in
 * browser asks /api/major-projects/[slug]/viewer once per page load (shared by
 * every island below), and only when a sign-in cookie exists, like the trial banner.
 */
export interface ViewerData {
  signedIn: boolean;
  member?: ProjectMemberDetails | null;
  pro?: { generalContractor: string | null; bidListUrl: string | null; bidRoute: string | null } | null;
  offer?: { mode: "trial" | "signup_trial" | "resume" | "paid"; href: string };
}

const AUTH_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token/;
const loads = new Map<string, Promise<ViewerData | null>>();

function load(slug: string): Promise<ViewerData | null> {
  let p = loads.get(slug);
  if (!p) {
    p = fetch(`/api/major-projects/${encodeURIComponent(slug)}/viewer`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ViewerData>) : null))
      .catch(() => null);
    loads.set(slug, p);
    // A fresh answer on the next page view (sign-in, trial start, upgrade).
    setTimeout(() => loads.delete(slug), 30_000);
  }
  return p;
}

function useViewer(slug: string): ViewerData | null {
  const [data, setData] = useState<ViewerData | null>(null);
  useEffect(() => {
    if (typeof document === "undefined" || !AUTH_COOKIE.test(document.cookie)) return;
    let live = true;
    load(slug).then((d) => {
      if (live && d?.signedIn) setData(d);
    });
    return () => {
      live = false;
    };
  }, [slug]);
  return data;
}

const day = (d: string | null, lang: Parameters<typeof formatDate>[1]) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");

export interface ViewerLabels {
  status: string;
  statusText: string;
  statusAsOf: string;
  sourceWording: string;
  size: string;
  timeline: string;
  evidenceLabel: string;
  evidence: Record<string, string>;
  caveats: string;
  trades: string;
  tradesNote: string;
  openTitle: string;
  openNone: string;
  openCloses: string;
  awardsTitle: string;
  awardsBody: string;
  gc: string;
  gcUnknown: string;
  bidLink: string;
  bidRoute: string;
  noRoute: string;
}

const H2 = ({ id, children }: { id: string; children: ReactNode }) => (
  <h2 className="s-h2" id={id}>
    <span>{children}</span>
  </h2>
);

/** Hides a static signed-out panel once we know the viewer is past it. */
const Hide = ({ selector }: { selector: string }) => <style>{`${selector}{display:none}`}</style>;

/** Free-account facts and trades (replaces the "free account" gate panel for members). */
export function ViewerAbout({ slug, labels }: { slug: string; labels: ViewerLabels }) {
  const lang = useLang();
  const v = useViewer(slug);
  const member = v?.member;
  if (!member) return null;
  return (
    <>
      <Hide selector='[data-panel="free-gate"]' />
      <div className="s-dtw" data-viewer="member">
        <table className="s-dt">
          <tbody>
            {member.statusDate && (
              <tr><th scope="row">{labels.status}</th><td>{fmt(labels.statusAsOf, { status: labels.statusText, date: day(member.statusDate, lang) })}</td></tr>
            )}
            {member.statusRaw && member.statusRaw.toLowerCase() !== labels.statusText.toLowerCase() && (
              <tr><th scope="row">{labels.status}</th><td><span className="sub">{fmt(labels.sourceWording, { text: member.statusRaw })}</span></td></tr>
            )}
            {member.size && <tr><th scope="row">{labels.size}</th><td>{member.size}</td></tr>}
            {member.timeline && <tr><th scope="row">{labels.timeline}</th><td>{member.timeline}</td></tr>}
            {member.evidence && <tr><th scope="row">{labels.evidenceLabel}</th><td data-evidence={member.evidence}>{labels.evidence[member.evidence]}</td></tr>}
          </tbody>
        </table>
      </div>
      {member.caveats && <p className="small muted"><b>{labels.caveats}:</b> {member.caveats}</p>}
      {member.trades.length > 0 && (
        <>
          <H2 id="trades">{labels.trades}</H2>
          <p>{member.trades.map((n) => tradeName(n, lang)).join(" · ")}</p>
          <p className="small muted">{labels.tradesNote}</p>
        </>
      )}
    </>
  );
}

/** Trade Pro fields; replaces the locked panel when the viewer has them (RLS decides on the server). */
export function ViewerPro({ slug, labels }: { slug: string; labels: ViewerLabels }) {
  const pro = useViewer(slug)?.pro;
  if (!pro) return null;
  return (
    <>
      <Hide selector='[data-panel="locked"]' />
      <div className="s-dtw" data-panel="pro">
        <table className="s-dt">
          <tbody>
            <tr><th scope="row">{labels.gc}</th><td>{pro.generalContractor ?? labels.gcUnknown}</td></tr>
            {pro.bidListUrl && <tr><th scope="row">{labels.bidLink}</th><td><a className="ext" href={pro.bidListUrl} target="_blank" rel="noopener noreferrer nofollow">{pro.bidListUrl.replace(/^https?:\/\/(www\.)?/, "")}</a></td></tr>}
            <tr><th scope="row">{labels.bidRoute}</th><td>{pro.bidRoute ?? labels.noRoute}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Related open bids and past awards for members. */
export function ViewerRelated({ slug, labels }: { slug: string; labels: ViewerLabels }) {
  const lang = useLang();
  const member = useViewer(slug)?.member;
  if (!member) return null;
  return (
    <>
      <H2 id="open">{labels.openTitle}</H2>
      {member.open.length ? (
        <ul className="s-table" data-list="open">
          {member.open.map((r) => (
            <li key={r.slug}>
              <span className="code" aria-hidden>{r.deadline ? Number(r.deadline.slice(8, 10)) : "—"}</span>
              <span>
                <Link className="nm" href={`/rfps/${r.slug}`}>{r.title}</Link>
                {r.deadline && <span className="lic">{fmt(labels.openCloses, { date: day(r.deadline, lang) })}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{labels.openNone}</p>
      )}
      {member.awards.length > 0 && (
        <>
          <H2 id="awards">{labels.awardsTitle}</H2>
          <p className="small muted">{labels.awardsBody}</p>
          <ul className="s-table" data-list="awards">
            {member.awards.map((r) => (
              <li key={r.slug}>
                <span className="code" aria-hidden>{r.deadline ? Number(r.deadline.slice(8, 10)) : "—"}</span>
                <span>
                  <Link className="nm" href={`/rfps/${r.slug}`}>{r.title}</Link>
                  {r.deadline && <span className="lic">{day(r.deadline, lang)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * The trial-first button. The server HTML is the signed-out version (a link to
 * sign up for the trial); a signed-in browser swaps it for the one-click trial
 * form, the paid link, or the onboarding hop, per /api/.../viewer.
 */
export function ViewerCta({
  slug,
  source,
  returnTo,
  href,
  trialLabel,
  paidLabel,
  plansHref,
  plansLabel,
  className,
  plansClassName,
}: {
  slug: string;
  source: string;
  returnTo: string;
  /** The signed-out target (sign-up that resumes into the trial). */
  href: string;
  trialLabel: string;
  paidLabel: string;
  plansHref: string;
  plansLabel: string;
  className?: string;
  plansClassName?: string;
}) {
  const lang = useLang();
  const offer = useViewer(slug)?.offer;
  const mode = offer?.mode ?? "signup_trial";
  const track = { "data-track": "trial_cta_clicked", "data-source": source } as const;
  return (
    <span className="inline-flex flex-wrap items-center gap-3" data-gate={mode}>
      {mode === "trial" ? (
        <form action={startTrialAction} className="inline">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="return" value={returnTo} />
          <button type="submit" className={className} data-action="start-trial" {...track}>{trialLabel}</button>
        </form>
      ) : mode === "paid" ? (
        <Link href={offer?.href ?? href} className={className} data-gate-cta="paid">{paidLabel}</Link>
      ) : (
        <Link href={offer?.href ?? href} className={className} data-gate-cta="trial-link" {...track}>{trialLabel}</Link>
      )}
      {mode !== "paid" && <Link href={plansHref} className={plansClassName} data-gate-cta="plans">{plansLabel}</Link>}
    </span>
  );
}
