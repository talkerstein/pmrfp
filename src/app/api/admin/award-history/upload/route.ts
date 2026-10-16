import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { MAX_UPLOAD_BYTES, hasHeader, uploadText } from "@/lib/major-projects/upload";
import { CANADABUYS_HEADER, CANADABUYS_SOURCE, parseCanadabuysCsv } from "@/lib/contract-history/sources/canadabuys";
import { addMonths } from "@/lib/intel/model";
import { applyHistory, prepareAwards } from "@/lib/contract-history/sync";
import { coverageOf } from "@/lib/contract-history/coverage";
import { forgetHistorySlice } from "@/lib/contract-history/load";
import { isoDay } from "@/lib/contract-history/model";

// One record-aligned piece of the file (~3 MB of CSV, gzipped by the browser).
export const maxDuration = 120;

/**
 * Upload a CanadaBuys award-notice file an admin downloaded in a browser
 * (canadabuys.canada.ca's robots.txt bars every bot, so no PMRFP job fetches
 * it): POST /api/admin/award-history/upload?source=ca-canadabuys-awards
 * [&dry=1][&since=YYYY-MM-DD], body = one gzipped piece (header line + whole
 * records). The admin page splits the file and sends the pieces in order.
 * Admins only, same-origin only. Upserts into award_history; deletes nothing.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const session = await getSession().catch(() => null);
  if (!session || !isAdminRole(session.profile.primary_role) || session.profile.status === "suspended") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = new URL(request.url).searchParams;
  if (q.get("source") !== CANADABUYS_SOURCE) return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  const dry = q.get("dry") === "1";
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length) return NextResponse.json({ error: "Empty piece" }, { status: 400 });
  if (body.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Piece too large (over 4.4 MB after compression)" }, { status: 413 });
  let text: string;
  try {
    text = uploadText(body);
  } catch {
    return NextResponse.json({ error: "Could not read the piece" }, { status: 400 });
  }
  if (!hasHeader(text, CANADABUYS_HEADER)) return NextResponse.json({ error: `Not a CanadaBuys award-notice file: no ${CANADABUYS_HEADER} column` }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const since = isoDay(q.get("since")) ?? addMonths(today, -5 * 12);
  const batch = parseCanadabuysCsv(text, { since, asOf: today });
  const { rows, invalid } = prepareAwards(batch.awards);
  const result: Record<string, unknown> = { source: CANADABUYS_SOURCE, dry, since, read: batch.read, kept: rows.length, skipped: batch.skipped, invalid, coverage: coverageOf(rows, [], today) };
  if (!dry && isServiceConfigured()) {
    result.written = await applyHistory(createServiceClient(), rows, []);
    forgetHistorySlice();
    await logAudit({ actorUserId: session.userId, action: "award_history.upload", entityType: "award_history", metadata: { source: CANADABUYS_SOURCE, kept: rows.length } });
  }
  return NextResponse.json(result);
}
