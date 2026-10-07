import type { Metadata } from "next";
import Link from "@/i18n/link";
import { MessagesSquare } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { ForumHero, OpeningSoon } from "@/components/forum/parts";
import { getForumIndex, type ForumCategory } from "@/lib/forum/data";
import { CHANNEL_ORDER, FORUM_CHANNELS } from "@/lib/forum/categories";
import { RANKS } from "@/lib/forum/rules";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).forum.meta;
  return { title: t.indexTitle, description: t.indexDescription, alternates: alternatesFor(l, "/forum") };
}

export default async function ForumIndexPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("forum");
  const idx = await getForumIndex();

  // A channel with none of its categories present (e.g. not seeded yet) is hidden, not shown empty.
  const section = (title: string, slugs: readonly string[], cats: ForumCategory[]) => !slugs.some((s) => cats.some((c) => c.slug === s)) ? null : (
    <section className="mt-10">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t.index.colForum}</th>
              <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">{t.index.colThreads}</th>
              <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">{t.index.colPosts}</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">{t.index.colLast}</th>
            </tr>
          </thead>
          <tbody>
            {slugs.map((slug) => {
              const c = cats.find((x) => x.slug === slug);
              if (!c) return null;
              const name = t.categories[c.slug].name;
              return (
                <tr key={slug} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <Link href={`/forum/${slug}`} className="font-semibold text-foreground hover:underline">{name}</Link>
                    <p className="mt-0.5 text-muted-foreground">{t.categories[c.slug].blurb}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.index.modsLabel}{" "}
                      {c.mods.length
                        ? c.mods.map((m, i) => (
                            <span key={m.handle}>
                              {i > 0 && ", "}
                              <Link href={`/forum/u/${m.handle}`} className="hover:underline">{m.displayName}</Link>
                            </span>
                          ))
                        : <em>{t.index.modOpen}</em>}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                      {fmt(t.category.stats, { threads: c.threadCount, posts: c.postCount })}
                    </p>
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{formatNumber(c.threadCount, lang)}</td>
                  <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{formatNumber(c.postCount, lang)}</td>
                  <td className="hidden max-w-64 px-4 py-3 md:table-cell">
                    {c.lastThread ? (
                      <>
                        <Link href={c.lastThread.path} className="line-clamp-1 hover:underline">{c.lastThread.title}</Link>
                        <span className="text-xs text-muted-foreground">
                          {c.lastThread.lastUser ? `${fmt(t.index.by, { name: c.lastThread.lastUser })} · ` : ""}
                          {c.lastPostAt ? formatDate(c.lastPostAt, lang) : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t.index.noPosts}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "PMRFP", path: "/" }, { name: t.forum, path: "/forum" }])} />
      <ForumHero eyebrow={t.index.eyebrow} title={t.index.title} lead={t.index.lead}>
        {idx.ready && (
          <div className="mt-6">
            <Link href="/forum/job-site-stories/new" className={cn(buttonVariants({ variant: "accent" }), "gap-2")}>
              <MessagesSquare className="size-4" /> {t.category.newThread}
            </Link>
          </div>
        )}
      </ForumHero>
      {!idx.ready ? (
        <OpeningSoon />
      ) : (
        <Container className="grid gap-10 pb-16 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            {CHANNEL_ORDER.map((ch) => (
              <div key={ch}>{section(t.channels[ch], FORUM_CHANNELS[ch], idx.categories)}</div>
            ))}
          </div>
          <aside className="space-y-6 lg:mt-10">
            <div className="rounded-xl border border-border p-5">
              <h2 className="font-bold">{t.index.ranksTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.index.ranksLead}</p>
              <ol className="mt-3 space-y-1.5 text-sm">
                {RANKS.map((r) => (
                  <li key={r.slug} className="flex justify-between">
                    <span>{t.ranks[r.slug]}</span>
                    <span className="tabular-nums text-muted-foreground">{formatNumber(r.min, lang)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-border p-5">
              <h2 className="font-bold">{t.index.rulesTitle}</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                {t.index.rules.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          </aside>
        </Container>
      )}
    </>
  );
}
