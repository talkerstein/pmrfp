import type { Metadata } from "next";
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
  await requireRole(["admin", "super_admin"]);
  const demo = isDemoMode() || !isServiceConfigured();
  const enabled = weeklyDigestEnabled();

  let rows: Row[] = [];
  let missing = false;
  if (!demo) {
    const { data, error } = await createServiceClient()
      .from("digest_subscribers")
      .select("email,country,province,trades,lang,status,source,created_at,confirmed_at,last_sent_at,sends")
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<Row[]>();
    missing = Boolean(error);
    rows = data ?? [];
  }
  const count = (status: string, country: string) => rows.filter((r) => r.status === status && r.country === country).length;

  return (
    <>
      <PageHeader
        title="Weekly email"
        description="The free weekly email (major projects, open bids, recent awards by province/state and trade). Double opt-in; only confirmed subscribers get it."
      />
      {demo && <DemoBanner />}
      <p className={`mb-4 rounded-md px-3 py-2 text-sm ${enabled ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"}`}>
        {enabled
          ? "WEEKLY_DIGEST_ENABLED is on: sign-up forms are live and the Tuesday cron sends."
          : "WEEKLY_DIGEST_ENABLED is off: no sign-up forms, no emails. Set it to 1 in Vercel (and redeploy) to turn it on. /api/cron/weekly-digest?dry=1 previews a run."}
      </p>
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The digest_subscribers table is missing. Run supabase/migrations/20261013000010_growth_pack.sql.
        </p>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {(["CA", "US"] as const).flatMap((c) =>
          (["active", "pending"] as const).map((s) => (
            <div key={`${c}${s}`} className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">{c === "CA" ? "Canada" : "U.S."} · {s === "active" ? "confirmed" : "pending"}</div>
              <div className="mt-1 text-2xl font-semibold">{count(s, c)}</div>
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
