import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { ModButtons, ThreadForm } from "@/components/forum/forms";
import { AppointModForm } from "@/components/forum/admin-forms";
import { isMissingTable } from "@/lib/forum/data";
import { FORUM_CATEGORY_SLUGS } from "@/lib/forum/categories";
import { excerpt } from "@/lib/forum/text";
import { getDictionary } from "@/i18n/dictionaries";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Forum · Admin · PMRFP" };

interface QueueItem {
  type: "thread" | "post";
  id: string;
  status: string;
  title: string;
  body: string;
  author: string;
  flags: number;
  createdAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadQueue(): Promise<{ ready: boolean; items: QueueItem[] }> {
  if (!isServiceConfigured()) return { ready: false, items: [] };
  const db = createServiceClient();
  const [threads, posts] = await Promise.all([
    db.from("forum_threads").select("id,title,body,status,flag_count,created_at,author:forum_profiles!forum_threads_author_fkey(handle)").or("status.neq.approved,flag_count.gt.0").order("created_at", { ascending: false }).limit(100),
    db.from("forum_posts").select("id,body,status,flag_count,created_at,author:forum_profiles!forum_posts_author_fkey(handle),forum_threads(title)").or("status.neq.approved,flag_count.gt.0").order("created_at", { ascending: false }).limit(100),
  ]);
  if (threads.error && isMissingTable(threads.error)) return { ready: false, items: [] };
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);
  const items: QueueItem[] = [
    ...((threads.data ?? []) as any[]).map((r) => ({ type: "thread" as const, id: r.id, status: r.status, title: r.title, body: r.body, author: one(r.author)?.handle ?? "?", flags: r.flag_count, createdAt: r.created_at })),
    ...((posts.data ?? []) as any[]).map((r) => ({ type: "post" as const, id: r.id, status: r.status, title: one(r.forum_threads)?.title ?? "", body: r.body, author: one(r.author)?.handle ?? "?", flags: r.flag_count, createdAt: r.created_at })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ready: true, items };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Mod queue (held links, reported and hidden posts), community moderator
 * appointments, and the form for clearly labelled "PMRFP Staff" threads
 * (the seeding plan, spec 2.10). No content is seeded from code.
 */
export default async function AdminForumPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const { ready, items } = isDemoMode() ? { ready: false, items: [] } : await loadQueue();
  const names = getDictionary("en").forum.categories;
  const categories = FORUM_CATEGORY_SLUGS.map((slug) => ({ slug, name: names[slug].name }));

  return (
    <div className="space-y-10">
      <PageHeader title="Forum" description="Mod queue, community moderators and staff threads." />
      {isDemoMode() && <DemoBanner />}
      {!ready ? (
        <p className="text-sm text-muted-foreground">The forum tables aren&apos;t there yet. Apply supabase/migrations/20261006000002_forum.sql.</p>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-semibold">Mod queue ({items.length})</h2>
            {items.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing waiting.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {items.map((it) => (
                  <li key={`${it.type}-${it.id}`} className="space-y-2 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">{it.type}</span>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{it.status}</span>
                      {it.flags > 0 && <span className="text-xs text-destructive">{it.flags} reports</span>}
                      <span className="font-medium">{it.title}</span>
                      <span className="text-muted-foreground">by <Link href={`/forum/u/${it.author}`} className="hover:underline">@{it.author}</Link></span>
                    </div>
                    <p className="text-muted-foreground">{excerpt(it.body, 400)}</p>
                    <ModButtons type={it.type} id={it.id} ops={it.status === "approved" ? ["hide", "unhide"] : it.status === "held" ? ["approve", "hide"] : ["unhide"]} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Community moderators</h2>
            <p className="mt-1 text-sm text-muted-foreground">Appoint a member (Foreman+ with a clean record, per the spec) to a category. They appear in the forum header.</p>
            <div className="mt-3"><AppointModForm categories={categories} /></div>
          </section>

          <section className="max-w-2xl">
            <h2 className="text-lg font-semibold">Post a staff thread</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Posts under your account with a visible &quot;PMRFP Staff&quot; label. Use real questions only; never post as a fake persona.
            </p>
            <div className="mt-4"><ThreadForm categories={categories} firstPost={false} staffOption /></div>
          </section>
        </>
      )}
    </div>
  );
}
