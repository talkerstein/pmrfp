import { NextResponse } from "next/server";
import { syncLinkSignals } from "@/lib/links/sync";
import { purgeOutCache } from "@/lib/links/data";

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
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const report = await syncLinkSignals({ dry });
  if (!dry && report.changed) purgeOutCache();
  return NextResponse.json(report);
}
