import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { readUploadBody, uploadText } from "@/lib/major-projects/upload";
import { payloadError, type UploadPayload } from "@/lib/tenders/canadabuys-upload";
import { closedTendersSource, openTendersSource, pastAwardsSource } from "@/lib/tenders/canadabuys-feeds";
import { syncPublicSources, type Source } from "@/lib/tenders/sync";
import { isVpsLiveCustomerAuth, matchesCustomerOrigin } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";

// Sync of a few hundred to ~1,000 rows (inserts, refreshes, archives).
export const maxDuration = 300;

/**
 * Admin upload of CanadaBuys open-data rows (canadabuys.canada.ca's
 * robots.txt bars every bot, so the daily/weekly crons don't download it):
 * POST /api/admin/canadabuys/upload[?dry=1], body = gzipped JSON built by the
 * /admin/canadabuys page from files the admin downloaded in a browser. Runs
 * the same classifiers and sync as the cron for one feed: open tenders,
 * past contracts (awards) or the closed-tender archive. Admins only,
 * same-origin only.
 */
export async function POST(request: Request) {
  const native = isVpsLiveCustomerAuth();
  if (!native && !isSupabaseConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const session = await getSession().catch(() => null);
  if (!session || !isAdminRole(session.profile.primary_role) ||
    (native ? session.profile.status !== "active" : session.profile.status === "suspended")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (native ? !matchesCustomerOrigin(request) : origin && new URL(origin).host !== new URL(request.url).host) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  let payload: UploadPayload;
  try {
    const body = await readUploadBody(request);
    if (!body) return NextResponse.json({ error: "Upload too large (over 4.4 MB after compression)" }, { status: 413 });
    if (!body.length) return NextResponse.json({ error: "Empty upload" }, { status: 400 });
    payload = JSON.parse(uploadText(body)) as UploadPayload;
  } catch {
    return NextResponse.json({ error: "Could not read the upload" }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const problem = payloadError(payload, today);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const source: Source =
    payload.kind === "open"
      ? openTendersSource(async () => payload.rows)
      : payload.kind === "awards"
        ? pastAwardsSource(async () => payload.rows)
        : closedTendersSource(async () => ({ tenders: payload.rows, awards: payload.awards ?? [] }));

  if (!native && !isServiceConfigured()) return NextResponse.json({ error: "Service client not configured" }, { status: 503 });
  try {
    const { status, body: result } = await syncPublicSources(native ? vpsAppDatabase() : createServiceClient(), [source], { today, dry });
    if (!dry && status === 200) {
      await logAudit({
        actorUserId: session.userId,
        action: "canadabuys.upload",
        entityType: "rfp_posts",
        metadata: { kind: payload.kind, files: payload.files, rows: payload.rows.length, ...result },
      });
    }
    return NextResponse.json({ kind: payload.kind, dry, rowsReceived: payload.rows.length, ...result }, { status });
  } catch {
    return NextResponse.json({ error: "The CanadaBuys import did not complete. Retry the same upload." }, { status: 503 });
  }
}
