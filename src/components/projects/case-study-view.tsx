import type { ReactNode } from "react";
import { SH2 } from "@/components/v3/simple";
import { ProjectGallery } from "@/components/projects/public";
import type { CaseStudyDetail } from "@/lib/data/case-studies";
import type { ProjectExtras } from "@/lib/data/projects";
import type { PublicReview } from "@/lib/projects/reviews";
import { clientTypeKey, valueBandKey } from "@/lib/projects/case-study";
import { SITE } from "@/lib/site";
import { getLang, getT } from "@/i18n/server";
import { localizePath } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

/**
 * The body of a case study on the v3 simple-page template, shared by the
 * public page (/case-studies/<slug>) and the private share page
 * (/shared/<token>). Every block is the company's own content and hides when
 * it's empty; nothing is filled in for them.
 */
export function CaseStudyBody({
  cs,
  extras,
  reviews,
  orgLinked,
  banner,
  more,
}: {
  cs: CaseStudyDetail;
  extras: ProjectExtras;
  reviews: PublicReview[];
  /** The company has a public directory profile to link to. */
  orgLinked: boolean;
  banner?: ReactNode;
  /** Extra links in the company card (e.g. more projects in this trade). */
  more?: { href: string; label: string }[];
}) {
  const lang = getLang();
  const t = getT("portfolio").page;
  const pc = getT("portfolioClient");
  const td = getT("directory").projects;
  const L = (p: string) => localizePath(p, lang);
  const client = clientTypeKey(cs.clientType);
  const band = valueBandKey(cs.budgetBand);
  const place = [cs.city, cs.province ? regionName(cs.province, lang) : null].filter(Boolean).join(", ");
  const finished = cs.completedOn ? formatDate(`${cs.completedOn.slice(0, 10)}T12:00:00Z`, lang, { month: "long", year: "numeric" }) : null;
  const facts = [
    client ? { k: t.facts.client, v: pc.clientTypes[client] } : null,
    finished ? { k: t.facts.finished, v: finished } : cs.timeline ? { k: t.facts.finished, v: cs.timeline } : null,
    band ? { k: t.facts.value, v: pc.valueBands[band] } : cs.budgetBand ? { k: t.facts.value, v: cs.budgetBand } : null,
    cs.categoryName ? { k: t.facts.trade, v: tradeName(cs.categoryName, lang) } : null,
    place ? { k: t.facts.where, v: place } : null,
  ].filter((x): x is { k: string; v: string } => Boolean(x));

  const sections = [
    cs.scope ? { id: "scope", h: t.scope, body: cs.scope } : null,
    { id: "challenge", h: t.challenge, body: cs.challenge },
    { id: "approach", h: t.approach, body: cs.approach },
    { id: "outcome", h: t.outcome, body: cs.outcome },
  ].filter((x): x is { id: string; h: string; body: string } => Boolean(x));
  let no = 0;
  const fmtMonth = (d: string) => formatDate(d, lang, { month: "long", year: "numeric" });

  return (
    <>
      {banner}
      {facts.length > 0 && (
        <div className="pf-facts" data-block="facts">
          {facts.map((f) => (
            <div key={f.k}>
              <div className="k">{f.k}</div>
              <div className="v">{f.v}</div>
            </div>
          ))}
        </div>
      )}

      {extras.photos.length > 0 && (
        <div className="pf-gallery">
          <ProjectGallery photos={extras.photos} heroUrl={extras.heroUrl} title={cs.title} capturedOnSite={extras.source === "capture"} />
        </div>
      )}

      {sections.map((s) => (
        <section key={s.id} aria-labelledby={`cs-${s.id}`}>
          <SH2 no={++no} id={`cs-${s.id}`}>{s.h}</SH2>
          <p className="whitespace-pre-line">{s.body}</p>
        </section>
      ))}

      {cs.results.length > 0 && (
        <section aria-labelledby="cs-numbers">
          <SH2 no={++no} id="cs-numbers">{t.numbers}</SH2>
          <div className="pf-nums" data-block="numbers">
            {cs.results.map((r, i) => (
              <div key={i}>
                <div className="n">{r.value}</div>
                <div className="l">{r.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section aria-labelledby="cs-reviews">
          <SH2 no={++no} id="cs-reviews">{t.reviews}</SH2>
          <ul className="pf-reviews">
            {reviews.map((r) => (
              <li key={r.id}>
                <span className="st" role="img" aria-label={fmt(td.stars, { rating: String(r.rating) })}>
                  {"★".repeat(Math.round(r.rating))}
                  <span className="off">{"★".repeat(Math.max(0, 5 - Math.round(r.rating)))}</span>
                </span>
                <p>{r.body}</p>
                <div className="by">
                  <b>{r.name}</b>
                  {r.company && <> · {r.company}</>} · {fmtMonth(r.createdAt)}
                  {r.verifiedVia === "project_invite" && <span title={td.viaTitle}> · {td.viaLink}</span>}
                </div>
                {r.reply && (
                  <div className="rp">
                    <b>{td.reply}</b> {r.reply}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cs.aiAssisted && <p className="pf-ai">{fmt(t.aiNote, { org: cs.orgName })}</p>}

      <aside className="pf-org" aria-labelledby="cs-org">
        <div className="eb">{t.aboutHead}</div>
        <h2 id="cs-org" className="hd">{cs.orgName}</h2>
        <p>{fmt(t.aboutBody, { org: cs.orgName, brand: SITE.name })}</p>
        <div className="acts">
          {orgLinked && cs.orgSlug && (
            <a href={L(`/directory/${cs.orgSlug}`)} className="btn mint md">
              {fmt(t.profile, { org: cs.orgName })}
            </a>
          )}
          {orgLinked && cs.orgSlug && (
            <a
              href={L(`/sign-up?role=property_manager&next=${encodeURIComponent(`/pm-dashboard/rfps/new?invite=${cs.orgSlug}`)}`)}
              className="lnk"
            >
              {t.invite}
            </a>
          )}
          {(more ?? []).map((m) => (
            <a key={m.href} href={L(m.href)} className="lnk">
              {m.label}
            </a>
          ))}
        </div>
      </aside>
    </>
  );
}
