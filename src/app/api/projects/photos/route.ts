import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { countActiveProjects, getProjectSession } from "@/lib/projects/server";
import { canAddProject } from "@/lib/projects/limits";
import { MAX_UPLOAD_BYTES, processPhoto, UnreadableImageError } from "@/lib/projects/image";
import { PROJECT_PHOTO_BUCKET, photoPath } from "@/lib/projects/photos";

export const maxDuration = 30;

/**
 * POST /api/projects/photos — one image per request (multipart, field
 * "file"). The capture page already shrinks photos in the browser; this is
 * the trust boundary: re-encode with sharp (upright, ≤1920px, JPEG, all
 * metadata incl. GPS stripped), then store at project-photos/{orgId}/{uuid}.jpg
 * with the service role. There is no client-side upload path to this bucket.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "photo-upload");
  if (limited) return rateLimitResponse(limited);

  const session = await getProjectSession();
  if (!session) return NextResponse.json({ error: "Sign in to your company account first." }, { status: 401 });
  if (!isServiceConfigured()) {
    return NextResponse.json({ error: "Photo uploads aren't set up here yet." }, { status: 503 });
  }

  // Free plan: one project. Don't take photos for a second one it can't publish.
  if (!session.hasTradeAccess && !canAddProject(false, await countActiveProjects(session.organization.id))) {
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
  const storage = createServiceClient().storage.from(PROJECT_PHOTO_BUCKET);
  const { error } = await storage.upload(path, processed.data, {
    contentType: "image/jpeg",
    // Content-addressed (uuid) path, so it can be cached for good.
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    console.error("[projects/photos] upload failed", error.message);
    return NextResponse.json({ error: "Couldn't save that photo. Try again in a minute." }, { status: 502 });
  }
  const { data } = storage.getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path, width: processed.width, height: processed.height });
}
