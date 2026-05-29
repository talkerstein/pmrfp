import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate, fmtMoney, dash } from "@/lib/admin/queries";
import type { Subscription } from "@/types/db";

export const metadata: Metadata = { title: "Subscriptions · Admin · PMRFP" };

type SubRow = Pick<
  Subscription,
  "id" | "organization_id" | "status" | "amount" | "currency" | "current_period_end" | "cancel_at_period_end"
>;

const DEMO_SUBS: SubRow[] = [
  { id: "1", organization_id: "Northline Electrical Ltd.", status: "active", amount: 249, currency: "CAD", current_period_end: "2027-05-18", cancel_at_period_end: false },
  { id: "2", organization_id: "Summit Mechanical (HVAC)", status: "comped", amount: 0, currency: "CAD", current_period_end: "2027-01-01", cancel_at_period_end: false },
  { id: "3", organization_id: "IronClad Roofing", status: "past_due", amount: 249, currency: "CAD", current_period_end: "2026-06-01", cancel_at_period_end: false },
  { id: "4", organization_id: "Vista Glass & Windows", status: "canceled", amount: 249, currency: "CAD", current_period_end: "2026-05-15", cancel_at_period_end: true },
];

export default async function AdminSubscriptionsPage() {
  await requireRole(["admin", "super_admin"]);

  let rows = DEMO_SUBS;
  if (!isDemoMode()) {
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

      {rows.length === 0 ? (
        <EmptyState title="No subscriptions yet" description="Paid and comped accounts will appear here." />
      ) : (
        <AdminTable columns={["Organization", "Status", "Amount", "Renews", "Cancels at period end"]}>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{dash(s.organization_id)}</TableCell>
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
