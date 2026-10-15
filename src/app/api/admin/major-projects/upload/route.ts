import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { fundingMinValue } from "@/lib/major-projects/model";
import { UPLOAD_SOURCES } from "@/lib/major-projects/sources-wave2";
import { MAX_UPLOAD_BYTES, hasHeader, uploadText } from "@/lib/major-projects/upload";
import { applySync, loadExisting, loadRegionLookup, planSummary, planSync } from "@/lib/major-projects/sync";

// A 9 MB CSV: gunzip + parse + up to ~2,000 rows in batches of 200.
export const maxDuration = 120;

/**
 * Upload a source file an admin downloaded by hand (robots.txt blocks
 * automated access to it): POST /api/admin/major-projects/upload?source=
 * infrastructure-canada[&dry=1], body = the file, gzipped by the browser.
 * Admins only, same-origin only. The rows are open data (OGL-Canada), so
 * they are public on import like any feed; stale marking and the
 * broken-feed guard work exactly as in the weekly import.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const session = await getSession().catch(() => null);
  if (!session || !isAdminRole(session.profile.primary_role) || session.profile.status === "suspended") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const source = UPLOAD_SOURCES[params.get("source") ?? ""];
  if (!source) return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  const dry = params.get("dry") === "1";

  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length) return NextResponse.json({ error: "Empty file" }, { status: 400 });
  if (body.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File too large (over 4.4 MB after compression)" }, { status: 413 });
  let text: string;
  try {
    text = uploadText(body);
  } catch {
    return NextResponse.json({ error: "Could not read the file" }, { status: 400 });
  }
  if (!hasHeader(text, source.header)) return NextResponse.json({ error: `Not the ${source.label}: no ${source.header} column` }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const fundingMin = fundingMinValue();
  const rows = source.parse(text, { today, fundingMin });
  const result: Record<string, unknown> = { source: source.key, dry, fundingMin, parsed: rows.length, withValue: rows.filter((r) => r.estValueCad != null).length };

  if (isServiceConfigured()) {
    const supabase = createServiceClient();
    const [existing, regions] = await Promise.all([loadExisting(supabase, source.key), loadRegionLookup(supabase)]);
    const plan = planSync({
      source: source.key,
      incoming: rows,
      existing,
      today,
      now: new Date().toISOString(),
      regionIdBySlug: regions.bySlug,
      provinceRegionId: regions.provinceRegionId,
    });
    Object.assign(result, planSummary(plan));
    if (!dry) {
      try {
        await applySync(supabase, plan, today);
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
      }
    }
  } else if (!dry) {
    result.error = "The service key isn't configured, so nothing was saved.";
  }

  if (!dry) {
    await logAudit({ actorUserId: session.userId, action: "major_project.source_upload", entityType: "major_project", metadata: { ...result } });
  }
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
