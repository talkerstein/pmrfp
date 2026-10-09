import type { Metadata } from "next";
import { after } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "@/i18n/link";
import { CheckCircle2, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { MemberName, OpeningSoon, Pager, PostBody, RatingBar, VerifyPanel } from "@/components/forum/parts";
import { ModButtons, PostControls, RateThread, ReplyForm, ThreadReport } from "@/components/forum/forms";
import { getSession, isAdminRole } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { getThread, isCategoryMod, listPosts, listRelatedThreads, viewerPostCount, viewerState, type Post, type Thread } from "@/lib/forum/data";
import { isFrenchForum, tradeForForum } from "@/lib/forum/categories";
import { sessionCanPost } from "@/lib/forum/eligibility";
import { RANKS, isIndexableThread, pageCount, rankFor } from "@/lib/forum/rules";
import { excerpt, parseThreadParam } from "@/lib/forum/text";
import { threadSchema } from "@/lib/forum/schema";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getLang, getT } from "@/i18n/server";
import { AutoPostChip } from "@/components/forum/auto-chip";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { ForumIcon, GuideChip, ThreadList } from "@/components/forum/organize";
import { TenderCard } from "@/components/forum/tender-card";
import { getTenderContext } from "@/lib/forum/tender-context";
import { firstReplyPrompt, shownCount } from "@/lib/forum/quiet";

async function load(category: string, param: string) {
  const parsed = parseThreadParam(param);
  if (!parsed) return { ready: true as const, thread: null };
  const res = await getThread(parsed.shortId);
  if (!res.ready) return { ready: false as const };
  const thread = res.thread;
  if (!thread) return { ready: true as const, thread: null };
  return { ready: true as const, thread, canonical: thread.categorySlug === category && thread.slug === parsed.slug };
}

export async function threadMetadata(langParam: string, category: string, param: string, page: number): Promise<Metadata> {
  const l = hasLocale(langParam) ? langParam : "en";
  const res = await load(category, param);
  if (!res.ready || !res.thread) return { robots: { index: false, follow: true } };
  const th = res.thread;
  const t = getDictionary(l).forum;
  const path = page > 1 ? `${th.path}/page/${page}` : th.path;
  const indexable = isIndexableThread({ status: th.status, type: th.type, replyCount: th.replyCount, wordsTotal: th.wordsTotal, category: th.categorySlug, auto: th.isAuto });
  return {
    title: `${th.title}${page > 1 ? fmt(t.meta.pageSuffix, { n: page }) : ""} · ${t.categories[th.categorySlug].name}`,
    description: excerpt(th.body, 160),
    // Member content is English, so every language copy points at the English
    // URL, except French-first forums (Québec), whose threads canonicalize to /fr.
    alternates: { canonical: isFrenchForum(th.categorySlug) ? localizePath(path, "fr") : path },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: { type: "article", title: th.title, description: excerpt(th.body, 200) },
  };
}

function PostCard({
  p,
  thread,
  viewerId,
  voted,
  isMod,
  canAccept,
  highlight,
}: {
  p: Post;
  thread: Thread;
  viewerId: string | null;
  voted: boolean;
  isMod: boolean;
  canAccept: boolean;
  highlight?: boolean;
}) {
  const t = getT("forum");
  const lang = getLang();
  const own = viewerId != null && p.author?.userId === viewerId;
  return (
    <article id={`post-${p.id}`} className={cn("f-card", highlight && "ok")}>
      <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <MemberName m={p.author} staff={p.isStaff} showRank />
        <span className="text-xs text-muted-foreground">
          {p.isAccepted && (
            <span className="mr-2 inline-flex items-center gap-1 font-semibold text-teal-700">
              <CheckCircle2 className="size-3.5" /> {t.thread.accepted}
            </span>
          )}
          <time dateTime={p.createdAt}>{formatDate(p.createdAt, lang)}</time>
        </span>
      </header>
      <PostBody text={p.body} className="mt-3" />
      <footer className="mt-4">
        <PostControls
          postId={p.id}
          upvotes={p.upvoteCount}
          voted={voted}
          canVote={viewerId != null && !own}
          canAccept={thread.type === "question" && canAccept}
          accepted={p.isAccepted}
          canReport={viewerId != null && !own}
          isMod={isMod}
        />
      </footer>
    </article>
  );
}

export async function ThreadView({ category, param, page }: { category: string; param: string; page: number }) {
  const res = await load(category, param);
  if (!res.ready) return <OpeningSoon />;
  if (!res.thread) notFound();
  const thread = res.thread;
  if (!res.canonical) permanentRedirect(localizePath(page > 1 ? `${thread.path}/page/${page}` : thread.path, getLang()));

  const t = getT("forum");
  const lang = getLang();
  const pages = pageCount(thread.replyCount);
  if (page > pages) notFound();

  const session = await getSession();
  const viewerId = session?.userId ?? null;
  const isMod = session ? isAdminRole(session.profile.primary_role) || (await isCategoryMod(session.userId, thread.categoryId)) : false;
  const [{ posts, accepted }, related, tender] = await Promise.all([
    listPosts(thread, page),
    listRelatedThreads(thread.categoryId, thread.categorySlug, thread.id, 5),
    // Automatic tender threads: the real listing's facts + similar past awards.
    thread.isAuto && page === 1 ? getTenderContext(thread.id) : Promise.resolve(null),
  ]);
  const viewer = session
    ? await viewerState(await createClient(), session.userId, thread.id, posts.map((p) => p.id))
    : { rating: null, voted: new Set<string>() };
  let canPost = false;
  if (session) {
    const { data } = await (await createClient()).auth.getUser();
    canPost = await sessionCanPost(session, data.user);
  }
  // Votes, ratings, reports and replies all need a verified member.
  const actorId = canPost ? viewerId : null;
  const canAccept = actorId != null && (actorId === thread.author?.userId || isMod);

  if (page === 1) {
    after(async () => {
      try {
        await createReadClient().rpc("forum_bump_view", { tid: thread.id });
      } catch {
        /* view counts are best effort */
      }
    });
  }

  const cat = t.categories[thread.categorySlug];
  const trade = tradeForForum(thread.categorySlug);
  const answerWord = thread.type === "question" ? t.thread.answers : t.thread.replies;
  const op = thread.author?.userId === viewerId;
  const v = getT("v3Pages").forum;
  const q = t.quiet;
  const firstPrompt = firstReplyPrompt(thread);

  return (
    <>
      <JsonLd data={{ ...threadSchema(thread, posts, accepted), ...(isFrenchForum(thread.categorySlug) ? { inLanguage: "fr" } : {}) }} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "PMRFP", path: "/" },
          { name: t.forum, path: "/forum" },
          { name: cat.name, path: `/forum/${thread.categorySlug}` },
          { name: thread.title, path: thread.path },
        ])}
      />
      <div lang={isFrenchForum(thread.categorySlug) ? "fr-CA" : undefined}>
      <section className="f-band">
        <div className="wrap f-band-in">
          <nav className="f-crumbs" aria-label="Breadcrumb">
            <Link href="/forum">{t.forum}</Link>
            <span aria-hidden>/</span>
            <Link href={`/forum/${thread.categorySlug}`} className="inline-flex items-center gap-1"><ForumIcon slug={thread.categorySlug} className="size-3.5" />{cat.name}</Link>
            <span aria-hidden>/</span>
            <span aria-current="page" className="max-w-[40ch] truncate">{thread.title}</span>
          </nav>
          <div className="meta">
            <span className="on">{thread.type === "question" ? t.category.question : t.category.discussion}</span>
            <span>{cat.name}</span>
            {thread.hasAccepted && <span><CheckCircle2 className="size-3.5" /> {t.category.answered}</span>}
            {thread.isLocked && <span><Lock className="size-3.5" /> {t.category.locked}</span>}
          </div>
          <h1>{thread.title}</h1>
          <p className="lead" style={{ fontSize: 15 }}>
            {[
              shownCount(thread.replyCount) != null ? plural(thread.replyCount, answerWord) : null,
              shownCount(thread.viewCount) != null ? plural(thread.viewCount, t.thread.views) : null,
              fmt(t.thread.updated, { date: formatDate(thread.lastPostAt, lang) }),
              thread.region,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
      </section>
      <div className="wrap f-page">
      <div className="f-cols">
      <div className="main">
        {page === 1 && accepted && (
          <section className="f-card ok" aria-label={t.thread.bestAnswer}>
            <h2 className="f-pill">
              <CheckCircle2 className="size-4" /> {t.thread.bestAnswer}
            </h2>
            <PostBody text={accepted.body} className="mt-2" />
            <p className="mt-3 text-xs text-muted-foreground">
              {t.thread.by} <MemberName m={accepted.author} staff={accepted.isStaff} /> · {formatDate(accepted.createdAt, lang)}
            </p>
          </section>
        )}

        {page === 1 && (
          <article className="f-card op" style={{ marginTop: accepted ? 14 : 0 }}>
            <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="inline-flex flex-wrap items-center gap-2">
                <MemberName m={thread.author} staff={thread.isStaff && !thread.isAuto} showRank={!thread.isAuto && !thread.isGuide} />
                {thread.isAuto && <AutoPostChip lang={lang} full />}
                {thread.isGuide && <GuideChip />}
              </span>
              <time dateTime={thread.createdAt} className="text-xs text-muted-foreground">{fmt(t.thread.posted, { date: formatDate(thread.createdAt, lang) })}</time>
            </header>
            <PostBody text={thread.body} className="mt-3" />
            <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t.thread.rateThis}</p>
                <div className="flex items-center gap-4">
                  <RateThread threadId={thread.id} current={viewer.rating} canRate={actorId != null && !op} />
                  {thread.ratingCount > 0 && <RatingBar avg={thread.ratingAvg} count={thread.ratingCount} />}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {actorId && !op && <ThreadReport threadId={thread.id} />}
                {isMod && (
                  <ModButtons
                    type="thread"
                    id={thread.id}
                    ops={[thread.isPinned ? "unpin" : "pin", thread.isLocked ? "unlock" : "lock", "hide"]}
                  />
                )}
              </div>
            </footer>
          </article>
        )}

        {page === 1 && tender && <TenderCard ctx={tender} />}

        {/* No "0 replies" header on an empty thread: the reply box below invites the first one. */}
        {!firstPrompt && (
          <>
            <h2 className="f-hd2" style={{ marginTop: 40 }}>{plural(thread.replyCount, answerWord)}</h2>
            <div className="mt-4 space-y-3.5">
              {posts.length === 0 ? (
                <p className="text-muted-foreground">{t.thread.noReplies}</p>
              ) : (
                posts.map((p) => (
                  <PostCard key={p.id} p={p} thread={thread} viewerId={actorId} voted={viewer.voted.has(p.id)} isMod={isMod} canAccept={canAccept} highlight={p.isAccepted} />
                ))
              )}
            </div>
          </>
        )}
        <Pager base={thread.path} page={page} total={pages} />

        <section id="reply" className="mt-10 rounded-3xl bg-[#F5F5FA] p-5 sm:p-6">
          {firstPrompt && (
            <div className="mb-4">
              <h2 className="f-hd2">{firstPrompt === "answer" ? q.firstAnswer : q.firstReply}</h2>
              <p className="mt-1 text-sm text-[#4B4F6B]">{thread.isGuide ? q.firstGuideLead : q.firstLead}</p>
            </div>
          )}
          {thread.isLocked && !isMod ? (
            <p className="text-sm text-muted-foreground">{t.thread.lockedNote}</p>
          ) : !canPost ? (
            <VerifyPanel signedIn={Boolean(session)} next={thread.path} />
          ) : session ? (
            <ReplyForm threadId={thread.id} label={thread.type === "question" ? t.thread.yourAnswer : t.thread.yourReply} firstPost={(await viewerPostCount(session.userId)) === 0} />
          ) : (
            <div className="flex flex-wrap gap-3">
              <Link href={`/sign-in?next=${encodeURIComponent(thread.path)}`} className={buttonVariants()}>{t.thread.signInToReply}</Link>
              <Link href="/sign-up" className={buttonVariants({ variant: "outline" })}>{t.thread.joinToReply}</Link>
            </div>
          )}
        </section>

        <section className="mt-10" aria-labelledby="related-threads">
          <h2 id="related-threads" className="f-hd2">{t.org.related}</h2>
          <div className="mt-4">
            <ThreadList items={related.map((th) => ({ th }))} empty={t.org.relatedNone} />
          </div>
          <p className="mt-3 text-sm">
            <Link href={`/forum/${thread.categorySlug}`} className="font-bold">{fmt(t.org.browseForum, { name: cat.name })} →</Link>
          </p>
        </section>

        {trade && (
          <p className="mt-8 text-sm">
            <Link href={`/trades/${trade}`} className="font-bold">{fmt(t.thread.findTrades, { trade: cat.name })}</Link>
          </p>
        )}
      </div>
      <aside>
        {thread.isGuide && (
          <div className="f-side-mint">
            <div className="lb">{q.guide}</div>
            <div className="nm">{thread.author?.displayName}</div>
            <p style={{ marginTop: 8, fontSize: 14 }}>{q.guideNote}</p>
          </div>
        )}
        {thread.author && !thread.isAuto && !thread.isGuide && (
          <div className="f-side-mint">
            <div className="lb">{v.authorCard}</div>
            <div className="nm">{thread.author.displayName}</div>
            <div className="bars" aria-hidden>
              {[16, 26, 36, 46, 56].map((h, i) => <i key={h} className={i <= RANKS.findIndex((r) => r.slug === rankFor(thread.author!.reputation).rank) ? "on wave" : "wave"} style={{ height: h, animationDelay: `${i * 0.2}s` }} />)}
            </div>
            <div style={{ marginTop: 8, fontWeight: 700 }}>{fmt(v.rankPoints, { rank: t.ranks[rankFor(thread.author.reputation).rank], n: formatNumber(thread.author.reputation, lang) })}</div>
            <Link href={`/forum/u/${thread.author.handle}`}>{v.viewProfile}</Link>
          </div>
        )}
        <div className="f-side-ink">
          <div className="h">{v.differentQuestion}</div>
          <Link href={`/forum/${thread.categorySlug}/new?type=question`} className="btn mint">{t.org.askQuestion}</Link>
        </div>
      </aside>
      </div>
      </div>
      </div>
    </>
  );
}
