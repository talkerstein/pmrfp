import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/access/access";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { MAX_UPLOAD_BYTES, processPhoto, UnreadableImageError } from "@/lib/projects/image";
import { PROJECT_PHOTO_BUCKET, photoPath } from "@/lib/projects/photos";

export const maxDuration = 30;

/**
 * POST /api/marketplace/photos — one image per request (multipart "file").
 * Same trust boundary as project photos: sharp re-encodes (upright, ≤1920px,
 * JPEG, EXIF/GPS stripped), then the service role stores it at
 * project-photos/{userId}/{uuid}.jpg. Listings only keep URLs in that folder.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "photo-upload");
  if (limited) return rateLimitResponse(limited);
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signIn" }, { status: 401 });
  if (!isServiceConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "upload" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "upload" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "tooBig" }, { status: 413 });
  if (file.type && !file.type.startsWith("image/")) return NextResponse.json({ error: "notImage" }, { status: 415 });

  let processed: Awaited<ReturnType<typeof processPhoto>>;
  try {
    processed = await processPhoto(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof UnreadableImageError) return NextResponse.json({ error: "notImage" }, { status: 422 });
    throw err;
  }

  const path = photoPath(session.userId, randomUUID());
  const storage = createServiceClient().storage.from(PROJECT_PHOTO_BUCKET);
  const { error } = await storage.upload(path, processed.data, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("[marketplace/photos] upload failed", error.message);
    return NextResponse.json({ error: "upload" }, { status: 502 });
  }
  const { data } = storage.getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path, width: processed.width, height: processed.height });
}
