import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/admin/queries";
import { addBlockedDomainAction, removeBlockedDomainAction } from "@/lib/admin/org-actions";
import { SEED_BLOCKED_DOMAINS } from "@/lib/spam/server";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Blocked domains · Admin · PMRFP" };

interface Row {
  domain: string;
  reason: string | null;
  created_at: string;
}

type Search = { added?: string; error?: string };

export default async function BlockedDomainsPage({ params, searchParams }: { params: Promise<object>; searchParams?: Promise<Search> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = (await searchParams) ?? {};

  let rows: Row[] = [];
  let ready = true;
  if (isDemoMode()) {
    rows = SEED_BLOCKED_DOMAINS.map((domain) => ({ domain, reason: "Demo", created_at: "2026-10-24" }));
  } else {
    const { data, error } = await (await createClient()).from("blocked_domains").select("domain,reason,created_at").order("created_at", { ascending: false }).returns<Row[]>();
    if (error) ready = false;
    rows = data ?? [];
  }

  return (
    <>
      <PageHeader
        title="Blocked domains"
        description="A new or edited listing whose email or website is on one of these domains is rejected (not public), and you get an email. The sign-up itself is never blocked."
      />
      {isDemoMode() && <DemoBanner />}

      {sp.added && <p className="mb-4 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">Blocked {sp.added}.</p>}
      {sp.error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{sp.error === "domain" ? "That doesn't look like a domain (try example.com)." : "Could not save. Try again."}</p>}

      {!ready ? (
        <EmptyState title="Blocked domains start after the database update" description="Run migration 20261024000100_earned_links.sql. Until then the two seed domains are still checked." />
      ) : (
        <>
          {!isDemoMode() && (
            <form action={addBlockedDomainAction} className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4" data-form="add-blocked-domain">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Domain</span>
                <input name="domain" required placeholder="bad-seo-agency.com" className="w-64 rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Why (optional)</span>
                <input name="reason" maxLength={300} placeholder="Satellite listings, 2026-10" className="w-80 rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <button className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Block domain</button>
            </form>
          )}
          {rows.length === 0 ? (
            <EmptyState title="No blocked domains" description="Add the email or website domains of SEO agencies and spam senders here." />
          ) : (
            <AdminTable columns={["Domain", "Why", "Added", ""]}>
              {rows.map((r) => (
                <TableRow key={r.domain}>
                  <TableCell className="font-medium">{r.domain}</TableCell>
                  <TableCell className="text-muted-foreground">{r.reason || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                  <TableCell>
                    {!isDemoMode() && (
                      <form action={removeBlockedDomainAction}>
                        <input type="hidden" name="domain" value={r.domain} />
                        <button className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary">Remove</button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </AdminTable>
          )}
        </>
      )}
    </>
  );
}
