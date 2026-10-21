import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { fmtDate, dash } from "@/lib/admin/queries";
import type { Organization } from "@/types/db";
import {
  clearProfileReviewAction,
  reinstateOrganizationAction,
  reviewOrganizationAction,
  suspendOrganizationAction,
} from "@/lib/admin/org-actions";
import { REVIEW_FIELD_LABELS, clipValue, parseReviewChanges } from "@/lib/organizations/profile-review";
import { isSchemaMissing } from "@/lib/projects/compat";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Organizations · Admin · PMRFP" };

type OrgRow = Pick<
  Organization,
  "id" | "name" | "slug" | "organization_type" | "profile_status" | "status" | "verified" | "profile_completion_score" | "created_at" | "updated_at"
> &
  Pick<Organization, "approved_at" | "review_flagged_at" | "review_changes">;

const BASE_COLUMNS = "id, name, slug, organization_type, profile_status, status, verified, profile_completion_score, created_at, updated_at";
/** Migration 20261021000030. */
const REVIEW_COLUMNS = `${BASE_COLUMNS}, approved_at, review_flagged_at, review_changes`;

const DEMO_ORGS: OrgRow[] = [
  { id: "1", name: "Northline Electrical Ltd.", slug: "northline", organization_type: "trade_company", profile_status: "approved", status: "active", verified: true, profile_completion_score: 88, created_at: "2026-05-18", updated_at: "2026-10-20", approved_at: "2026-05-19", review_flagged_at: "2026-10-20", review_changes: { website: { from: "https://northline.ca", to: "https://northline-electric.ca" } } },
  { id: "2", name: "Demo Property Group", slug: "demo-pg", organization_type: "property_manager", profile_status: "approved", status: "active", verified: true, profile_completion_score: 92, created_at: "2026-05-10", updated_at: "2026-05-10" },
  { id: "3", name: "GTA SnowPro", slug: "gta-snowpro", organization_type: "trade_company", profile_status: "pending_review", status: "active", verified: false, profile_completion_score: 54, created_at: "2026-05-22", updated_at: "2026-05-22" },
  { id: "4", name: "Apex Asphalt & Concrete", slug: "apex", organization_type: "trade_company", profile_status: "pending_review", status: "active", verified: false, profile_completion_score: 61, created_at: "2026-05-21", updated_at: "2026-05-21" },
];

const VIEWS = ["all", "waiting", "edited", "suspended"] as const;
type View = (typeof VIEWS)[number];
type Search = { view?: string; stale?: string };

const isEdited = (o: OrgRow) => o.profile_status === "approved" && Boolean(o.review_flagged_at);
const FILTER: Record<View, (o: OrgRow) => boolean> = {
  all: () => true,
  waiting: (o) => o.profile_status === "pending_review",
  edited: isEdited,
  suspended: (o) => o.profile_status === "suspended" && o.status !== "deleted",
};
const VIEW_LABEL: Record<View, string> = {
  all: "All",
  waiting: "Waiting for approval",
  edited: "Edited since approval",
  suspended: "Suspended",
};

async function loadOrgs(): Promise<{ rows: OrgRow[]; reviewReady: boolean }> {
  if (isDemoMode()) return { rows: DEMO_ORGS, reviewReady: true };
  const supabase = await createClient();
  const list = (columns: string) =>
    supabase.from("organizations").select(columns).order("created_at", { ascending: false }).returns<OrgRow[]>();
  const { data, error } = await list(REVIEW_COLUMNS);
  if (!error) return { rows: data ?? [], reviewReady: true };
  if (!isSchemaMissing(error)) return { rows: [], reviewReady: true };
  // Deployed before the migration ran: the list still works, without the edit queue.
  const old = await list(BASE_COLUMNS);
  return { rows: old.data ?? [], reviewReady: false };
}

export default async function AdminOrganizationsPage({ params, searchParams }: { params: Promise<object>; searchParams?: Promise<Search> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = (await searchParams) ?? {};
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "all";

  const { rows: all, reviewReady } = await loadOrgs();
  const counts = Object.fromEntries(VIEWS.map((v) => [v, all.filter(FILTER[v]).length])) as Record<View, number>;
  // Waiting companies first: they're invisible in the directory until approved.
  const rows = all
    .filter(FILTER[view])
    .sort((a, b) => Number(b.profile_status === "pending_review") - Number(a.profile_status === "pending_review"));

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Trade companies and property managers. Approve, check edits, and suspend profiles here."
      />
      {isDemoMode() && <DemoBanner />}

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter organizations">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={v === "all" ? "/admin/organizations" : `/admin/organizations?view=${v}`}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${v === view ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"}`}
            data-view={v}
          >
            {VIEW_LABEL[v]} ({counts[v]})
          </Link>
        ))}
      </nav>

      <p className="mb-4 text-sm text-muted-foreground">
        {counts.waiting > 0
          ? `${counts.waiting} ${counts.waiting === 1 ? "company is" : "companies are"} waiting for approval and hidden from the directory until then.`
          : "No companies waiting for approval."}{" "}
        {counts.edited > 0 &&
          `${counts.edited} approved ${counts.edited === 1 ? "company" : "companies"} changed name, website, logo, description or email: still live, worth a look.`}
      </p>

      {view === "edited" ? (
        <EditedQueue rows={rows} reviewReady={reviewReady} stale={Boolean(sp.stale)} />
      ) : rows.length === 0 ? (
        <EmptyState title="No organizations here" description="Registered companies will appear here." />
      ) : (
        <AdminTable columns={["Name", "Type", "Profile", "Verified", "Completion", "Created", ""]}>
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">
                {dash(o.name)}
                {isEdited(o) && (
                  <Link href="/admin/organizations?view=edited" className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    edited
                  </Link>
                )}
              </TableCell>
              <TableCell className="capitalize">{o.organization_type.replace(/_/g, " ")}</TableCell>
              <TableCell><StatusBadge status={o.profile_status} /></TableCell>
              <TableCell>{o.verified ? "✓" : "—"}</TableCell>
              <TableCell className="text-muted-foreground">{o.profile_completion_score}%</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(o.created_at)}</TableCell>
              <TableCell>
                {o.profile_status === "pending_review" && !isDemoMode() && (
                  <div className="flex gap-2">
                    <form action={reviewOrganizationAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <button className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90">
                        Approve
                      </button>
                    </form>
                    <form action={reviewOrganizationAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <button className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary">
                        Reject
                      </button>
                    </form>
                  </div>
                )}
                {FILTER.suspended(o) && !isDemoMode() && (
                  <form action={reinstateOrganizationAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <button className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary">
                      Reinstate
                    </button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}

/** Approved companies whose name, website, logo, description or email changed since an admin last looked. Still live. */
function EditedQueue({ rows, reviewReady, stale }: { rows: OrgRow[]; reviewReady: boolean; stale: boolean }) {
  if (!reviewReady) {
    return (
      <EmptyState
        title="Edit checks start after the database update"
        description="Run migration 20261021000030_keep_approval_on_edit.sql. Until then edits are only in the audit log."
      />
    );
  }
  return (
    <>
      {stale && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          That company saved its profile again while you were looking. Check the latest changes below.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No profile edits to check" description="Approved companies that change their name, website, logo, description or email show up here. They stay live while they wait." />
      ) : (
        <ul className="space-y-4">
          {rows.map((o) => {
            const changes = parseReviewChanges(o.review_changes);
            return (
              <li key={o.id} className="rounded-lg border border-border bg-card p-5" data-edited={o.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold">
                    {o.slug ? (
                      <Link href={`/directory/${o.slug}`} className="hover:underline">
                        {dash(o.name)}
                      </Link>
                    ) : (
                      dash(o.name)
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Edited {fmtDate(o.review_flagged_at)}
                    {o.approved_at ? ` · approved ${fmtDate(o.approved_at)}` : ""} · still live
                  </p>
                </div>
                {changes.length ? (
                  <dl className="mt-3 space-y-2 text-sm">
                    {changes.map((c) => (
                      <div key={c.field} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                        <dt className="font-medium">{REVIEW_FIELD_LABELS[c.field]}</dt>
                        <dd className="break-words">
                          <span className="text-muted-foreground line-through">{clipValue(c.from)}</span>
                          <span aria-hidden="true"> → </span>
                          <span>{clipValue(c.to)}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No field-level changes on record (changed back since, or restored after the old edit reset). Open the profile to check.
                  </p>
                )}
                {!isDemoMode() && (
                  <div className="mt-4 flex gap-2">
                    <form action={clearProfileReviewAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="seen" value={o.updated_at} />
                      <button className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90">
                        Looks good
                      </button>
                    </form>
                    <form action={suspendOrganizationAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <button className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-50">
                        Suspend
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
