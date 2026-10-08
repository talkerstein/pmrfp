import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/i18n/link";
import { CircleHelp, Lock, MapPin, MessagesSquare, Pin, ShieldCheck } from "lucide-react";
import { Container } from "@/components/container";
import { ForumHero, MemberName, OpeningSoon, Pager, RatingBar } from "@/components/forum/parts";
import { getCategoryRow, listCategoryThreads, type ThreadSummary } from "@/lib/forum/data";
import { isForumCategory } from "@/lib/forum/categories";
import { PAGE_SIZE, isIndexableListPage, pageCount } from "@/lib/forum/rules";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getLang, getT } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { alternatesFor } from "@/i18n/metadata";
import { cn } from "@/lib/utils";
import { ForumIcon, SortTabs, ThreadBadges } from "@/components/forum/organize";
import { sortQuery, timeAgo, type ThreadSort } from "@/lib/forum/organize";

export function categoryMetadata(langParam: string, category: string, page: number): Metadata {
  const l = hasLocale(langParam) ? langParam : "en";
  if (!isForumCategory(category)) return {};
  const t = getDictionary(l).forum;
  const c = t.categories[category];
  const path = page > 1 ? `/forum/${category}/page/${page}` : `/forum/${category}`;
  return {
    title: fmt(t.meta.categoryTitle, { name: c.name }) + (page > 1 ? fmt(t.meta.pageSuffix, { n: page }) : ""),
    description: fmt(t.meta.categoryDescription, { blurb: c.blurb }),
    // Each page is self-canonical; deep list pages stay out of the index.
    alternates: page > 1 ? { canonical: localizePath(path, l) } : alternatesFor(l, path),
    robots: isIndexableListPage(page) ? undefined : { index: false, follow: true },
  };
}

function ThreadRow({ th, pinned }: { th: ThreadSummary; pinned?: boolean }) {
  const t = getT("forum");
  const lang = getLang();
  const pages = pageCount(th.replyCount);
  return (
    <tr className={cn("border-t border-border align-top", pinned && "bg-amber-50/50 dark:bg-amber-500/5")}>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {pinned && <Pin className="size-3.5 text-amber-600" aria-label={t.category.pinned} />}
          {th.isLocked && <Lock className="size-3.5 text-muted-foreground" aria-label={t.category.locked} />}
          <Link href={th.path} className="font-semibold text-foreground hover:underline">{th.title}</Link>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ThreadBadges th={th} />
          {th.region && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" aria-hidden />{th.region}</span>}
          {th.isStaff && <span className="inline-flex items-center gap-0.5"><ShieldCheck className="size-3" /> {t.category.staff}</span>}
          {pages > 1 && (
            <span className="inline-flex gap-1">
              {Array.from({ length: Math.min(pages, 4) }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={n === 1 ? th.path : `${th.path}/page/${n}`} className="hover:underline">{n}</Link>
              ))}
              {pages > 4 && (
                <>… <Link href={`${th.path}/page/${pages}`} className="hover:underline">{pages}</Link></>
              )}
            </span>
          )}
          <span className="md:hidden">· <MemberName m={th.author} /> · {formatNumber(th.replyCount, lang)} · {timeAgo(th.lastPostAt, lang)}</span>
        </div>
      </td>
      <td className="hidden px-3 py-3 text-sm md:table-cell"><MemberName m={th.author} staff={th.isStaff} /></td>
      <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{formatNumber(th.replyCount, lang)}</td>
      <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{formatNumber(th.viewCount, lang)}</td>
      <td className="hidden px-3 py-3 lg:table-cell"><RatingBar avg={th.ratingAvg} count={th.ratingCount} /></td>
      <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
        {th.lastUser && <Link href={`/forum/u/${th.lastUser.handle}`} className="block text-foreground hover:underline">{th.lastUser.displayName}</Link>}
        <time dateTime={th.lastPostAt} title={formatDate(th.lastPostAt, lang)}>{timeAgo(th.lastPostAt, lang)}</time>
      </td>
    </tr>
  );
}

export async function CategoryView({ category, page, sort = "latest" }: { category: string; page: number; sort?: ThreadSort }) {
  if (!isForumCategory(category)) notFound();
  const t = getT("forum");
  const res = await getCategoryRow(category);
  const c = t.categories[category];
  if (!res.ready) {
    return (
      <>
        <ForumHero eyebrow={t.forum} title={c.name} lead={c.blurb} crumbs={[{ label: t.forum, href: "/forum" }, { label: c.name }]} />
        <OpeningSoon />
      </>
    );
  }
  const { pinned, threads, total } = await listCategoryThreads(res.category.id, category, page, sort);
  const pages = pageCount(total, PAGE_SIZE);
  if (page > pages && !(page === 1 && sort !== "latest")) notFound();
  const base = `/forum/${category}`;

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "PMRFP", path: "/" }, { name: t.forum, path: "/forum" }, { name: c.name, path: base }])} />
      <ForumHero eyebrow={t.forum} title={c.name} lead={c.blurb} icon={<ForumIcon slug={category} className="size-5" />} crumbs={[{ label: t.forum, href: "/forum" }, { label: c.name }]}>
        <div className="meta">
          <span>
            {t.index.modsLabel}{" "}
            {res.category.mods.length
              ? res.category.mods.map((m, i) => (
                  <span key={m.handle}>
                    {i > 0 && ", "}
                    <Link href={`/forum/u/${m.handle}`} style={{ color: "#91F2CF" }}>{m.displayName}</Link>
                  </span>
                ))
              : t.index.modOpen}
          </span>
          <span className="on">{fmt(t.category.stats, { threads: res.category.threadCount, posts: res.category.postCount })}</span>
        </div>
        <div className="acts">
          <Link href={`${base}/new?type=question`} className="btn mint">
            <CircleHelp className="size-4" /> {t.org.askQuestion}
          </Link>
          <Link href={`${base}/new?type=discussion`} className="btn ghost">
            <MessagesSquare className="size-4" /> {t.category.newThread}
          </Link>
          <Link href="/forum" className="btn ghost">{t.category.back}</Link>
        </div>
      </ForumHero>
      <Container className="f-page">
        {category === "client-talk" && (
          <p className="mb-4 flex items-start gap-2 rounded-2xl border-2 border-amber-500/50 bg-amber-50/60 px-5 py-4 text-sm">
            <Pin className="mt-0.5 size-4 shrink-0 text-amber-600" /> {t.clientTalkRule}
          </p>
        )}
        {res.category.threadCount > 0 && <SortTabs base={base} current={sort} />}
        {pinned.length + threads.length === 0 ? (
          <p className="rounded-3xl border-2 border-dashed border-[#D5D7E6] px-6 py-14 text-center text-[#4B4F6B]">{sort === "latest" ? t.category.empty : t.org.tabEmpty}</p>
        ) : (
          <div className="overflow-hidden rounded-3xl border-2 border-[#E3E4EE]">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5FA] text-left font-mono text-xs uppercase tracking-[0.08em] text-[#4B4F6B]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t.category.colTopic}</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">{t.category.colAuthor}</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">{t.category.colReplies}</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">{t.category.colViews}</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">{t.category.colRating}</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">{t.category.colLast}</th>
                </tr>
              </thead>
              <tbody>
                {pinned.map((th) => <ThreadRow key={th.id} th={th} pinned />)}
                {threads.map((th) => <ThreadRow key={th.id} th={th} />)}
              </tbody>
            </table>
          </div>
        )}
        <Pager base={base} page={page} total={pages} query={sortQuery(sort)} />
      </Container>
    </>
  );
}
