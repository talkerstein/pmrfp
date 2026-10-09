import type { Metadata } from "next";
import { headers } from "next/headers";
import { ChevronDown, CircleHelp } from "lucide-react";
import { OpeningSoon } from "@/components/forum/parts";
import { getForumIndex, listLatestThreads, listPinnedThreads, searchThreads, type ForumCategory, type ThreadWithCategory } from "@/lib/forum/data";
import { ForumIcon, ForumSearch, ThreadList } from "@/components/forum/organize";
import { cleanSearch } from "@/lib/forum/organize";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { CHANNEL_ORDER, FORUM_CHANNELS, type ForumCategorySlug } from "@/lib/forum/categories";
import { FeaturedContributors, LevelStairs } from "@/components/karma/level-stairs";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber, plural } from "@/i18n/format";
import { V3Body } from "@/components/v3/body";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: SP }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).forum.meta;
  // Search results (?q=) canonicalize to /forum and stay out of the index.
  const searching = (await searchParams).q !== undefined;
  return { title: t.indexTitle, description: t.indexDescription, alternates: alternatesFor(l, "/forum"), robots: searching ? { index: false, follow: true } : undefined };
}

async function runSearch(raw: unknown): Promise<{ q: string | null; asked: boolean; limited: boolean; results: ThreadWithCategory[] }> {
  const asked = raw !== undefined;
  const q = cleanSearch(raw);
  if (!q) return { q: null, asked, limited: false, results: [] };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (await checkRateLimitByIp(ip, "forum-search")) return { q, asked, limited: true, results: [] };
  return { q, asked, limited: false, results: await searchThreads(q) };
}

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
export default async function ForumIndexPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  await setLangFrom(params);
  const rawQ = (await searchParams).q;
  const lang = getLang();
  const t = getT("forum");
  const v = getT("v3Pages").forum;
  const k = getT("karma");
  const o = t.org;
  const [idx, search, latestThreads, pinnedThreads] = await Promise.all([getForumIndex(), runSearch(rawQ), listLatestThreads(8), listPinnedThreads(3)]);
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => formatNumber(n, lang);
  const newThread = L("/forum/job-site-stories/new");

  const cats = idx.ready ? idx.categories : [];
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const channels = CHANNEL_ORDER.map((ch) => ({ ch, list: FORUM_CHANNELS[ch].map((s) => bySlug.get(s)).filter((c): c is ForumCategory => Boolean(c)) })).filter((x) => x.list.length > 0);
  const totalThreads = cats.reduce((s, c) => s + c.threadCount, 0);
  const latest = [...cats].filter((c) => c.lastThread && c.lastPostAt).sort((a, b) => (b.lastPostAt ?? "").localeCompare(a.lastPostAt ?? ""))[0];

  const no = (i: number) => String(i).padStart(2, "0");
  const pinnedIds = new Set(pinnedThreads.map((p) => p.id));
  const activity = [...pinnedThreads, ...latestThreads.filter((x) => !pinnedIds.has(x.id))].map((th) => ({ th, forum: th.categorySlug }));

  const forumRow = (c: ForumCategory) => (
    <li key={c.slug}>
      <a href={L(`/forum/${c.slug}`)} className="flex items-start gap-3 px-4 py-3 hover:bg-[#F5F5FA]" lang={c.slug === "quebec" ? "fr-CA" : undefined}>
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#EEEFF6] text-[#282B59]"><ForumIcon slug={c.slug} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[#1B1D3A]">{t.categories[c.slug].name}</span>
          <span className="block truncate text-sm text-[#4B4F6B]">{t.categories[c.slug].blurb}</span>
          {c.lastThread && <span className="mt-0.5 block truncate text-xs text-[#4B4F6B]">{v.latest}: <span className="font-medium text-[#282B59]">{c.lastThread.title}</span></span>}
        </span>
        <span className="shrink-0 text-right text-xs tabular-nums text-[#4B4F6B]">{plural(c.threadCount, o.threadsIn)}</span>
      </a>
    </li>
  );

  return (
    <V3Body>
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
          <section className="wrap f-sec first" aria-labelledby="forum-latest">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <h2 className="h2" id="forum-latest">{search.asked ? (search.q ? fmt(o.searchTitle, { q: search.q }) : o.searchLabel) : o.latestTitle}</h2>
              <ForumSearch action={L("/forum")} q={search.q} />
            </div>
            {search.asked ? (
              <>
                {search.limited ? (
                  <p className="rounded-2xl border-2 border-amber-500/50 bg-amber-50/60 px-5 py-4 text-sm">{o.searchRate}</p>
                ) : !search.q ? (
                  <p className="text-sm text-[#4B4F6B]">{o.searchShort}</p>
                ) : (
                  <ThreadList items={search.results.map((th) => ({ th, forum: th.categorySlug }))} empty={fmt(o.searchNone, { q: search.q })} />
                )}
                <p className="mt-3 flex flex-wrap gap-4 text-sm">
                  <a href={L("/forum")} className="font-bold">{o.searchClear}</a>
                </p>
              </>
            ) : (
              <>
                {pinnedThreads.length > 0 && <p className="mb-2 font-mono text-xs uppercase tracking-[0.08em] text-[#4B4F6B]">{o.startHere}</p>}
                <ThreadList items={activity} empty={o.latestEmpty} pinnedIds={pinnedIds} />
              </>
            )}
          </section>

          {channels.map(({ ch, list }) => {
            const active = list.filter((c) => c.threadCount > 0);
            const quiet = list.filter((c) => c.threadCount === 0);
            const threads = list.reduce((n, c) => n + c.threadCount, 0);
            return (
              <section key={ch} className="wrap f-sec" aria-labelledby={`ch-${ch}`}>
                <details open className="group overflow-hidden rounded-3xl border-2 border-[#E3E4EE] bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <span className="font-mono text-sm text-[#4B4F6B]" aria-hidden>{no(CHANNEL_ORDER.indexOf(ch) + 1)}</span>
                    <span className="min-w-0 flex-1">
                      <h2 className="text-xl font-extrabold text-[#1B1D3A]" id={`ch-${ch}`}>{t.channels[ch]}</h2>
                      <span className="block text-sm text-[#4B4F6B]">{v.channelBlurbs[ch]}</span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-[#4B4F6B] sm:block">{fmt(v.nBoards, { n: list.length })} · {plural(threads, o.threadsIn)}</span>
                    <ChevronDown className="size-5 shrink-0 text-[#282B59] transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="border-t-2 border-[#E3E4EE]">
                    {active.length > 0 ? (
                      <ul className="divide-y divide-[#E3E4EE]">{active.map(forumRow)}</ul>
                    ) : (
                      <p className="px-5 py-3 text-sm text-[#4B4F6B]">{o.allQuiet}</p>
                    )}
                    {quiet.length > 0 && (
                      <details className="border-t-2 border-[#E3E4EE]">
                        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-[#282B59]">{plural(quiet.length, o.showAll)}</summary>
                        <ul className="divide-y divide-[#E3E4EE] border-t border-[#E3E4EE]">{quiet.map(forumRow)}</ul>
                      </details>
                    )}
                    <div className="flex flex-wrap gap-3 border-t-2 border-[#E3E4EE] px-5 py-3 text-sm">
                      <a href={L(`/forum/${list[0].slug}/new?type=question`)} rel="nofollow" className="inline-flex items-center gap-1 font-bold text-[#282B59]">
                        <CircleHelp className="size-4" aria-hidden /> {fmt(o.askIn, { name: t.categories[list[0].slug].name })}
                      </a>
                    </div>
                  </div>
                </details>
              </section>
            );
          })}

          <section className="f-rep">
            <div className="wrap f-rep-in">
              <div className="f-rep-head">
                <div>
                  <div className="eb" style={{ color: "inherit" }}>{v.reputation}</div>
                  <h2 className="h2">{k.forum.repTitle}</h2>
                </div>
                <p>{k.forum.repBody} <a href={L("/reputation")} style={{ fontWeight: 700, textDecoration: "underline" }}>{k.forum.how} →</a></p>
              </div>
              {/* Forum ranks were folded into company reputation (src/lib/karma). */}
              <LevelStairs />
              <FeaturedContributors />
            </div>
          </section>

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
    </V3Body>
  );
}
