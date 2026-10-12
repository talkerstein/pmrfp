import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { SPONSORS } from "@/lib/sponsors/registry";
import { loadAdminSponsors, loadCounters, type AdminSponsorRow } from "@/lib/sponsors/admin";
import { torontoDay } from "@/lib/sponsors/model";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Sponsors · Admin · PMRFP" };

const PLACEMENT_LABEL: Record<string, string> = {
  rfp_detail: "Tender pages",
  trade_page: "Trade pages",
  benchmark: "Price benchmarks",
  major_projects: "Major projects",
  forum: "Forum",
  trade_dashboard: "Trade dashboard (retired)",
  alerts_email: "Daily match email",
  digest_email: "Weekly digest",
};

const TIER_LABEL: Record<string, string> = { province: "Province × trade", national: "National trade", digest: "Digest only" };

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-teal-50 text-teal-800 border-teal-300",
  pending: "bg-amber-50 text-amber-800 border-amber-300",
  paused: "bg-secondary text-foreground border-border",
  draft: "bg-secondary text-muted-foreground border-border",
  ended: "bg-secondary text-muted-foreground border-border",
  rejected: "bg-red-50 text-red-800 border-red-300",
};

/**
 * Paid sponsorships (create, review, approve, report) and the house
 * sponsors' clicks. Numbers are the last 30 days from the daily counters.
 */
export default async function AdminSponsorsPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<Record<string, string | undefined>> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = await searchParams;
  const { today, since } = last30Days();

  let rows: AdminSponsorRow[] = [];
  let ready = true;
  let imp = new Map<string, number>();
  let clk = new Map<string, number>();
  const housePlacements = new Map<string, Map<string, number>>();
  if (!isDemoMode()) {
    const supabase = await createClient();
    const loaded = await loadAdminSponsors(supabase);
    rows = loaded.rows;
    ready = loaded.ready;
    const ids = [...rows.map((r) => r.slug), ...SPONSORS.map((s) => s.id)];
    const c = await loadCounters(supabase, ids, since, today);
    imp = sum(c.impressions);
    clk = sum(c.clicks);
    for (const r of c.clicks) {
      const m = housePlacements.get(r.sponsor) ?? new Map<string, number>();
      m.set(r.placement, (m.get(r.placement) ?? 0) + r.n);
      housePlacements.set(r.sponsor, m);
    }
  }
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div>
      {isDemoMode() && <DemoBanner />}
      <PageHeader
        title="Sponsors"
        description="Paid sponsorships by trade × province/state. One sponsor per slot; copy is reviewed before it goes live. Counts: last 30 days."
      />
      {sp.error && <p className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{sp.error}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/admin/sponsors/new" className="rounded-full bg-primary px-4 py-1.5 font-semibold text-primary-foreground hover:opacity-90">New sponsor</Link>
        {pending > 0 && <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-800">{pending} waiting for review</span>}
        <Link href="/advertise" className="text-teal-ink underline">Public page</Link>
      </div>

      {!ready ? (
        <EmptyState title="Almost ready" description="The sponsors table isn't there yet. Run migration 20261012000002_sponsorships.sql, then reload." />
      ) : rows.length === 0 ? (
        <EmptyState title="No paid sponsors yet" description="Enquiries from /advertise land in Contact Requests (and paid checkouts appear here as pending). Add one with New sponsor." />
      ) : (
        <AdminTable columns={["Sponsor", "Status", "Slot", "Dates", "Impressions", "Clicks", ""]}>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                <Link href={`/admin/sponsors/${r.id}`} className="underline">{r.name}</Link>
                <div className="text-xs text-muted-foreground">/go/{r.slug}</div>
              </TableCell>
              <TableCell>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</span>
              </TableCell>
              <TableCell className="text-sm">
                {TIER_LABEL[r.tier] ?? r.tier} · {r.country}
                <div className="text-xs text-muted-foreground">
                  {(r.trades ?? []).join(", ")}
                  {(r.regions ?? []).length ? ` · ${(r.regions ?? []).join(", ")}` : " · whole country"}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.start_date ?? "—"} → {r.end_date ?? "open"}</TableCell>
              <TableCell className="font-semibold">{imp.get(r.slug) ?? 0}</TableCell>
              <TableCell className="font-semibold">{clk.get(r.slug) ?? 0}</TableCell>
              <TableCell className="text-sm">
                <Link href={`/admin/sponsors/${r.id}/report`} className="text-teal-ink underline">Report</Link>
              </TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}

      <h2 className="mb-2 mt-10 text-base font-semibold">House sponsors</h2>
      <p className="mb-3 text-sm text-muted-foreground">Fill a slot only when no paid sponsor holds it. Set in src/lib/sponsors/registry.ts.</p>
      <AdminTable columns={["Sponsor", "Label", "Impressions", "Clicks", "Clicks by placement"]}>
        {SPONSORS.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell className="text-muted-foreground">{s.label}</TableCell>
            <TableCell className="font-semibold">{imp.get(s.id) ?? 0}</TableCell>
            <TableCell className="font-semibold">{clk.get(s.id) ?? 0}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {[...(housePlacements.get(s.id) ?? new Map<string, number>()).entries()].map(([p, n]) => `${PLACEMENT_LABEL[p] ?? p}: ${n}`).join(" · ") || "—"}
            </TableCell>
          </TableRow>
        ))}
      </AdminTable>
    </div>
  );
}

function last30Days(): { today: string; since: string } {
  return { today: torontoDay(), since: torontoDay(new Date(Date.now() - 30 * 86_400_000)) };
}

function sum(rows: { sponsor: string; n: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.sponsor, (m.get(r.sponsor) ?? 0) + r.n);
  return m;
}
