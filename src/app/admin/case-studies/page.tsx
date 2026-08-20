import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { reviewCaseStudyAction } from "@/lib/case-studies/actions";

export const metadata: Metadata = { title: "Case Studies · Admin · PMRFP" };

interface Row {
  id: string;
  title: string;
  slug: string;
  status: string;
  challenge: string;
  approach: string;
  outcome: string;
  city: string | null;
  province: string | null;
  created_at: string;
  organizations: { name: string; slug: string } | null;
}

export default async function AdminCaseStudiesPage() {
  await requireRole(["admin", "super_admin"]);

  let rows: Row[] = [];
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("case_studies")
      .select("id,title,slug,status,challenge,approach,outcome,city,province,created_at,organizations(name,slug)")
      .order("created_at", { ascending: false })
      .limit(100);
    rows = (data as unknown as Row[]) ?? [];
  }

  const pending = rows.filter((r) => r.status === "pending_review");
  const rest = rows.filter((r) => r.status !== "pending_review");

  return (
    <>
      {isDemoMode() && <DemoBanner />}
      <PageHeader
        title="Case studies"
        description="Vendor-submitted project write-ups. Publishing puts them on /case-studies and the vendor's trade×city page."
      />

      {pending.length === 0 && rest.length === 0 ? (
        <EmptyState title="No submissions yet" description="Member-submitted case studies land here for review." />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Pending review ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Queue is clear.</p>
            ) : (
              <div className="space-y-4">
                {pending.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{r.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {r.organizations?.name ?? "Unknown org"} ·{" "}
                          {[r.city, r.province].filter(Boolean).join(", ") || "no location"} ·{" "}
                          {new Date(r.created_at).toLocaleDateString("en-CA")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <form action={reviewCaseStudyAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="published" />
                          <button className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
                            Publish
                          </button>
                        </form>
                        <form action={reviewCaseStudyAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="rejected" />
                          <button className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary">
                            Reject
                          </button>
                        </form>
                      </div>
                    </div>
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-teal-ink">Read full submission</summary>
                      <div className="mt-2 space-y-3 text-foreground/90">
                        <p><strong>Challenge:</strong> {r.challenge}</p>
                        <p><strong>Approach:</strong> {r.approach}</p>
                        <p><strong>Outcome:</strong> {r.outcome}</p>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </section>

          {rest.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Reviewed</h2>
              <ul className="space-y-2 text-sm">
                {rest.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-md border border-border px-4 py-2">
                    <span>
                      {r.title}{" "}
                      <span className="text-xs text-muted-foreground">({r.organizations?.name})</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{r.status}</span>
                      {r.status === "published" && (
                        <Link href={`/case-studies/${r.slug}`} className="text-xs text-teal-ink hover:underline">
                          View →
                        </Link>
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
