import type { Metadata } from "next";
import { headers } from "next/headers";
import { BookOpen, CalendarClock, ChevronDown, CircleHelp } from "lucide-react";
import { OpeningSoon } from "@/components/forum/parts";
import { getForumIndex, listLatestThreads, listPinnedGuides, listRecentAutoThreads, searchThreads, type AutoThread, type ForumCategory, type ThreadWithCategory } from "@/lib/forum/data";
import { newestPerForum, openTenderStrip, partitionForums, pickStartHere, shownCount, torontoToday } from "@/lib/forum/quiet";
import { ForumIcon, ForumSearch, ThreadList } from "@/components/forum/organize";
import { cleanSearch } from "@/lib/forum/organize";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { CHANNEL_ORDER, FORUM_CHANNELS, type ForumCategorySlug } from "@/lib/forum/categories";
import { RANKS } from "@/lib/forum/rules";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
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
/** Rank staircase: height, background, text, accent. */
const RANK_LOOK: [number, string, string, string][] = [
  [190, "#FFFFFF", "#1B1D3A", "#282B59"],
  [240, "#5FD3AC", "#1B1D3A", "#1B1D3A"],
  [290, "#3E9F85", "#FFFFFF", "#FFFFFF"],
  [340, "#282B59", "#FFFFFF", "#91F2CF"],
  [400, "#1B1D3A", "#FFFFFF", "#91F2CF"],
];

export default async function ForumIndexPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  await setLangFrom(params);
  const rawQ = (await searchParams).q;
  const lang = getLang();
  const t = getT("forum");
  const v = getT("v3Pages").forum;
  const o = t.org;
  const [idx, search, latestThreads, pinnedGuides, autoThreads] = await Promise.all([
    getForumIndex(),
    runSearch(rawQ),
    listLatestThreads(40),
    listPinnedGuides(),
    listRecentAutoThreads(),
  ]);
  const q = t.quiet;
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => formatNumber(n, lang);
  const newThread = L("/forum/job-site-stories/new");

  const cats = idx.ready ? idx.categories : [];
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const channels = CHANNEL_ORDER.map((ch) => ({ ch, list: FORUM_CHANNELS[ch].map((s) => bySlug.get(s)).filter((c): c is ForumCategory => Boolean(c)) })).filter((x) => x.list.length > 0);
  const totalThreads = cats.reduce((s, c) => s + c.threadCount, 0);
  const latest = [...cats].filter((c) => c.lastThread && c.lastPostAt).sort((a, b) => (b.lastPostAt ?? "").localeCompare(a.lastPostAt ?? ""))[0];

  const no = (i: number) => String(i).padStart(2, "0");
  // Lead with what is really there: pinned PMRFP Team guides, then real
  // tenders (each with its own automatic thread). No invented activity.
  const startHere = pickStartHere(pinnedGuides, 6);
  const now = new Date();
  const tenders = openTenderStrip(autoThreads, { today: torontoToday(now), now, days: 7, limit: 8 });
  const byForum = newestPerForum(autoThreads, { per: 2, forums: 6, skip: new Set(tenders.map((x) => x.id)) });
  const shownIds = new Set([...startHere, ...tenders].map((x) => x.id));
  // Latest activity: member and staff threads (tenders have their own rows above).
  const activity = latestThreads.filter((x) => !x.isAuto && !shownIds.has(x.id)).slice(0, 8).map((th) => ({ th, forum: th.categorySlug }));
  const closes = (th: AutoThread) => (th.deadline ? fmt(q.closes, { date: formatDate(th.deadline, lang, { month: "short", day: "numeric" }) }) : null);

  const forumRow = (c: ForumCategory) => (
    <li key={c.slug}>
      <a href={L(`/forum/${c.slug}`)} className="flex items-start gap-3 px-4 py-3 hover:bg-[#F5F5FA]" lang={c.slug === "quebec" ? "fr-CA" : undefined}>
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#EEEFF6] text-[#282B59]"><ForumIcon slug={c.slug} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[#1B1D3A]">{t.categories[c.slug].name}</span>
          <span className="block truncate text-sm text-[#4B4F6B]">{t.categories[c.slug].blurb}</span>
          {c.lastThread && <span className="mt-0.5 block truncate text-xs text-[#4B4F6B]">{v.latest}: <span className="font-medium text-[#282B59]">{c.lastThread.title}</span></span>}
        </span>
        {shownCount(c.threadCount) != null && <span className="shrink-0 text-right text-xs tabular-nums text-[#4B4F6B]">{plural(c.threadCount, o.threadsIn)}</span>}
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
          {!search.asked && startHere.length > 0 && (
            <section className="wrap f-sec first" aria-labelledby="forum-start">
              <h2 className="h2" id="forum-start">{q.startHereTitle}</h2>
              <p className="mt-1 max-w-2xl text-sm text-[#4B4F6B]">{q.startHereLead}</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {startHere.map((g) => (
                  <li key={g.id}>
                    <a href={L(g.path)} className="flex h-full flex-col gap-2 rounded-2xl border-2 border-[#E3E4EE] bg-white p-4 hover:border-[#282B59]" lang={g.categorySlug === "quebec" ? "fr-CA" : undefined}>
                      <span className="inline-flex w-fit items-center gap-1 rounded bg-[#282B59] px-1.5 py-0.5 text-[11px] font-semibold text-white"><BookOpen className="size-3" aria-hidden /> {q.guide}</span>
                      <span className="font-bold leading-snug text-[#1B1D3A]">{g.title}</span>
                      <span className="mt-auto inline-flex items-center gap-1 text-xs text-[#4B4F6B]"><ForumIcon slug={g.categorySlug} className="size-3" /> {t.categories[g.categorySlug].name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!search.asked && tenders.length > 0 && (
            <section className="wrap f-sec" aria-labelledby="forum-tenders">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="h2" id="forum-tenders">{q.tendersTitle}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-[#4B4F6B]">{q.tendersLead}</p>
                </div>
                <a href={L("/rfps")} className="text-sm font-bold">{q.tendersAll} →</a>
              </div>
              <ul className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
                {tenders.map((th) => (
                  <li key={th.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
                    <a href={L(th.path)} className="flex h-full flex-col gap-2 rounded-2xl border-2 border-[#E3E4EE] bg-white p-4 hover:border-[#282B59]" lang={th.categorySlug === "quebec" ? "fr-CA" : undefined}>
                      <span className="inline-flex w-fit items-center gap-1 rounded bg-[#DDFBF0] px-1.5 py-0.5 text-[11px] font-semibold text-teal-800"><CalendarClock className="size-3" aria-hidden /> {closes(th)}</span>
                      <span className="line-clamp-3 font-semibold leading-snug text-[#1B1D3A]">{th.title}</span>
                      <span className="mt-auto inline-flex flex-wrap items-center gap-1 text-xs text-[#4B4F6B]"><ForumIcon slug={th.categorySlug} className="size-3" /> {t.categories[th.categorySlug].name}{th.region && <> · {th.region}</>}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!search.asked && byForum.length > 0 && (
            <section className="wrap f-sec" aria-labelledby="forum-byforum">
              <h2 className="h2" id="forum-byforum">{q.byForumTitle}</h2>
              <p className="mt-1 max-w-2xl text-sm text-[#4B4F6B]">{q.byForumLead}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {byForum.map(({ forum, threads }) => {
                  const slug = forum as ForumCategorySlug;
                  return (
                    <div key={forum} className="rounded-2xl border-2 border-[#E3E4EE] bg-white">
                      <a href={L(`/forum/${slug}`)} className="flex items-center gap-2 border-b-2 border-[#E3E4EE] px-4 py-2.5 font-bold text-[#1B1D3A] hover:bg-[#F5F5FA]">
                        <span className="grid size-7 place-items-center rounded-lg bg-[#EEEFF6] text-[#282B59]"><ForumIcon slug={slug} /></span>
                        {t.categories[slug].name}
                      </a>
                      <ul className="divide-y divide-[#E3E4EE]">
                        {threads.map((th) => (
                          <li key={th.id}>
                            <a href={L(th.path)} className="block px-4 py-2.5 hover:bg-[#F5F5FA]" lang={slug === "quebec" ? "fr-CA" : undefined}>
                              <span className="line-clamp-2 text-sm font-semibold text-[#1B1D3A]">{th.title}</span>
                              {closes(th) && <span className="text-xs text-[#4B4F6B]">{closes(th)}</span>}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className={`wrap f-sec${search.asked || (startHere.length === 0 && tenders.length === 0 && byForum.length === 0) ? " first" : ""}`} aria-labelledby="forum-latest">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <h2 className="h2" id="forum-latest">{search.asked ? (search.q ? fmt(o.searchTitle, { q: search.q }) : o.searchLabel) : activity.length > 0 ? o.latestTitle : o.searchLabel}</h2>
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
              activity.length > 0 && <ThreadList items={activity} empty={o.latestEmpty} />
            )}
          </section>

          {channels.map(({ ch, list }) => {
            const { active, quiet } = partitionForums(list);
            const threads = list.reduce((n, c) => n + c.threadCount, 0);
            return (
              <section key={ch} className="wrap f-sec" aria-labelledby={`ch-${ch}`}>
                <details open={active.length > 0} className="group overflow-hidden rounded-3xl border-2 border-[#E3E4EE] bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <span className="font-mono text-sm text-[#4B4F6B]" aria-hidden>{no(CHANNEL_ORDER.indexOf(ch) + 1)}</span>
                    <span className="min-w-0 flex-1">
                      <h2 className="text-xl font-extrabold text-[#1B1D3A]" id={`ch-${ch}`}>{t.channels[ch]}</h2>
                      <span className="block text-sm text-[#4B4F6B]">{v.channelBlurbs[ch]}</span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-[#4B4F6B] sm:block">{fmt(v.nBoards, { n: list.length })}{shownCount(threads) != null && <> · {plural(threads, o.threadsIn)}</>}</span>
                    <ChevronDown className="size-5 shrink-0 text-[#282B59] transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="border-t-2 border-[#E3E4EE]">
                    {active.length > 0 ? (
                      <ul className="divide-y divide-[#E3E4EE]">{active.map(forumRow)}</ul>
                    ) : (
                      <ul className="divide-y divide-[#E3E4EE]">{quiet.map(forumRow)}</ul>
                    )}
                    {active.length > 0 && quiet.length > 0 && (
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
