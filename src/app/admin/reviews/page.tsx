import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { moderateReviewAction } from "@/lib/reviews/actions";
import { looksLikeSelfReview } from "@/lib/projects/reviews";

export const metadata: Metadata = { title: "Reviews · Admin · PMRFP" };

interface Row {
  id: string;
  status: string;
  rating: number;
  body: string;
  reviewer_name: string;
  reviewer_company: string | null;
  reviewer_email?: string | null;
  verified_via?: string | null;
  show_building?: boolean;
  reference_ok?: boolean;
  project_context: string | null;
  created_at: string;
  organizations: { name: string; slug: string; email: string | null; website: string | null } | null;
  case_studies?: { title: string; slug: string } | null;
}

const BASE_COLS =
  "id,status,rating,body,reviewer_name,reviewer_company,project_context,created_at,organizations(name,slug,email,website)";
const PROJECT_COLS = "reviewer_email,verified_via,show_building,reference_ok,case_studies(title,slug)";

/**
 * Review moderation. Every review lands here, whatever the rating (no
 * review gating): publish what's genuine, reject what isn't. The self-review
 * flag compares the reviewer's email with the company's own email / domain.
 */
export default async function AdminReviewsPage() {
  await requireRole(["admin", "super_admin"]);

  let rows: Row[] = [];
  if (!isDemoMode()) {
    const supabase = await createClient();
    const run = (cols: string) =>
      supabase.from("vendor_reviews").select(cols).order("created_at", { ascending: false }).limit(200);
    let { data, error } = await run(`${BASE_COLS},${PROJECT_COLS}`);
    // Before the Projects migration: no project columns yet.
    if (error) ({ data, error } = await run(BASE_COLS));
    rows = error ? [] : ((data as unknown as Row[]) ?? []);
  }

  const pending = rows.filter((r) => r.status === "pending_review");
  const rest = rows.filter((r) => r.status !== "pending_review");

  return (
    <>
      {isDemoMode() && <DemoBanner />}
      <PageHeader
        title="Reviews"
        description="Client reviews of trades. Published reviews show on the company profile and the project page, and count toward its star rating."
      />

      {rows.length === 0 ? (
        <EmptyState title="No reviews yet" description="Reviews sent through project review links land here for checking." />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Waiting for review ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Queue is clear.</p>
            ) : (
              <div className="space-y-4">
                {pending.map((r) => {
                  const selfFlag = looksLikeSelfReview(r.reviewer_email, {
                    email: r.organizations?.email,
                    website: r.organizations?.website,
                  });
                  return (
                    <div key={r.id} className="rounded-lg border border-border bg-card p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            <Stars n={r.rating} /> for {r.organizations?.name ?? "Unknown company"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.case_studies ? (
                              <Link href={`/case-studies/${r.case_studies.slug}`} className="text-teal-ink hover:underline">
                                {r.case_studies.title}
                              </Link>
                            ) : (
                              r.project_context ?? "No project"
                            )}{" "}
                            · {new Date(r.created_at).toLocaleDateString("en-CA")}
                            {r.verified_via ? ` · via ${r.verified_via.replace(/_/g, " ")}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <form action={moderateReviewAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="decision" value="published" />
                            <button className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
                              Publish
                            </button>
                          </form>
                          <form action={moderateReviewAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="decision" value="rejected" />
                            <button className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary">
                              Reject
                            </button>
                          </form>
                        </div>
                      </div>

                      <p className="mt-3 whitespace-pre-line text-sm text-foreground/90">{r.body}</p>

                      <p className="mt-3 text-xs text-muted-foreground">
                        <strong className="text-foreground">{r.reviewer_name}</strong>
                        {r.reviewer_company ? `, ${r.reviewer_company}` : ""}
                        {r.reviewer_email ? ` · ${r.reviewer_email}` : ""}
                        {" · "}
                        {r.show_building ? "company may be shown" : "first name + initial only"}
                        {r.reference_ok ? " · OK as a reference" : ""}
                      </p>
                      {selfFlag && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800">
                          <AlertTriangle className="size-3.5" />
                          Reviewer email matches the company&apos;s own email or website. Check before publishing.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {rest.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Checked</h2>
              <ul className="space-y-2 text-sm">
                {rest.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-4 py-2">
                    <span>
                      <Stars n={r.rating} /> {r.organizations?.name ?? "Unknown"}{" "}
                      <span className="text-xs text-muted-foreground">({r.reviewer_name})</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusBadge status={r.status} />
                      {r.status === "published" && r.organizations?.slug && (
                        <Link href={`/directory/${r.organizations.slug}`} className="text-xs text-teal-ink hover:underline">
                          View profile
                        </Link>
                      )}
                      {r.status === "published" && (
                        <form action={moderateReviewAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="rejected" />
                          <button className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                            Unpublish
                          </button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="text-amber-500" aria-label={`${n} out of 5`}>
      {"★".repeat(n)}
      <span className="text-slate-300">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}
