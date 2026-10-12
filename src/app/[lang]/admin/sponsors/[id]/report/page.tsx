import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { loadAdminSponsor, loadSponsorReport } from "@/lib/sponsors/admin";
import { monthRange } from "@/lib/sponsors/report";
import { torontoDay } from "@/lib/sponsors/model";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Sponsor report · Admin · PMRFP" };

const PLACEMENT_LABEL: Record<string, string> = {
  rfp_detail: "Tender pages",
  trade_page: "Trade pages",
  benchmark: "Price benchmarks",
  major_projects: "Major projects",
  forum: "Forum",
  alerts_email: "Daily match email (sent)",
  digest_email: "Weekly digest (sent)",
};

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * The monthly report a sponsor gets: impressions (unit on screen, or
 * email sent) and clicks, by placement and by trade × province, with a
 * CSV export. Our own first-party counts; nothing is estimated.
 */
export default async function AdminSponsorReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const { id } = await params;
  const sp = await searchParams;
  if (isDemoMode() || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const row = await loadAdminSponsor(supabase, id);
  if (!row) notFound();
  const { month, from, to } = monthRange(sp.month, torontoDay());
  const report = await loadSponsorReport(supabase, row.slug, month, from, to);

  const bySlot = new Map<string, { impressions: number; clicks: number }>();
  for (const l of report.lines) {
    const k = [l.trade || "—", l.region || "—"].join(" · ");
    const v = bySlot.get(k) ?? { impressions: 0, clicks: 0 };
    v.impressions += l.impressions;
    v.clicks += l.clicks;
    bySlot.set(k, v);
  }
  const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(2)}%`);

  return (
    <>
      <PageHeader title={`${row.name}: ${month}`} description="Impressions = the unit was at least half on screen (pages) or in a sent email. Clicks = /go link opens." />
      <p className="mb-4 flex flex-wrap gap-3 text-sm">
        <Link href={`/admin/sponsors/${row.id}`} className="text-teal-ink underline">← Sponsor</Link>
        <Link href={`/admin/sponsors/${row.id}/report?month=${shiftMonth(month, -1)}`} className="underline">← {shiftMonth(month, -1)}</Link>
        <Link href={`/admin/sponsors/${row.id}/report?month=${shiftMonth(month, 1)}`} className="underline">{shiftMonth(month, 1)} →</Link>
        <a href={`/api/admin/sponsors/report?id=${row.id}&month=${month}`} className="font-semibold text-teal-ink underline">Download CSV</a>
      </p>

      <div className="mb-8 grid max-w-2xl grid-cols-3 gap-3">
        {[["Impressions", report.impressions.toLocaleString("en-CA")], ["Clicks", report.clicks.toLocaleString("en-CA")], ["Click rate", pct(report.ctr)]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
            <div className="mt-1 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      {report.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing counted this month.</p>
      ) : (
        <>
          <h2 className="mb-2 text-base font-semibold">By placement</h2>
          <AdminTable columns={["Placement", "Impressions", "Clicks", "Click rate"]}>
            {report.byPlacement.map((p) => (
              <TableRow key={p.placement}>
                <TableCell>{PLACEMENT_LABEL[p.placement] ?? p.placement}</TableCell>
                <TableCell>{p.impressions}</TableCell>
                <TableCell>{p.clicks}</TableCell>
                <TableCell>{pct(p.impressions ? p.clicks / p.impressions : null)}</TableCell>
              </TableRow>
            ))}
          </AdminTable>
          <h2 className="mb-2 mt-8 text-base font-semibold">By trade × province/state</h2>
          <AdminTable columns={["Trade · province/state", "Impressions", "Clicks"]}>
            {[...bySlot.entries()].sort((a, b) => b[1].impressions - a[1].impressions).map(([k, v]) => (
              <TableRow key={k}>
                <TableCell>{k}</TableCell>
                <TableCell>{v.impressions}</TableCell>
                <TableCell>{v.clicks}</TableCell>
              </TableRow>
            ))}
          </AdminTable>
        </>
      )}
    </>
  );
}
