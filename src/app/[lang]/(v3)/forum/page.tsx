import type { Metadata } from "next";
import Image from "next/image";
import { OpeningSoon } from "@/components/forum/parts";
import { getForumIndex, type ForumCategory } from "@/lib/forum/data";
import { CHANNEL_ORDER, FORUM_CHANNELS, type ForumCategorySlug, type ForumChannel } from "@/lib/forum/categories";
import { RANKS } from "@/lib/forum/rules";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).forum.meta;
  return { title: t.indexTitle, description: t.indexDescription, alternates: alternatesFor(l, "/forum") };
}

/** Trade boards with a photo tile (the rest get the navy tile, as designed). */
const TRADE_IMG: Partial<Record<ForumCategorySlug, string>> = {
  electrical: "/images/home/trade-electrical.webp",
  "hvac-mechanical": "/images/home/trade-hvac.webp",
  "roofing-envelope": "/images/home/hero-roofing.webp",
  "concrete-structure": "/images/photos/masonry-block-wall.webp",
  "landscaping-snow": "/images/home/trade-snow.webp",
  "cleaning-janitorial": "/images/home/trade-cleaning.webp",
};
const REGION_CODE: Partial<Record<ForumCategorySlug, string>> = { quebec: "QC", ontario: "ON", alberta: "AB", "british-columbia": "BC", "united-states": "US" };

/** Floating board names in the hero: [board, left, top, font size, palette]. */
const BUBBLES: [ForumCategorySlug, string, string, number, number][] = [
  ["business-pricing", "0%", "2%", 19, 0],
  ["jobs-hiring", "52%", "0%", 15, 1],
  ["quebec", "4%", "17%", 15, 2],
  ["codes-permits", "34%", "15%", 17, 3],
  ["tools-gear", "48%", "30%", 15, 2],
  ["electrical", "0%", "32%", 18, 0],
  ["hvac-mechanical", "14%", "47%", 15, 1],
  ["roofing-envelope", "56%", "45%", 15, 3],
  ["condo-boards", "0%", "61%", 15, 1],
  ["ontario", "60%", "60%", 17, 0],
];
const PAL = [["#91F2CF", "#1B1D3A"], ["#282B59", "#FFFFFF"], ["#4A4E85", "#FFFFFF"], ["#FFFFFF", "#1B1D3A"]];
/** Rank staircase: height, background, text, accent. */
const RANK_LOOK: [number, string, string, string][] = [
  [190, "#FFFFFF", "#1B1D3A", "#282B59"],
  [240, "#5FD3AC", "#1B1D3A", "#1B1D3A"],
  [290, "#3E9F85", "#FFFFFF", "#FFFFFF"],
  [340, "#282B59", "#FFFFFF", "#91F2CF"],
  [400, "#1B1D3A", "#FFFFFF", "#91F2CF"],
];

export default async function ForumIndexPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("forum");
  const v = getT("v3pages").forum;
  const idx = await getForumIndex();
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => formatNumber(n, lang);
  const newThread = L("/forum/job-site-stories/new");

  const cats = idx.ready ? idx.categories : [];
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const channels = CHANNEL_ORDER.map((ch) => ({ ch, list: FORUM_CHANNELS[ch].map((s) => bySlug.get(s)).filter((c): c is ForumCategory => Boolean(c)) })).filter((x) => x.list.length > 0);
  const totalThreads = cats.reduce((s, c) => s + c.threadCount, 0);
  const latest = [...cats].filter((c) => c.lastThread && c.lastPostAt).sort((a, b) => (b.lastPostAt ?? "").localeCompare(a.lastPostAt ?? ""))[0];
  const startIn = (slug: string) => L(`/forum/${slug}/new`);

  const footer = (c: ForumCategory, dark: boolean) =>
    c.threadCount > 0 && c.lastThread ? (
      <>
        <span className="last">{c.lastThread.title}</span>
        {fmt(t.category.stats, { threads: c.threadCount, posts: c.postCount })}
        {dark ? <> · <b>{v.open}</b></> : null}
      </>
    ) : dark ? (
      <>{v.noThreads}. <b>{v.startFirst}</b></>
    ) : (
      v.noThreads
    );
  const mod = (c: ForumCategory) => (c.mods.length ? `${t.index.modsLabel} ${c.mods.map((m) => m.displayName).join(", ")}` : t.index.modOpen);
  const no = (i: number) => String(i).padStart(2, "0");
  let counter = 0;
  const sectionHead = (ch: ForumChannel, n: number, first = false) => (
    <div className="f-sec-head">
      <div className="l">
        <div className="f-big" aria-hidden>{no(CHANNEL_ORDER.indexOf(ch) + 1)}</div>
        <div>
          <div className="eb">{fmt(v.nBoards, { n })}</div>
          <h2 className="h2" id={`ch-${ch}`}>{t.channels[ch]}</h2>
        </div>
      </div>
      <div className="r" style={first ? undefined : undefined}>{v.channelBlurbs[ch]}</div>
    </div>
  );

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "PMRFP", path: "/" }, { name: t.forum, path: "/forum" }])} />

      <div className="dark">
        <section className="wrap f-hero">
          <div className="f-hero-main">
            <div className="a-kicker"><span className="dot" />{t.index.eyebrow}</div>
            <h1 className="f-h1">{t.index.title}</h1>
            <p className="f-lead">{t.index.lead}</p>
            {idx.ready && (
              <>
                <div className="f-ctas">
                  <a href={newThread} className="btn mint">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#1B1D3A" strokeWidth="2.8" aria-hidden><path d="M9 2v14M2 9h14" /></svg>
                    {t.category.newThread}
                  </a>
                  <a href={L("/sign-up")} className="btn ghost">{v.join}</a>
                </div>
                <div className="f-stats">
                  <div><div className="n">{num(cats.length)}</div><div className="l">{v.boardsOpen}</div></div>
                  <div><div className="n">{num(channels.length)}</div><div className="l">{v.groups}</div></div>
                  <div><div className="n w">{num(totalThreads)}</div><div className="l">{v.threadsSoFar}</div></div>
                </div>
              </>
            )}
          </div>
          {idx.ready && (
            <div className="f-cloud">
              {BUBBLES.filter(([s]) => bySlug.has(s)).map(([s, x, y, size, p], i) => (
                <a
                  key={s}
                  href={L(`/forum/${s}`)}
                  className="f-bub float"
                  style={{ left: x, top: y, fontSize: size, background: PAL[p][0], color: PAL[p][1], animationDuration: `${4 + (i % 4)}s`, animationDelay: `${-i * 0.7}s` }}
                >
                  {t.categories[s].name}
                </a>
              ))}
              {totalThreads === 0 ? (
                <a href={newThread} className="f-first">
                  <span className="row"><span className="k">{v.unwritten}</span><span className="pill">{v.foundingSpot}</span></span>
                  <span className="t" style={{ display: "block" }}>{v.yourQuestion}<span className="caret blink" aria-hidden /></span>
                  <span className="b" style={{ display: "block" }}>{v.nobody}</span>
                </a>
              ) : latest?.lastThread ? (
                <a href={L(latest.lastThread.path)} className="f-first">
                  <span className="row"><span className="k">{v.latest}</span><span className="pill">{t.categories[latest.slug].name}</span></span>
                  <span className="t" style={{ display: "block" }}>{latest.lastThread.title}</span>
                  {latest.lastThread.lastUser && <span className="b" style={{ display: "block" }}>{fmt(t.index.by, { name: latest.lastThread.lastUser })}</span>}
                </a>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {!idx.ready ? (
        <OpeningSoon />
      ) : (
        <>
          <section className="f-rep">
            <div className="wrap f-rep-in">
              <div className="f-rep-head">
                <div>
                  <div className="eb" style={{ color: "inherit" }}>{v.reputation}</div>
                  <h2 className="h2">{v.repTitle}</h2>
                </div>
                <p>{v.repBody} {t.index.ranksLead}</p>
              </div>
              <ol className="f-ranks">
                {RANKS.map((r, i) => {
                  const [h, bg, fg, accent] = RANK_LOOK[i];
                  return (
                    <li key={r.slug} className="f-rank step" style={{ height: h, background: bg, color: fg }}>
                      <div className="top" style={{ color: accent }}><span>{fmt(v.rank, { n: no(i + 1) })}</span><span>{no(i + 1)}/{no(RANKS.length)}</span></div>
                      <div>
                        <div className="nm">{t.ranks[r.slug]}</div>
                        <div className="pts"><b style={{ color: accent }}>{num(r.min)}</b><span>{v.points}</span></div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          {channels.map(({ ch, list }, ci) => {
            if (ch === "property")
              return (
                <section key={ch} className="wrap f-sec" aria-labelledby={`ch-${ch}`}>
                  <div className="f-prop">
                    <div className="f-prop-side">
                      <div className="f-big" aria-hidden>{no(CHANNEL_ORDER.indexOf(ch) + 1)}</div>
                      <div className="lb">{fmt(v.nBoards, { n: list.length })}</div>
                      <h2 id={`ch-${ch}`}>{t.channels[ch]}</h2>
                      <p>{v.channelBlurbs[ch]}</p>
                      <a href={startIn(list[0].slug)} className="btn mint md">{t.category.newThread}</a>
                    </div>
                    <div className="f-prop-grid">
                      {list.map((c) => (
                        <a key={c.slug} href={L(`/forum/${c.slug}`)} className="f-p blk">
                          <span className="top"><span className="no">{no(++counter)}</span><span className="mod">{mod(c)}</span></span>
                          <h3 className="nm">{t.categories[c.slug].name}</h3>
                          <span className="ds">{t.categories[c.slug].blurb}</span>
                          <span className="ft">{footer(c, true)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </section>
              );
            if (ch === "trades")
              return (
                <section key={ch} className="wrap f-sec" aria-labelledby={`ch-${ch}`}>
                  {sectionHead(ch, list.length)}
                  <div className="f-trades">
                    {list.map((c, i) => {
                      const img = TRADE_IMG[c.slug];
                      return (
                        <a key={c.slug} href={L(`/forum/${c.slug}`)} className="f-t zoom" style={{ background: img ? "#282B59" : i % 2 ? "#30335D" : "#3D416F" }}>
                          {img && <Image src={img} alt="" fill sizes="(min-width: 1024px) 280px, 50vw" className="img-cover" />}
                          <span className="shade" />
                          <span className="no">{no(++counter)}</span>
                          <h3 className="nm">{t.categories[c.slug].name}</h3>
                          <span className="ds">{t.categories[c.slug].blurb}</span>
                          <span className="ft">{footer(c, true)}</span>
                        </a>
                      );
                    })}
                  </div>
                </section>
              );
            if (ch === "regional")
              return (
                <section key={ch} className="wrap f-sec" aria-labelledby={`ch-${ch}`}>
                  {sectionHead(ch, list.length)}
                  <div className="f-regions">
                    {list.map((c) => (
                      <a key={c.slug} href={L(`/forum/${c.slug}`)} className={`f-r lift${c.slug === "quebec" ? " qc" : ""}`} lang={c.slug === "quebec" ? "fr-CA" : undefined}>
                        <span className="code" aria-hidden>{REGION_CODE[c.slug] ?? ""}</span>
                        <h3 className="nm">{t.categories[c.slug].name}</h3>
                        <span className="ds">{t.categories[c.slug].blurb}</span>
                        <span className="ft">{c.threadCount > 0 ? fmt(t.category.stats, { threads: c.threadCount, posts: c.postCount }) : v.noThreads}</span>
                        <span className="go">{c.threadCount > 0 ? v.open : v.startFirst}</span>
                      </a>
                    ))}
                  </div>
                </section>
              );
            return (
              <section key={ch} className={`wrap f-sec${ci === 0 ? " first" : ""}`} aria-labelledby={`ch-${ch}`}>
                {sectionHead(ch, list.length, ci === 0)}
                <div className="f-grid4">
                  {list.map((c) => (
                    <a key={c.slug} href={L(`/forum/${c.slug}`)} className="f-b lift">
                      <span className="top"><span className="no">{no(++counter)}</span><span className="mod">{mod(c)}</span></span>
                      <h3 className="nm">{t.categories[c.slug].name}</h3>
                      <span className="ds">{t.categories[c.slug].blurb}</span>
                      <span className="ft">{footer(c, false)}</span>
                      <span className="go">{c.threadCount > 0 ? v.open : v.startFirst}</span>
                    </a>
                  ))}
                </div>
              </section>
            );
          })}

          <section className="dots-bg f-rules">
            <div className="wrap f-rules-in">
              <div className="f-rules-side">
                <div className="eb">{t.index.rulesTitle}</div>
                <h2 className="h2">{v.rulesHead}<br />{v.rulesThatIs} <span className="tag-rot">{v.rulesAll}</span></h2>
                <p>{v.modBody}</p>
                <a href={L("/contact")}>{v.modCta}</a>
              </div>
              <ol className="f-rules-grid">
                {t.index.rules.map((r, i) => {
                  const cut = r.search(/[.;]\s/);
                  const head = cut > 0 ? r.slice(0, cut + 1) : r;
                  const rest = cut > 0 ? r.slice(cut + 2) : "";
                  return (
                    <li key={r} className="f-rule">
                      <span className="no" aria-hidden>{no(i + 1)}</span>
                      <span><span className="h">{head}</span>{rest && <span className="t">{rest}</span>}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          <section className="f-end">
            <div className="wrap f-end-in">
              <div className="n" aria-hidden>{totalThreads === 0 ? "01" : num(totalThreads)}</div>
              <div>
                <h2 className="h">{totalThreads === 0 ? v.endEmpty1 : v.endLive1}<br />{totalThreads === 0 ? v.endEmpty2 : v.endLive2}</h2>
                <div className="s">{fmt(v.endSub, { boards: num(cats.length), groups: num(channels.length) })}</div>
              </div>
              <div className="cta">
                <a href={newThread} className="btn ink xl">{t.category.newThread} →</a>
                <a href={L("/sign-up")} className="btn line-ink xl">{v.join}</a>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
