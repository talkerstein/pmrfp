import type { Metadata } from "next";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { SH2, SimplePage } from "@/components/v3/simple";
import { LevelBadge } from "@/components/karma/level-badge";
import { LevelStairs } from "@/components/karma/level-stairs";
import { LEVELS, POINTS, type KarmaKind } from "@/lib/karma/rules";
import { PERKS } from "@/lib/karma/perks";

/**
 * /reputation — the public, exact explanation of company reputation: how
 * points are earned and lost, the limits, the five levels and what they
 * unlock. Every number on this page is read from src/lib/karma (rules.ts,
 * perks.ts), so the page can never drift from the scoring code.
 */

export const revalidate = 86400;

const PATH = "/reputation";

/** Earning rows in display order, with the points the rules award. */
const EARN: { kind: Exclude<KarmaKind, "admin_adjustment" | "forum_content_removed">; points: string; live: boolean }[] = [
  { kind: "profile_approved", points: `+${POINTS.profile_approved}`, live: true },
  { kind: "vendor_verified", points: `+${POINTS.vendor_verified}`, live: true },
  { kind: "project_verified_review", points: `+${POINTS.project_verified_review}`, live: true },
  { kind: "rfp_bids_received", points: `+${POINTS.rfp_bids_received}`, live: true },
  { kind: "gc_package_interest", points: `+${POINTS.gc_package_interest}`, live: true },
  { kind: "gc_award_package", points: `+${POINTS.gc_award_package}`, live: true },
  { kind: "forum_accepted_answer", points: `+${POINTS.forum_accepted_answer}`, live: true },
  { kind: "forum_answer_upvote", points: `+${POINTS.forum_answer_upvote}`, live: true },
  { kind: "forum_thread_rated", points: `+${POINTS.forum_thread_rated_sharp} / +${POINTS.forum_thread_rated_gold}`, live: true },
  { kind: "referral_verified", points: `+${POINTS.referral_verified}`, live: false },
];

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).karma.page;
  return { title: { absolute: t.metaTitle }, description: t.metaDescription, alternates: alternatesFor(l, PATH) };
}

export default async function ReputationPage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const k = getT("karma");
  const t = k.page;
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  let no = 0;

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: home, path: L("/") }, { name: t.crumb, path: L(PATH) }])} />
      <SimplePage lang={lang} current={null} group="company" crumbs={[]} tabs={false} aside={false} title={t.title} lead={t.lead}>
        <SH2 no={++no} id="how">{t.sec.how}</SH2>
        <ul>
          {t.how.map((x) => <li key={x}>{x}</li>)}
        </ul>

        <SH2 no={++no} id="earn">{t.sec.earn}</SH2>
        <div className="s-dtw">
          <table className="s-dt" data-list="earn">
            <thead>
              <tr>
                <th scope="col">{t.colAction}</th>
                <th scope="col" className="r">{t.colPoints}</th>
                <th scope="col">{t.colRule}</th>
              </tr>
            </thead>
            <tbody>
              {EARN.map((e) => (
                <tr key={e.kind} data-kind={e.kind} style={e.live ? undefined : { opacity: 0.6 }}>
                  <td><b>{k.kinds[e.kind]}</b>{!e.live && <span className="sub">{t.perkSoon}</span>}</td>
                  <td className="r" style={{ whiteSpace: "nowrap" }}>{e.points}</td>
                  <td>{t.earn[e.kind]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SH2 no={++no} id="lose">{t.sec.lose}</SH2>
        <ul>
          {t.lose.map((x) => <li key={x}>{x}</li>)}
        </ul>

        <SH2 no={++no} id="limits">{t.sec.limits}</SH2>
        <ul>
          {t.limits.map((x) => <li key={x}>{x}</li>)}
        </ul>

        <SH2 no={++no} id="levels">{t.sec.levels}</SH2>
        <div className="s-dtw">
          <table className="s-dt" data-list="levels">
            <thead>
              <tr>
                <th scope="col">{t.colLevel}</th>
                <th scope="col" className="r">{t.colFrom}</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((l) => (
                <tr key={l.slug}>
                  <td><LevelBadge level={l.level} always /></td>
                  <td className="r">{fmt(t.fromPoints, { n: formatNumber(l.min, lang) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="f-rep" style={{ borderRadius: 24, padding: "8px 16px 0", marginTop: 24, overflow: "hidden" }} aria-hidden>
          <LevelStairs />
        </div>

        <SH2 no={++no} id="perks">{t.sec.perks}</SH2>
        <ul data-list="perks">
          {PERKS.map((p) => (
            <li key={p.key}>
              <b>{p.live ? t.perkLive : t.perkSoon}:</b> {t.perks[p.key]}
            </li>
          ))}
        </ul>
        <div className="s-callout"><p>{t.perkNote}</p></div>

        <SH2 no={++no} id="forum">{t.sec.forum}</SH2>
        <p>{t.forum}</p>

        <p style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a href={L("/dashboard")} className="btn ink">{t.cta} →</a>
          <a href={L("/sign-up?role=trade")} className="btn line-ink">{t.ctaJoin}</a>
        </p>
      </SimplePage>
    </>
  );
}
