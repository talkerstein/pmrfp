import "@/components/v3-pages/directory.css";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { RequestIntroForm } from "@/components/public/request-intro-form";
import { SaveTradeButton } from "@/components/trusted/save-trade-button";
import { ProjectDeck } from "@/components/home-v3/project-deck";
import { AddProjectTile } from "@/components/projects/add-project-tile";
import { monogram } from "@/components/home-v3/directory-list";
import { LevelBadge } from "@/components/karma/level-badge";
import { getRecommendedBy } from "@/lib/trusted/data";
import { JsonLd, breadcrumbSchema, localBusinessSchema } from "@/lib/seo/jsonld";
import { getVendor, listVendors, retiredVendorRedirect } from "@/lib/data/directory";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { isOrgLifetime } from "@/lib/founding/server";
import { listOrgProjects, listPublishedReviews } from "@/lib/data/projects";
import { reviewStats } from "@/lib/projects/reviews";
import { oneDecimal } from "@/components/projects/public";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { propertyTypeName, regionName, tradeName } from "@/i18n/terms";

export const revalidate = 3600;

export async function generateStaticParams({ params }: { params: { lang: string } }) {
  // English is prebuilt in full; French and Spanish get a few and render the rest
  // on first visit, then cache (ISR). Prebuilding every language tripled the build.
  // (An empty list for any language switches prebuilding off for the whole route.)
  const [trades, suppliers] = await Promise.all([listVendors(), listVendors({ orgType: "supplier" })]);
  const all = [...trades, ...suppliers].map((v) => ({ slug: v.slug }));
  return params.lang === "en" ? all : all.slice(0, 3);
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).directory.profile;
  const v = await getVendor(slug);
  if (!v) return { title: t.notFound };
  const place = [v.city, v.province].filter((x): x is string => Boolean(x)).map((x) => regionName(x, l));
  // "<Company> — <Trade> in <City>, <Prov>": the trade + city is what PMs search.
  const mainTrade = v.categories[0] ? tradeName(v.categories[0], l) : null;
  const where = place.join(", ");
  const title = [v.name, [mainTrade, where].filter(Boolean).join(where && mainTrade ? ` ${t.titleIn} ` : "")].filter(Boolean).join(" — ");
  const description = v.shortDescription ?? fmt(t.fallbackDescription, { name: v.name, site: SITE.name });
  const path = `/directory/${v.slug}`;
  const base = SITE.url.replace(/\/$/, "");
  const url = `${base}${localizePath(path, l)}`;
  // Absolute on SITE.url (as before), with hreflang for each language.
  const alt = alternatesFor(l, path);
  const languages = Object.fromEntries(Object.entries(alt.languages ?? {}).map(([k, href]) => [k, `${base}${href}`]));
  return {
    title,
    description,
    alternates: { canonical: url, languages },
    // The colocated opengraph-image.tsx supplies the og:image / twitter:image.
    openGraph: { type: "profile", title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}

const Tick = ({ stroke = "#1B1D3A", size = 13 }: { stroke?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke={stroke} strokeWidth="2.5" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg>
);
const StarIc = ({ fill }: { fill: string }) => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill={fill} aria-hidden><path d="M7 .8l1.9 3.9 4.3.6-3.1 3 .7 4.3L7 10.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" /></svg>
);
const PhoneIc = ({ stroke }: { stroke: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="2" aria-hidden><path d="M3 2.5h3l1.2 3.2-1.7 1.1a8 8 0 0 0 3.7 3.7l1.1-1.7 3.2 1.2v3A1.5 1.5 0 0 1 12 14.5 10.5 10.5 0 0 1 1.5 4 1.5 1.5 0 0 1 3 2.5z" /></svg>
);

export default async function VendorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const lang = await setLangFrom(params);
  const td = getT("directory");
  const tp = td.profile;
  const t = getT("v3Pages").profile;
  const tf = getT("founding");
  const { slug } = await params;
  const v = await getVendor(slug);
  if (!v) {
    // Retired listing (demo / suspended): permanent redirect to the closest
    // real page so the URL's search value isn't thrown away. Unknown → 404.
    const to = await retiredVendorRedirect(slug);
    if (to) permanentRedirect(localizePath(to, lang));
    notFound();
  }
  const L = (p: string) => localizePath(p, lang);
  const n = (x: number) => formatNumber(x, lang);

  const [founding, projects, reviews, recommenders, categories, regions, propertyTypes] = await Promise.all([
    isOrgLifetime(v.id),
    listOrgProjects(v.id),
    listPublishedReviews({ organizationId: v.id }, 100),
    getRecommendedBy(v.id),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
  ]);
  const rating = reviewStats(reviews);
  const showContact = v.contactVisibility === "show_contact";
  const place = [v.city, v.province].filter((x): x is string => Boolean(x)).map((x) => regionName(x, lang)).join(", ");
  const trades = v.categories.map((c) => tradeName(c, lang));
  const catSlug = new Map(categories.map((c) => [c.name, c.slug]));
  const regSlug = new Map(regions.map((r) => [r.name, r.slug]));
  const propSlug = new Map(propertyTypes.map((p) => [p.name, p.slug]));
  const inviteHref = `/sign-up?role=property_manager&next=${encodeURIComponent(`/pm-dashboard/rfps/new?invite=${v.slug}`)}`;

  // Badges the company actually holds.
  const badges: { label: string; kind: "solid" | "line" | "white"; title?: string; icon: "star" | "tick" }[] = [];
  if (v.platinum) badges.push({ label: td.badges.platinum, kind: "solid", icon: "star" });
  else if (v.featured) badges.push({ label: td.badges.featured, kind: "solid", icon: "star" });
  if (founding) badges.push({ label: tf.directoryBadge, kind: "line", title: tf.directoryBadgeTooltip, icon: "star" });
  if (v.verified) badges.push({ label: td.badges.verified, kind: "white", title: td.badges.verifiedTooltip, icon: "tick" });

  // Up to three facts the company has; none are invented.
  const facts: { n: string; l: string }[] = [];
  if (v.emergencyService) facts.push({ n: "24/7", l: t.facts.emergency });
  if (v.yearsInBusiness) facts.push({ n: n(v.yearsInBusiness), l: t.facts.years });
  if (trades.length) facts.push({ n: n(trades.length), l: fmt(t.facts.trades, { list: trades.join(", ") }) });
  if (v.regions.length) facts.push({ n: n(v.regions.length), l: t.facts.areas });
  if (projects.length) facts.push({ n: n(projects.length), l: t.facts.projects });
  if (v.employeeCountRange) facts.push({ n: v.employeeCountRange, l: t.facts.team });

  const groups = [
    { label: t.groups.trades, items: v.categories.map((c) => ({ name: tradeName(c, lang), href: catSlug.get(c) ? `/directory?category=${catSlug.get(c)}` : "/directory" })) },
    { label: t.groups.area, items: v.regions.map((r) => ({ name: regionName(r, lang), href: regSlug.get(r) ? `/directory?region=${regSlug.get(r)}` : "/directory" })) },
    { label: t.groups.props, items: v.propertyTypes.map((p) => ({ name: propertyTypeName(p, lang), href: propSlug.get(p) ? `/directory?propertyType=${propSlug.get(p)}` : "/directory" })) },
  ].filter((g) => g.items.length > 0);

  const projSub = (p: (typeof projects)[number]) =>
    [[p.city, p.province].filter((x): x is string => Boolean(x)).map((x) => regionName(x, lang)).join(", "), p.publishedAt ? formatDate(p.publishedAt, lang, { year: "numeric" }) : null]
      .filter(Boolean)
      .join(" · ");
  const deck = projects.slice(0, 4).map((p) => ({ href: L(`/case-studies/${p.slug}`), title: p.title, sub: projSub(p), img: p.heroUrl }));
  const more = projects.slice(4);
  const credsOnFile = [v.insuranceStatus, v.wsibStatus].some(Boolean);
  const fmtMonth = (d: string) => formatDate(d, lang, { month: "long", year: "numeric" });

  return (
    <>
      <JsonLd
        data={localBusinessSchema({
          name: v.name,
          slug: v.slug,
          city: v.city,
          province: v.province,
          shortDescription: v.shortDescription,
          categories: v.categories,
          logoUrl: v.logoUrl,
          aggregateRating: rating.count > 0 ? { ratingValue: rating.average, reviewCount: rating.count } : undefined,
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: tp.home, path: localizePath("/", lang) },
          { name: tp.directory, path: localizePath("/directory", lang) },
          { name: v.name, path: localizePath(`/directory/${v.slug}`, lang) },
        ])}
      />

      <div className="v3-top">
        <section>
          <div className="v3-wrap v3-cp-hero-in">
            <nav aria-label={tp.breadcrumb} className="v3-cp-crumb">
              <a href={L("/directory")}>{tp.directory}</a>
              {v.categories[0] && (
                <>
                  <span className="sl" aria-hidden>/</span>
                  <a href={L(catSlug.get(v.categories[0]) ? `/directory?category=${catSlug.get(v.categories[0])}` : "/directory")}>{trades[0]}</a>
                </>
              )}
            </nav>

            <div className="v3-cp-head fadeup">
              <div className="v3-cp-logo">
                {v.logoUrl ? <Image src={v.logoUrl} alt={v.name} fill sizes="148px" unoptimized={v.logoUrl.endsWith(".svg")} /> : monogram(v.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                {badges.length > 0 && (
                  <div className="v3-cp-badges">
                    {badges.map((b) => (
                      <span key={b.label} className={`v3-cp-badge ${b.kind}`} title={b.title}>
                        {b.icon === "tick" ? <Tick stroke="#15803D" /> : <StarIc fill={b.kind === "solid" ? "#1B1D3A" : "#91F2CF"} />}
                        {b.label}
                      </span>
                    ))}
                  </div>
                )}
                <h1 className="v3-cp-h1">{v.name}</h1>
                {v.level != null && v.level >= 2 && (
                  <a href={L("/reputation")} style={{ display: "inline-block", marginTop: 10 }}><LevelBadge level={v.level} tone="dark" /></a>
                )}
                <div className="v3-cp-meta">
                  {place && (
                    <span className="city">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#91F2CF" strokeWidth="2" aria-hidden><path d="M9 16.5s5.5-4.9 5.5-9A5.5 5.5 0 0 0 3.5 7.5c0 4.1 5.5 9 5.5 9z" /><circle cx="9" cy="7.5" r="2" /></svg>
                      {place}
                    </span>
                  )}
                  {v.categories.map((c) => (
                    <a key={c} className="tr" href={L(catSlug.get(c) ? `/directory?category=${catSlug.get(c)}` : "/directory")}>{tradeName(c, lang)}</a>
                  ))}
                  {rating.count > 0 && (
                    <span className="rt"><a href="#reviews-h"><b>★ {oneDecimal(rating.average, lang)}</b> {plural(rating.count, tp.clientReviews)}</a></span>
                  )}
                  {v.googleRating != null && v.googleReviewCount != null && v.googleReviewCount > 0 && (
                    // Displayed with attribution, sourced via the official Places API.
                    // Deliberately NOT in schema markup: rich-result rules require first-party reviews.
                    <span className="rt"><b>★ {oneDecimal(v.googleRating, lang)}</b> {fmt(tp.googleReviews, { n: v.googleReviewCount })}</span>
                  )}
                </div>
              </div>
              <div className="v3-cp-ctas">
                <a href={L(inviteHref)} className="v3-pill mint">{t.heroInvite}</a>
                {showContact && v.phone && (
                  <a href={`tel:${v.phone}`} className="v3-pill ghost"><PhoneIc stroke="#FFFFFF" />{v.phone}</a>
                )}
              </div>
            </div>

            {v.shortDescription && <p className="v3-cp-short">{v.shortDescription}</p>}
            {/* Realtors and PMs who put this company on their trusted-trades page. */}
            {recommenders.length > 0 && (
              <p className="v3-cp-rec">
                {tp.recommendedBy}{" "}
                {recommenders.slice(0, 3).map((r, i) => (
                  <span key={r.handle}>
                    <a href={L(`/trusted/${r.handle}`)}>{r.displayName}</a>
                    {r.brokerage && <> ({r.brokerage})</>}
                    {i < Math.min(recommenders.length, 3) - 1 && ", "}
                  </span>
                ))}
                {recommenders.length > 3 && <> {plural(recommenders.length - 3, tp.andMore)}</>}
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="v3-wrap v3-cp-body">
        <div className="v3-cp-main">
          {(v.fullDescription || facts.length > 0) && (
            <section>
              <div className="v3-eyebrow">{t.aboutEyebrow}</div>
              <h2 className="v3-cp-h2">{fmt(tp.about, { name: v.name })}</h2>
              {v.fullDescription && <p className="v3-cp-about">{v.fullDescription}</p>}
              {facts.length > 0 && (
                <div className="v3-cp-facts">
                  {facts.slice(0, 3).map((f) => <div key={f.l}><div className="n">{f.n}</div><div className="l">{f.l}</div></div>)}
                </div>
              )}
            </section>
          )}

          {/* Only the company's own published projects; hidden when there are none. */}
          {deck.length > 0 && (
            <section>
              <div className="v3-eyebrow">{t.workEyebrow}</div>
              <h2 className="v3-cp-h2">{td.projects.heading}</h2>
              <ProjectDeck projects={deck} tag={fmt(td.projects.sub, { name: v.name })} seeLabel={t.seeProject} noPhoto={t.noPhoto} />
              <div className="v3-cp-more">
                {more.map((p, i) => (
                  <a key={p.slug} className="lift" href={L(`/case-studies/${p.slug}`)}>
                    <span className="k">{String(i + 5).padStart(2, "0")}{projSub(p) ? ` · ${projSub(p)}` : ""}</span>
                    <span><span className="t">{p.title}</span></span>
                  </a>
                ))}
                {projects.length > 1 && (
                  <a className="lift" href={L(`/projects?company=${encodeURIComponent(v.slug)}`)}>
                    <span className="k" aria-hidden>→</span>
                    <span><span className="t">{getT("portfolio").profile.allProjects}</span></span>
                  </a>
                )}
                {/* Only the company's own members see this (checked server-side after load). */}
                <AddProjectTile organizationId={v.id} href={L("/dashboard/projects")} title={t.addProject} body={t.addProjectBody} />
              </div>
            </section>
          )}

          {(credsOnFile || v.verified) && (
            <section>
              <div className="v3-cp-cred">
                <span className="ring spin" aria-hidden>
                  <svg width="104" height="104" viewBox="0 0 96 96"><defs><path id="v3circ-cp" d="M48 48m-36 0a36 36 0 1 1 72 0a36 36 0 1 1 -72 0" /></defs><text fontFamily="IBM Plex Mono, monospace" fontSize="10.5" letterSpacing="2.2" fill="#91F2CF"><textPath href="#v3circ-cp">{t.ring}</textPath></text></svg>
                </span>
                <div className="k">{t.credEyebrow}</div>
                <h2 className="v3-cp-h2">{t.credHead}</h2>
                <div className="v3-cp-cred-grid">
                  {v.verified && (
                    <div className="v3-cp-cred-card on">
                      <span className="hd"><span className="kk">{td.badges.verified}</span><span className="op"><Tick stroke="#FFFFFF" size={11} />{t.onProfile}</span></span>
                      <span><span className="v">{t.verifiedNote}</span></span>
                    </div>
                  )}
                  {(
                    [
                      [t.insurance, v.insuranceStatus],
                      [t.wsib, v.wsibStatus],
                    ] as const
                  ).map(([k, val]) =>
                    val ? (
                      <div key={k} className="v3-cp-cred-card on">
                        <span className="hd"><span className="kk">{k}</span><span className="op"><Tick stroke="#FFFFFF" size={11} />{t.onProfile}</span></span>
                        <span><span className="v">{val}</span></span>
                      </div>
                    ) : (
                      <div key={k} className="v3-cp-cred-card off">
                        <span className="kk">{k}</span>
                        <span><span className="mm">{t.missing}</span></span>
                      </div>
                    ),
                  )}
                </div>
                <div className="note">{t.credNote}</div>
              </div>
            </section>
          )}

          {groups.length > 0 && (
            <section>
              <div className="v3-eyebrow">{t.whereEyebrow}</div>
              <h2 className="v3-cp-h2">{t.whereHead}</h2>
              <div className="v3-cp-groups">
                {groups.map((g, gi) => (
                  <div key={g.label} className={`v3-cp-group g${gi}`}>
                    <span className="n">{n(g.items.length)}</span>
                    <span className="l">{g.label}</span>
                    <span className="it">
                      {g.items.map((i) => <a key={i.name} className="lift" href={L(i.href)}>{i.name}</a>)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {reviews.length > 0 && (
            <section aria-labelledby="reviews-h">
              <div className="v3-eyebrow">{t.reviewsEyebrow}</div>
              <h2 id="reviews-h" className="v3-cp-h2">{td.projects.reviews}</h2>
              <div className="v3-cp-sum"><b>{oneDecimal(rating.average, lang)}</b><span>{plural(rating.count, td.projects.summary)}</span></div>
              <div className="v3-cp-reviews">
                {reviews.map((r) => (
                  <div key={r.id} className="v3-cp-review">
                    <div className="hd">
                      <span className="st" role="img" aria-label={fmt(td.projects.stars, { rating: String(r.rating) })}>
                        {"★".repeat(Math.round(r.rating))}<span className="off">{"★".repeat(Math.max(0, 5 - Math.round(r.rating)))}</span>
                      </span>
                      <span className="dt">{fmtMonth(r.createdAt)}</span>
                    </div>
                    <p>{r.body}</p>
                    <div className="by">
                      <b>{r.name}</b>{r.company && <> · {r.company}</>}
                      {r.verifiedVia === "project_invite" && <span title={td.projects.viaTitle}> · {td.projects.viaLink}</span>}
                    </div>
                    {r.reply && <div className="rp"><b>{td.projects.reply}</b> {r.reply}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {v.portfolioPhotos.length > 0 && (
            <section>
              <div className="v3-eyebrow">{t.photosEyebrow}</div>
              <h2 className="v3-cp-h2">{tp.portfolio}</h2>
              <p className="v3-cp-about">{fmt(tp.portfolioSub, { name: v.name })}</p>
              <div className="v3-cp-photos">
                {v.portfolioPhotos.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="zoom">
                    <Image src={url} alt={fmt(tp.portfolioAlt, { name: v.name, n: i + 1 })} fill sizes="(min-width: 1024px) 260px, 50vw" className="v3-img" />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="v3-cp-aside">
          <div className="v3-cp-quote">
            <div className="hd"><span className="k">{t.quote.eyebrow}</span><span className="fr">{t.quote.free}</span></div>
            <div className="h">{t.quote.head}</div>
            <div className="p">{fmt(tp.quoteBody, { name: v.name })}</div>
            <ol>
              {t.quote.steps.map((s, i) => <li key={s}><span>{i + 1}</span>{s}</li>)}
            </ol>
            {/* Through sign-up (PM role preselected) so cold visitors get registration,
                not a password wall; `next` brings them back to post-an-RFP-with-this-vendor. */}
            <a href={L(inviteHref)} className="go">{t.quote.cta}</a>
            <div className="save v3-bb"><SaveTradeButton organizationId={v.id} slug={v.slug} name={v.name} /></div>
            <a href={L("/rfp-writer")} className="wr">{t.quote.writer}</a>
          </div>

          <div className="v3-cp-contact">
            {showContact && (v.website || v.email || v.phone) ? (
              <>
                <div className="k">{tp.contact}</div>
                <div className="ls">
                  {v.website && (
                    <a href={v.website} target="_blank" rel="noopener noreferrer">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#282B59" strokeWidth="2" aria-hidden><circle cx="9" cy="9" r="7" /><path d="M2 9h14M9 2c2.5 2.5 2.5 11.5 0 14M9 2c-2.5 2.5-2.5 11.5 0 14" /></svg>
                      {v.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  )}
                  {v.email && (
                    <a href={`mailto:${v.email}`}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#282B59" strokeWidth="2" aria-hidden><rect x="2" y="4" width="14" height="10" rx="2" /><path d="M2.5 5l6.5 5 6.5-5" /></svg>
                      {v.email}
                    </a>
                  )}
                  {v.phone && <a href={`tel:${v.phone}`}><PhoneIc stroke="#282B59" />{v.phone}</a>}
                </div>
                {v.website && <p style={{ marginTop: 8, fontSize: 13, color: "#4B4F6B" }}>{fmt(getT("agencies").linkNote, { company: v.name })}</p>}
              </>
            ) : (
              <>
                <div className="k">{tp.contact}</div>
                <div className="h">{tp.introTitle}</div>
                <div className="p">{fmt(tp.introBody, { site: SITE.name })}</div>
                <div className="frm v3-bb"><RequestIntroForm vendorSlug={v.slug} vendorName={v.name} /></div>
              </>
            )}
          </div>
        </aside>
      </div>

      <section className="v3-mint-band">
        <div className="v3-wrap v3-cp-claim-in">
          <div className="ic" aria-hidden>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="#91F2CF" strokeWidth="5"><circle cx="22" cy="32" r="12" /><path d="M34 32h24M48 32v10M56 32v7" /></svg>
          </div>
          <div>
            <div className="k">{fmt(tp.areYou, { name: v.name })}</div>
            <h2 className="h">{t.claimHead}</h2>
            <div className="p">{t.claimBody}</div>
          </div>
          <div className="btns">
            <a href={L("/sign-up")} className="v3-pill ink">{t.claimCta}</a>
            <a href={L("/pricing")} className="v3-pill out">{t.pricing}</a>
          </div>
        </div>
      </section>

      <div className="v3-sticky">
        <div className="v3-sticky-in">
          <span className="v3-dot" style={{ width: 10, height: 10 }} />
          <div className="grow"><b>{v.name}</b>{(trades.length > 0 || place) && <> <span className="c">{[trades.join(", "), place].filter(Boolean).join(" · ")}</span></>}</div>
          <a href={L("/directory")} className="v3-pill ghost">{t.back}</a>
          <a href={L(inviteHref)} className="v3-pill mintsm">{t.stickyInvite}</a>
        </div>
      </div>
    </>
  );
}
