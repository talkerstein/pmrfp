import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { reviewMajorProjectAction, updateMajorProjectAction } from "@/lib/major-projects/actions";
import { MAJOR_PROJECT_CATEGORIES, MAJOR_PROJECT_STATUSES } from "@/lib/major-projects/model";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Edit major project · Admin · PMRFP" };

interface Row {
  id: string;
  slug: string;
  source: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  status_date: string | null;
  owner: string | null;
  city: string | null;
  province: string | null;
  est_value_cad: number | null;
  size: string | null;
  timeline: string | null;
  general_contractor: string | null;
  bid_list_url: string | null;
  bid_route: string | null;
  trades_needed: string[];
  caveats: string | null;
  evidence: string | null;
  review_status: string;
  approved: boolean;
  sources: { label: string; url: string }[] | null;
}

const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function Field({ label, name, value, area }: { label: string; name: string; value: string | number | null; area?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {area ? (
        <textarea name={name} defaultValue={value ?? ""} rows={4} className={input} />
      ) : (
        <input name={name} defaultValue={value ?? ""} className={input} />
      )}
    </label>
  );
}

export default async function AdminMajorProjectEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const { id } = await params;
  const sp = await searchParams;
  if (isDemoMode() || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("major_projects").select("*").eq("id", id).maybeSingle();
  const r = data as Row | null;
  if (!r) notFound();
  const isPublic = r.review_status !== "rejected" && (r.source !== "manual" || r.approved);

  return (
    <>
      <PageHeader
        title={r.name}
        description={`${r.source} · ${r.review_status}${isPublic ? " · public" : " · private"}${r.evidence ? ` · evidence ${r.evidence}` : ""}`}
      />
      <p className="mb-4 text-sm">
        <Link href="/admin/major-projects" className="text-teal-ink underline">← Back to the queue</Link>
        {isPublic && <> · <Link href={`/major-projects/${r.slug}`} className="text-teal-ink underline">Public page</Link></>}
      </p>
      {sp.saved && <p className="mb-4 rounded-md border border-teal-300 bg-teal-50 p-3 text-sm">Saved.</p>}
      {sp.error && <p className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">Not saved: {sp.error === "province" ? "province must be a Canadian province." : "check the fields and try again."}</p>}
      {r.source !== "manual" && (
        <p className="mb-4 text-sm text-muted-foreground">Open-data row: your edits stay until the source itself changes this project; then the weekly import overwrites them.</p>
      )}

      <form action={updateMajorProjectAction} className="grid max-w-3xl gap-4">
        <input type="hidden" name="id" value={r.id} />
        <Field label="Name" name="name" value={r.name} />
        <Field label="Description" name="description" value={r.description} area />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Type</span>
            <select name="category" defaultValue={r.category} className={input}>
              {MAJOR_PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Status</span>
            <select name="status" defaultValue={r.status} className={input}>
              {MAJOR_PROJECT_STATUSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <Field label="Status date (YYYY-MM-DD)" name="statusDate" value={r.status_date} />
          <Field label="Estimated value (CAD, e.g. 750000000 or 750M)" name="value" value={r.est_value_cad} />
          <Field label="Owner" name="owner" value={r.owner} />
          <Field label="City" name="city" value={r.city} />
          <Field label="Province" name="province" value={r.province} />
          <Field label="Size" name="size" value={r.size} />
        </div>
        <Field label="Timeline" name="timeline" value={r.timeline} />
        <Field label="General contractor (Trade Pro)" name="gc" value={r.general_contractor} />
        <Field label="Bid-list / prequalification URL (Trade Pro)" name="bidListUrl" value={r.bid_list_url} />
        <Field label="How to get on the bid list (Trade Pro)" name="bidRoute" value={r.bid_route} area />
        <Field label="Trades needed (trade slugs, comma separated)" name="trades" value={r.trades_needed.join(", ")} />
        <Field label="Caveats" name="caveats" value={r.caveats} area />
        <div>
          <button className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Save</button>
        </div>
      </form>

      {r.sources && r.sources.length > 0 && (
        <section className="mt-8 max-w-3xl">
          <h2 className="mb-2 font-semibold">Sources</h2>
          <ul className="list-disc pl-5 text-sm">
            {r.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-teal-ink underline">{s.url}</a></li>)}
          </ul>
        </section>
      )}

      <div className="mt-8 flex gap-2">
        {!(r.approved && r.review_status === "approved") && (
          <form action={reviewMajorProjectAction}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="decision" value="approve" />
            <button className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">Approve (make public)</button>
          </form>
        )}
        {r.review_status !== "rejected" && (
          <form action={reviewMajorProjectAction}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="decision" value="reject" />
            <button className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary">Reject / hide</button>
          </form>
        )}
      </div>
    </>
  );
}
