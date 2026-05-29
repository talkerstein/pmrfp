import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate, dash } from "@/lib/admin/queries";
import type { UserProfile } from "@/types/db";

export const metadata: Metadata = { title: "Users · Admin · PMRFP" };

const DEMO_USERS: Pick<
  UserProfile,
  "id" | "full_name" | "email" | "primary_role" | "status" | "created_at"
>[] = [
  { id: "1", full_name: "Daniela Cruz", email: "daniela@northline.ca", primary_role: "trade", status: "active", created_at: "2026-05-20" },
  { id: "2", full_name: "Marcus Webb", email: "marcus@demopg.com", primary_role: "property_manager", status: "active", created_at: "2026-05-12" },
  { id: "3", full_name: "Priya Anand", email: "priya@summitmech.ca", primary_role: "trade", status: "suspended", created_at: "2026-04-30" },
  { id: "4", full_name: "Admin User", email: "admin@pmrfp.com", primary_role: "admin", status: "active", created_at: "2026-01-04" },
];

export default async function AdminUsersPage() {
  await requireRole(["admin", "super_admin"]);

  let rows = DEMO_USERS;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("users_profile")
      .select("id, full_name, email, primary_role, status, created_at")
      .order("created_at", { ascending: false })
      .returns<typeof DEMO_USERS>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Users" description="Everyone with a PMRFP account." />
      {isDemoMode() && <DemoBanner />}

      {rows.length === 0 ? (
        <EmptyState title="No users yet" description="New signups will appear here." />
      ) : (
        <AdminTable columns={["Name", "Email", "Role", "Status", "Joined"]}>
          {rows.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{dash(u.full_name)}</TableCell>
              <TableCell className="text-muted-foreground">{dash(u.email)}</TableCell>
              <TableCell className="capitalize">{u.primary_role.replace(/_/g, " ")}</TableCell>
              <TableCell><StatusBadge status={u.status} /></TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(u.created_at)}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
