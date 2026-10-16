import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner, StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { isIntelRowActive } from "@/lib/entitlement/intel";
import { INTEL_PRICE_ENV, intelCheckoutEnabled } from "@/lib/intel/pricing";
import { grantIntelAction, revokeIntelAction } from "@/lib/admin/intel-actions";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Award Intelligence · Admin · PMRFP" };

interface Row {
  organization_id: string;
  status: string;
  source: string;
  billing_interval: string | null;
  currency: string | null;
  amount: number | null;
  current_period_end: string | null;
  expires_at: string | null;
  note: string | null;
  updated_at: string;
}

type SP = Promise<Record<string, string | undefined>>;

/** Admin: who has Award Intelligence (paid or granted), grant or revoke by hand. English only (admin screen). */
export default async function AdminIntelPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = await searchParams;
  const demo = isDemoMode() || !isServiceConfigured();

  let rows: Row[] = [];
  let missing = false;
  const orgs = new Map<string, { name: string; slug: string | null }>();
  if (!demo) {
    const db = createServiceClient();
    const { data, error } = await db
      .from("intel_access")
      .select("organization_id,status,source,billing_interval,currency,amount,current_period_end,expires_at,note,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1000)
      .returns<Row[]>();
    missing = isMissingTableError(error);
    rows = data ?? [];
    const ids = rows.map((r) => r.organization_id);
    if (ids.length) {
      const { data: o } = await db.from("organizations").select("id,name,slug").in("id", ids).returns<{ id: string; name: string; slug: string | null }[]>();
      for (const r of o ?? []) orgs.set(r.id, r);
    }
  }
  const now = new Date();
  const active = rows.filter((r) => isIntelRowActive(r, now));
  const paying = active.filter((r) => r.source === "stripe");
  const envState = Object.values(INTEL_PRICE_ENV).flatMap((byCur) => Object.values(byCur)).map((k) => `${k}: ${process.env[k] ? "set" : "missing"}`);

  return (
    <>
      <PageHeader
        title="Award Intelligence"
        description="Paid add-on, separate from Trade Pro. Grant it by hand for design partners or support; Stripe subscriptions show up here on their own."
      />
      {demo && <DemoBanner />}
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The intel_access table is missing, so nobody has Award Intelligence. Run supabase/migrations/20261017000001_intel_access.sql.
        </p>
      )}
      {sp.granted && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Granted to {sp.granted}.</p>}
      {sp.revoked && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Revoked.</p>}
      {sp.error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">Could not do that: {sp.error === "org" ? "no company with that slug or id" : sp.error === "date" ? "end date must be YYYY-MM-DD" : sp.error}</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Active now" value={active.length} />
        <StatCard label="Paying (Stripe)" value={paying.length} />
        <StatCard label="Granted (admin)" value={active.length - paying.length} />
      </div>
      <p className="mb-2 text-sm text-muted-foreground">
        Card checkout: {intelCheckoutEnabled() ? "ON" : "OFF (set INTEL_CHECKOUT_ENABLED=true to sell by card)"} · {envState.join(" · ")}
      </p>

      <form action={grantIntelAction} className="mb-8 flex flex-wrap items-end gap-3 rounded-md border p-4">
        <label className="flex flex-col text-sm">
          Company slug or id
          <input name="org" required className="rounded border px-2 py-1" placeholder="northline-electrical" />
        </label>
        <label className="flex flex-col text-sm">
          Ends on (optional)
          <input name="until" type="date" className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Note
          <input name="note" maxLength={500} className="rounded border px-2 py-1" placeholder="Design partner" />
        </label>
        <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">Grant Award Intelligence</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Nobody has Award Intelligence yet" description="Grants and Stripe subscriptions appear here." />
      ) : (
        <AdminTable columns={["Company", "Status", "From", "Plan", "Renews / ends", "Note", ""]}>
          {rows.map((r) => {
            const o = orgs.get(r.organization_id);
            const on = isIntelRowActive(r, now);
            return (
              <TableRow key={r.organization_id}>
                <TableCell className="max-w-[220px] truncate font-medium">{o?.name ?? r.organization_id}</TableCell>
                <TableCell>{on ? `On (${r.status})` : r.status}</TableCell>
                <TableCell>{r.source}</TableCell>
                <TableCell>{r.billing_interval ? `${r.billing_interval} · ${r.amount ?? "?"} ${r.currency ?? ""}` : "–"}</TableCell>
                <TableCell className="whitespace-nowrap">{(r.expires_at ?? r.current_period_end)?.slice(0, 10) ?? "–"}</TableCell>
                <TableCell className="max-w-[200px] truncate">{r.note ?? ""}</TableCell>
                <TableCell>
                  {r.source === "admin" && on && (
                    <form action={revokeIntelAction}>
                      <input type="hidden" name="id" value={r.organization_id} />
                      <button type="submit" className="text-sm font-semibold text-red-700 underline">Revoke</button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </AdminTable>
      )}
    </>
  );
}
