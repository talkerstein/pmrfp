import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/admin/queries";
import { adjustKarmaAction, reverseKarmaEventAction, runKarmaSyncAction } from "@/lib/karma/actions";
import { getOrgReputation } from "@/lib/karma/data";
import { ADMIN_ADJUST_MAX, LEVELS } from "@/lib/karma/rules";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Reputation · Admin · PMRFP" };

type SP = Promise<Record<string, string | undefined>>;

interface Row {
  org_id: string;
  raw_points: number;
  score: number;
  level: number;
  decay: number;
  last_earned_at: string | null;
  updated_at: string;
  organizations: { name: string; organization_type: string; profile_status: string; is_demo: boolean } | null;
}

const LEVEL_NAME: Record<number, string> = Object.fromEntries(LEVELS.map((l) => [l.level, l.slug]));
const input = "rounded-md border border-border bg-background px-2 py-1 text-sm";
const btn = "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90";
const btnLine = "rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary";

/**
 * Admin: every company's reputation, one company's ledger, manual
 * adjustments and abuse reversals (both need a written reason and land in
 * audit_logs), and the sync/backfill (dry run first).
 */
export default async function AdminKarmaPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = await searchParams;
  const demo = isDemoMode() || !isServiceConfigured();

  let rows: Row[] = [];
  let missing = false;
  if (!demo) {
    const { data, error } = await createServiceClient()
      .from("org_karma")
      .select("org_id,raw_points,score,level,decay,last_earned_at,updated_at,organizations(name,organization_type,profile_status,is_demo)")
      .order("score", { ascending: false })
      .limit(300)
      .returns<Row[]>();
    missing = Boolean(error);
    rows = data ?? [];
  }
  const byLevel = LEVELS.map((l) => ({ ...l, n: rows.filter((r) => r.level === l.level && r.organizations?.profile_status === "approved" && !r.organizations?.is_demo).length }));
  const org = sp.org && /^[0-9a-f-]{36}$/i.test(sp.org) ? sp.org : null;
  const rep = org ? await getOrgReputation(org) : null;
  const orgName = org ? rows.find((r) => r.org_id === org)?.organizations?.name ?? org : null;

  return (
    <>
      <PageHeader
        title="Reputation"
        description="Company reputation levels (public) and scores (private). Points come only from verifiable actions; the nightly cron re-derives them from real data."
      />
      {demo && <DemoBanner />}
      {sp.ok && <p className="mb-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">{sp.ok}</p>}
      {sp.error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">{sp.error}</p>}
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The karma tables are missing. Run supabase/migrations/20261010000001_karma.sql, then a dry run below.
        </p>
      )}

      <section className="mb-8 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Sync / backfill</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Re-derives every company&apos;s ledger from real data (adds new points, claws back points whose source is gone) and recomputes levels with decay.
          Run the dry run first: it writes nothing and shows what would change.
        </p>
        <div className="mt-3 flex gap-2">
          <form action={runKarmaSyncAction}>
            <input type="hidden" name="mode" value="dry" />
            <button className={btnLine} disabled={demo}>Dry run</button>
          </form>
          <form action={runKarmaSyncAction}>
            <input type="hidden" name="mode" value="apply" />
            <button className={btn} disabled={demo}>Apply</button>
          </form>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Listed companies by level: {byLevel.map((l) => `L${l.level} ${l.slug}: ${l.n}`).join(" · ")}
        </p>
      </section>

      {org && rep && (
        <section className="mb-8 rounded-lg border border-border bg-card p-5" data-section="ledger">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Ledger: {orgName}</h2>
            <Link href="/admin/karma" className="text-xs text-primary">Close</Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Score {rep.score} (raw {rep.raw}, decay ×{rep.decay}) · level {rep.level} {LEVEL_NAME[rep.level]} · last earned {rep.lastEarnedAt ? fmtDate(rep.lastEarnedAt) : "never"}
          </p>
          <form action={adjustKarmaAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="orgId" value={org} />
            <label className="text-xs">Points<br /><input name="points" type="number" min={-ADMIN_ADJUST_MAX} max={ADMIN_ADJUST_MAX} required className={`${input} w-24`} /></label>
            <label className="text-xs">Reason (required, kept in the audit log)<br /><input name="reason" required minLength={3} maxLength={500} className={`${input} w-80`} /></label>
            <button className={btn}>Add adjustment</button>
          </form>
          {rep.ledger.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No ledger entries.</p>
          ) : (
            <AdminTable columns={["When", "Kind", "Points", "Counted", "Status", ""]}>
              {rep.ledger.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{fmtDate(e.createdAt)}</TableCell>
                  <TableCell>{e.kind}{e.reason ? <span className="block text-xs text-muted-foreground">{e.reason}</span> : null}</TableCell>
                  <TableCell>{e.points}</TableCell>
                  <TableCell>{e.counted}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.reversed ? `reversed: ${e.reversedReason ?? ""}` : e.capped ? `capped (${e.capped})` : "counted"}</TableCell>
                  <TableCell>
                    {!e.reversed && (
                      <form action={reverseKarmaEventAction} className="flex gap-1">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="orgId" value={org} />
                        <input name="reason" required minLength={3} placeholder="Abuse reason" className={`${input} w-36`} />
                        <button className={btnLine}>Reverse</button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </AdminTable>
          )}
        </section>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No scores yet" description="Run the dry run, then Apply, to compute every company's reputation from real data." />
      ) : (
        <AdminTable columns={["Company", "Type", "Level", "Score", "Raw", "Decay", "Last earned", ""]}>
          {rows.map((r) => (
            <TableRow key={r.org_id}>
              <TableCell className="font-medium">
                {r.organizations?.name ?? r.org_id}
                {r.organizations?.is_demo && <span className="ml-1 text-xs text-muted-foreground">(demo)</span>}
                {r.organizations && r.organizations.profile_status !== "approved" && <span className="ml-1 text-xs text-muted-foreground">({r.organizations.profile_status})</span>}
              </TableCell>
              <TableCell className="capitalize">{r.organizations?.organization_type.replace(/_/g, " ") ?? "—"}</TableCell>
              <TableCell>{r.level} · {LEVEL_NAME[r.level]}</TableCell>
              <TableCell className="tabular-nums">{r.score}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{r.raw_points}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">×{Number(r.decay)}</TableCell>
              <TableCell className="text-muted-foreground">{r.last_earned_at ? fmtDate(r.last_earned_at) : "—"}</TableCell>
              <TableCell><Link href={`/admin/karma?org=${r.org_id}`} className="text-xs font-semibold text-primary">Ledger / adjust</Link></TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
