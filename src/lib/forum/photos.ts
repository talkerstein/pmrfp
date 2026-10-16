/**
 * Forum photos (pure part). Same rules as project photos (PR #133):
 *
 *   forum-photos          PUBLIC bucket. Only photos of APPROVED threads and
 *                         replies: what anyone can already read.
 *   forum-photos-private  PRIVATE bucket, service role only. Every upload
 *                         lands here, and stays until its post is approved.
 *                         A post that is held for review or hidden keeps (or
 *                         gets back) its photos here, so a public URL stops
 *                         working the moment the post comes down.
 *
 * Photos are stored at {userId}/{uuid}.jpg after sharp has turned them
 * upright, shrunk them and re-encoded them as JPEG, which drops every bit of
 * metadata (EXIF, GPS, camera serials). The post rows keep only
 * [{ path, w, h }]; URLs are built from the path, never stored or trusted.
 * Server side: photos-server.ts. Upload route: /api/forum/photos.
 */
export const FORUM_PHOTO_BUCKET = "forum-photos";
export const FORUM_PRIVATE_PHOTO_BUCKET = "forum-photos-private";

/** Largest file we accept from the browser (before re-encoding). */
export const MAX_FORUM_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Bucket limit for the processed JPEG (a 1920px JPEG is far below it). */
export const MAX_FORUM_STORED_BYTES = 5 * 1024 * 1024;
/** Photos per thread or reply. Mirrored by a check constraint in the migration. */
export const MAX_IMAGES_PER_POST = 4;

export type PhotoBucketKind = "public" | "private";

export interface ForumImage {
  path: string;
  w: number;
  h: number;
}

export type UploadCheck = { ok: true } | { ok: false; reason: "empty" | "too-big" | "type" | "too-many" };

/**
 * Can this file be uploaded? `existing` = photos already attached to the
 * post being written. Browsers send "" as the type for some HEIC files;
 * sharp decides then (an unreadable file is refused after decoding).
 */
export function checkUpload(f: { size: number; type?: string | null }, existing = 0): UploadCheck {
  if (existing >= MAX_IMAGES_PER_POST) return { ok: false, reason: "too-many" };
  if (!Number.isFinite(f.size) || f.size <= 0) return { ok: false, reason: "empty" };
  if (f.size > MAX_FORUM_UPLOAD_BYTES) return { ok: false, reason: "too-big" };
  if (f.type && !f.type.startsWith("image/")) return { ok: false, reason: "type" };
  if (f.type && /svg|gif/i.test(f.type)) return { ok: false, reason: "type" };
  return { ok: true };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^(${UUID})/(${UUID})\\.jpg$`, "i");

export function forumPhotoPath(userId: string, id: string): string {
  return `${userId}/${id}.jpg`;
}

/** A path we wrote ({uuid}/{uuid}.jpg), optionally inside one member's folder. */
export function isForumPhotoPath(path: unknown, userId?: string): path is string {
  if (typeof path !== "string") return false;
  const m = PATH_RE.exec(path);
  if (!m) return false;
  return userId ? m[1].toLowerCase() === userId.toLowerCase() : true;
}

/**
 * Stored jsonb → photos we are willing to render: our own path shape, sane
 * sizes, no duplicates, at most MAX_IMAGES_PER_POST. Anything else is dropped.
 * With `userId`, only that member's own uploads pass (used on write, so a
 * member can't attach somebody else's photo).
 */
export function sanitizeImages(raw: unknown, opts: { userId?: string } = {}): ForumImage[] {
  if (!Array.isArray(raw)) return [];
  const out: ForumImage[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_IMAGES_PER_POST) break;
    if (!item || typeof item !== "object") continue;
    const { path, w, h } = item as Record<string, unknown>;
    if (!isForumPhotoPath(path, opts.userId) || seen.has(path)) continue;
    const width = Number(w);
    const height = Number(h);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 10000 || height > 10000) continue;
    seen.add(path);
    out.push({ path, w: width, h: height });
  }
  return out;
}

/**
 * The photos field of a thread/reply form (JSON) → the member's photos, or
 * "invalid" when it isn't ours to accept (someone else's folder, too many).
 * An empty or missing field is simply no photos.
 */
export function parseImagesField(value: unknown, userId: string): ForumImage[] | "invalid" {
  if (value == null || value === "") return [];
  if (typeof value !== "string" || value.length > 4000) return "invalid";
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return "invalid";
  }
  if (!Array.isArray(raw)) return "invalid";
  if (raw.length > MAX_IMAGES_PER_POST) return "invalid";
  const clean = sanitizeImages(raw, { userId });
  return clean.length === raw.length ? clean : "invalid";
}

/** Where a post's photos belong: public only once the post itself is public. */
export function bucketForStatus(status: "held" | "approved" | "hidden" | string): PhotoBucketKind {
  return status === "approved" ? "public" : "private";
}

export function bucketName(kind: PhotoBucketKind): string {
  return kind === "public" ? FORUM_PHOTO_BUCKET : FORUM_PRIVATE_PHOTO_BUCKET;
}

/** Public URL of an approved post's photo. */
export function publicPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${FORUM_PHOTO_BUCKET}/${path}`;
}
