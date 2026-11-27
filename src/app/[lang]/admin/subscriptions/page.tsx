import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate, fmtMoney, dash } from "@/lib/admin/queries";
import type { Subscription } from "@/types/db";
import { setLangFrom } from "@/i18n/server";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { activeRequestAdmin } from "@/lib/d1/customer-requests";
import { readD1 } from "@/lib/lifecycle/d1";

export const metadata: Metadata = { title: "Subscriptions · Admin · PMRFP" };

type SubRow = Pick<
  Subscription,
  "id" | "organization_id" | "status" | "amount" | "currency" | "current_period_end" | "cancel_at_period_end"
> & { organization_name?: string | null };

const DEMO_SUBS: SubRow[] = [
  { id: "1", organization_id: "Northline Electrical Ltd.", status: "active", amount: 249, currency: "CAD", current_period_end: "2027-05-18", cancel_at_period_end: false },
  { id: "2", organization_id: "Summit Mechanical (HVAC)", status: "comped", amount: 0, currency: "CAD", current_period_end: "2027-01-01", cancel_at_period_end: false },
  { id: "3", organization_id: "IronClad Roofing", status: "past_due", amount: 249, currency: "CAD", current_period_end: "2026-06-01", cancel_at_period_end: false },
  { id: "4", organization_id: "Vista Glass & Windows", status: "canceled", amount: 249, currency: "CAD", current_period_end: "2026-05-15", cancel_at_period_end: true },
];

export default async function AdminSubscriptionsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const admin = await requireRole(["admin", "super_admin"]);
  const native = isVpsLiveCustomerAuth();
  if (native && admin.profile.status !== "active") notFound();

  let rows = DEMO_SUBS;
  let unavailable = false;
  if (native) {
    try {
      type Row = Omit<SubRow, "cancel_at_period_end" | "amount"> & { cancel_at_period_end: number; amount: string | number | null };
      const nativeRows = await readD1<Row>(vpsAppDatabase(), `SELECT s.id,s.organization_id,s.status,s.amount,s.currency,
        s.current_period_end,s.cancel_at_period_end,o.name AS organization_name FROM subscriptions s
        LEFT JOIN organizations o ON o.id=s.organization_id
        WHERE ${activeRequestAdmin} ORDER BY s.created_at DESC,s.id LIMIT 1000`, admin.userId);
      rows = nativeRows.map((r) => ({ ...r, amount: r.amount == null ? null : Number(r.amount), cancel_at_period_end: r.cancel_at_period_end === 1 }));
    } catch {
      rows = [];
      unavailable = true;
    }
  } else if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("id, organization_id, status, amount, currency, current_period_end, cancel_at_period_end")
      .order("created_at", { ascending: false })
      .returns<SubRow[]>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Subscriptions" description="Trade access billing across all organizations." />
      {isDemoMode() && <DemoBanner />}

      {unavailable ? <EmptyState title="Subscriptions could not be loaded" description="Refresh to try again." /> : rows.length === 0 ? (
        <EmptyState title="No subscriptions yet" description="Paid and comped accounts will appear here." />
      ) : (
        <AdminTable columns={["Organization", "Status", "Amount", "Renews", "Cancels at period end"]}>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{dash(s.organization_name ?? s.organization_id)}</TableCell>
              <TableCell><StatusBadge status={s.status} /></TableCell>
              <TableCell>{fmtMoney(s.amount, s.currency)}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(s.current_period_end)}</TableCell>
              <TableCell className="text-muted-foreground">{s.cancel_at_period_end ? "Yes" : "—"}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
