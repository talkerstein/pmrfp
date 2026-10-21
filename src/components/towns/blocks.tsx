import { Snippet } from "@/components/public/badge-embed";
import { SH2 } from "@/components/v3/simple";
import type { BuyerOpenBid, BuyerPage } from "@/lib/buyers/model";
import { compactDollars } from "@/lib/data/fomo";
import type { RfpListItem } from "@/lib/data/types";
import { scriptSnippet } from "@/lib/embed/widgets";
import { SITE } from "@/lib/site";
import type { ManagedPage } from "@/lib/towns/managed";
import { inSentence } from "@/lib/towns/names";
import { claimSignUpHref, followTownHref } from "@/lib/towns/paths";
import { getLang, getT } from "@/i18n/server";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { regionName } from "@/i18n/terms";

/**
 * The pieces every buyer page shares for PMRFP for Towns: the verified
 * badge and what the buyer manages, the claim and follow calls to action,
 * nearby bids from the shared snapshot and the website-widget code.
 * Server components; copy in towns (en/fr/es).
 */

const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const day = (d: string | null, lang: Locale) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");
const month = (m: string, lang: Locale) => formatDate(`${m}-15T12:00:00Z`, lang, { month: "long", year: "numeric" });

/** "Verified · managed by the Town of Cobourg", the logo and the buyer's own intro. */
export function VerifiedBadge({ managed, name }: { managed: ManagedPage; name: string }) {
  const t = getT("towns").page;
  const lang = getLang();
  return (
    <div className="s-callout" data-managed="verified" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      {managed.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={managed.logoUrl} alt="" width={64} height={64} style={{ width: 64, height: 64, objectFit: "contain", background: "#fff", borderRadius: 8 }} />
      )}
      <div>
        <p>
          <b data-flag="verified">✓ {fmt(t.verified, { name: inSentence(name, lang) })}</b>
          <span className="small muted"> · {fmt(t.verifiedOn, { date: day(managed.verifiedAt, lang) })}</span>
        </p>
        {managed.intro && <p style={{ whiteSpace: "pre-line" }}>{managed.intro}</p>}
      </div>
    </div>
  );
}

/** Rows the managing buyer added: its bids page, its platform page, vendor registration and (when public) its contact. */
export function ManagedRows({ managed }: { managed: ManagedPage }) {
  const t = getT("towns").page;
  const link = (href: string, data: string) => (
    <a className="ext" href={href} target="_blank" rel="noopener noreferrer nofollow" data-link={data}>{host(href)}</a>
  );
  return (
    <>
      {managed.bidsUrl && (
        <tr>
          <th scope="row">{t.bidsPage}</th>
          <td>{link(managed.bidsUrl, "managed-bids")}</td>
        </tr>
      )}
      {managed.platformUrl && (
        <tr>
          <th scope="row">{t.platformPage}</th>
          <td>{link(managed.platformUrl, "managed-platform")}</td>
        </tr>
      )}
      {managed.vendorRegistrationUrl && (
        <tr>
          <th scope="row">{t.vendorRegistration}</th>
          <td>
            <a className="ext" href={managed.vendorRegistrationUrl} target="_blank" rel="noopener noreferrer nofollow" data-link="vendor-registration">{t.vendorRegistrationLink} ↗</a>
          </td>
        </tr>
      )}
      {(managed.contactEmail || managed.contactPhone) && (
        <tr>
          <th scope="row">{t.contact}</th>
          <td data-contact="managed">
            {managed.contactEmail && <a href={`mailto:${managed.contactEmail}`}>{managed.contactEmail}</a>}
            {managed.contactEmail && managed.contactPhone ? " · " : ""}
            {managed.contactPhone && <a href={`tel:${managed.contactPhone.replace(/[^0-9+]/g, "")}`}>{managed.contactPhone}</a>}
          </td>
        </tr>
      )}
    </>
  );
}

/** The buyer's optional "upcoming purchases" list (title + expected month; never documents). */
export function UpcomingPurchases({ managed, no }: { managed: ManagedPage; no: number }) {
  const t = getT("towns").page;
  const lang = getLang();
  if (!managed.upcoming.length) return null;
  return (
    <>
      <SH2 no={no} id="upcoming">{t.upcomingTitle}</SH2>
      <p className="small muted">{t.upcomingNote}</p>
      <ul className="s-table" data-list="upcoming">
        {managed.upcoming.map((u) => (
          <li key={`${u.month}-${u.title}`}>
            <span className="code" aria-hidden>{Number(u.month.slice(5, 7))}</span>
            <span>
              <span className="nm">{u.title}</span>
              <span className="lic">{fmt(t.upcomingMonth, { month: month(u.month, lang) })}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** "Work for the Town of X? Claim this page free." */
export function ClaimCta({ name, buyerKey }: { name: string; buyerKey: string }) {
  const t = getT("towns").page;
  const lang = getLang();
  return (
    <div className="g-cta" data-cta="claim">
      <h3 className="hd">{fmt(t.claimTitle, { name: inSentence(name, lang) })}</h3>
      <p>{t.claimBody}</p>
      <div className="acts">
        <a href={localizePath(claimSignUpHref(buyerKey), lang)} className="btn mint lg" rel="nofollow">{t.claimBtn}</a>
      </div>
    </div>
  );
}

/** "Contractor near X? Follow this town": a free trade sign-up with the town's region preference (following itself is Part B). */
export function FollowCta({ name, place, province, path, regionSlug }: { name: string; place: string; province: string; path: string; regionSlug: string | null }) {
  const t = getT("towns").page;
  const lang = getLang();
  return (
    <div className="g-cta" data-cta="follow">
      <h3 className="hd">{fmt(t.followTitle, { place })}</h3>
      <p>{fmt(t.followBody, { name, province })}</p>
      <div className="acts">
        <a href={localizePath(followTownHref(localizePath(path, lang), regionSlug), lang)} className="btn mint lg" rel="nofollow">{t.followBtn}</a>
      </div>
    </div>
  );
}

/** The buyer's own open bids on the board. */
export function OpenBidList({ bids, name, no }: { bids: readonly BuyerOpenBid[]; name: string; no: number }) {
  const t = getT("towns").page;
  const lang = getLang();
  return (
    <>
      <SH2 no={no} id="open">{fmt(t.openTitle, { name })}</SH2>
      {bids.length ? (
        <ul className="s-table" data-list="open">
          {bids.map((r) => (
            <li key={r.slug}>
              <span className="code" aria-hidden>{r.deadline ? Number(r.deadline.slice(8, 10)) : "—"}</span>
              <span>
                <a className="nm" href={localizePath(`/rfps/${r.slug}`, lang)}>{r.title}</a>
                {r.deadline && <span className="lic">{fmt(t.closes, { date: day(r.deadline, lang) })}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{fmt(t.openNone, { name })}</p>
      )}
    </>
  );
}

/** Open bids near the town, from the shared board snapshot (no queries of its own). */
export function NearbyBids({ rows, place, province, provinceSlug, no }: { rows: readonly RfpListItem[]; place: string; province: string; provinceSlug: string; no: number }) {
  const t = getT("towns").page;
  const lang = getLang();
  return (
    <>
      <SH2 no={no} id="nearby">{fmt(t.nearbyTitle, { place })}</SH2>
      {rows.length ? (
        <ul className="s-table" data-list="nearby">
          {rows.map((r) => (
            <li key={r.slug}>
              <span className="code" aria-hidden>{r.deadline ? Number(r.deadline.slice(8, 10)) : "—"}</span>
              <span>
                <a className="nm" href={localizePath(`/rfps/${r.slug}`, lang)}>{r.title}</a>
                <span className="lic">{[r.city, r.deadline ? fmt(t.closes, { date: day(r.deadline, lang) }) : null].filter(Boolean).join(" · ")}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{fmt(t.nearbyNone, { province })}</p>
      )}
      <p className="small"><a href={localizePath(`/rfps?region=${provinceSlug}`, lang)}>{fmt(t.nearbyMore, { province })} →</a></p>
    </>
  );
}

/**
 * A town's past contracts and the major projects in it, when the board has
 * any (a municipality only the census knew still has its award history): the
 * same sections a researched buyer's page shows.
 */
export function AwardsAndProjects({ p, name, no }: { p: BuyerPage; name: string; no: number }) {
  const t = getT("buyers");
  const mp = getT("majorProjects");
  const lang = getLang();
  const L = (path: string) => localizePath(path, lang);
  const province = regionName(p.province, lang);
  const place = p.municipality;
  let n = no;
  return (
    <>
      {p.awards.count > 0 && (
        <>
          <SH2 no={n++} id="awards">{fmt(t.page.awardsTitle, { name })}</SH2>
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
          <div className="g-cta" data-cta="intel">
            <h3 className="hd">{t.page.intelTitle}</h3>
            <p>{fmt(t.page.intelBody, { name })}</p>
            <div className="acts">
              <a href={L(p.intelSlug ? `/intel/buyers/${p.intelSlug}` : "/intel")} className="btn mint lg">{t.page.intelBtn}</a>
            </div>
          </div>
        </>
      )}
      {place && p.projectsTotal > 0 && (
        <>
          <SH2 no={n++} id="projects">{fmt(t.page.projectsTitle, { place })}</SH2>
          <p className="small muted">{fmt(t.page.projectsBody, { place })}</p>
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
    </>
  );
}

/** How many numbered sections AwardsAndProjects adds. */
export const awardsAndProjectsCount = (p: Pick<BuyerPage, "awards" | "projectsTotal" | "municipality">) => Number(p.awards.count > 0) + Number(!!p.municipality && p.projectsTotal > 0);

/** The copy-paste code for the town-bids widget (lib/embed/widgets). */
export function TownWidgetCode({ provinceSlug, slug, lang, title, body }: { provinceSlug: string; slug: string; lang: Locale; title: string; body: string }) {
  const code = scriptSnippet(SITE.url, { kind: "town-bids", province: provinceSlug, slug, lang }, { theme: "light", limit: 5 });
  return (
    <div data-widget="town-bids" style={{ marginTop: 18 }}>
      <p className="small">{body}</p>
      <Snippet label={title} code={code} />
    </div>
  );
}
