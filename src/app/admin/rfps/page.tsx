import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate, dash } from "@/lib/admin/queries";
import type { RfpPost } from "@/types/db";

export const metadata: Metadata = { title: "RFPs · Admin · PMRFP" };

type RfpRow = Pick<RfpPost, "id" | "title" | "status" | "deadline" | "source_type" | "created_at">;

const DEMO_RFPS: RfpRow[] = [
  { id: "1", title: "Condominium Electrical Maintenance Contract", status: "published", deadline: "2026-07-15", source_type: "property_manager_direct", created_at: "2026-05-15" },
  { id: "2", title: "Commercial Plaza Snow Removal Services", status: "pending_review", deadline: "2026-09-30", source_type: "admin_seeded", created_at: "2026-05-22" },
  { id: "3", title: "Apartment Building HVAC Preventive Maintenance", status: "published", deadline: "2026-08-01", source_type: "property_manager_direct", created_at: "2026-05-10" },
  { id: "4", title: "Retail Property Parking Lot Asphalt Repair", status: "draft", deadline: "2026-07-31", source_type: "admin_seeded", created_at: "2026-05-24" },
];

export default async function AdminRfpsPage() {
  await requireRole(["admin", "super_admin"]);

  let rows = DEMO_RFPS;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("rfp_posts")
      .select("id, title, status, deadline, source_type, created_at")
      .order("created_at", { ascending: false })
      .returns<RfpRow[]>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader
        title="RFPs"
        description="Every posted opportunity. Review, publish, and seed new RFPs."
        action={
          <Link href="/admin/rfps/new" className={buttonVariants({ size: "lg" })}>
            New RFP
          </Link>
        }
      />
      {isDemoMode() && <DemoBanner />}

      {rows.length === 0 ? (
        <EmptyState
          title="No RFPs yet"
          description="Posted and seeded opportunities will appear here."
        >
          <Link href="/admin/rfps/new" className={buttonVariants({ size: "lg" })}>
            Seed an RFP
          </Link>
        </EmptyState>
      ) : (
        <AdminTable columns={["Title", "Status", "Deadline", "Source", "Created"]}>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-xs truncate font-medium">{dash(r.title)}</TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(r.deadline)}</TableCell>
              <TableCell className="capitalize text-muted-foreground">
                {r.source_type.replace(/_/g, " ")}
              </TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
