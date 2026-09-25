import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { SPONSORS } from "@/lib/sponsors/registry";

export const metadata: Metadata = { title: "Sponsors · Admin · PMRFP" };

interface ClickRow {
  day: string;
  sponsor: string;
  placement: string;
  trade: string;
  clicks: number;
}

const PLACEMENT_LABEL: Record<string, string> = {
  rfp_detail: "Tender pages",
  trade_page: "Trade pages",
  trade_dashboard: "Trade dashboard",
  alerts_email: "Daily match email",
  digest_email: "Weekly digest",
};

/** Clicks per sponsor and placement over the last 30 days: the numbers for a sponsor's monthly report. */
export default async function AdminSponsorsPage() {
  await requireRole(["admin", "super_admin"]);
  const { rows, ready } = isDemoMode() ? { rows: [] as ClickRow[], ready: true } : await loadClicks();

  const bySponsor = SPONSORS.map((s) => {
    const mine = rows.filter((r) => r.sponsor === s.id);
    const byPlacement = new Map<string, number>();
    const byTrade = new Map<string, number>();
    for (const r of mine) {
      byPlacement.set(r.placement, (byPlacement.get(r.placement) ?? 0) + r.clicks);
      if (r.trade) byTrade.set(r.trade, (byTrade.get(r.trade) ?? 0) + r.clicks);
    }
    const topTrades = [...byTrade.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { s, total: mine.reduce((n, r) => n + r.clicks, 0), byPlacement, topTrades };
  });

  return (
    <div>
      {isDemoMode() && <DemoBanner />}
      <PageHeader
        title="Sponsors"
        description="Clicks on sponsor placements in the last 30 days. Sponsors are set in src/lib/sponsors/registry.ts."
      />
      {!ready ? (
        <EmptyState title="Almost ready" description="The sponsor click table is being set up. Check back after the next deploy." />
      ) : (
        <AdminTable columns={["Sponsor", "Label", "Clicks (30 days)", "By placement", "Top trades"]}>
          {bySponsor.map(({ s, total, byPlacement, topTrades }) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground">{s.label}</TableCell>
              <TableCell className="font-semibold">{total}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {[...byPlacement.entries()].map(([p, n]) => `${PLACEMENT_LABEL[p] ?? p}: ${n}`).join(" · ") || "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {topTrades.map(([t, n]) => `${t} (${n})`).join(", ") || "—"}
              </TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

async function loadClicks(): Promise<{ rows: ClickRow[]; ready: boolean }> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await (await createClient())
    .from("sponsor_clicks")
    .select("day,sponsor,placement,trade,clicks")
    .gte("day", since)
    .order("day", { ascending: false })
    .limit(2000);
  return { rows: (data as ClickRow[] | null) ?? [], ready: !error };
}
