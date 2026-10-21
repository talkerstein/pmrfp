import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { postsToExport, recordBundle } from "@/lib/town-jobs/records-server";
import { recordFiles } from "@/lib/town-jobs/records";
import { recordLabels } from "@/lib/town-jobs/records-labels";
import { logTownEvent } from "@/lib/town-jobs/server";
import { townBrand } from "@/lib/town-jobs/results-server";
import { zip } from "@/lib/zip/write";
import { getDictionary } from "@/i18n/dictionaries";
import { isEnabledLocale } from "@/i18n/config";

/**
 * A town's records (PMRFP for Towns, Part C): one post (?rfp=<id>) or every
 * post it created in a date range (?from=YYYY-MM-DD&to=YYYY-MM-DD, up to
 * 100), as a ZIP of CSV files plus a printable HTML page per post, with a
 * retention note. Members of the posting town only. A sealed box's
 * responses are included only once it's opened. Each export is logged in
 * the post's record.
 */
export const maxDuration = 60;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const limited = await checkRateLimit(request, "default");
  if (limited) return rateLimitResponse(limited);
  if (!isSupabaseConfigured() || !isServiceConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const org = session.organization;
  if (!org || org.organization_type !== "public_buyer") return NextResponse.json({ error: "Towns only" }, { status: 403 });
  const url = new URL(request.url);
  const rfpId = url.searchParams.get("rfp");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (rfpId && !/^[0-9a-f-]{36}$/i.test(rfpId)) return NextResponse.json({ error: "Bad post" }, { status: 400 });
  if (!rfpId && ((from && !DAY.test(from)) || (to && !DAY.test(to)) || (from && to && from > to))) return NextResponse.json({ error: "Bad dates" }, { status: 400 });
  const langParam = url.searchParams.get("lang");
  const m = getDictionary(isEnabledLocale(langParam) ? langParam : "en");

  const db = createServiceClient();
  const posts = await postsToExport(db, org.id, { rfpId, from, to });
  if (rfpId && !posts.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bundles = [];
  for (const p of posts) bundles.push(await recordBundle(db, p, session.userId));
  const brand = await townBrand(db, org.id);
  const now = new Date().toISOString();
  const range = rfpId ? (posts[0]?.slug ?? rfpId) : `${from ?? "…"} – ${to ?? "…"}`;
  const files = recordFiles(bundles, recordLabels(m), { town: brand.name ?? org.name, exportedAt: now, exportedBy: session.profile.full_name?.trim() || session.profile.email, range });
  const body = zip(files, new Date());
  for (const p of posts) {
    await logTownEvent(db, { rfpId: p.id, organizationId: org.id, buyerKey: p.buyer_key, actorUserId: session.userId, event: "records_exported", detail: { scope: rfpId ? "post" : "range", from, to } });
  }
  const name = rfpId ? `records-${posts[0].slug}` : `records-${from ?? "start"}-to-${to ?? now.slice(0, 10)}`;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name.replace(/[^a-z0-9-]/gi, "-")}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
