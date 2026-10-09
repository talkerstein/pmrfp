import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { countActiveProjects, getProjectSessionFromRequest } from "@/lib/projects/server";
import { canAddProject } from "@/lib/projects/limits";
import { MAX_UPLOAD_BYTES, processPhoto, UnreadableImageError } from "@/lib/projects/image";
import { PRIVATE_PHOTO_BUCKET, PROJECT_PHOTO_BUCKET, photoPath } from "@/lib/projects/photos";
import { ensurePrivateBucket, SIGNED_URL_TTL, supabasePhotoStore } from "@/lib/projects/photo-storage";

export const maxDuration = 30;

/**
 * POST /api/projects/photos — one image per request (multipart, field
 * "file"). The capture page already shrinks photos in the browser; this is
 * the trust boundary: re-encode with sharp (upright, ≤1920px, JPEG, all
 * metadata incl. GPS stripped), then store at
 * project-photos-private/{orgId}/{uuid}.jpg with the service role and answer
 * with a signed URL for the preview. There is no client-side upload path to
 * either photo bucket.
 * The mobile app calls this too, with a bearer token instead of cookies.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "photo-upload");
  if (limited) return rateLimitResponse(limited);

  // Cookie session (web) or bearer token (mobile app).
  const auth = await getProjectSessionFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Sign in to your company account first." }, { status: 401 });
  const { session, db } = auth;
  if (!isServiceConfigured()) {
    return NextResponse.json({ error: "Photo uploads aren't set up here yet." }, { status: 503 });
  }

  // Free plan: one project. Don't take photos for a second one it can't publish.
  if (!session.hasTradeAccess && !canAddProject(false, await countActiveProjects(session.organization.id, db))) {
    return NextResponse.json(
      { error: "The free plan includes one project. Upgrade to Trade Pro to add more.", code: "plan_limit" },
      { status: 403 },
    );
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "That upload didn't come through. Try again." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No photo found in the upload." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That photo is over 15 MB. Try a smaller one." }, { status: 413 });
  }
  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only photos can be uploaded here." }, { status: 415 });
  }

  let processed: Awaited<ReturnType<typeof processPhoto>>;
  try {
    processed = await processPhoto(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof UnreadableImageError) {
      return NextResponse.json(
        { error: "We couldn't read that photo. Try a JPEG or PNG, or take it again with the camera." },
        { status: 422 },
      );
    }
    throw err;
  }

  const path = photoPath(session.organization.id, randomUUID());
  const service = createServiceClient();
  const opts = {
    contentType: "image/jpeg",
    // An hour, not a year: if the project later goes private, a cached
    // public copy (CDN, browser) must not outlive the move by much.
    cacheControl: "3600",
    upsert: false,
  };
  // Private by default: nothing is public until a public project is saved
  // (syncProjectPhotos moves it then). The private bucket is created on
  // first use if the migration couldn't; only if that fails too does the
  // photo go to the public bucket as before (the save still sorts it out).
  const priv = service.storage.from(PRIVATE_PHOTO_BUCKET);
  let { error } = await priv.upload(path, processed.data, opts);
  if (error && /not found/i.test(error.message) && (await ensurePrivateBucket(service))) {
    ({ error } = await priv.upload(path, processed.data, opts));
  }
  if (!error) {
    const signed = await supabasePhotoStore(service).sign([path], SIGNED_URL_TTL);
    const url = signed.get(path);
    if (url) return NextResponse.json({ url, path, width: processed.width, height: processed.height });
    console.error("[projects/photos] couldn't sign the new upload");
    return NextResponse.json({ error: "Couldn't save that photo. Try again in a minute." }, { status: 502 });
  }
  console.error("[projects/photos] private upload failed", error.message);
  const pub = service.storage.from(PROJECT_PHOTO_BUCKET);
  const res = await pub.upload(path, processed.data, opts);
  if (res.error) {
    console.error("[projects/photos] upload failed", res.error.message);
    return NextResponse.json({ error: "Couldn't save that photo. Try again in a minute." }, { status: 502 });
  }
  const { data } = pub.getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path, width: processed.width, height: processed.height });
}
