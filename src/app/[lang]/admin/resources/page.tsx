import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
import { setLangFrom } from "@/i18n/server";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { activeRequestAdmin } from "@/lib/d1/customer-requests";
import { readD1 } from "@/lib/lifecycle/d1";

export const metadata: Metadata = { title: "Resources · Admin · PMRFP" };

type ResourceRow = Pick<ResourceArticle, "id" | "title" | "slug" | "status" | "published_at">;

export default async function AdminResourcesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const admin = await requireRole(["admin", "super_admin"]);
  const native = isVpsLiveCustomerAuth();
  if (native && admin.profile.status !== "active") notFound();

  let rows: ResourceRow[];
  let unavailable = false;
  if (native) {
    try {
      rows = await readD1<ResourceRow>(vpsAppDatabase(), `SELECT id,title,slug,status,published_at FROM resources
        WHERE is_demo=0 AND ${activeRequestAdmin} ORDER BY published_at DESC NULLS LAST,slug LIMIT 1000`, admin.userId);
    } catch {
      rows = [];
      unavailable = true;
    }
  } else if (isDemoMode()) {
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

      {unavailable ? <EmptyState title="Publication status could not be loaded" description="Refresh to try again." /> : rows.length === 0 ? (
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
