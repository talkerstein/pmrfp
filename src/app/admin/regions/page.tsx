import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { getRegions } from "@/lib/data/taxonomy";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { dash } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Regions · Admin · PMRFP" };

interface RegionRow {
  name: string;
  slug: string;
  province: string | null;
  active: boolean;
}

export default async function AdminRegionsPage() {
  await requireRole(["admin", "super_admin"]);

  let rows: RegionRow[];
  if (isDemoMode()) {
    const regions = await getRegions();
    rows = regions.map((r) => ({ name: r.name, slug: r.slug, province: r.province, active: true }));
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("regions")
      .select("name, slug, province, active")
      .order("sort_order")
      .returns<RegionRow[]>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Regions" description="Service areas vendors and RFPs are mapped to." />
      {isDemoMode() && <DemoBanner />}

      {rows.length === 0 ? (
        <EmptyState title="No regions yet" description="Service regions will appear here." />
      ) : (
        <AdminTable columns={["Name", "Slug", "Province", "Active"]}>
          {rows.map((r) => (
            <TableRow key={r.slug}>
              <TableCell className="font-medium">{dash(r.name)}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.slug}</TableCell>
              <TableCell className="text-muted-foreground">{dash(r.province)}</TableCell>
              <TableCell>{r.active ? "✓" : "—"}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
