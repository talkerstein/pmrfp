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
import { setLangFrom } from "@/i18n/server";
import { adminConvertVisitorAction } from "@/lib/auth/visitor-upgrade-actions";

export const metadata: Metadata = { title: "Users · Admin · PMRFP" };

const DEMO_USERS: Pick<
  UserProfile,
  "id" | "full_name" | "email" | "primary_role" | "status" | "created_at" | "onboarding_completed"
>[] = [
  { id: "1", full_name: "Daniela Cruz", email: "daniela@northline.ca", primary_role: "trade", status: "active", created_at: "2026-05-20", onboarding_completed: true },
  { id: "2", full_name: "Marcus Webb", email: "marcus@demopg.com", primary_role: "property_manager", status: "active", created_at: "2026-05-12", onboarding_completed: true },
  { id: "3", full_name: "Priya Anand", email: "priya@summitmech.ca", primary_role: "trade", status: "suspended", created_at: "2026-04-30", onboarding_completed: false },
  { id: "5", full_name: "Fresh One Cleaning", email: "info@freshonecleaning.ca", primary_role: "visitor", status: "active", created_at: "2026-10-10", onboarding_completed: true },
  { id: "4", full_name: "Admin User", email: "admin@pmrfp.com", primary_role: "admin", status: "active", created_at: "2026-01-04", onboarding_completed: true },
];

export default async function AdminUsersPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);

  let rows = DEMO_USERS;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("users_profile")
      .select("id, full_name, email, primary_role, status, created_at, onboarding_completed")
      .order("created_at", { ascending: false })
      .returns<typeof DEMO_USERS>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Users" description="Everyone with a PMRFP account. A business that signed up as “Just looking” (visitor) can be switched to a trade or supplier here: their company setup opens the next time they sign in. No email is sent." />
      {isDemoMode() && <DemoBanner />}

      {rows.length === 0 ? (
        <EmptyState title="No users yet" description="New signups will appear here." />
      ) : (
        <AdminTable columns={["Name", "Email", "Role", "Onboarding", "Status", "Joined", ""]}>
          {rows.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{dash(u.full_name)}</TableCell>
              <TableCell className="text-muted-foreground">{dash(u.email)}</TableCell>
              <TableCell className="capitalize">{u.primary_role === "visitor" ? "Visitor (just looking)" : u.primary_role.replace(/_/g, " ")}</TableCell>
              <TableCell className="text-muted-foreground">{u.onboarding_completed ? "Done" : "Not finished"}</TableCell>
              <TableCell><StatusBadge status={u.status} /></TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(u.created_at)}</TableCell>
              <TableCell>
                {u.primary_role === "visitor" && (
                  <form action={adminConvertVisitorAction} className="flex flex-wrap gap-1.5">
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" name="role" value="trade" className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted">Convert to trade</button>
                    <button type="submit" name="role" value="supplier" className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted">Supplier</button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
