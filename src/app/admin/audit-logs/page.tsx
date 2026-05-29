import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate, dash } from "@/lib/admin/queries";
import type { AuditLog } from "@/types/db";

export const metadata: Metadata = { title: "Audit Logs · Admin · PMRFP" };

type AuditRow = Pick<AuditLog, "id" | "action" | "entity_type" | "created_at">;

export default async function AdminAuditLogsPage() {
  await requireRole(["admin", "super_admin"]);

  let rows: AuditRow[] = [];
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<AuditRow[]>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Audit Logs" description="The 100 most recent platform actions." />
      {isDemoMode() && <DemoBanner />}

      {rows.length === 0 ? (
        <EmptyState
          title="No audit entries yet"
          description="Moderation and administrative actions will be recorded here."
        />
      ) : (
        <AdminTable columns={["Action", "Entity", "When"]}>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{dash(a.action)}</TableCell>
              <TableCell className="capitalize text-muted-foreground">
                {a.entity_type ? a.entity_type.replace(/_/g, " ") : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(a.created_at)}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
