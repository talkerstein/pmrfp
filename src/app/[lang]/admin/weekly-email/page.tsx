import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/admin/queries";
import { weeklyDigestEnabled } from "@/lib/digest/config";
import { setLangFrom } from "@/i18n/server";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { useD1Lifecycle } from "@/lib/lifecycle/d1";

export const metadata: Metadata = { title: "Weekly email · Admin · PMRFP" };

interface Row {
  email: string;
  country: string;
  province: string;
  trades: string[] | null;
  lang: string;
  status: string;
  source: string;
  created_at: string;
  confirmed_at: string | null;
  last_sent_at: string | null;
  sends: number;
}

/**
 * Admin: the free weekly email — is it on, how many confirmed subscribers
 * per country, the latest sign-ups. Read-only; the switch is the
 * WEEKLY_DIGEST_ENABLED env var.
 */
export default async function WeeklyEmailAdminPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const session = await requireRole(["admin", "super_admin"]);
  const native = useD1Lifecycle();
  if (native && session.profile.status !== "active") notFound();
  const demo = isDemoMode() || (!native && !isServiceConfigured());
  const enabled = weeklyDigestEnabled();

  let rows: Row[] = [];
  const nativeCounts = new Map<string, number>();
  let missing = false;
  if (native) {
    try {
      const db = vpsAppDatabase();
      const [subscribers, counts] = await db.batch([
        db.prepare(`SELECT email,country,province,trades,lang,status,source,created_at,confirmed_at,last_sent_at,sends
          FROM digest_subscribers ORDER BY created_at DESC,id LIMIT 100`),
        db.prepare("SELECT country,status,count(*) AS total FROM digest_subscribers GROUP BY country,status"),
      ]);
      if (!subscribers?.success || !counts?.success) throw new Error("Digest subscriber data unavailable");
      rows = (subscribers.results as unknown as (Omit<Row, "trades"> & { trades: string | null })[]).map(row => ({
        ...row, trades: row.trades ? JSON.parse(row.trades) : null,
      }));
      for (const row of counts.results) nativeCounts.set(`${row.country}:${row.status}`, Number(row.total));
    } catch {
      missing = true;
    }
  } else if (!demo) {
    const { data, error } = await createServiceClient()
      .from("digest_subscribers")
      .select("email,country,province,trades,lang,status,source,created_at,confirmed_at,last_sent_at,sends")
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<Row[]>();
    missing = Boolean(error);
    rows = data ?? [];
  }
  const count = (status: string, country: string) => native
    ? nativeCounts.get(`${country}:${status}`) ?? 0
    : rows.filter((r) => r.status === status && r.country === country).length;

  return (
    <>
      <PageHeader
        title="Weekly email"
        description="The free weekly email (major projects, open bids, recent awards by province/state and trade). Double opt-in; only confirmed subscribers get it."
      />
      {demo && <DemoBanner />}
      <p className={`mb-4 rounded-md px-3 py-2 text-sm ${enabled ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"}`}>
        {enabled
          ? "WEEKLY_DIGEST_ENABLED is on: the Tuesday cron sends. Sign-up forms are always live."
          : native ? "Weekly sends are paused. Sign-ups and confirmation emails continue on the VPS. Use the weekly digest dry run before enabling sends."
            : "WEEKLY_DIGEST_ENABLED is off: sign-ups are collected (pending, double opt-in; confirmation emails go out when Resend is configured) but no weekly email sends. Set it to 1 in Vercel (and redeploy) to start sending. /api/cron/weekly-digest?dry=1 previews a run."}
      </p>
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {native ? "Subscriber data could not be loaded. Refresh to try again." : "The digest_subscribers table is missing. Run supabase/migrations/20261013000010_growth_pack.sql."}
        </p>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {(["CA", "US"] as const).flatMap((c) =>
          (["active", "pending"] as const).map((s) => (
            <div key={`${c}${s}`} className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">{c === "CA" ? "Canada" : "U.S."} · {s === "active" ? "confirmed" : "pending"}</div>
              <div className="mt-1 text-2xl font-semibold">{missing ? "—" : count(s, c)}</div>
            </div>
          )),
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No subscribers yet" description="Sign-ups appear here once the forms are on." />
      ) : (
        <AdminTable columns={["Email", "Place", "Trades", "Lang", "Status", "Source", "Signed up", "Last sent"]}>
          {rows.slice(0, 100).map((r) => (
            <TableRow key={r.email}>
              <TableCell className="text-xs">{r.email}</TableCell>
              <TableCell className="text-xs">{r.province}, {r.country}</TableCell>
              <TableCell className="text-xs">{r.trades?.length ? r.trades.join(", ") : "all"}</TableCell>
              <TableCell className="text-xs">{r.lang}</TableCell>
              <TableCell className="text-xs font-semibold uppercase">{r.status}</TableCell>
              <TableCell className="text-xs">{r.source}</TableCell>
              <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
              <TableCell className="text-xs">{r.last_sent_at ? `${fmtDate(r.last_sent_at)} (${r.sends})` : "—"}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
