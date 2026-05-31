import Link from "next/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { CloseRfpButton } from "@/components/dashboard/close-rfp-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Interested Vendors" };

type OrgRel = { name: string; slug: string; city: string | null; province: string | null };

interface InterestRow {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  contact_revealed: boolean;
  organizations: OrgRel | OrgRel[] | null;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default async function RfpInterestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["property_manager"]);
  const { id } = await params;

  let interests: InterestRow[] = [];
  let rfpStatus: string | null = null;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const [{ data: ints }, { data: rfp }] = await Promise.all([
      supabase
        .from("rfp_interests")
        .select("id,status,message,created_at,contact_revealed, organizations(name,slug,city,province)")
        .eq("rfp_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("rfp_posts")
        .select("status")
        .eq("id", id)
        .maybeSingle<{ status: string }>(),
    ]);
    interests = (ints as InterestRow[] | null) ?? [];
    rfpStatus = rfp?.status ?? null;
  }

  const closed = rfpStatus === "awarded" || rfpStatus === "closed" || rfpStatus === "archived";

  return (
    <div>
      <PageHeader
        title="Interested vendors"
        description="Trades that have expressed interest in this RFP."
      />

      {!isDemoMode() && (
        <div className="mb-6">
          <CloseRfpButton rfpId={id} alreadyClosed={closed} />
        </div>
      )}

      {interests.length === 0 ? (
        <EmptyState
          title="No vendors have expressed interest yet"
          description="Once trades express interest in this RFP, they'll appear here for you to review."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interests.map((it) => {
                const org = Array.isArray(it.organizations) ? it.organizations[0] : it.organizations;
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">
                      {org ? (
                        <Link href={`/directory/${org.slug}`} className="hover:text-teal-700">
                          {org.name}
                          {org.city && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {[org.city, org.province].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-muted-foreground">
                      {it.message ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={it.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmt(it.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
