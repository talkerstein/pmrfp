import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { reviewMajorProjectAction, uploadResearchCsvAction } from "@/lib/major-projects/actions";
import { MAJOR_PROJECT_CATEGORIES } from "@/lib/major-projects/model";
import { UPLOAD_SOURCES } from "@/lib/major-projects/sources-wave2";
import { MajorProjectSourceUpload } from "@/components/admin/major-project-source-upload";
import { compactDollars } from "@/lib/data/fomo";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Major projects · Admin · PMRFP" };

interface QueueRow {
  id: string;
  slug: string;
  name: string;
  owner: string | null;
  city: string | null;
  province: string | null;
  category: string;
  status: string;
  status_raw: string | null;
  est_value_cad: number | null;
  general_contractor: string | null;
  bid_list_url: string | null;
  bid_route: string | null;
  evidence: "F" | "S" | "A" | null;
  caveats: string | null;
  description: string | null;
  sources: { label: string; url: string }[] | null;
  review_status: string;
  updated_at: string;
}

interface SourceCount {
  source: string;
  live: number;
  stale: number;
  pending: number;
  hidden: number;
  last_seen: string | null;
}

const EVIDENCE: Record<string, string> = {
  F: "F · publisher's page read",
  S: "S · search summary only",
  A: "A · aggregator only (lead)",
};

const ERRORS: Record<string, string> = {
  service: "The service key isn't configured, so nothing can be saved.",
  save: "Saving failed. Check the server log and try again.",
  nofile: "Pick a CSV file first.",
  toobig: "That file is over 2 MB.",
  empty: "No usable rows in that file (each row needs a project name and a Canadian province).",
  invalid: "Some fields were not valid.",
};

/**
 * Review queue for major projects. Manual research rows (CSV uploads) stay
 * private until approved here; open-data rows are public on import and can
 * be hidden with Reject (the importer never un-hides them).
 */
export default async function AdminMajorProjectsPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<Record<string, string | undefined>> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = await searchParams;

  let pending: QueueRow[] = [];
  let rejected: QueueRow[] = [];
  let counts: SourceCount[] = [];
  let missing = false;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const cols = "id,slug,name,owner,city,province,category,status,status_raw,est_value_cad,general_contractor,bid_list_url,bid_route,evidence,caveats,description,sources,review_status,updated_at";
    const [p, r, c] = await Promise.all([
      supabase.from("major_projects").select(cols).eq("review_status", "pending").order("est_value_cad", { ascending: false, nullsFirst: false }).limit(200),
      supabase.from("major_projects").select(cols).eq("review_status", "rejected").order("updated_at", { ascending: false }).limit(50),
      supabase.from("major_project_source_counts").select("source,live,stale,pending,hidden,last_seen").order("source"),
    ]);
    missing = Boolean(p.error);
    pending = (p.data as unknown as QueueRow[]) ?? [];
    rejected = (r.data as unknown as QueueRow[]) ?? [];
    counts = (c.data as unknown as SourceCount[]) ?? [];
  }

  return (
    <>
      {isDemoMode() && <DemoBanner />}
      <PageHeader
        title="Major projects"
        description="Open-data projects import weekly and go public automatically. Research rows (CSV uploads) wait here until you approve each one."
      />

      {sp.error && <p className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{ERRORS[sp.error] ?? "Something went wrong."}</p>}
      {sp.uploaded != null && (
        <p className="mb-4 rounded-md border border-teal-300 bg-teal-50 p-3 text-sm">
          Upload done: {sp.uploaded} new, {sp.updated} changed (back in the queue), {sp.unchanged} unchanged, {sp.skipped} skipped.
        </p>
      )}
      {missing && <p className="mb-4 text-sm text-muted-foreground">The major_projects table isn&apos;t there yet. Run migrations 20261012000001_major_projects.sql and 20261012000003_major_projects_wave2.sql.</p>}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Sources</h2>
        {counts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing imported yet. The weekly crons (/api/cron/major-projects, /funding, /local) fill this; add ?dry=1 to preview.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Source</th><th>Live</th><th>Stale</th><th>Pending</th><th>Hidden</th><th>Last seen</th></tr></thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.source} className="border-t border-border">
                  <td className="py-1 font-medium">{c.source}</td><td>{c.live}</td><td>{c.stale}</td><td>{c.pending}</td><td>{c.hidden}</td><td>{c.last_seen ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-8 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-1 text-lg font-semibold">Upload an open-data file</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          For feeds whose website blocks automated downloads in robots.txt (Infrastructure Canada). Download the file in your browser, then upload it here, about once a month. Rows go public right away under the source&apos;s open licence; projects missing from a newer file are marked as no longer listed.
        </p>
        <MajorProjectSourceUpload sources={Object.values(UPLOAD_SOURCES).map((s) => ({ key: s.key, label: s.label, fileUrl: s.fileUrl }))} />
      </section>

      <section className="mb-8 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-1 text-lg font-semibold">Upload a research CSV</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          e.g. briefs/research/2026-10-11-canada-data-centres.csv or briefs/research/major-projects/major-projects.csv. Rows outside Canada are skipped. Re-uploading is safe: unchanged rows stay as they are, changed rows come back here for review.
        </p>
        <form action={uploadResearchCsvAction} className="flex flex-wrap items-end gap-3">
          <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
          <label className="text-sm">
            <span className="mr-2 text-muted-foreground">Type when the name doesn&apos;t say</span>
            <select name="category" defaultValue="" className="rounded-md border border-border px-2 py-1">
              <option value="">From file name</option>
              {MAJOR_PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">Queue for review</button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Waiting for review ({pending.length})</h2>
        {pending.length === 0 ? (
          <EmptyState title="Queue is clear" description="Uploaded research rows land here before anything goes public." />
        ) : (
          <div className="space-y-4">
            {pending.map((r) => (
              <article key={r.id} className="rounded-lg border border-border bg-card p-5" data-row={r.slug}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[r.city, r.province].filter(Boolean).join(", ")} · {r.category} · {r.status}{r.status_raw ? ` (“${r.status_raw}”)` : ""}
                      {r.est_value_cad ? ` · ${compactDollars(Number(r.est_value_cad))}` : ""}
                    </p>
                    <p className="mt-1 text-xs">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${r.evidence === "F" ? "bg-teal-100" : r.evidence === "A" ? "bg-red-100" : "bg-amber-100"}`}>
                        Evidence: {r.evidence ? EVIDENCE[r.evidence] : "not given"}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={reviewMajorProjectAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">Approve</button>
                    </form>
                    <Link href={`/admin/major-projects/${r.id}`} className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary">Edit</Link>
                    <form action={reviewMajorProjectAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <button className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary">Reject</button>
                    </form>
                  </div>
                </div>
                {r.owner && <p className="mt-2 text-sm"><b>Owner:</b> {r.owner}</p>}
                {r.description && <p className="mt-1 text-sm text-foreground/90">{r.description}</p>}
                <p className="mt-1 text-sm"><b>GC (Pro):</b> {r.general_contractor ?? "—"}</p>
                {(r.bid_route || r.bid_list_url) && <p className="mt-1 text-sm"><b>Bid route (Pro):</b> {r.bid_list_url ? <a href={r.bid_list_url} className="text-teal-ink underline" target="_blank" rel="noreferrer">{r.bid_list_url}</a> : null} {r.bid_route}</p>}
                {r.caveats && <p className="mt-1 text-sm text-amber-900"><b>Caveats:</b> {r.caveats}</p>}
                {r.sources && r.sources.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {r.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-teal-ink underline">{s.url}</a></li>)}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {rejected.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Hidden / rejected ({rejected.length})</h2>
          <ul className="space-y-2 text-sm">
            {rejected.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3">
                <span>{r.name} <span className="text-muted-foreground">({[r.city, r.province].filter(Boolean).join(", ")})</span></span>
                <form action={reviewMajorProjectAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="requeue" />
                  <button className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary">Back to queue</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
