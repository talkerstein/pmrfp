import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner, StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { isMissingTableError, trialState } from "@/lib/entitlement/trial";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Trade Pro trials · Admin · PMRFP" };

interface TrialRow {
  organization_id: string;
  started_by: string | null;
  started_at: string;
  ends_at: string;
  source: string;
}

/**
 * Admin: every 14-day Trade Pro trial (newest first), whether it's running
 * or ended, and whether the company went on to pay. Read-only.
 */
export default async function TrialsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const demo = isDemoMode() || !isServiceConfigured();

  let trials: TrialRow[] = [];
  let missing = false;
  const orgs = new Map<string, { name: string; slug: string | null; city: string | null; province: string | null }>();
  const paid = new Set<string>();
  if (!demo) {
    const db = createServiceClient();
    const { data, error } = await db
      .from("trade_trials")
      .select("organization_id,started_by,started_at,ends_at,source")
      .order("started_at", { ascending: false })
      .limit(1000)
      .returns<TrialRow[]>();
    missing = isMissingTableError(error);
    trials = data ?? [];
    const ids = trials.map((t) => t.organization_id);
    if (ids.length) {
      const [o, s] = await Promise.all([
        db.from("organizations").select("id,name,slug,city,province").in("id", ids).returns<{ id: string; name: string; slug: string | null; city: string | null; province: string | null }[]>(),
        db.from("subscriptions").select("organization_id,status").in("organization_id", ids).returns<{ organization_id: string; status: string }[]>(),
      ]);
      for (const r of o.data ?? []) orgs.set(r.id, r);
      for (const r of s.data ?? []) if (r.status === "active" || r.status === "comped") paid.add(r.organization_id);
    }
  }

  const now = new Date();
  const rows = trials.map((t) => ({ ...t, state: trialState({ startedAt: t.started_at, endsAt: t.ends_at }, now) }));
  const active = rows.filter((r) => r.state.status === "active").length;
  const ended = rows.length - active;
  const converted = rows.filter((r) => paid.has(r.organization_id)).length;

  return (
    <>
      <PageHeader
        title="Trade Pro trials"
        description="14-day trials, no card, one per company. A running trial counts as Trade Pro everywhere; when it ends the company is free again unless it paid."
      />
      {demo && <DemoBanner />}
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The trade_trials table is missing, so trials are off. Run supabase/migrations/20261016000001_trade_trials.sql.
        </p>
      )}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <StatCard label="Trials started" value={rows.length} />
        <StatCard label="Running now" value={active} />
        <StatCard label="Ended" value={ended} />
        <StatCard label="Now paying" value={converted} hint={rows.length ? `${Math.round((converted / rows.length) * 100)}% of trials` : undefined} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No trials yet" description="Trials show up here as soon as a trade company starts one." />
      ) : (
        <AdminTable columns={["Started", "Company", "Where", "From", "Ends", "Status", "Paying"]}>
          {rows.map((r) => {
            const o = orgs.get(r.organization_id);
            return (
              <TableRow key={r.organization_id}>
                <TableCell className="whitespace-nowrap">{r.started_at.slice(0, 10)}</TableCell>
                <TableCell className="max-w-[220px] truncate font-medium">{o?.name ?? r.organization_id}</TableCell>
                <TableCell className="max-w-[180px] truncate">{[o?.city, o?.province].filter(Boolean).join(", ") || "–"}</TableCell>
                <TableCell>{r.source}</TableCell>
                <TableCell className="whitespace-nowrap">{r.ends_at.slice(0, 10)}</TableCell>
                <TableCell>{r.state.status === "active" ? `Running · ${r.state.daysLeft}d left` : "Ended"}</TableCell>
                <TableCell>{paid.has(r.organization_id) ? "Yes" : "–"}</TableCell>
              </TableRow>
            );
          })}
        </AdminTable>
      )}
    </>
  );
}
