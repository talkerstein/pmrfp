import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate, dash } from "@/lib/admin/queries";
import type { Organization } from "@/types/db";
import { reviewOrganizationAction } from "@/lib/admin/org-actions";

export const metadata: Metadata = { title: "Organizations · Admin · PMRFP" };

type OrgRow = Pick<
  Organization,
  "id" | "name" | "organization_type" | "profile_status" | "verified" | "profile_completion_score" | "created_at"
>;

const DEMO_ORGS: OrgRow[] = [
  { id: "1", name: "Northline Electrical Ltd.", organization_type: "trade_company", profile_status: "approved", verified: true, profile_completion_score: 88, created_at: "2026-05-18" },
  { id: "2", name: "Demo Property Group", organization_type: "property_manager", profile_status: "approved", verified: true, profile_completion_score: 92, created_at: "2026-05-10" },
  { id: "3", name: "GTA SnowPro", organization_type: "trade_company", profile_status: "pending_review", verified: false, profile_completion_score: 54, created_at: "2026-05-22" },
  { id: "4", name: "Apex Asphalt & Concrete", organization_type: "trade_company", profile_status: "pending_review", verified: false, profile_completion_score: 61, created_at: "2026-05-21" },
];

export default async function AdminOrganizationsPage() {
  await requireRole(["admin", "super_admin"]);

  let rows = DEMO_ORGS;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("id, name, organization_type, profile_status, verified, profile_completion_score, created_at")
      .order("created_at", { ascending: false })
      .returns<OrgRow[]>();
    rows = data ?? [];
  }
  // Waiting companies first: they're invisible in the directory until approved.
  rows = [...rows].sort((a, b) => Number(b.profile_status === "pending_review") - Number(a.profile_status === "pending_review"));
  const pending = rows.filter((r) => r.profile_status === "pending_review").length;

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Trade companies and property managers. Approve, verify, and suspend profiles here."
      />
      {isDemoMode() && <DemoBanner />}

      <p className="mb-4 text-sm text-muted-foreground">
        {pending > 0
          ? `${pending} ${pending === 1 ? "company is" : "companies are"} waiting for approval and hidden from the directory until then.`
          : "No companies waiting for approval."}
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No organizations yet" description="Registered companies will appear here." />
      ) : (
        <AdminTable columns={["Name", "Type", "Profile", "Verified", "Completion", "Created", ""]}>
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">{dash(o.name)}</TableCell>
              <TableCell className="capitalize">{o.organization_type.replace(/_/g, " ")}</TableCell>
              <TableCell><StatusBadge status={o.profile_status} /></TableCell>
              <TableCell>{o.verified ? "✓" : "—"}</TableCell>
              <TableCell className="text-muted-foreground">{o.profile_completion_score}%</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(o.created_at)}</TableCell>
              <TableCell>
                {o.profile_status === "pending_review" && !isDemoMode() && (
                  <div className="flex gap-2">
                    <form action={reviewOrganizationAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <button className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90">
                        Approve
                      </button>
                    </form>
                    <form action={reviewOrganizationAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <button className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary">
                        Reject
                      </button>
                    </form>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
