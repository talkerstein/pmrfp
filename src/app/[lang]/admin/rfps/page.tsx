import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate, dash } from "@/lib/admin/queries";
import type { RfpPost } from "@/types/db";
import { reviewRfpAction } from "@/lib/admin/rfp-actions";
import { setLangFrom } from "@/i18n/server";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { pmJobAlertsEnabled } from "@/lib/pm-jobs/alerts";
import { isPmJobSource } from "@/lib/pm-jobs/rules";
import { runPmJobAlerts, type AlertRunResult } from "@/lib/pm-jobs/server";

export const metadata: Metadata = { title: "RFPs · Admin · PMRFP" };

type RfpRow = Pick<RfpPost, "id" | "title" | "status" | "deadline" | "source_type" | "created_at">;

const DEMO_RFPS: RfpRow[] = [
  { id: "1", title: "Condominium Electrical Maintenance Contract", status: "published", deadline: "2026-07-15", source_type: "property_manager_direct", created_at: "2026-05-15" },
  { id: "2", title: "Commercial Plaza Snow Removal Services", status: "pending_review", deadline: "2026-09-30", source_type: "admin_seeded", created_at: "2026-05-22" },
  { id: "3", title: "Apartment Building HVAC Preventive Maintenance", status: "published", deadline: "2026-08-01", source_type: "property_manager_direct", created_at: "2026-05-10" },
  { id: "4", title: "Retail Property Parking Lot Asphalt Repair", status: "draft", deadline: "2026-07-31", source_type: "admin_seeded", created_at: "2026-05-24" },
];

type Search = { published?: string; alerts?: string; n?: string; rejected?: string; preview?: string };

/** What the admin sees after a publish or reject (lib/admin/rfp-actions puts it in the URL). */
function reviewBanner(sp: Search): { tone: "ok" | "warn"; text: string } | null {
  if (sp.rejected) return { tone: "ok", text: "Rejected. The poster was emailed your reason." };
  if (!sp.published) return null;
  const n = Number(sp.n) || 0;
  const trades = `${n} matching ${n === 1 ? "person" : "people"}`;
  switch (sp.alerts) {
    case "on":
      return { tone: "ok", text: n ? `Published. Emailing ${trades} now (same-day job alert).` : "Published. No matching trades to email for this job yet." };
    case "off":
      return { tone: "warn", text: `Published. Job alerts are off (PM_JOB_ALERTS_ENABLED), so nobody was emailed: ${trades} would have been.` };
    case "no_address":
      return { tone: "warn", text: `Published, but no job alerts went out: BUSINESS_MAILING_ADDRESS isn't set (required by CASL). ${trades} would have been emailed.` };
    default:
      return { tone: "ok", text: "Published. Not a property-manager job, so no same-day alert (Trade Pro members get it in their daily digest)." };
  }
}

export default async function AdminRfpsPage({ params, searchParams }: { params: Promise<object>; searchParams?: Promise<Search> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = (await searchParams) ?? {};
  const banner = reviewBanner(sp);
  const alertsOn = pmJobAlertsEnabled();
  const addressSet = Boolean(process.env.BUSINESS_MAILING_ADDRESS?.trim());

  let rows = DEMO_RFPS;
  let waiting: RfpRow[] = DEMO_RFPS.filter((r) => r.status === "pending_review");
  if (!isDemoMode()) {
    const supabase = await createClient();
    const [{ data }, { data: queue }] = await Promise.all([
      supabase
        .from("rfp_posts")
        .select("id, title, status, deadline, source_type, created_at")
        .order("created_at", { ascending: false })
        .returns<RfpRow[]>(),
      // Asked for separately: the full list is capped at 1,000 rows by the
      // API and is mostly imported tenders, so a waiting post could fall off.
      supabase
        .from("rfp_posts")
        .select("id, title, status, deadline, source_type, created_at")
        .eq("status", "pending_review")
        .order("created_at", { ascending: false })
        .returns<RfpRow[]>(),
    ]);
    rows = data ?? [];
    waiting = queue ?? [];
  }
  // Dry run: who a waiting (or published) job would email right now. Sends nothing.
  const previewRow = sp.preview ? [...waiting, ...rows].find((r) => r.id === sp.preview) ?? null : null;
  let preview: AlertRunResult | null = null;
  if (previewRow && isPmJobSource(previewRow.source_type) && !isDemoMode() && isServiceConfigured()) {
    preview = await runPmJobAlerts(createServiceClient(), previewRow.id, { dry: true }).catch(() => null);
  }

  return (
    <>
      <PageHeader
        title="RFPs"
        description="Every posted opportunity. Review, publish, and seed new RFPs."
        action={
          <Link href="/admin/rfps/new" className={buttonVariants({ size: "lg" })}>
            New RFP
          </Link>
        }
      />
      {isDemoMode() && <DemoBanner />}

      {banner && (
        <p
          className={`mb-4 rounded-lg border p-4 text-sm ${banner.tone === "ok" ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
          data-banner={sp.alerts ?? (sp.rejected ? "rejected" : "")}
        >
          {banner.text}
        </p>
      )}
      <p className="mb-6 text-sm text-muted-foreground" data-alerts={alertsOn ? "on" : "off"}>
        Same-day job alerts to matching trades (free and Pro) when you publish a property-manager job:{" "}
        <strong className={alertsOn ? "text-green-700" : "text-amber-700"}>{alertsOn ? "ON" : "OFF"}</strong>
        {alertsOn ? (addressSet ? "." : ". Blocked until BUSINESS_MAILING_ADDRESS is set.") : " (set PM_JOB_ALERTS_ENABLED=1 in Vercel to turn them on)."}
      </p>

      {previewRow && (
        <section className="mb-8 rounded-lg border border-border bg-card p-5" data-preview={previewRow.id}>
          <h2 className="text-base font-semibold">Alert preview: {dash(previewRow.title)}</h2>
          {!isPmJobSource(previewRow.source_type) ? (
            <p className="mt-2 text-sm text-muted-foreground">Not a property-manager job: no same-day alert.</p>
          ) : !preview || preview.reason === "not_found" || preview.reason === "not_pm_job" ? (
            <p className="mt-2 text-sm text-muted-foreground">Preview unavailable for this listing.</p>
          ) : (
            <>
              <p className="mt-2 text-sm">
                This job would alert <strong>{preview.wouldEmail}</strong> {preview.wouldEmail === 1 ? "person" : "people"} at{" "}
                <strong>{preview.orgs.length}</strong> matching {preview.orgs.length === 1 ? "company" : "companies"}
                {preview.orgs.length ? ":" : "."}
                {preview.skipped && preview.skipped.optedOut + preview.skipped.weekly + preview.skipped.alreadySent > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    (left out: {preview.skipped.optedOut} turned these emails off, {preview.skipped.weekly} get them weekly instead,{" "}
                    {preview.skipped.alreadySent} already sent)
                  </span>
                )}
              </p>
              {preview.orgs.length > 0 && (
                <ul className="mt-2 max-h-64 list-disc overflow-y-auto pl-5 text-sm text-muted-foreground">
                  {preview.orgs.slice(0, 200).map((o, i) => (
                    <li key={`${o.name}-${i}`}>
                      {o.name}
                      {o.city ? ` (${o.city})` : ""}
                      {o.pro ? " · Pro" : " · free"}
                    </li>
                  ))}
                </ul>
              )}
              {preview.truncated && <p className="mt-2 text-xs text-amber-700">More match than one run sends; the hourly catch-up sends the rest.</p>}
              {!alertsOn && <p className="mt-2 text-xs text-muted-foreground">Alerts are off: publishing sends nothing until PM_JOB_ALERTS_ENABLED=1.</p>}
            </>
          )}
          <Link href="/admin/rfps" className="mt-3 inline-block text-sm font-medium text-teal-ink hover:underline">
            Close preview
          </Link>
        </section>
      )}

      {waiting.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">
            Waiting for review ({waiting.length}): hidden until you publish
          </h2>
          <AdminTable columns={["Title", "Source", "Deadline", "Created", ""]}>
            {waiting.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-xs truncate font-medium">{dash(r.title)}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{r.source_type.replace(/_/g, " ")}</TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(r.deadline)}</TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                <TableCell>
                  {!isDemoMode() && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={reviewRfpAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="published" />
                          <button className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90">
                            Publish
                          </button>
                        </form>
                        {isPmJobSource(r.source_type) && (
                          <Link href={`/admin/rfps?preview=${r.id}`} className="text-xs font-medium text-teal-ink hover:underline">
                            Preview alerts
                          </Link>
                        )}
                      </div>
                      <form action={reviewRfpAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="decision" value="rejected" />
                        <input
                          name="reason"
                          required
                          maxLength={1000}
                          placeholder="Short reason for the poster"
                          aria-label="Reason sent to the poster"
                          className="h-7 w-48 rounded-md border border-input bg-transparent px-2 text-xs"
                        />
                        <button className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-secondary">
                          Reject
                        </button>
                      </form>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </AdminTable>
        </section>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No RFPs yet"
          description="Posted and seeded opportunities will appear here."
        >
          <Link href="/admin/rfps/new" className={buttonVariants({ size: "lg" })}>
            Seed an RFP
          </Link>
        </EmptyState>
      ) : (
        <AdminTable columns={["Title", "Status", "Deadline", "Source", "Created"]}>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-xs truncate font-medium">{dash(r.title)}</TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(r.deadline)}</TableCell>
              <TableCell className="capitalize text-muted-foreground">
                {r.source_type.replace(/_/g, " ")}
                {r.status === "published" && isPmJobSource(r.source_type) && (
                  <Link href={`/admin/rfps?preview=${r.id}`} className="ml-2 text-xs normal-case text-teal-ink hover:underline">
                    alerts
                  </Link>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
