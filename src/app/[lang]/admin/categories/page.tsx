import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data/taxonomy";
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

export const metadata: Metadata = { title: "Categories · Admin · PMRFP" };

interface CategoryRow {
  name: string;
  slug: string;
  active: boolean;
}

export default async function AdminCategoriesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const admin = await requireRole(["admin", "super_admin"]);
  const native = isVpsLiveCustomerAuth();
  if (native && admin.profile.status !== "active") notFound();

  let rows: CategoryRow[];
  let unavailable = false;
  if (native) {
    try {
      const results = await readD1<Omit<CategoryRow, "active"> & { active: number }>(vpsAppDatabase(),
        `SELECT name,slug,active FROM trade_categories WHERE ${activeRequestAdmin} ORDER BY sort_order,slug LIMIT 1000`, admin.userId);
      rows = results.map(row => ({ ...row, active: row.active === 1 }));
    } catch {
      rows = [];
      unavailable = true;
    }
  } else if (isDemoMode()) {
    const cats = await getCategories();
    rows = cats.map((c) => ({ name: c.name, slug: c.slug, active: true }));
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("trade_categories")
      .select("name, slug, active")
      .order("sort_order")
      .returns<CategoryRow[]>();
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Trade Categories" description="The taxonomy vendors and RFPs are classified by." />
      {isDemoMode() && <DemoBanner />}

      {unavailable ? <EmptyState title="Trade categories could not be loaded" description="Refresh to try again." /> : rows.length === 0 ? (
        <EmptyState title="No categories yet" description="Trade categories will appear here." />
      ) : (
        <AdminTable columns={["Name", "Slug", "Active"]}>
          {rows.map((c) => (
            <TableRow key={c.slug}>
              <TableCell className="font-medium">{dash(c.name)}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{c.slug}</TableCell>
              <TableCell>{c.active ? "✓" : "—"}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
