import type { Metadata } from "next";
import { requireRole } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { CanadabuysUpload } from "@/components/admin/canadabuys-upload";
import { filesFor } from "@/lib/tenders/canadabuys-upload";
import { canadabuysFetchAllowed } from "@/lib/tenders/canadabuys-access";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "CanadaBuys Upload · Admin · PMRFP" };
// The file names depend on today's fiscal year.
export const dynamic = "force-dynamic";

/**
 * Admin: keep the CanadaBuys listings current by upload. canadabuys.canada.ca
 * allows only Googlebot and bingbot in robots.txt (re-checked 2026-10-16) and
 * open.canada.ca only links to the same files, so the crons don't download
 * them unless CANADABUYS_DIRECT_FETCH=1. English only (admin screen).
 */
export default async function AdminCanadabuysPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const today = new Date().toISOString().slice(0, 10);
  const direct = canadabuysFetchAllowed();

  return (
    <>
      <PageHeader
        title="CanadaBuys upload"
        description="Federal tenders, past contracts and closed tenders from CanadaBuys open data (Open Government Licence – Canada). canadabuys.canada.ca's robots.txt blocks every bot except Google and Bing, so PMRFP's jobs don't download these files. Download them in your browser and upload them here; the same rules and sync as the old daily job run on the upload."
      />
      <p className={`mb-6 rounded-md px-3 py-2 text-sm ${direct ? "bg-amber-50 text-amber-900" : "bg-secondary/60"}`}>
        Automated download: <strong>{direct ? "ON (CANADABUYS_DIRECT_FETCH=1)" : "OFF"}</strong>.{" "}
        {direct
          ? "Only keep this on with written permission from CanadaBuys (PSPC)."
          : "Upload open tenders daily (new federal tenders only alert members on the day they are imported), past contracts weekly, closed tenders weekly."}
      </p>
      <div className="space-y-6">
        <CanadabuysUpload kind="open" files={filesFor("open", today)} label="Open tenders (daily)" />
        <CanadabuysUpload kind="awards" files={filesFor("awards", today)} label="Past contracts: award notices, this fiscal year and last (weekly)" />
        <CanadabuysUpload kind="closed" files={filesFor("closed", today)} label="Closed-tender archive: tender and award files for the last ~18 months (weekly)" />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Every file is required for its feed: a partial upload would archive listings that are still valid. Preview first to see the counts. Award history for Award Intelligence has its own upload at /admin/award-history.
      </p>
    </>
  );
}
