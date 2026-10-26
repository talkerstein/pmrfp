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
  resolveHeldOrganizationAction,
  reviewOrganizationAction,
  screenExistingOrganizationsAction,
  setLinkTrustedAction,
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
  Pick<Organization, "approved_at" | "review_flagged_at" | "review_changes"> &
  Partial<Pick<Organization, "website" | "link_trusted" | "risk_flagged" | "link_earned_at">>;

const BASE_COLUMNS = "id, name, slug, organization_type, profile_status, status, verified, profile_completion_score, created_at, updated_at";
/** Migration 20261021000030. */
const REVIEW_COLUMNS = `${BASE_COLUMNS}, approved_at, review_flagged_at, review_changes`;
/** Migration 20261024000100 (earn the link + spam check). */
const LINK_COLUMNS = `${REVIEW_COLUMNS}, website, link_trusted, risk_flagged, link_earned_at`;

/** organization_risk, as the admin sees it. */
interface RiskRow {
  organization_id: string;
  score: number;
  reasons: { code: string; points: number; detail: string }[];
  held: boolean;
  blocked: boolean;
  decision: string | null;
  source: string;
  evaluated_at: string;
}

const DEMO_ORGS: OrgRow[] = [
  { id: "1", name: "Northline Electrical Ltd.", slug: "northline", organization_type: "trade_company", profile_status: "approved", status: "active", verified: true, profile_completion_score: 88, created_at: "2026-05-18", updated_at: "2026-10-20", approved_at: "2026-05-19", review_flagged_at: "2026-10-20", review_changes: { website: { from: "https://northline.ca", to: "https://northline-electric.ca" } } },
  { id: "2", name: "Demo Property Group", slug: "demo-pg", organization_type: "property_manager", profile_status: "approved", status: "active", verified: true, profile_completion_score: 92, created_at: "2026-05-10", updated_at: "2026-05-10" },
  { id: "3", name: "GTA SnowPro", slug: "gta-snowpro", organization_type: "trade_company", profile_status: "pending_review", status: "active", verified: false, profile_completion_score: 54, created_at: "2026-05-22", updated_at: "2026-05-22" },
  { id: "4", name: "Apex Asphalt & Concrete", slug: "apex", organization_type: "trade_company", profile_status: "pending_review", status: "active", verified: false, profile_completion_score: 61, created_at: "2026-05-21", updated_at: "2026-05-21" },
];

const VIEWS = ["all", "waiting", "held", "edited", "suspended"] as const;
type View = (typeof VIEWS)[number];
type Search = { view?: string; stale?: string; screened?: string; flagged?: string };

const isEdited = (o: OrgRow) => o.profile_status === "approved" && Boolean(o.review_flagged_at);
/** The spam check flagged it (new listing held or rejected, or a live one flagged after an edit). */
const isHeld = (o: OrgRow) => Boolean(o.risk_flagged) && o.status !== "deleted";
const FILTER: Record<View, (o: OrgRow) => boolean> = {
  all: () => true,
  waiting: (o) => o.profile_status === "pending_review",
  held: isHeld,
  edited: isEdited,
  suspended: (o) => o.profile_status === "suspended" && o.status !== "deleted",
};
const VIEW_LABEL: Record<View, string> = {
  all: "All",
  waiting: "Waiting for approval",
  held: "Held by spam check",
  edited: "Edited since approval",
  suspended: "Suspended",
};

async function loadOrgs(): Promise<{ rows: OrgRow[]; reviewReady: boolean; risk: Map<string, RiskRow> }> {
  if (isDemoMode()) return { rows: DEMO_ORGS, reviewReady: true, risk: new Map() };
  const supabase = await createClient();
  const list = (columns: string) =>
    supabase.from("organizations").select(columns).order("created_at", { ascending: false }).returns<OrgRow[]>();
  let res = await list(LINK_COLUMNS);
  let reviewReady = true;
  if (res.error && isSchemaMissing(res.error)) res = await list(REVIEW_COLUMNS);
  if (res.error && isSchemaMissing(res.error)) {
    // Deployed before the migrations ran: the list still works, without the edit queue.
    res = await list(BASE_COLUMNS);
    reviewReady = false;
  }
  const rows = res.error && !isSchemaMissing(res.error) ? [] : (res.data ?? []);
  const risk = new Map<string, RiskRow>();
  const flagged = rows.filter((o) => o.risk_flagged).map((o) => o.id);
  if (flagged.length) {
    const { data } = await supabase
      .from("organization_risk")
      .select("organization_id,score,reasons,held,blocked,decision,source,evaluated_at")
      .in("organization_id", flagged)
      .returns<RiskRow[]>();
    for (const r of data ?? []) risk.set(r.organization_id, r);
  }
  return { rows, reviewReady, risk };
}

export default async function AdminOrganizationsPage({ params, searchParams }: { params: Promise<object>; searchParams?: Promise<Search> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = (await searchParams) ?? {};
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "all";

  const { rows: all, reviewReady, risk } = await loadOrgs();
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

      {counts.held > 0 && view !== "held" && (
        <p className="mb-4 text-sm text-amber-800">
          <Link href="/admin/organizations?view=held" className="font-semibold underline">{counts.held} {counts.held === 1 ? "company is" : "companies are"} held by the spam check</Link>: not auto-approved, link nofollow.
        </p>
      )}

      {view === "edited" ? (
        <EditedQueue rows={rows} reviewReady={reviewReady} stale={Boolean(sp.stale)} />
      ) : view === "held" ? (
        <>
          {sp.screened && (
            <p className="mb-4 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
              Checked {sp.screened} listed companies; {sp.flagged ?? "0"} flagged. Flagged companies stay live (nofollow, noindex) until you decide below.
            </p>
          )}
          {!isDemoMode() && (
            <form action={screenExistingOrganizationsAction} className="mb-4">
              <button className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary" title="Scores every listed company with the sign-up rules and flags the ones that would be held. Changes no status.">
                Run the spam check on existing companies
              </button>
            </form>
          )}
          <HeldQueue rows={rows} risk={risk} />
        </>
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
                {o.profile_status === "approved" && !isDemoMode() && (
                  <form action={setLinkTrustedAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="trusted" value={o.link_trusted ? "0" : "1"} />
                    <button className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary" title="Trusted companies get a followed website link from day one">
                      {o.link_trusted ? "Untrust link" : "Trust link"}
                    </button>
                  </form>
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

/**
 * Listings the spam check flagged (lib/spam/org-risk), with the reasons.
 * New ones wait in pending_review, auto-rejected ones are off, and a live
 * company flagged after an edit stays live (nofollow, noindex) until decided.
 */
function HeldQueue({ rows, risk }: { rows: OrgRow[]; risk: Map<string, RiskRow> }) {
  if (rows.length === 0) {
    return <EmptyState title="Nothing held by the spam check" description="New or edited listings with a blocked domain, several companies from one owner, a keyword-stuffed or gibberish name, or a mismatched country show up here with the reasons." />;
  }
  return (
    <ul className="space-y-4">
      {rows.map((o) => {
        const r = risk.get(o.id);
        const state =
          o.profile_status === "rejected" ? "auto-rejected: page is off" : o.profile_status === "pending_review" ? "held: page is hidden until you decide" : o.profile_status === "approved" ? "live, but nofollow and noindex" : o.profile_status;
        return (
          <li key={o.id} className="rounded-lg border border-border bg-card p-5" data-held={o.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">{dash(o.name)}</h2>
              <p className="text-xs text-muted-foreground">
                Score {r?.score ?? "?"}{r?.blocked ? " · blocked domain" : ""} · {state} · {fmtDate(r?.evaluated_at ?? o.created_at)}
              </p>
            </div>
            <p className="mt-1 break-all text-sm text-muted-foreground">{o.website || "no website"}</p>
            {r?.reasons?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {r.reasons.map((x, i) => (
                  <li key={`${x.code}-${i}`}>
                    <span className="font-medium">{x.points > 0 ? "+" : ""}{x.points}</span> {x.detail}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No reasons on record.</p>
            )}
            {!isDemoMode() && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(["approved", "rejected", "suspended"] as const).map((d) => (
                  <form key={d} action={resolveHeldOrganizationAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="decision" value={d} />
                    <button
                      className={
                        d === "approved"
                          ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                          : d === "rejected"
                            ? "rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary"
                            : "rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-50"
                      }
                    >
                      {d === "approved" ? "Approve" : d === "rejected" ? "Reject" : "Suspend"}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
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
