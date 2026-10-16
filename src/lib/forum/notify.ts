import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE } from "@/lib/site";
import { localizePath } from "@/i18n/config";
import { sendForumReplyEmail } from "@/lib/email/send";
import { canonicalRoom, isFrenchForum } from "./categories";
import { excerpt } from "./text";
import { threadPath } from "./data";
import { forumUnsubscribeUrl, shouldNotify } from "./notify-rules";
import { SYSTEM_HANDLE } from "./auto-threads";
import { TEAM_HANDLE } from "./staff-guides";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");

/**
 * Email the thread's author about a new approved reply, when their
 * preferences allow it (notify-rules.ts). Best effort: never throws, and
 * does nothing until the rework migration (preference column + log table)
 * is applied.
 */
export async function notifyThreadAuthor(db: SupabaseClient, p: { threadId: string; replierId: string; replyBody: string }): Promise<void> {
  try {
    const { data: t } = await db
      .from("forum_threads")
      .select("id,title,slug,short_id,status,author_id,category:forum_categories(slug),author:forum_profiles!forum_threads_author_fkey(handle,is_system)")
      .eq("id", p.threadId)
      .maybeSingle();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const th = t as any;
    if (!th || th.status !== "approved") return;
    const author = Array.isArray(th.author) ? th.author[0] : th.author;
    const room = canonicalRoom((Array.isArray(th.category) ? th.category[0] : th.category)?.slug);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (!room) return;
    const authorIsSystem = Boolean(author?.is_system) || author?.handle === SYSTEM_HANDLE || author?.handle === TEAM_HANDLE;

    const [prefs, log, replier, profile] = await Promise.all([
      db.from("notification_preferences").select("forum_replies,channel_email").eq("user_id", th.author_id).maybeSingle<{ forum_replies: string | null; channel_email: boolean | null }>(),
      db.from("forum_reply_notifications").select("last_sent_at,sent_count").eq("user_id", th.author_id).eq("thread_id", th.id).maybeSingle<{ last_sent_at: string; sent_count: number }>(),
      db.from("forum_profiles").select("display_name").eq("user_id", p.replierId).maybeSingle<{ display_name: string }>(),
      db.from("users_profile").select("email,status").eq("id", th.author_id).maybeSingle<{ email: string; status: string }>(),
    ]);
    // Before the migration the column / table don't exist: send nothing.
    if (prefs.error || log.error) return;
    if (!profile.data?.email || profile.data.status !== "active") return;
    if (
      !shouldNotify({
        threadAuthorId: th.author_id,
        replierId: p.replierId,
        authorIsSystem,
        pref: prefs.data?.forum_replies,
        channelEmail: prefs.data?.channel_email,
        lastSentAt: log.data?.last_sent_at,
      })
    )
      return;

    // Claim the slot first, so two replies at once send one email.
    const now = new Date().toISOString();
    const claim = log.data
      ? await db.from("forum_reply_notifications").update({ last_sent_at: now, sent_count: (log.data.sent_count ?? 0) + 1 }).eq("user_id", th.author_id).eq("thread_id", th.id).eq("last_sent_at", log.data.last_sent_at).select("thread_id")
      : await db.from("forum_reply_notifications").insert({ user_id: th.author_id, thread_id: th.id, last_sent_at: now }).select("thread_id");
    if (claim.error || !claim.data?.length) return;

    const lang = isFrenchForum(room) ? "fr" : "en";
    await sendForumReplyEmail(profile.data.email, {
      threadTitle: th.title,
      replierName: replier.data?.display_name ?? (lang === "fr" ? "Un membre" : "A member"),
      excerpt: excerpt(p.replyBody, 280),
      url: `${BASE}${localizePath(threadPath(room, th.slug, th.short_id), lang)}#reply`,
      unsubscribeUrl: forumUnsubscribeUrl(BASE, th.author_id),
      lang,
    });
  } catch (err) {
    console.error("[forum/notify]", err instanceof Error ? err.message : err);
  }
}
