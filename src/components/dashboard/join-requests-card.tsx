import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { decideJoinRequestAction } from "@/lib/dedupe/actions";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate } from "@/i18n/format";
import type { SessionContext } from "@/lib/access/access";

interface PendingRow {
  id: string;
  created_at: string;
  users_profile: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
}

/**
 * Dashboard: people who asked to join this company at onboarding
 * (lib/dedupe/join). Owners and admins of the company only. Renders nothing
 * when there are none, or before the join-request migration.
 */
export async function JoinRequestsCard({ session, back, flash }: { session: SessionContext; back: "/dashboard" | "/pm-dashboard" | "/buyer-dashboard"; flash?: string }) {
  const org = session.organization;
  if (!org || !isServiceConfigured()) return null;
  const t = getT("dedupeClient").card;
  const lang = getLang();
  const db = createServiceClient();
  const { data: me } = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", session.userId)
    .maybeSingle<{ role: string }>();
  if (!me || (me.role !== "owner" && me.role !== "admin")) return null;

  const { data, error } = await db
    .from("organization_join_requests")
    .select("id,created_at,users_profile:user_id(full_name,email)")
    .eq("organization_id", org.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);
  const rows = error ? [] : ((data ?? []) as unknown as PendingRow[]);
  const message = flash === "approved" ? t.approved : flash === "declined" ? t.declined : flash === "error" ? t.error : null;
  if (!rows.length && !message) return null;

  return (
    <section className="mb-6 rounded-xl border border-teal-200 bg-teal-50/60 p-5">
      {message && <p role="status" className="mb-3 text-sm font-medium text-teal-900">{message}</p>}
      {rows.length > 0 && (
        <>
          <h2 className="text-base font-semibold">{t.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{fmt(t.intro, { company: org.name })}</p>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
            {rows.map((r) => {
              const who = Array.isArray(r.users_profile) ? r.users_profile[0] : r.users_profile;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{who?.full_name || who?.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {who?.full_name ? `${who.email} · ` : ""}
                      {fmt(t.requested, { date: formatDate(r.created_at, lang) })}
                    </p>
                  </div>
                  <form action={decideJoinRequestAction} className="flex gap-2">
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="requestId" value={r.id} />
                    <button type="submit" name="decision" value="approve" className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800">
                      {t.approve}
                    </button>
                    <button type="submit" name="decision" value="decline" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                      {t.decline}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
