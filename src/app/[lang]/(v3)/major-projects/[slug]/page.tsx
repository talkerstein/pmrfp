import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getMajorProject, getProjectProFields } from "@/lib/major-projects/data";
import { isThinProject, relatedWork, type RelatedCandidate } from "@/lib/major-projects/filters";
import { compactDollars, isPastContract } from "@/lib/data/fomo";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { getCategories } from "@/lib/data/taxonomy";
import { getSession, hasActiveTradeAccess } from "@/lib/access/access";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { rfpMarket } from "@/lib/visitor-geo";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";
import { SponsorSlot } from "@/components/sponsors/sponsor-slot";
import { FreeGate } from "@/components/growth/free-gate";
import { majorProjectView } from "@/lib/growth/gate";

export const revalidate = 3600;

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

  const [session, access, board, categories] = await Promise.all([
    getSession(),
    hasActiveTradeAccess(),
    listAllRfpsCached().catch(() => []),
    getCategories().catch(() => []),
  ]);
  // Trade Pro fields come through the visitor's own session: RLS decides.
  const pro = access ? await getProjectProFields(p.id) : null;
  const proHref = session ? "/dashboard/billing?plan=pro&interval=monthly" : signUpHrefForPlan("pro", "monthly");

  // Related work from the shared board snapshot — Canada only (a project's province is always Canadian).
  const slugByName = new Map(categories.map((c) => [c.name, c.slug]));
  const nameBySlug = new Map(categories.map((c) => [c.slug, c.name]));
  const candidates: RelatedCandidate[] = board
    .filter((r) => rfpMarket(r) === "CA")
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      city: r.city,
      province: r.province,
      categorySlugs: r.categories.map((c) => slugByName.get(c) ?? "").filter(Boolean),
      deadline: r.deadline,
      isOpen: r.status === "open",
      isAward: isPastContract(r),
    }));
  const related = session ? relatedWork(p, candidates) : { open: [], awards: [] };
  const trades = p.tradesNeeded.map((s) => nameBySlug.get(s)).filter((x): x is string => Boolean(x));
  // Free-account gate: signed-out visitors (crawlers included) get the summary only;
  // the details below are rendered from `member`, which is null for them.
  const { member } = majorProjectView(p, { trades, open: related.open, awards: related.awards }, Boolean(session));
  const here = `/major-projects/${p.slug}`;
  const sourceName = m.sourceNames[p.source] ?? p.source;
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
          <div><div className="k">{t.facts.updated}</div><div className="v">{day(p.lastSeen, lang)}</div></div>
        </div>

        {p.stale && <p className="small" data-flag="stale" style={{ marginTop: 18 }}><b>{fmt(t.stale, { date: day(p.staleSince, lang) })}</b></p>}

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
                <td>
                  {member?.statusDate ? fmt(t.statusAsOf, { status: m.statuses[p.status], date: day(member.statusDate, lang) }) : m.statuses[p.status]}
                  {member?.statusRaw && member.statusRaw.toLowerCase() !== m.statuses[p.status].toLowerCase() && <span className="sub"> {fmt(t.sourceWording, { text: member.statusRaw })}</span>}
                </td>
              </tr>
              {member?.size && <tr><th scope="row">{t.size}</th><td>{member.size}</td></tr>}
              {member?.timeline && <tr><th scope="row">{t.timeline}</th><td>{member.timeline}</td></tr>}
              {member?.evidence && <tr><th scope="row">{t.evidenceLabel}</th><td data-evidence={member.evidence}>{t.evidence[member.evidence]}</td></tr>}
            </tbody>
          </table>
        </div>
        {member?.caveats && <p className="small muted"><b>{t.caveats}:</b> {member.caveats}</p>}
        {!member && <FreeGate kind="project" path={here} />}

        {member && member.trades.length > 0 && (
          <>
            <SH2 no={++no} id="trades">{t.trades}</SH2>
            <p>{member.trades.map((n) => tradeName(n, lang)).join(" · ")}</p>
            <p className="small muted">{t.tradesNote}</p>
          </>
        )}

        <SH2 no={++no} id="bid-list">{t.bidTitle}</SH2>
        <p>{t.bidIntro}</p>
        <ol>
          {t.bidSteps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        {pro ? (
          <div className="s-dtw" data-panel="pro">
            <table className="s-dt">
              <tbody>
                <tr><th scope="row">{t.gc}</th><td>{pro.generalContractor ?? t.gcUnknown}</td></tr>
                {pro.bidListUrl && <tr><th scope="row">{t.bidLink}</th><td><a className="ext" href={pro.bidListUrl} target="_blank" rel="noopener noreferrer nofollow">{pro.bidListUrl.replace(/^https?:\/\/(www\.)?/, "")}</a></td></tr>}
                <tr><th scope="row">{t.bidRoute}</th><td>{pro.bidRoute ?? t.noRoute}</td></tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="g-cta" data-panel="locked">
            <h3 className="hd">{t.lockedHead}</h3>
            {p.hasGc && <p>{t.lockedHasGc}</p>}
            {p.hasBidRoute && <p>{t.lockedHasRoute}</p>}
            <p>{t.lockedNone}</p>
            <div className="acts">
              <a href={L(proHref)} className="btn mint lg">{t.lockedCta}</a>
            </div>
          </div>
        )}

        {member && (
        <>
        <SH2 no={++no} id="open">{t.openTitle}</SH2>
        {member.open.length ? (
          <ul className="s-table" data-list="open">
            {member.open.map((r) => (
              <li key={r.slug}>
                <span className="code" aria-hidden>{r.deadline ? Number(r.deadline.slice(8, 10)) : "—"}</span>
                <span>
                  <a className="nm" href={L(`/rfps/${r.slug}`)}>{r.title}</a>
                  {r.deadline && <span className="lic">{fmt(t.openCloses, { date: day(r.deadline, lang) })}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.openNone}</p>
        )}

        {member.awards.length > 0 && (
          <>
            <SH2 no={++no} id="awards">{t.awardsTitle}</SH2>
            <p className="small muted">{t.awardsBody}</p>
            <ul className="s-table" data-list="awards">
              {member.awards.map((r) => (
                <li key={r.slug}>
                  <span className="code" aria-hidden>{r.deadline ? Number(r.deadline.slice(8, 10)) : "—"}</span>
                  <span>
                    <a className="nm" href={L(`/rfps/${r.slug}`)}>{r.title}</a>
                    {r.deadline && <span className="lic">{day(r.deadline, lang)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        </>
        )}

        <div className="g-cta">
          <h3 className="hd">{t.ctaHead}</h3>
          <p>{t.ctaBody}</p>
          <div className="acts">
            <a href={L(proHref)} className="btn mint lg">{t.ctaBtn}</a>
            <a href={L("/rfps")} className="lnk">{t.ctaBoard} →</a>
          </div>
        </div>

        <SH2 no={++no} id="sources">{t.sources}</SH2>
        <p className="small">{fmt(t.sourceName, { source: sourceName })}</p>
        {p.sources.length > 0 && (
          <ul className="small" data-list="sources">
            {p.sources.map((s) => (
              <li key={s.url}><a className="ext" href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.label}</a></li>
            ))}
          </ul>
        )}
        <p className="small muted" data-license>{p.license}</p>
        <p className="small muted">{fmt(t.lastSeen, { date: day(p.lastSeen, lang), first: day(p.firstSeen, lang) })}</p>

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
