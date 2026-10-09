import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured } from "@/lib/supabase/config";
import { backfillProjectPhotos } from "@/lib/projects/photo-storage";

// Moving a few hundred photos takes a while.
export const maxDuration = 300;

/**
 * One-off (and safe to repeat): put every existing project's photos in the
 * bucket its visibility calls for. Unlisted/private projects' photos leave
 * the public bucket, so their old public URLs stop working.
 *
 *   GET  /api/projects/photo-backfill            dry run: what would move
 *   POST /api/projects/photo-backfill?apply=1    move them
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`, or a signed-in admin.
 * Never runs for anyone else, even when CRON_SECRET isn't set.
 */
export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  return NextResponse.json(await backfillProjectPhotos({ apply: false }), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  return NextResponse.json(await backfillProjectPhotos({ apply }), { headers: { "Cache-Control": "no-store" } });
}

async function authorized(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const session = await getSession().catch(() => null);
  return Boolean(session && isAdminRole(session.profile.primary_role) && session.profile.status !== "suspended");
}
