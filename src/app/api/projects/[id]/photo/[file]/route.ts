import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { isPrivatePhotoRef, sanitizePhotos } from "@/lib/projects/photos";
import { canViewProjectPhotos } from "@/lib/projects/photo-access";
import { REDIRECT_URL_TTL, supabasePhotoStore } from "@/lib/projects/photo-storage";
import { isSchemaMissing } from "@/lib/projects/compat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/projects/<caseStudyId>/photo/<fileId> — one photo of an UNLISTED
 * project, for its cached public page. Checked on every request: the
 * project must still be published and not private, and the photo must be
 * one of its own. Then a two-minute signed URL. Anything else is a 404 that
 * looks the same, so this can't be used to probe for private projects.
 *
 * Private projects never come through here: their viewers (the company,
 * share-link holders, admins) get signed URLs straight from dynamic pages.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const limited = await checkRateLimit(request, "public-read");
  if (limited) return rateLimitResponse(limited);

  const { id, file } = await params;
  if (!UUID.test(id) || !UUID.test(file) || !isServiceConfigured()) return notFound();

  const db = createServiceClient();
  const { data, error } = await db
    .from("case_studies")
    .select("id,organization_id,status,visibility,photos")
    .eq("id", id)
    .maybeSingle();
  // Before the portfolio migration nothing is unlisted.
  if (error || !data || isSchemaMissing(error)) return notFound();
  const row = data as { id: string; organization_id: string; status: string; visibility: string | null; photos: unknown };
  const project = { id: row.id, organizationId: row.organization_id, visibility: row.visibility, status: row.status };
  if (!canViewProjectPhotos(project, { kind: "anonymous" })) return notFound();

  const sb = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const path = `${row.organization_id}/${file.toLowerCase()}.jpg`;
  const photo = sanitizePhotos(row.photos, sb, row.organization_id, { includePrivate: true }).find(
    (p) => p.path.toLowerCase() === path,
  );
  if (!photo) return notFound();
  // A public project's photo is already public.
  if (!isPrivatePhotoRef(photo.url, sb)) return redirect(photo.url);

  const signed = await supabasePhotoStore(db).sign([photo.path], REDIRECT_URL_TTL);
  const url = signed.get(photo.path);
  return url ? redirect(url) : notFound();
}

function redirect(url: string) {
  const res = NextResponse.redirect(url, 302);
  // Re-checked on every view: a project made private stops here at once.
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

function notFound() {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}
