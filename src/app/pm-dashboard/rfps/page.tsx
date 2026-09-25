import Link from "next/link";
import { Code2, Plus } from "lucide-react";
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

export const metadata = { title: "My RFPs" };

interface PostRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  deadline: string | null;
  created_at: string;
}

function fmt(d: string | null) {
  if (!d) return "Open";
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PmRfpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const sp = await searchParams;

  let posts: PostRow[] = [];
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("rfp_posts")
      .select("id,title,slug,status,deadline,created_at")
      .eq("posted_by_user_id", session.userId)
      .order("created_at", { ascending: false });
    posts = (data as PostRow[] | null) ?? [];
  }

  return (
    <div>
      <PageHeader
        title="My RFPs"
        description="Every project you've posted and where it stands."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/widgets?w=bids" className={buttonVariants({ variant: "outline" })}>
              <Code2 className="size-4" /> Show on your website
            </Link>
            <Link href="/pm-dashboard/rfps/new" className={buttonVariants()}>
              <Plus className="size-4" /> Post an RFP
            </Link>
          </div>
        }
      />

      {sp.posted === "1" && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>RFP submitted.</strong> It&apos;s now pending review and will be published once approved.
        </div>
      )}

      {posts.length === 0 ? (
        <EmptyState
          title="You haven't posted any RFPs yet"
          description="Post your first project to start connecting with qualified trades."
        >
          <Link href="/pm-dashboard/rfps/new" className={buttonVariants()}>
            Post an RFP
          </Link>
        </EmptyState>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead className="text-right">Interests</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmt(p.deadline)}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/pm-dashboard/rfps/${p.id}/interests`}
                      className="font-medium text-primary hover:underline"
                    >
                      View vendors
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
