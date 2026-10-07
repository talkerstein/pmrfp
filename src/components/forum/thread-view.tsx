import type { Metadata } from "next";
import { after } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "@/i18n/link";
import { CheckCircle2, Lock } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { MemberName, OpeningSoon, Pager, PostBody, RatingBar } from "@/components/forum/parts";
import { ModButtons, PostControls, RateThread, ReplyForm, ThreadReport } from "@/components/forum/forms";
import { getSession, isAdminRole } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { getThread, isCategoryMod, listPosts, viewerPostCount, viewerState, type Post, type Thread } from "@/lib/forum/data";
import { tradeForForum } from "@/lib/forum/categories";
import { isIndexableThread, pageCount } from "@/lib/forum/rules";
import { excerpt, parseThreadParam } from "@/lib/forum/text";
import { threadSchema } from "@/lib/forum/schema";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getLang, getT } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt, formatDate, plural } from "@/i18n/format";
import { cn } from "@/lib/utils";

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
  const indexable = isIndexableThread({ status: th.status, type: th.type, replyCount: th.replyCount, wordsTotal: th.wordsTotal });
  return {
    title: `${th.title}${page > 1 ? fmt(t.meta.pageSuffix, { n: page }) : ""} · ${t.categories[th.categorySlug].name}`,
    description: excerpt(th.body, 160),
    // Member content is English-only: every language copy points at the English URL.
    alternates: { canonical: path },
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
    <article id={`post-${p.id}`} className={cn("rounded-xl border p-5", highlight ? "border-teal-500 bg-teal-50/40 dark:bg-teal-500/5" : "border-border")}>
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
  const { posts, accepted } = await listPosts(thread, page);
  const viewer = session
    ? await viewerState(await createClient(), session.userId, thread.id, posts.map((p) => p.id))
    : { rating: null, voted: new Set<string>() };
  const canAccept = viewerId != null && (viewerId === thread.author?.userId || isMod);

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

  return (
    <>
      <JsonLd data={threadSchema(thread, posts, accepted)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "PMRFP", path: "/" },
          { name: t.forum, path: "/forum" },
          { name: cat.name, path: `/forum/${thread.categorySlug}` },
          { name: thread.title, path: thread.path },
        ])}
      />
      <Container className="max-w-4xl py-8 pb-16">
        <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/forum" className="hover:underline">{t.forum}</Link>
          {" / "}
          <Link href={`/forum/${thread.categorySlug}`} className="hover:underline">{cat.name}</Link>
        </nav>

        <h1 className="mt-3 text-balance text-2xl font-extrabold tracking-tight md:text-3xl">{thread.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{thread.type === "question" ? t.category.question : t.category.discussion}</span>
          <span>{plural(thread.replyCount, answerWord)}</span>
          <span>{plural(thread.viewCount, t.thread.views)}</span>
          <span>{fmt(t.thread.updated, { date: formatDate(thread.lastPostAt, lang) })}</span>
          {thread.region && <span>{thread.region}</span>}
          {thread.isLocked && <span className="inline-flex items-center gap-1"><Lock className="size-3.5" /> {t.category.locked}</span>}
        </div>

        {page === 1 && accepted && (
          <section className="mt-6 rounded-xl border-2 border-teal-500 bg-teal-50/50 p-5 dark:bg-teal-500/5" aria-label={t.thread.bestAnswer}>
            <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
              <CheckCircle2 className="size-4" /> {t.thread.bestAnswer}
            </h2>
            <PostBody text={accepted.body} className="mt-2" />
            <p className="mt-3 text-xs text-muted-foreground">
              {t.thread.by} <MemberName m={accepted.author} staff={accepted.isStaff} /> · {formatDate(accepted.createdAt, lang)}
            </p>
          </section>
        )}

        {page === 1 && (
          <article className="mt-6 rounded-xl border border-border p-5">
            <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <MemberName m={thread.author} staff={thread.isStaff} showRank />
              <time dateTime={thread.createdAt} className="text-xs text-muted-foreground">{fmt(t.thread.posted, { date: formatDate(thread.createdAt, lang) })}</time>
            </header>
            <PostBody text={thread.body} className="mt-3" />
            <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t.thread.rateThis}</p>
                <div className="flex items-center gap-4">
                  <RateThread threadId={thread.id} current={viewer.rating} canRate={viewerId != null && !op} />
                  <RatingBar avg={thread.ratingAvg} count={thread.ratingCount} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {viewerId && !op && <ThreadReport threadId={thread.id} />}
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

        <h2 className="mt-10 text-lg font-bold">{plural(thread.replyCount, answerWord)}</h2>
        <div className="mt-4 space-y-4">
          {posts.length === 0 ? (
            <p className="text-muted-foreground">{t.thread.noReplies}</p>
          ) : (
            posts.map((p) => (
              <PostCard key={p.id} p={p} thread={thread} viewerId={viewerId} voted={viewer.voted.has(p.id)} isMod={isMod} canAccept={canAccept} highlight={p.isAccepted} />
            ))
          )}
        </div>
        <Pager base={thread.path} page={page} total={pages} />

        <section className="mt-10 rounded-xl border border-border bg-muted/30 p-5">
          {thread.isLocked && !isMod ? (
            <p className="text-sm text-muted-foreground">{t.thread.lockedNote}</p>
          ) : session ? (
            <ReplyForm threadId={thread.id} label={thread.type === "question" ? t.thread.yourAnswer : t.thread.yourReply} firstPost={(await viewerPostCount(session.userId)) === 0} />
          ) : (
            <div className="flex flex-wrap gap-3">
              <Link href={`/sign-in?next=${encodeURIComponent(thread.path)}`} className={buttonVariants()}>{t.thread.signInToReply}</Link>
              <Link href="/sign-up" className={buttonVariants({ variant: "outline" })}>{t.thread.joinToReply}</Link>
            </div>
          )}
        </section>

        {trade && (
          <p className="mt-8 text-sm">
            <Link href={`/trades/${trade}`} className="text-primary hover:underline">{fmt(t.thread.findTrades, { trade: cat.name })}</Link>
          </p>
        )}
      </Container>
    </>
  );
}
