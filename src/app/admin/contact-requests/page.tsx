import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate, dash } from "@/lib/admin/queries";
import type { ContactRequest } from "@/types/db";

export const metadata: Metadata = { title: "Contact Requests · Admin · PMRFP" };

type RequestRow = Pick<
  ContactRequest,
  "id" | "request_type" | "requester_name" | "requester_email" | "status" | "created_at"
>;

const DEMO_REQUESTS: RequestRow[] = [
  { id: "1", request_type: "directory_intro", requester_name: "Marcus Webb", requester_email: "marcus@demopg.com", status: "new", created_at: "2026-05-25" },
  { id: "2", request_type: "property_manager_help", requester_name: "Sandra Liu", requester_email: "sandra@maplecourt.ca", status: "contacted", created_at: "2026-05-23" },
  { id: "3", request_type: "general_contact", requester_name: "Tom Riley", requester_email: "tom@example.com", status: "closed", created_at: "2026-05-20" },
  { id: "4", request_type: "vendor_question", requester_name: "—", requester_email: "noreply@spam.io", status: "spam", created_at: "2026-05-19" },
];

export default async function AdminContactRequestsPage() {
  await requireRole(["admin", "super_admin"]);

  let rows = DEMO_REQUESTS;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("contact_requests")
      .select("id, request_type, requester_name, requester_email, status, created_at")
      .order("created_at", { ascending: false })
      .returns<RequestRow[]>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Contact Requests" description="Inbound intros and help requests from the public site." />
      {isDemoMode() && <DemoBanner />}

      {rows.length === 0 ? (
        <EmptyState title="No contact requests yet" description="Inbound messages will appear here." />
      ) : (
        <AdminTable columns={["Type", "Name", "Email", "Status", "Received"]}>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="capitalize">{c.request_type.replace(/_/g, " ")}</TableCell>
              <TableCell className="font-medium">{dash(c.requester_name)}</TableCell>
              <TableCell className="text-muted-foreground">{dash(c.requester_email)}</TableCell>
              <TableCell><StatusBadge status={c.status} /></TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(c.created_at)}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
