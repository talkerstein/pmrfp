import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession, isAdminRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { jobsFor, runJobs } from "@/lib/open-data/run";

// Weekly: ~5 cities x a few requests each. Monthly: 4 small requests. Well under a minute.
export const maxDuration = 120;

/**
 * Open-data imports (Vercel cron), batch 1. Groups:
 *   weekly   city permit leads (ArcGIS pilot cities)
 *   monthly  Calgary contractor activity + Toronto capital project pipeline
 * Options: ?dry=1 (fetch and report, write nothing, works without the
 * service key), ?source=<source key or city key>, ?limit=N (raw rows per city).
 * Protect with CRON_SECRET if set (signed-in admins may also call it).
 * Vancouver and the federal contracts file are local scripts, not crons
 * (scripts/run-open-data.mjs, scripts/import-federal-contracts.mjs).
 */
export async function GET(request: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  if (group !== "weekly" && group !== "monthly") return NextResponse.json({ error: "Unknown group" }, { status: 404 });

  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    const session = await getSession().catch(() => null);
    if (!session || !isAdminRole(session.profile.primary_role) || session.profile.status === "suspended") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const q = new URL(request.url).searchParams;
  const dry = q.get("dry") === "1";
  if (!isServiceConfigured() && !dry) return NextResponse.json({ skipped: "no service client" });

  const today = new Date().toISOString().slice(0, 10);
  const db = dry ? null : createServiceClient();
  const { reports, failed } = await runJobs(jobsFor(group, q.get("source")), {
    today,
    db,
    only: q.get("source"),
    limit: Number(q.get("limit")) || undefined,
  });
  // Pages that show this data keep a 24 h cache; mark them stale so the next visit refreshes (stale-while-revalidate).
  if (db) revalidateTag("open-data", "max");
  return NextResponse.json({ dry, group, today, sources: reports }, { status: failed && failed === reports.length ? 500 : 200 });
}
