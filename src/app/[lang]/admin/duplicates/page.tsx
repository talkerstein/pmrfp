import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner, StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { setLangFrom } from "@/i18n/server";
import { loadDuplicates, type DuplicatesData } from "@/lib/dedupe/admin-data";
import { disableAccountAction, dismissDuplicateAction, enableAccountAction, mergeCompaniesAction } from "@/lib/dedupe/admin-actions";
import { decideJoinRequestAction } from "@/lib/dedupe/actions";
import type { AccountReason } from "@/lib/dedupe/people";
import type { MatchReason } from "@/lib/dedupe/company";

export const metadata: Metadata = { title: "Duplicates · Admin · PMRFP" };

const ACCOUNT_REASON: Record<AccountReason, string> = {
  email: "Same mailbox (normalized email)",
  phone: "Same name + phone",
  city: "Same name + city",
  name: "Same name (90 days)",
};

const COMPANY_REASON: Record<MatchReason, string> = {
  name: "Same name",
  website: "Same website",
  phone: "Same phone",
  email_domain: "Same email domain",
  similar_name: "Similar name",
};

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "–";
}

/**
 * Admin: suspected duplicate accounts and company listings (lib/dedupe).
 * Accounts: same normalized email, or the same full name (+ phone / city)
 * within 90 days. Companies: same name / website / phone / company email
 * domain. Actions: merge companies (older stays primary), disable an
 * account (suspend + ban, reversible), dismiss. Plus join requests nobody
 * at the company can approve.
 */
export default async function DuplicatesPage({
  params,
  searchParams,
}: {
  params: Promise<object>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const { ok, error } = await searchParams;
  const demo = isDemoMode() || !isServiceConfigured();
  const data: DuplicatesData = demo
    ? { accounts: [], companies: [], joinRequests: [], ready: { reviews: false, joins: false }, resolved: 0 }
    : await loadDuplicates(createServiceClient());

  return (
    <>
      <PageHeader
        title="Duplicates"
        description="Accounts and company listings that look like the same person or business. Sign-up already blocks a second account for the same mailbox; names collide, so name matches are only listed here, never blocked. Nothing is merged or disabled until you click."
      />
      {demo && <DemoBanner />}
      {ok && <p role="status" className="mb-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">{ok}</p>}
      {error && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!demo && (!data.ready.reviews || !data.ready.joins) && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Migration <code>20261019000001_dedupe_signups.sql</code> isn&apos;t applied yet: suspected pairs still show, but Dismiss, join requests and the
          email unique index need it.
        </p>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <StatCard label="Suspected accounts" value={data.accounts.length} />
        <StatCard label="Suspected companies" value={data.companies.length} />
        <StatCard label="Join requests" value={data.joinRequests.length} hint={`${data.joinRequests.filter((j) => !j.hasApprover).length} need an admin`} />
        <StatCard label="Resolved" value={data.resolved} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">Accounts</h2>
      {data.accounts.length === 0 ? (
        <EmptyState title="No suspected duplicate accounts" description="Pairs show up here when two accounts share a mailbox, or a full name within 90 days." />
      ) : (
        <AdminTable columns={["Why", "Older account", "Newer account", "Actions"]}>
          {data.accounts.map((p) => (
            <TableRow key={p.key}>
              <TableCell className="align-top text-sm">
                <span className="font-medium">{ACCOUNT_REASON[p.strength]}</span>
                {p.reasons.length > 1 && (
                  <span className="block text-xs text-muted-foreground">{p.reasons.map((r) => ACCOUNT_REASON[r]).join(" · ")}</span>
                )}
                {p.strength === "email" && <span className="block text-xs text-muted-foreground">{p.normalizedEmail}</span>}
              </TableCell>
              {[p.a, p.b].map((u, i) => (
                <TableCell key={u.id} className="align-top text-sm">
                  <span className="block font-medium">{u.full_name || "(no name)"}</span>
                  <span className="block text-xs">{u.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    Joined {day(u.created_at)}
                    {u.phone ? ` · ${u.phone}` : ""}
                    {u.cities?.length ? ` · ${u.cities.join(", ")}` : " · no company"}
                  </span>
                  {u.status === "suspended" ? (
                    <form action={enableAccountAction} className="mt-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <span className="mr-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">Disabled</span>
                      <button type="submit" className="text-xs font-medium text-teal-700 underline">Re-enable</button>
                    </form>
                  ) : (
                    <form action={disableAccountAction} className="mt-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="otherId" value={i === 0 ? p.b.id : p.a.id} />
                      <button type="submit" className="text-xs font-medium text-red-700 underline">Disable this account</button>
                    </form>
                  )}
                </TableCell>
              ))}
              <TableCell className="align-top">
                <DismissForm kind="account" a={p.a.id} b={p.b.id} disabled={!data.ready.reviews} />
              </TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Companies</h2>
      {data.companies.length === 0 ? (
        <EmptyState title="No suspected duplicate companies" description="Listings show up here when they share a name, website, phone number or company email domain." />
      ) : (
        <AdminTable columns={["Why", "Older listing (kept)", "Newer listing", "Actions"]}>
          {data.companies.map((p) => (
            <TableRow key={p.key}>
              <TableCell className="align-top text-sm">
                <span className="font-medium">{p.reasons.length ? p.reasons.map((r) => COMPANY_REASON[r]).join(" · ") : "Flagged at onboarding"}</span>
                {p.flagged?.source === "onboarding" && (
                  <span className="block text-xs text-amber-800">New member said it&apos;s a different company</span>
                )}
              </TableCell>
              {[p.a, p.b].map((o) => (
                <TableCell key={o.id} className="align-top text-sm">
                  <a href={`/directory/${o.slug}`} className="block font-medium text-teal-700 hover:underline">{o.name}</a>
                  <span className="block text-xs text-muted-foreground">
                    {[o.city, o.province].filter(Boolean).join(", ") || "no city"} · created {day(o.created_at)} · {o.profile_status}
                  </span>
                  <span className="block text-xs text-muted-foreground">{[o.website, o.phone, o.email].filter(Boolean).join(" · ")}</span>
                </TableCell>
              ))}
              <TableCell className="space-y-3 align-top">
                <form action={mergeCompaniesAction} className="space-y-1">
                  <input type="hidden" name="aId" value={p.a.id} />
                  <input type="hidden" name="bId" value={p.b.id} />
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" name="confirm" value="merge" required className="size-3.5" />
                    Merge into the older listing
                  </label>
                  <button type="submit" className="rounded-md bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800">Merge</button>
                </form>
                <DismissForm kind="company" a={p.a.id} b={p.b.id} disabled={!data.ready.reviews} />
              </TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Join requests</h2>
      {data.joinRequests.length === 0 ? (
        <EmptyState title="No pending join requests" description="When someone at onboarding asks to join an existing company, it shows here. The company's owner can approve it too." />
      ) : (
        <AdminTable columns={["Company", "Requested by", "Asked", "Decide"]}>
          {data.joinRequests.map((j) => (
            <TableRow key={j.id}>
              <TableCell className="text-sm">
                {j.company ? <a href={`/directory/${j.company.slug}`} className="font-medium text-teal-700 hover:underline">{j.company.name}</a> : "(gone)"}
                {!j.hasApprover && <span className="block text-xs text-amber-800">No owner/admin: needs you</span>}
              </TableCell>
              <TableCell className="text-sm">
                {j.requester?.name || "(no name)"}
                <span className="block text-xs text-muted-foreground">{j.requester?.email}</span>
              </TableCell>
              <TableCell className="text-sm">{day(j.created_at)}</TableCell>
              <TableCell>
                <form action={decideJoinRequestAction} className="flex gap-2">
                  <input type="hidden" name="back" value="/admin/duplicates" />
                  <input type="hidden" name="requestId" value={j.id} />
                  <button type="submit" name="decision" value="approve" className="rounded-md bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800">Approve</button>
                  <button type="submit" name="decision" value="decline" className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">Decline</button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}

function DismissForm({ kind, a, b, disabled }: { kind: "account" | "company"; a: string; b: string; disabled: boolean }) {
  return (
    <form action={dismissDuplicateAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="aId" value={a} />
      <input type="hidden" name="bId" value={b} />
      <button type="submit" disabled={disabled} className="text-xs text-muted-foreground underline disabled:no-underline disabled:opacity-50" title={disabled ? "Needs the dedupe migration" : undefined}>
        Not a duplicate: dismiss
      </button>
    </form>
  );
}
