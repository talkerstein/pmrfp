import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner, StatCard } from "@/components/dashboard/stat-card";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { CorrectionResolve } from "@/components/admin/correction-resolve";
import { ACK_TARGET_DAYS, RESOLVE_TARGET_DAYS, URGENT_REASONS, businessDaysSince, type CorrectionReason, type CorrectionStatus } from "@/lib/corrections/rules";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Corrections · Admin · PMRFP" };

interface Row {
  id: string;
  page_kind: string;
  page_path: string;
  page_ref: string | null;
  reason: CorrectionReason;
  details: string;
  contact_email: string;
  contact_name: string | null;
  lang: string;
  status: CorrectionStatus;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
}

const OPEN: CorrectionStatus[] = ["new", "in_review"];

/**
 * Admin: the "Report an error or request removal" queue. Open requests
 * first (personal-information and removal requests on top), with the
 * policy's targets (acknowledge in 2 business days, resolve in 10). Reply to
 * the requester by email from the admin inbox; record what was done here.
 * English only (admin screen).
 */
export default async function AdminCorrectionsPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<{ all?: string }> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const showAll = (await searchParams).all === "1";
  const demo = isDemoMode() || !isServiceConfigured();
  let rows: Row[] = [];
  let missing = false;
  if (!demo) {
    let q = createServiceClient()
      .from("correction_requests")
      .select("id,page_kind,page_path,page_ref,reason,details,contact_email,contact_name,lang,status,resolution,resolved_at,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (!showAll) q = q.in("status", OPEN);
    const { data, error } = await q.returns<Row[]>();
    missing = isMissingTableError(error);
    rows = data ?? [];
  }
  const urgent = (r: Row) => URGENT_REASONS.includes(r.reason);
  rows.sort((a, b) => Number(OPEN.includes(b.status)) - Number(OPEN.includes(a.status)) || Number(urgent(b)) - Number(urgent(a)) || a.created_at.localeCompare(b.created_at));
  const open = rows.filter((r) => OPEN.includes(r.status));
  const overdue = open.filter((r) => businessDaysSince(r.created_at) > RESOLVE_TARGET_DAYS).length;
  const unacked = open.filter((r) => r.status === "new" && businessDaysSince(r.created_at) > ACK_TARGET_DAYS).length;

  return (
    <>
      <PageHeader
        title="Corrections & removal requests"
        description={`From the "Report an error or request removal" link on public-record pages. Policy (/corrections): acknowledge within ${ACK_TARGET_DAYS} business days, fix or explain within ${RESOLVE_TARGET_DAYS}; personal-information requests first. Reply to the requester by email, then record the outcome here.`}
      />
      {demo && <DemoBanner />}
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The correction_requests table is missing. Run supabase/migrations/20261017000050_correction_requests.sql.
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={open.length} />
        <StatCard label={`New, past ${ACK_TARGET_DAYS} business days`} value={unacked} />
        <StatCard label={`Open, past ${RESOLVE_TARGET_DAYS} business days`} value={overdue} />
      </div>
      <p className="mb-3 text-sm">
        {showAll ? <a href="?" className="underline">Show open only</a> : <a href="?all=1" className="underline">Show all (incl. closed)</a>}
      </p>
      <AdminTable columns={["Received", "Page", "Reason", "Details", "Contact", "Status / resolution"]}>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap text-xs">
              {r.created_at.slice(0, 10)}
              <br />
              <span className="text-muted-foreground">{businessDaysSince(r.created_at)} bd</span>
            </TableCell>
            <TableCell className="max-w-[220px] text-xs">
              <a href={r.page_path} className="underline" target="_blank" rel="noreferrer">{r.page_path}</a>
              <br />
              <span className="text-muted-foreground">{r.page_kind}</span>
            </TableCell>
            <TableCell className={`text-xs ${urgent(r) ? "font-semibold text-red-700" : ""}`}>{r.reason.replace("_", " ")}</TableCell>
            <TableCell className="max-w-[320px] whitespace-pre-wrap text-xs">{r.details}</TableCell>
            <TableCell className="text-xs">
              <a href={`mailto:${r.contact_email}`} className="underline">{r.contact_email}</a>
              {r.contact_name && <><br />{r.contact_name}</>}
              <br />
              <span className="text-muted-foreground">{r.lang}</span>
            </TableCell>
            <TableCell>
              <CorrectionResolve id={r.id} status={r.status} resolution={r.resolution} />
              {r.resolved_at && <p className="text-xs text-muted-foreground">Resolved {r.resolved_at.slice(0, 10)}</p>}
            </TableCell>
          </TableRow>
        ))}
      </AdminTable>
    </>
  );
}
