import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/admin/queries";
import { approveWinnerClaimAction, rejectWinnerClaimAction, revokeWinnerClaimAction } from "@/lib/claims/actions";
import { domainMatchesName, emailMatchesWebsite } from "@/lib/claims/domain";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Winner claims · Admin · PMRFP" };

type SP = Promise<Record<string, string | undefined>>;

interface Row {
  id: string;
  winner_slug: string;
  winner_name: string;
  organization_id: string;
  email: string;
  website: string | null;
  method: "email_domain" | "admin_review";
  status: "pending" | "approved" | "rejected" | "revoked";
  note: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  organizations: { name: string; slug: string; organization_type: string; website: string | null } | null;
}

const input = "rounded-md border border-border bg-background px-2 py-1 text-xs";
const btn = "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90";
const btnLine = "rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary";

/**
 * Admin: "claim this contract-winner page" queue. Pending claims first, with
 * the checks the auto-approval uses (email domain = website, website looks
 * like the winner's name). Approving links the page to the company's
 * profile; the public award facts never change. Every decision goes to
 * audit_logs.
 */
export default async function WinnerClaimsPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = await searchParams;
  const demo = isDemoMode() || !isServiceConfigured();

  let rows: Row[] = [];
  let missing = false;
  if (!demo) {
    const { data, error } = await createServiceClient()
      .from("winner_claims")
      .select("id,winner_slug,winner_name,organization_id,email,website,method,status,note,admin_note,created_at,reviewed_at,organizations(name,slug,organization_type,website)")
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<Row[]>();
    missing = Boolean(error);
    rows = data ?? [];
  }
  const order = { pending: 0, approved: 1, rejected: 2, revoked: 3 } as const;
  rows.sort((a, b) => order[a.status] - order[b.status] || b.created_at.localeCompare(a.created_at));
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <PageHeader
        title="Winner claims"
        description={`Companies claiming their /contract-winners page. ${pending} waiting for review. Auto-approved claims (email domain matched the website and the website matched the name) are listed too, so you can revoke a wrong one.`}
      />
      {demo && <DemoBanner />}
      {sp.ok && <p className="mb-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">{sp.ok}</p>}
      {sp.error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">{sp.error}</p>}
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The winner_claims table is missing. Run supabase/migrations/20261013000010_growth_pack.sql.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No claims yet" description="Claims appear here when a company uses “Claim this page” on a contract-winner page." />
      ) : (
        <AdminTable columns={["Status", "Winner page", "Company", "Claimant", "Checks", "Note", "Submitted", "Action"]}>
          {rows.map((r) => {
            const emailOk = emailMatchesWebsite(r.email, r.website);
            const nameOk = domainMatchesName(r.website, r.winner_name);
            return (
              <TableRow key={r.id}>
                <TableCell className="text-xs font-semibold uppercase">{r.status}{r.method === "email_domain" && r.status === "approved" ? " (auto)" : ""}</TableCell>
                <TableCell>
                  <a href={`/contract-winners/${r.winner_slug}`} target="_blank" rel="noopener" className="font-medium hover:underline">{r.winner_name}</a>
                </TableCell>
                <TableCell>
                  {r.organizations ? (
                    <a href={`/directory/${r.organizations.slug}`} target="_blank" rel="noopener" className="hover:underline">{r.organizations.name}</a>
                  ) : r.organization_id}
                  <div className="text-xs text-muted-foreground">{r.organizations?.organization_type}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {r.email}
                  <div className="text-muted-foreground">{r.website ?? "—"}</div>
                </TableCell>
                <TableCell className="text-xs">
                  <div>{emailOk ? "✓" : "✗"} email domain = website</div>
                  <div>{nameOk ? "✓" : "✗"} website ≈ winner name</div>
                </TableCell>
                <TableCell className="max-w-xs text-xs">
                  {r.note ?? "—"}
                  {r.admin_note && <div className="mt-1 text-muted-foreground">Admin: {r.admin_note}</div>}
                </TableCell>
                <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                <TableCell>
                  {r.status === "pending" && (
                    <div className="flex flex-col gap-2">
                      <form action={approveWinnerClaimAction} className="flex gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <button className={btn}>Approve</button>
                      </form>
                      <form action={rejectWinnerClaimAction} className="flex gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="adminNote" placeholder="Reason (optional)" className={input} />
                        <button className={btnLine}>Reject</button>
                      </form>
                    </div>
                  )}
                  {r.status === "approved" && (
                    <form action={revokeWinnerClaimAction} className="flex gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="adminNote" placeholder="Reason" className={input} />
                      <button className={btnLine}>Revoke</button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </AdminTable>
      )}
    </>
  );
}
