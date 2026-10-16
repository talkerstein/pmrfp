import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sessionCanPost } from "@/lib/forum/eligibility";
import { MAX_FORUM_STORED_BYTES, checkUpload, forumPhotoPath } from "@/lib/forum/photos";
import { signPreview, storePrivatePhoto } from "@/lib/forum/photos-server";
import { processPhoto, UnreadableImageError } from "@/lib/projects/image";

export const maxDuration = 30;

const MSG = {
  signin: "Sign in to add photos.",
  verified: "Photos are open to verified members.",
  setup: "Photo uploads aren't set up here yet.",
  "too-many": "Four photos per post.",
  empty: "No photo found in the upload.",
  "too-big": "That photo is over 10 MB. Try a smaller one.",
  type: "Only JPEG, PNG, WebP or HEIC photos.",
  unreadable: "We couldn't read that photo. Try a JPEG or PNG.",
  failed: "Couldn't save that photo. Try again in a minute.",
} as const;

const err = (code: keyof typeof MSG, status: number) => NextResponse.json({ error: MSG[code], code }, { status });

/**
 * POST /api/forum/photos — one photo per request (multipart, field "file";
 * optional "count" = photos already attached). Verified members only. The
 * trust boundary: sharp re-encodes (upright, ≤1920px, JPEG, ALL metadata
 * incl. GPS stripped), then the photo goes to the PRIVATE bucket at
 * {userId}/{uuid}.jpg. It only becomes public when the post it is attached
 * to is approved (lib/forum/photos-server placePhotos). Answers with the
 * path, size and a 1-hour signed preview URL.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "photo-upload");
  if (limited) return rateLimitResponse(limited);
  if (!isServiceConfigured()) return err("setup", 503);

  const session = await getSession();
  if (!session) return err("signin", 401);
  const { data } = await (await createClient()).auth.getUser();
  if (!(await sessionCanPost(session, data.user))) return err("verified", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return err("empty", 400);
  }
  const file = form.get("file");
  const count = Number(form.get("count") ?? 0) || 0;
  if (!(file instanceof File)) return err("empty", 400);
  const check = checkUpload({ size: file.size, type: file.type }, count);
  if (!check.ok) return err(check.reason, check.reason === "too-big" ? 413 : check.reason === "type" ? 415 : 400);

  let processed: Awaited<ReturnType<typeof processPhoto>>;
  try {
    processed = await processPhoto(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof UnreadableImageError) return err("unreadable", 422);
    throw e;
  }
  if (processed.data.length > MAX_FORUM_STORED_BYTES) return err("too-big", 413);

  const db = createServiceClient();
  const path = forumPhotoPath(session.userId, randomUUID());
  if (!(await storePrivatePhoto(db, path, processed.data))) return err("failed", 502);
  const preview = await signPreview(db, path);
  if (!preview) return err("failed", 502);
  return NextResponse.json({ path, w: processed.width, h: processed.height, preview });
}
