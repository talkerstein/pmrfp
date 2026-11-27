import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { getRegions } from "@/lib/data/taxonomy";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { dash } from "@/lib/admin/queries";
import { setLangFrom } from "@/i18n/server";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { activeRequestAdmin } from "@/lib/d1/customer-requests";
import { readD1 } from "@/lib/lifecycle/d1";

export const metadata: Metadata = { title: "Regions · Admin · PMRFP" };

interface RegionRow {
  name: string;
  slug: string;
  province: string | null;
  active: boolean;
}

export default async function AdminRegionsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const admin = await requireRole(["admin", "super_admin"]);
  const native = isVpsLiveCustomerAuth();
  if (native && admin.profile.status !== "active") notFound();

  let rows: RegionRow[];
  let unavailable = false;
  if (native) {
    try {
      const results = await readD1<Omit<RegionRow, "active"> & { active: number }>(vpsAppDatabase(),
        `SELECT name,slug,province,active FROM regions WHERE ${activeRequestAdmin} ORDER BY sort_order,slug LIMIT 1000`, admin.userId);
      rows = results.map(row => ({ ...row, active: row.active === 1 }));
    } catch {
      rows = [];
      unavailable = true;
    }
  } else if (isDemoMode()) {
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

      {unavailable ? <EmptyState title="Regions could not be loaded" description="Refresh to try again." /> : rows.length === 0 ? (
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
