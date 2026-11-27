import { NextResponse } from "next/server";
import { syncD1LinkSignals, syncLinkSignals } from "@/lib/links/sync";
import { purgeOutCache } from "@/lib/links/data";
import { cronAuthFailure } from "@/lib/cron-auth";
import { vpsAppDatabase } from "@/lib/d1/http-binding";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Daily "earn the link" pass (Vercel cron, 08:25): copies each directory
 * company's paid-plan, badge-installed and indexable answers onto its
 * organization row so public pages can print the right rel without extra
 * reads. `?dry=1` reports what would change and writes nothing. Protect with
 * CRON_SECRET if set. The report has counts only.
 */
export async function GET(request: Request) {
  const failure = cronAuthFailure(request.headers.get("authorization"));
  if (failure) {
    return NextResponse.json({ error: failure === 401 ? "Unauthorized" : "Cron unavailable" }, { status: failure });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const report = process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1"
      ? await syncD1LinkSignals(vpsAppDatabase(), { dry })
      : await syncLinkSignals({ dry });
    if (!dry && report.changed) purgeOutCache();
    return NextResponse.json(report, { status: report.skipped ? 503 : 200 });
  } catch {
    return NextResponse.json({ error: "Link signal sync unavailable" }, { status: 503 });
  }
}
