import Link from "@/i18n/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLang, getT } from "@/i18n/server";
import { formatDate } from "@/i18n/format";

interface NoticeRow {
  id: string;
  type: string | null;
  message: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * The member's latest in-app notifications (table notifications, read as
 * themselves): new responses for a poster; picked / declined / not selected /
 * contact shared and new matching jobs for a trade. Hidden when there are none.
 */
export async function RecentUpdates({ userId, types, limit = 6 }: { userId: string; types?: readonly string[]; limit?: number }) {
  const t = getT("pmJobs").notices;
  const lang = getLang();
  let rows: NoticeRow[] = [];
  try {
    const supabase = await createClient();
    let q = supabase.from("notifications").select("id,type,message,link_url,read_at,created_at").eq("user_id", userId);
    if (types?.length) q = q.in("type", [...types]);
    const { data } = await q.order("created_at", { ascending: false }).limit(limit);
    rows = (data as NoticeRow[] | null) ?? [];
  } catch {
    rows = [];
  }
  if (!rows.length) return null;
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5" data-updates={rows.length}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Bell className="size-4" /> {t.title}
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((n) => {
          const label = (n.type && t.types[n.type]) || t.fallback;
          const body = (
            <>
              <span className="block text-sm font-medium">
                {!n.read_at && <span className="mr-1.5 inline-block size-2 rounded-full bg-teal-500 align-middle" aria-hidden />}
                {label}
              </span>
              {n.message && <span className="block truncate text-sm text-muted-foreground">{n.message}</span>}
            </>
          );
          return (
            <li key={n.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                {n.link_url?.startsWith("/") ? (
                  <Link href={n.link_url} className="hover:text-teal-700">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(n.created_at, lang, { month: "short", day: "numeric" })}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The poster's notices (PM dashboard). */
export const POSTER_NOTICE_TYPES = ["pm_new_response", "rfp_published", "rfp_rejected"] as const;
/** A trade's notices about its responses and new jobs (trade dashboard). */
export const TRADE_NOTICE_TYPES = ["response_picked", "response_declined", "response_not_selected", "response_contact_shared", "rfp_alert"] as const;
