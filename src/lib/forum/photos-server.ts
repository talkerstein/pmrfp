import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FORUM_PHOTO_BUCKET, FORUM_PRIVATE_PHOTO_BUCKET, MAX_FORUM_STORED_BYTES, bucketForStatus, bucketName, type ForumImage, type PhotoBucketKind } from "./photos";

/**
 * Forum photos (Storage side, service role). See photos.ts for the rules.
 * Every function no-ops gracefully when Storage isn't reachable; a photo
 * that can't be moved is left out of the post rather than exposed.
 */

let bucketsChecked = false;

/** Create both buckets (public / private) if the migration couldn't. */
export async function ensureForumBuckets(db: SupabaseClient): Promise<boolean> {
  if (bucketsChecked) return true;
  for (const [id, isPublic] of [[FORUM_PHOTO_BUCKET, true], [FORUM_PRIVATE_PHOTO_BUCKET, false]] as const) {
    const { data } = await db.storage.getBucket(id);
    if (data) {
      // Never serve the private bucket publicly, whoever flipped it.
      if (!isPublic && data.public) await db.storage.updateBucket(id, { public: false });
      continue;
    }
    const { error } = await db.storage.createBucket(id, { public: isPublic, allowedMimeTypes: ["image/jpeg"], fileSizeLimit: MAX_FORUM_STORED_BYTES });
    if (error && !/already exists/i.test(error.message)) {
      console.error("[forum/photos] bucket", id, error.message);
      return false;
    }
  }
  bucketsChecked = true;
  return true;
}

/** Store a processed JPEG in the private bucket. */
export async function storePrivatePhoto(db: SupabaseClient, path: string, data: Buffer): Promise<boolean> {
  const opts = { contentType: "image/jpeg", cacheControl: "3600", upsert: false };
  const priv = db.storage.from(FORUM_PRIVATE_PHOTO_BUCKET);
  let { error } = await priv.upload(path, data, opts);
  if (error && /not found/i.test(error.message) && (await ensureForumBuckets(db))) ({ error } = await priv.upload(path, data, opts));
  if (error) console.error("[forum/photos] upload", error.message);
  return !error;
}

/** A short-lived preview URL for the uploader (the photo is still private). */
export async function signPreview(db: SupabaseClient, path: string, ttlSeconds = 3600): Promise<string | null> {
  const { data, error } = await db.storage.from(FORUM_PRIVATE_PHOTO_BUCKET).createSignedUrl(path, ttlSeconds);
  if (error) console.error("[forum/photos] sign", error.message);
  return data?.signedUrl ?? null;
}

/** Make `path` live only in bucket `to`. True once it does. */
async function moveOne(db: SupabaseClient, path: string, to: PhotoBucketKind): Promise<boolean> {
  const from: PhotoBucketKind = to === "public" ? "private" : "public";
  const src = db.storage.from(bucketName(from));
  const dst = db.storage.from(bucketName(to));
  const moved = await src.move(path, path, { destinationBucket: bucketName(to) });
  if (!moved.error) return true;
  // Already there (an earlier run, or a retry): make sure the other copy is gone.
  const there = await dst.exists(path);
  if (there.data) {
    await src.remove([path]);
    return true;
  }
  if (/not found/i.test(moved.error.message) && (await ensureForumBuckets(db))) {
    const retry = await src.move(path, path, { destinationBucket: bucketName(to) });
    if (!retry.error) return true;
  }
  console.error("[forum/photos] move", path, moved.error.message);
  return false;
}

/**
 * Put a post's photos where its status says (approved → public, else
 * private). Returns the photos that are now in the right place; the rest
 * are dropped from the post (never left public by mistake).
 */
export async function placePhotos(db: SupabaseClient, images: readonly ForumImage[], status: string): Promise<ForumImage[]> {
  if (!images.length) return [];
  const to = bucketForStatus(status);
  const out: ForumImage[] = [];
  for (const img of images) if (await moveOne(db, img.path, to)) out.push(img);
  return out;
}

/** After a moderator hides / approves: move the stored photos of one thread or post. */
export async function syncPhotosForStatus(db: SupabaseClient, table: "forum_threads" | "forum_posts", id: string, status: string): Promise<void> {
  const { data, error } = await db.from(table).select("images").eq("id", id).maybeSingle<{ images: ForumImage[] | null }>();
  if (error || !data?.images?.length) return;
  const placed = await placePhotos(db, data.images, status);
  if (placed.length !== data.images.length) await db.from(table).update({ images: placed }).eq("id", id);
}
