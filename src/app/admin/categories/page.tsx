import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data/taxonomy";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { dash } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Categories · Admin · PMRFP" };

interface CategoryRow {
  name: string;
  slug: string;
  active: boolean;
}

export default async function AdminCategoriesPage() {
  await requireRole(["admin", "super_admin"]);

  let rows: CategoryRow[];
  if (isDemoMode()) {
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

      {rows.length === 0 ? (
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
