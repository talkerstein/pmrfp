import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate, dash } from "@/lib/admin/queries";
import { DEMO_RESOURCES } from "@/lib/demo-data";
import type { ResourceArticle } from "@/types/db";

export const metadata: Metadata = { title: "Resources · Admin · PMRFP" };

type ResourceRow = Pick<ResourceArticle, "id" | "title" | "slug" | "status" | "published_at">;

export default async function AdminResourcesPage() {
  await requireRole(["admin", "super_admin"]);

  let rows: ResourceRow[];
  if (isDemoMode()) {
    rows = DEMO_RESOURCES.map((r) => ({
      id: r.slug,
      title: r.title,
      slug: r.slug,
      status: "published" as const,
      published_at: r.publishedAt,
    }));
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("resources")
      .select("id, title, slug, status, published_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .returns<ResourceRow[]>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Resources" description="Guides and articles published to the public resource library." />
      {isDemoMode() && <DemoBanner />}

      <p className="mb-4 text-sm text-muted-foreground">
        Articles are authored and edited in the CMS; this view tracks publication status.
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No resources yet" description="Published articles will appear here." />
      ) : (
        <AdminTable columns={["Title", "Slug", "Status", "Published"]}>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-xs truncate font-medium">{dash(r.title)}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.slug}</TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(r.published_at)}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
