import { ViewerAbout, ViewerCta, ViewerPro, ViewerRelated, type ViewerLabels } from "@/components/major-projects/viewer";
import { trialSignUpHref } from "@/lib/entitlement/gate";
import type { Metadata } from "next";
import { RecordFooter } from "@/components/public/record-footer";
import { localizeCredit } from "@/lib/data-credits";
import { notFound } from "next/navigation";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getMajorProject, getMajorProjects } from "@/lib/major-projects/data";
import { frozenSourceDate, isThinProject, linkedListings } from "@/lib/major-projects/filters";
import { compactDollars } from "@/lib/data/fomo";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate } from "@/i18n/format";
import { regionName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";
import { SponsorSlot } from "@/components/sponsors/sponsor-slot";
import { FreeGate } from "@/components/growth/free-gate";

export const revalidate = 86400;

export async function generateStaticParams() {
  return []; // rendered on first visit, then cached — no build-time prebuild (DB-load incident 2026-10-09)
}

const day = (d: string | null, lang: Locale) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");

export async function generateMetadata({ params }: { params: Promise<{ slug: string; lang: string }> }): Promise<Metadata> {
  const { slug, lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const m = getDictionary(l).majorProjects;
  const p = await getMajorProject(slug);
  if (!p) return { title: m.meta.notFound, robots: { index: false } };
  const vars = {
    name: p.name,
    city: p.city ?? (p.province ? regionName(p.province, l) : "Canada"),
    status: m.statuses[p.status].toLowerCase(),
    value: p.estValueCad ? `, ${compactDollars(p.estValueCad, l)}` : "",
    owner: p.owner ?? "—",
  };
  return {
    title: fmt(m.meta.projectTitle, vars),
    description: fmt(m.meta.projectDescription, vars),
    alternates: alternatesFor(l, `/major-projects/${p.slug}`),
    ...(isThinProject(p) ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function MajorProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const m = getT("majorProjects");
  const t = m.detail;
  const home = getT("v3Pages").simple.home;
  const L = (path: string) => localizePath(path, lang);
  const { slug } = await params;
  const p = await getMajorProject(slug);
  if (!p) notFound();

  // ISR page: nothing here may read the visitor (cookies()/headers()/session), or the route
  // throws DYNAMIC_SERVER_USAGE and returns 500. The server HTML is the signed-out version;
  // the viewer islands (components/major-projects/viewer) fill in member and Pro parts in the browser.
  const allProjects = await getMajorProjects();
  const returnPath = `/major-projects/${p.slug}`;
  const signUpTrial = trialSignUpHref("projects", returnPath);
  const labels: ViewerLabels = {
    status: t.facts.status,
    statusText: m.statuses[p.status],
    statusAsOf: t.statusAsOf,
    sourceWording: t.sourceWording,
    size: t.size,
    timeline: t.timeline,
    evidenceLabel: t.evidenceLabel,
    evidence: t.evidence,
    caveats: t.caveats,
    trades: t.trades,
    tradesNote: t.tradesNote,
    openTitle: t.openTitle,
    openNone: t.openNone,
    openCloses: t.openCloses,
    awardsTitle: t.awardsTitle,
    awardsBody: t.awardsBody,
    gc: t.gc,
    gcUnknown: t.gcUnknown,
    bidLink: t.bidLink,
    bidRoute: t.bidRoute,
    noRoute: t.noRoute,
  };
  const cta = (label: string, className: string) => (
    <ViewerCta
      slug={p.slug}
      source="projects"
      returnTo={returnPath}
      href={L(signUpTrial)}
      trialLabel={getT("trialFirst").cta.start}
      paidLabel={label}
      plansHref={L("/pricing")}
      plansLabel={getT("trialFirst").cta.seePlans}
      className={className}
      plansClassName="lnk"
    />
  );
  const here = `/major-projects/${p.slug}`;
  const sourceName = m.sourceNames[p.source] ?? p.source;
  // Other public sources listing the same project (linked, never merged).
  const alsoListed = linkedListings(p, allProjects);
  // BC's inventory stopped at Dec 2024: say so on its pages.
  const bcFrozen = p.source === "bc-major-projects" ? frozenSourceDate(allProjects, "bc-major-projects") : null;
  const place = [p.city, p.province ? regionName(p.province, lang) : null].filter(Boolean).join(", ");
  let no = 0;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: t.crumb, path: L("/major-projects") },
          { name: p.name, path: L(`/major-projects/${p.slug}`) },
        ])}
      />
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: t.crumb, href: "/major-projects" }]}
        tabs={false}
        aside={false}
        title={p.name}
        lead={[m.categories[p.category], place].filter(Boolean).join(" — ")}
      >
        <div className="s-facts">
          <div><div className="k">{t.facts.value}</div><div className="v">{p.estValueCad ? compactDollars(p.estValueCad, lang) : t.facts.notDisclosed}</div></div>
          <div><div className="k">{t.facts.status}</div><div className="v" data-stat="status">{m.statuses[p.status]}</div></div>
          <div><div className="k">{p.sourceUpdated ? t.sourceUpdated : t.facts.updated}</div><div className="v">{day(p.sourceUpdated ?? p.lastSeen, lang)}</div></div>
        </div>

        {p.stale && <p className="small" data-flag="stale" style={{ marginTop: 18 }}><b>{fmt(t.stale, { date: day(p.staleSince, lang) })}</b></p>}
        {bcFrozen && <p className="small" data-flag="bc-frozen" style={{ marginTop: 18 }}><b>{fmt(t.bcNote, { date: formatDate(`${bcFrozen}T12:00:00Z`, lang, { month: "long", year: "numeric" }) })}</b></p>}
        {p.status === "application" && <p className="small muted" data-flag="application" style={{ marginTop: 18 }}>{t.applicationNote}</p>}

        <SH2 no={++no} id="about">{t.about}</SH2>
        {p.description && <p>{p.description}</p>}
        <div className="s-dtw">
          <table className="s-dt" data-list="facts">
            <tbody>
              {p.owner && <tr><th scope="row">{t.owner}</th><td>{p.owner}</td></tr>}
              {place && <tr><th scope="row">{t.location}</th><td>{place}</td></tr>}
              <tr><th scope="row">{t.category}</th><td>{m.categories[p.category]}</td></tr>
              <tr>
                <th scope="row">{t.facts.status}</th>
                <td>{m.statuses[p.status]}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ViewerAbout slug={p.slug} labels={labels} />
        <FreeGate kind="project" path={here} />

        <SH2 no={++no} id="bid-list">{t.bidTitle}</SH2>
        <p>{t.bidIntro}</p>
        <ol>
          {t.bidSteps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <div className="g-cta" data-panel="locked">
          <h3 className="hd">{t.lockedHead}</h3>
          {p.hasGc && <p>{t.lockedHasGc}</p>}
          {p.hasBidRoute && <p>{t.lockedHasRoute}</p>}
          <p>{t.lockedNone}</p>
          <div className="acts">{cta(t.lockedCta, "btn mint lg")}</div>
        </div>
        <ViewerPro slug={p.slug} labels={labels} />
        <ViewerRelated slug={p.slug} labels={labels} />

        <div className="g-cta">
          <h3 className="hd">{t.ctaHead}</h3>
          <p>{t.ctaBody}</p>
          <div className="acts">
            {cta(t.ctaBtn, "btn mint lg")}
            <a href={L("/rfps")} className="lnk">{t.ctaBoard} →</a>
          </div>
        </div>

        {alsoListed.length > 0 && (
          <>
            <SH2 no={++no} id="also-listed">{t.alsoTitle}</SH2>
            <p className="small muted">{t.alsoBody}</p>
            <ul className="s-table" data-list="also-listed">
              {alsoListed.map((o) => (
                <li key={o.id}>
                  <span className="code" aria-hidden>{m.statuses[o.status].slice(0, 1)}</span>
                  <span>
                    <a className="nm" href={L(`/major-projects/${o.slug}`)}>{o.name}</a>
                    <span className="lic">{[m.sourceNames[o.source] ?? o.source, o.estValueCad ? compactDollars(o.estValueCad, lang) : null, m.statuses[o.status]].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <SH2 no={++no} id="sources">{t.sources}</SH2>
        <p className="small">{fmt(t.sourceName, { source: sourceName })}</p>
        {p.sources.length > 0 && (
          <ul className="small" data-list="sources">
            {p.sources.map((s) => (
              <li key={s.url}><a className="ext" href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.label}</a></li>
            ))}
          </ul>
        )}
        <p className="small muted" data-license>{localizeCredit(p.license, lang)}</p>
        <p className="small muted">{fmt(t.lastSeen, { date: day(p.lastSeen, lang), first: day(p.firstSeen, lang) })}</p>
        <RecordFooter credits={[]} lang={lang} kind="major_project" path={`/major-projects/${p.slug}`} refId={p.slug} className="mt-2" />

        {p.province && p.tradesNeeded.length > 0 && (
          // The province × trade sponsor for this project's trades, below everything else.
          <SponsorSlot
            className="mt-8 max-w-md"
            ctx={{ placement: "major_projects", market: "CA", province: p.province, categories: p.tradesNeeded, seed: p.slug }}
          />
        )}

        <div className="s-links">
          <a href={L("/major-projects")}>{t.back} →</a>
          {p.province && <a href={L(`/major-projects?province=${p.province.toLowerCase().replace(/\s+/g, "-")}`)}>{regionName(p.province, lang)} →</a>}
        </div>
      </SimplePage>
    </>
  );
}
