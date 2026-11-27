import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { readVpsAdminInterests, type AdminInterestRow } from "@/lib/d1/vps-bid-inbox";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate, dash } from "@/lib/admin/queries";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Interests · Admin · PMRFP" };

const DEMO_INTERESTS: AdminInterestRow[] = [
  { id: "1", status: "submitted", created_at: "2026-05-24", organizations: { name: "Northline Electrical Ltd." }, rfp_posts: { title: "Condominium Electrical Maintenance Contract" } },
  { id: "2", status: "shortlisted", created_at: "2026-05-22", organizations: { name: "Summit Mechanical (HVAC)" }, rfp_posts: { title: "Apartment Building HVAC Preventive Maintenance" } },
  { id: "3", status: "contact_revealed", created_at: "2026-05-20", organizations: { name: "GTA SnowPro" }, rfp_posts: { title: "Commercial Plaza Snow Removal Services" } },
  { id: "4", status: "declined", created_at: "2026-05-18", organizations: { name: "Apex Asphalt & Concrete" }, rfp_posts: { title: "Retail Property Parking Lot Asphalt Repair" } },
];

export default async function AdminInterestsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const session = await requireRole(["admin", "super_admin"]);

  let rows = DEMO_INTERESTS;
  if (isVpsLiveCustomerAuth()) {
    rows = await readVpsAdminInterests(session.userId);
  } else if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("rfp_interests")
      .select("id, status, created_at, organizations(name), rfp_posts(title)")
      .order("created_at", { ascending: false })
      .returns<AdminInterestRow[]>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Interests" description="Vendor expressions of interest across all RFPs." />
      {isDemoMode() && <DemoBanner />}

      {rows.length === 0 ? (
        <EmptyState title="No interests yet" description="Vendor submissions will appear here." />
      ) : (
        <AdminTable columns={["Vendor", "RFP", "Status", "Submitted"]}>
          {rows.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="font-medium">{dash(i.organizations?.name)}</TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground">
                {dash(i.rfp_posts?.title)}
              </TableCell>
              <TableCell><StatusBadge status={i.status} /></TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(i.created_at)}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
