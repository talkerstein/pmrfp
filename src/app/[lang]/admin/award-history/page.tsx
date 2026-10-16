import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner, StatCard } from "@/components/dashboard/stat-card";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { HISTORY_SOURCES } from "@/lib/contract-history/registry";
import { CANADABUYS_FILES } from "@/lib/contract-history/sources/canadabuys";
import { AwardHistoryUpload } from "@/components/admin/award-history-upload";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Award History · Admin · PMRFP" };

const SCHEDULE: Record<string, string> = {
  weekly: "Mondays 10:05 UTC (/api/cron/award-history/weekly)",
  monthly: "3rd of the month 10:20 UTC (/api/cron/award-history/monthly)",
  federal: "5th of the month 10:35 UTC (/api/cron/award-history/federal)",
};

/**
 * Admin: what award history holds per source (the raw rows behind Award
 * Intelligence; never on a public page), the cron schedule, and the
 * CanadaBuys file upload. English only (admin screen).
 */
export default async function AdminAwardHistoryPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const demo = isDemoMode() || !isServiceConfigured();
  const counts = new Map<string, { rows: number; asOf: string | null }>();
  let bids = 0;
  const missingFlags: boolean[] = [];
  if (!demo) {
    const db = createServiceClient();
    await Promise.all(
      HISTORY_SOURCES.map(async (s) => {
        const [{ count, error }, latest] = await Promise.all([
          db.from("award_history").select("id", { count: "exact", head: true }).eq("source", s.key),
          db.from("award_history").select("as_of").eq("source", s.key).order("as_of", { ascending: false }).limit(1).maybeSingle<{ as_of: string }>(),
        ]);
        missingFlags.push(isMissingTableError(error));
        counts.set(s.key, { rows: count ?? 0, asOf: latest.data?.as_of ?? null });
      }),
    );
    const { count } = await db.from("bid_results").select("id", { count: "exact", head: true });
    bids = count ?? 0;
  }
  const missing = missingFlags.some(Boolean);
  const total = [...counts.values()].reduce((n, c) => n + c.rows, 0);

  return (
    <>
      <PageHeader
        title="Award history"
        description="Years of public awards with contract end dates, bid counts and (where published) every bid. Feeds Award Intelligence only: no public page shows these rows. Open-licence and public-domain sources only; robots.txt respected."
      />
      {demo && <DemoBanner />}
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The award_history table is missing. Run supabase/migrations/20261017000040_award_history.sql.
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Award rows" value={total} />
        <StatCard label="Bid rows (who else bid)" value={bids} />
        <StatCard label="Sources" value={HISTORY_SOURCES.length} />
      </div>
      <AdminTable columns={["Source", "Country", "Licence", "How", "Rows", "Last read"]}>
        {HISTORY_SOURCES.map((s) => (
          <TableRow key={s.key}>
            <TableCell className="max-w-[280px] font-medium">
              <a href={s.url} className="underline" target="_blank" rel="noreferrer">{s.label}</a>
            </TableCell>
            <TableCell>{s.country}</TableCell>
            <TableCell className="max-w-[220px] text-xs">{s.licence}</TableCell>
            <TableCell className="max-w-[240px] text-xs">{s.mode === "upload" ? "Admin upload (robots.txt bars bots)" : SCHEDULE[s.group ?? ""] ?? s.group}</TableCell>
            <TableCell>{counts.get(s.key)?.rows ?? "–"}</TableCell>
            <TableCell className="whitespace-nowrap">{counts.get(s.key)?.asOf ?? "–"}</TableCell>
          </TableRow>
        ))}
      </AdminTable>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Upload CanadaBuys award notices</h2>
      <AwardHistoryUpload files={CANADABUYS_FILES} />

      <h2 className="mb-2 mt-8 text-lg font-semibold">Backfill</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>SEAO monthly roll-ups (one per call, 10 s apart): /api/cron/award-history/weekly?source=ca-seao&amp;files=2025-09 (or a list: files=2025-07,2025-08).</li>
        <li>USAspending by fiscal year: /api/cron/award-history/weekly?source=us-usaspending&amp;from=2024-10-01&amp;to=2025-09-30 (if the download isn&apos;t ready in time, re-run with &amp;file=&lt;file name from the response&gt;).</li>
        <li>Add ?dry=1 to any of these to see counts and coverage without saving.</li>
      </ul>
    </>
  );
}
