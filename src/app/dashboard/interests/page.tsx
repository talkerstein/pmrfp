import Link from "next/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "My Interests" };

interface InterestRow {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  rfp_posts: { title: string; slug: string } | { title: string; slug: string }[] | null;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default async function InterestsPage() {
  const session = await requireRole(["trade"]);

  let interests: InterestRow[] = [];
  if (!isDemoMode() && session.organization) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("rfp_interests")
      .select("id,status,message,created_at, rfp_posts(title,slug)")
      .eq("trade_organization_id", session.organization.id)
      .order("created_at", { ascending: false });
    interests = (data as InterestRow[] | null) ?? [];
  }

  return (
    <div>
      <PageHeader
        title="My Interests"
        description="RFPs you've expressed interest in and their current status."
      />

      {interests.length === 0 ? (
        <EmptyState
          title="You haven't expressed interest in any RFPs yet"
          description="When you find a relevant opportunity, express interest to let the property manager know."
        >
          <Link href="/dashboard/rfps" className={buttonVariants()}>
            View RFP feed
          </Link>
        </EmptyState>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RFP</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interests.map((it) => {
                const rfp = Array.isArray(it.rfp_posts) ? it.rfp_posts[0] : it.rfp_posts;
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">
                      {rfp ? (
                        <Link href={`/rfps/${rfp.slug}`} className="hover:text-gold-700">
                          {rfp.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmt(it.created_at)}</TableCell>
                    <TableCell>
                      <StatusBadge status={it.status} />
                    </TableCell>
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
