import "@/components/v3-pages/directory.css";
import Image from "next/image";
import type { ReactNode } from "react";
import { localizePath, type Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";
import { regionName, tradeName } from "@/i18n/terms";
import type { VendorListItem } from "@/lib/data/types";

/**
 * "Directory list (5 list types)" template: one layout for the trade
 * directory, suppliers, contract winners, jobs and talent. Server-rendered;
 * search, filters, chips and pagination are plain GET links/forms. Every
 * number and card comes from live data; sections without data are hidden.
 */

export type ListType = "trades" | "suppliers" | "winners" | "jobs" | "talent";
export type ListCopy = Messages["v3Pages"]["list"];

export const LIST_PATH: Record<ListType, string> = {
  trades: "/directory",
  suppliers: "/suppliers",
  winners: "/contract-winners",
  jobs: "/jobs",
  talent: "/talent",
};

export interface DLCard {
  href: string;
  name: string;
  loc?: string | null;
  tags?: string | null;
  desc?: string | null;
  metaN?: string | null;
  metaL?: string | null;
  badge?: string | null;
  logo?: string | null;
}

export interface DLLink { href: string; label: string }

export interface DLProps {
  lang: Locale;
  type: ListType;
  t: ListCopy;
  eyebrow: string;
  h1: string;
  h1Size: number;
  sub: string;
  stats: { n: string; l: string }[];
  /** Extra links under the intro (winners: report pages). */
  links?: DLLink[];
  search: { q: string; placeholder: string; button: string; keep: Record<string, string | undefined> } | null;
  ctas: [DLLink, DLLink];
  /** Live count per list (null = unknown, the pill is hidden). */
  tabs: Record<ListType, number | null>;
  filters: { name: string; label: string; value: string; options: { value: string; label: string }[] }[];
  /** Null hides the "Verified only" switch. */
  verified: boolean | null;
  filterButton: string;
  /** Hidden inputs the filter form keeps (the keyword). */
  filterKeep?: Record<string, string | undefined>;
  chips: { label: string; items: { name: string; n: number; href: string; on: boolean }[] } | null;
  /** Featured section (trades/suppliers/winners); null hides it. */
  featured: {
    title: string;
    card: { href: string; img: string; badge: string; badge2?: string | null; tags: string; name: string; loc: string; desc?: string | null } | null;
    /** The open slot's price line (rendered in the visitor's currency). */
    slotPrice: ReactNode;
    slotHref: string;
  } | null;
  list: {
    title: string;
    cards: DLCard[];
    cardCta: string;
    band: { eyebrow: string; head: string; text: ReactNode; cta: DLLink; big: ReactNode };
    page: number;
    pages: number;
    total: number;
    perPage: number;
    pageHref: (n: number) => string;
    footnote?: string;
  } | null;
  /** Extra block under the filters (e.g. the founding-region notice). */
  notice?: ReactNode;
  /** Filters active but nothing matches. */
  noMatch: { clearHref: string } | null;
  empty: {
    tag: string;
    head: string;
    text: string;
    cta1: DLLink;
    cta2: DLLink;
    link: DLLink;
    facts: { n: string; l: string }[];
    howLabel: string;
    howHead: string;
    how: string[];
  } | null;
  close: { eyebrow: string; head: string; text: string; cta1: DLLink; cta2: DLLink };
  sticky: { a: string; b: string; cta1: DLLink; cta2: DLLink };
}

const PAL = [["#282B59", "#FFFFFF"], ["#91F2CF", "#1B1D3A"], ["#EEEEF8", "#282B59"], ["#1B1D3A", "#91F2CF"], ["#DDFBF0", "#1B1D3A"], ["#4A4E85", "#FFFFFF"]];

export function monogram(name: string): string {
  const w = name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean);
  return ((w[0] ?? "").charAt(0) + (w[1] ?? "").charAt(0)).toUpperCase() || "·";
}

const Star = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="#1B1D3A" aria-hidden><path d="M7 1l1.8 3.9 4.2.5-3.1 2.9.8 4.2L7 10.4l-3.7 2.1.8-4.2L1 5.4l4.2-.5z" /></svg>
);
const Pin = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="#91F2CF" strokeWidth="2" aria-hidden><path d="M7 15s5-4.6 5-8.5A5 5 0 0 0 2 6.5C2 10.4 7 15 7 15z" /><circle cx="7" cy="6.5" r="1.6" /></svg>
);

function Card({ c, i, cta }: { c: DLCard; i: number; cta: string }) {
  const p = PAL[i % PAL.length];
  return (
    <a className="v3-dl-card lift" href={c.href}>
      <span className="top">
        <span className="mono" style={{ background: p[0], color: p[1] }}>
          {c.logo ? <Image src={c.logo} alt="" fill sizes="56px" unoptimized={c.logo.endsWith(".svg")} /> : monogram(c.name)}
        </span>
        {(c.badge || c.metaN) && (
          <span className="side">
            {c.badge && <span className="bdg">{c.badge}</span>}
            {c.metaN && <span className="meta"><b>{c.metaN}</b>{c.metaL && <span>{c.metaL}</span>}</span>}
          </span>
        )}
      </span>
      <span className="nm">{c.name}</span>
      {c.loc && <span className="lc">{c.loc}</span>}
      {c.tags && <span className="tg">{c.tags}</span>}
      <span className="ds">{c.desc}</span>
      <span className="go">{cta} →</span>
    </a>
  );
}

export function DirectoryList(p: DLProps) {
  const { t, lang } = p;
  const L = (path: string) => localizePath(path, lang);
  const num = (n: number) => formatNumber(n, lang);
  const list = p.list;
  const cards = (list?.cards ?? []).map((c) => ({ ...c, href: L(c.href) }));
  const from = list && list.total ? (list.page - 1) * list.perPage + 1 : 0;
  const to = list ? Math.min(list.total, list.page * list.perPage) : 0;
  const showing = list ? t.showing.replace("{from}", num(from)).replace("{to}", num(to)).replace("{total}", num(list.total)) : "";
  const tabKeys: ListType[] = ["trades", "suppliers", "winners", "jobs", "talent"];

  return (
    <>
      <div className="v3-top">
        <section className="v3-dl-hero">
          <div className="blob" aria-hidden />
          <div className="v3-wrap v3-dl-hero-in">
            <nav aria-label={t.home} className="v3-crumb"><a href={L("/")}>{t.home}</a><span aria-hidden>/</span><span className="on">{p.eyebrow}</span></nav>
            <div className="v3-dl-head">
              <div className="l">
                <h1 style={{ fontSize: p.h1Size }}>{p.h1}</h1>
                <p className="sub">{p.sub}</p>
                {p.links && p.links.length > 0 && (
                  <div className="v3-dl-links">{p.links.map((x) => <a key={x.href} href={L(x.href)}>{x.label}</a>)}</div>
                )}
              </div>
              {p.stats.length > 0 && (
                <div className="r">
                  {p.stats.map((s) => (
                    <div key={s.l} className="v3-dl-stat"><div className="n">{s.n}</div><div className="l">{s.l}</div></div>
                  ))}
                </div>
              )}
            </div>

            <div className="v3-dl-bar">
              {p.search && (
                <form method="get" action={L(LIST_PATH[p.type])} className="v3-dl-search" role="search">
                  {Object.entries(p.search.keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
                  <label>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#282B59" strokeWidth="2.5" aria-hidden><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l5 5" /></svg>
                    <span className="v3-sr">{t.keyword}</span>
                    <input type="search" name="q" defaultValue={p.search.q} placeholder={p.search.placeholder} />
                  </label>
                  <button type="submit">{p.search.button} →</button>
                </form>
              )}
              <a href={L(p.ctas[0].href)} className="v3-pill mint">{p.ctas[0].label}</a>
              <a href={L(p.ctas[1].href)} className="v3-pill ghost">{p.ctas[1].label}</a>
            </div>

            <nav aria-label={t.tabsLabel} className="v3-dl-tabs">
              {tabKeys.map((k) => (
                <a key={k} href={L(LIST_PATH[k])} className="v3-dl-tab" aria-current={k === p.type ? "page" : undefined}>
                  {t.tabs[k]}
                  {p.tabs[k] != null && <span className="c">{num(p.tabs[k]!)}</span>}
                </a>
              ))}
            </nav>
          </div>
        </section>
      </div>

      {(p.filters.length > 0 || p.chips) && (
        <section className="v3-dl-filters" aria-label={t.filtersLabel}>
          <div className="v3-wrap v3-dl-filters-in">
            {p.filters.length > 0 && (
              <form method="get" action={L(LIST_PATH[p.type])} className="v3-dl-form">
                {Object.entries(p.filterKeep ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
                {p.filters.map((f) => (
                  <label key={f.name} className="v3-dl-sel">
                    <span>{f.label}</span>
                    <select name={f.name} defaultValue={f.value}>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                ))}
                {p.verified != null && (
                  <label className="v3-dl-ver">
                    <input type="checkbox" name="verified" value="1" defaultChecked={p.verified} />
                    <span className="tr" aria-hidden><span className="kn" /></span>
                    <b>{t.verifiedOnly}</b>
                  </label>
                )}
                <button type="submit">{p.filterButton}</button>
              </form>
            )}
            {p.chips && p.chips.items.length > 0 && (
              <div className="v3-dl-chips">
                <span className="lab">{p.chips.label}</span>
                {p.chips.items.map((c) => (
                  <a key={c.href} href={L(c.href)} className={`v3-dl-chip lift${c.on ? " on" : ""}`} aria-current={c.on ? "true" : undefined}>
                    <b>{c.name}</b><span className="c">{num(c.n)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {p.notice && <div className="v3-wrap v3-bb" style={{ paddingTop: 24 }}>{p.notice}</div>}

      {list && (
        <section>
          <div className="v3-wrap v3-dl-sec">
            {p.featured && (
              <>
                <div className="v3-dl-sec-head">
                  <h2 className="t">{p.featured.title}</h2>
                  <div className="k">{t.paidPlacement}</div>
                </div>
                <div className="v3-dl-feat-grid">
                  {p.featured.card && (
                    <a className="v3-dl-feat zoom" href={L(p.featured.card.href)}>
                      <Image src={p.featured.card.img} alt="" fill sizes="(max-width: 1023px) 100vw, 760px" className="v3-img" />
                      <span className="sh" />
                      <span className="bdg">
                        <span className="b1"><Star />{p.featured.card.badge}</span>
                        {p.featured.card.badge2 && <span className="b2">{p.featured.card.badge2}</span>}
                      </span>
                      {p.featured.card.tags && <span className="rel tg">{p.featured.card.tags}</span>}
                      <span className="rel nm">{p.featured.card.name}</span>
                      {p.featured.card.loc && <span className="rel lc"><Pin />{p.featured.card.loc}</span>}
                      {p.featured.card.desc && <span className="rel ds">{p.featured.card.desc}</span>}
                      <span className="rel cta">{t.viewProfile} →</span>
                    </a>
                  )}
                  <div className="v3-dl-slot" style={{ gridColumn: p.featured.card ? "span 4" : "span 12" }}>
                    <span className="ring spin" aria-hidden>
                      <svg width="96" height="96" viewBox="0 0 96 96"><defs><path id="v3circf" d="M48 48m-36 0a36 36 0 1 1 72 0a36 36 0 1 1 -72 0" /></defs><text fontFamily="IBM Plex Mono, monospace" fontSize="10.5" letterSpacing="2.2" fill="#1B1D3A"><textPath href="#v3circf">{t.slot.ring}</textPath></text></svg>
                    </span>
                    <div className="k">{t.slot.label}</div>
                    <div className="h">{t.slot.head}</div>
                    <div className="sp" />
                    <div className="pr">{p.featured.slotPrice}</div>
                    <div className="bd">{t.slot.body}</div>
                    <a href={L(p.featured.slotHref)} className="v3-pill ink">{t.slot.cta}</a>
                  </div>
                </div>
              </>
            )}

            <div className="v3-dl-sec-head" style={{ marginTop: p.featured ? 64 : 0 }}>
              <h2 className="t">{list.title}</h2>
              <div className="s">{showing}</div>
            </div>
            <div className="v3-dl-grid">
              {cards.slice(0, 6).map((c, i) => <Card key={c.href} c={c} i={i} cta={list.cardCta} />)}
              <div className="v3-dl-band">
                <div className="big">{list.band.big}</div>
                <div>
                  <div className="k">{list.band.eyebrow}</div>
                  <div className="h">{list.band.head}</div>
                  <div className="p">{list.band.text}</div>
                </div>
                <a href={L(list.band.cta.href)} className="v3-pill mint">{list.band.cta.label} →</a>
              </div>
              {cards.slice(6).map((c, i) => <Card key={c.href} c={c} i={i + 6} cta={list.cardCta} />)}
            </div>

            <nav aria-label={t.pagination} className="v3-dl-pages">
              <span className="s">{showing}</span>
              {list.pages > 1 && (
                <div className="ps">
                  <a href={list.page > 1 ? L(list.pageHref(list.page - 1)) : undefined} aria-label={t.prev} className={`v3-dl-pg${list.page > 1 ? "" : " dis"}`} aria-disabled={list.page > 1 ? undefined : true}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#4B4F6B" strokeWidth="2.5" aria-hidden><path d="M10 3L5 8l5 5" /></svg>
                  </a>
                  {Array.from({ length: list.pages }, (_, i) => i + 1).map((n) => (
                    <a key={n} href={L(list.pageHref(n))} className="v3-dl-pg" aria-current={n === list.page ? "page" : undefined} aria-label={t.page.replace("{n}", String(n))}>{num(n)}</a>
                  ))}
                  {list.page < list.pages && <a href={L(list.pageHref(list.page + 1))} className="v3-dl-pg nx">{t.next}</a>}
                </div>
              )}
            </nav>
            {list.footnote && <p className="v3-dl-foot">{list.footnote}</p>}
          </div>
        </section>
      )}

      {p.noMatch && (
        <section className="v3-dl-empty">
          <div className="v3-wrap v3-dl-empty-in">
            <div className="v3-dl-empty-card" style={{ gridColumn: "span 12" }}>
              <div className="blob" aria-hidden />
              <h2 className="rel h">{t.noMatchHead}</h2>
              <p className="rel p">{t.noMatchText}</p>
              <div className="rel btns"><a href={L(p.noMatch.clearHref)} className="v3-pill navy big">{t.clear} →</a></div>
            </div>
          </div>
        </section>
      )}

      {p.empty && (
        <section className="v3-dl-empty">
          <div className="v3-wrap v3-dl-empty-in fadeup">
            <div className="v3-dl-empty-grid">
              <div className="v3-dl-empty-card">
                <div className="blob" aria-hidden />
                <div className="rel tag"><span className="v3-ping" aria-hidden><span className="ping" /><span /></span>{p.empty.tag}</div>
                <h2 className="rel h">{p.empty.head}</h2>
                <p className="rel p">{p.empty.text}</p>
                <div className="rel btns">
                  <a href={L(p.empty.cta1.href)} className="v3-pill navy big">{p.empty.cta1.label} →</a>
                  <a href={L(p.empty.cta2.href)} className="v3-pill outnavy big">{p.empty.cta2.label}</a>
                </div>
                <div className="rel lnk"><a href={L(p.empty.link.href)}>{p.empty.link.label} →</a></div>
                <div className="sp" />
                <div className="rel v3-dl-facts">
                  {p.empty.facts.map((f) => <div key={f.l}><div className="n">{f.n}</div><div className="l">{f.l}</div></div>)}
                </div>
              </div>
              <div className="v3-dl-how">
                <div className="k">{p.empty.howLabel}</div>
                <h3 className="h">{p.empty.howHead}</h3>
                <ol>
                  {p.empty.how.map((s, i) => <li key={s}><span className="no">0{i + 1}</span><b>{s}</b></li>)}
                </ol>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="v3-mint-band">
        <div className="v3-wrap v3-close-in">
          <div>
            <div className="k">{p.close.eyebrow}</div>
            <h2 className="h">{p.close.head}</h2>
            <div className="p">{p.close.text}</div>
          </div>
          <div className="btns">
            <a href={L(p.close.cta1.href)} className="v3-pill ink">{p.close.cta1.label} →</a>
            <a href={L(p.close.cta2.href)} className="v3-pill out">{p.close.cta2.label}</a>
          </div>
        </div>
      </section>

      <div className="v3-sticky">
        <div className="v3-sticky-in">
          <span className="v3-dot" style={{ width: 10, height: 10 }} />
          <div className="grow"><b>{p.sticky.a}</b> <span className="c">{p.sticky.b}</span></div>
          <a href={L(p.sticky.cta2.href)} className="v3-pill ghost">{p.sticky.cta2.label}</a>
          <a href={L(p.sticky.cta1.href)} className="v3-pill mintsm">{p.sticky.cta1.label} →</a>
        </div>
      </div>
    </>
  );
}

/** Builds ?a=b links for one list, dropping empties. */
export function listHref(path: string, params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "" && !(k === "page" && Number(v) <= 1)) q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export const PER_PAGE = 12;

export function paginate<T>(items: T[], rawPage: string | undefined): { page: number; pages: number; slice: T[] } {
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const n = Math.floor(Number(rawPage));
  const page = Number.isFinite(n) ? Math.min(Math.max(1, n), pages) : 1;
  return { page, pages, slice: items.slice((page - 1) * PER_PAGE, page * PER_PAGE) };
}

/** A directory card from a vendor (shared by /directory and /suppliers). */
export function vendorCard(v: VendorListItem, lang: Locale, t: { verified: string; featured: string; platinum: string; yrs: string }): DLCard {
  return {
    href: `/directory/${v.slug}`,
    name: v.name,
    loc: [v.city, v.province].filter((x): x is string => Boolean(x)).map((x) => regionName(x, lang)).join(", ") || null,
    tags: v.categories.map((c) => tradeName(c, lang)).join(" · ") || null,
    desc: v.shortDescription,
    metaN: v.yearsInBusiness ? formatNumber(v.yearsInBusiness, lang) : null,
    metaL: v.yearsInBusiness ? t.yrs : null,
    badge: v.platinum ? t.platinum : v.featured ? t.featured : v.verified ? t.verified : null,
    logo: v.logoUrl,
  };
}

