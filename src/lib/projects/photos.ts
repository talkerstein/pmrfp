import { z } from "zod";

/**
 * Project photos live at {orgId}/{uuid}.jpg in one of two buckets, written
 * only by our upload route (service role, after sharp strips EXIF/GPS):
 *
 *   project-photos          PUBLIC bucket. Only photos of PUBLIC projects.
 *   project-photos-private  PRIVATE bucket, no storage policies (service role
 *                           only). New uploads land here, and so does every
 *                           photo of an unlisted or private project. Viewers
 *                           get short-lived signed URLs (photo-storage.ts),
 *                           and only when photo-access.ts says they may see
 *                           the project.
 *
 * case_studies.photos stores one canonical URL per photo: the public URL,
 * or for the private bucket an `/object/authenticated/` URL a browser can't
 * open. Every read re-checks the URL against these prefixes, so a row edited
 * through the API can't point a page at an arbitrary host (next/image would
 * throw on it, and it's not ours).
 */

export const PROJECT_PHOTO_BUCKET = "project-photos";
export const PRIVATE_PHOTO_BUCKET = "project-photos-private";

export type PhotoBucket = "public" | "private";

export function bucketId(b: PhotoBucket): string {
  return b === "public" ? PROJECT_PHOTO_BUCKET : PRIVATE_PHOTO_BUCKET;
}

export const PHOTO_KINDS = ["before", "during", "after"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  before: "Before",
  during: "During",
  after: "After",
};

export interface ProjectPhoto {
  url: string;
  path: string;
  kind: PhotoKind;
  width: number;
  height: number;
}

export const projectPhotoSchema = z.object({
  // Room for a signed URL: the forms send back the URL they were shown.
  url: z.string().max(1200),
  path: z.string().max(200),
  kind: z.enum(PHOTO_KINDS),
  width: z.number().int().positive().max(10000),
  height: z.number().int().positive().max(10000),
});

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^(${UUID})/${UUID}\\.jpg$`, "i");

const trimBase = (supabaseUrl: string) => supabaseUrl.replace(/\/+$/, "");

/** Public URL prefix for the bucket, or for one org's folder in it. */
export function photoUrlPrefix(supabaseUrl: string, orgId?: string): string {
  return `${trimBase(supabaseUrl)}/storage/v1/object/public/${PROJECT_PHOTO_BUCKET}/${orgId ? `${orgId}/` : ""}`;
}

/** Prefix of the stored reference for a private-bucket photo (not openable in a browser). */
export function privatePhotoPrefix(supabaseUrl: string): string {
  return `${trimBase(supabaseUrl)}/storage/v1/object/authenticated/${PRIVATE_PHOTO_BUCKET}/`;
}

/** Prefix of a signed URL for the private bucket (what allowed viewers and the forms get). */
function signedPhotoPrefix(supabaseUrl: string): string {
  return `${trimBase(supabaseUrl)}/storage/v1/object/sign/${PRIVATE_PHOTO_BUCKET}/`;
}

/** The URL we store for a photo at `path` in bucket `b`. */
export function storedPhotoUrl(supabaseUrl: string, b: PhotoBucket, path: string): string {
  return b === "public" ? `${photoUrlPrefix(supabaseUrl)}${path}` : `${privatePhotoPrefix(supabaseUrl)}${path}`;
}

/** Storage path for a new photo. */
export function photoPath(orgId: string, id: string): string {
  return `${orgId}/${id}.jpg`;
}

/**
 * Which bucket and path a photo URL points at: a public URL, a stored
 * private reference, or a signed URL for the private bucket. Null for
 * anything else, and for a path outside `orgId`'s folder when one is given.
 */
export function photoLocation(
  url: string,
  supabaseUrl: string,
  orgId?: string,
): { bucket: PhotoBucket; path: string } | null {
  if (!supabaseUrl || typeof url !== "string") return null;
  const pub = photoUrlPrefix(supabaseUrl);
  const priv = privatePhotoPrefix(supabaseUrl);
  const signed = signedPhotoPrefix(supabaseUrl);
  let bucket: PhotoBucket;
  let rest: string;
  if (url.startsWith(pub)) {
    bucket = "public";
    rest = url.slice(pub.length);
  } else if (url.startsWith(priv)) {
    bucket = "private";
    rest = url.slice(priv.length);
  } else if (url.startsWith(signed)) {
    bucket = "private";
    // Only the token may follow the path.
    const q = url.indexOf("?", signed.length);
    if (q === -1 || !url.startsWith("?token=", q)) return null;
    rest = url.slice(signed.length, q);
  } else {
    return null;
  }
  const m = PATH_RE.exec(rest);
  if (!m) return null;
  if (orgId && m[1].toLowerCase() !== orgId.toLowerCase()) return null;
  return { bucket, path: rest };
}

/**
 * True when `url` is one of our processed photos in the PUBLIC bucket
 * (optionally in one org's folder): exact bucket prefix, then
 * {uuid}/{uuid}.jpg and nothing else. Private-bucket references are not
 * "own photo URLs": public pages and lists drop them by construction.
 */
export function isOwnPhotoUrl(url: string, supabaseUrl: string, orgId?: string): boolean {
  if (!supabaseUrl) return false;
  const prefix = photoUrlPrefix(supabaseUrl);
  if (!url.startsWith(prefix)) return false;
  const m = PATH_RE.exec(url.slice(prefix.length));
  if (!m) return false;
  return orgId ? m[1].toLowerCase() === orgId.toLowerCase() : true;
}

/** A stored private-bucket reference (needs signing before anyone can see it). */
export function isPrivatePhotoRef(url: string, supabaseUrl: string, orgId?: string): boolean {
  if (!supabaseUrl || !url.startsWith(privatePhotoPrefix(supabaseUrl))) return false;
  return photoLocation(url, supabaseUrl, orgId)?.bucket === "private";
}

/** Public projects keep public URLs; unlisted and private ones live in the private bucket. */
export function targetBucket(visibility: string | null | undefined): PhotoBucket {
  // Rows from before the portfolio migration have no visibility: public, as they always were.
  return visibility == null || visibility === "public" ? "public" : "private";
}

/**
 * next/image may optimize (and cache at the edge for a year) public-bucket
 * photos only. Signed URLs expire and must never land in that cache.
 */
export function isOptimizablePhoto(url: string): boolean {
  return url.includes(`/storage/v1/object/public/${PROJECT_PHOTO_BUCKET}/`);
}

/**
 * Parse the stored jsonb into photos we're willing to render. Anything off
 * is dropped. Private-bucket references are dropped too unless
 * `includePrivate` (the caller then signs them for a viewer who may see the
 * project, or moves them): a page that forgets to sign can't leak one.
 */
export function sanitizePhotos(
  raw: unknown,
  supabaseUrl: string,
  orgId?: string,
  opts: { includePrivate?: boolean } = {},
): ProjectPhoto[] {
  if (!Array.isArray(raw)) return [];
  const out: ProjectPhoto[] = [];
  for (const item of raw) {
    const p = projectPhotoSchema.safeParse(item);
    if (!p.success) continue;
    const ok =
      isOwnPhotoUrl(p.data.url, supabaseUrl, orgId) ||
      (opts.includePrivate === true && isPrivatePhotoRef(p.data.url, supabaseUrl, orgId));
    if (!ok) continue;
    if (!p.data.url.endsWith(`/${p.data.path}`)) continue;
    out.push(p.data);
  }
  return out;
}

/**
 * Photos sent back by a form (capture, builder, mobile app) → the canonical
 * stored form. The URL may be what the form was shown (a signed URL), so
 * identity is the path; the bucket comes from what the project already has
 * for that path, else from the URL. Null when any photo isn't this
 * company's (wrong folder, foreign host, path/URL mismatch).
 */
export function canonicalizePhotos(
  input: ProjectPhoto[],
  supabaseUrl: string,
  orgId: string,
  existing: ProjectPhoto[] = [],
): ProjectPhoto[] | null {
  const known = new Map(existing.map((p) => [p.path, p.url]));
  const out: ProjectPhoto[] = [];
  for (const p of input) {
    const loc = photoLocation(p.url, supabaseUrl, orgId);
    if (!loc || loc.path !== p.path) return null;
    out.push({ ...p, url: known.get(p.path) ?? storedPhotoUrl(supabaseUrl, loc.bucket, loc.path) });
  }
  return out;
}

/** Hero = first After photo (the result sells the job), else the first photo. */
export function pickHero(photos: ProjectPhoto[]): ProjectPhoto | null {
  return photos.find((p) => p.kind === "after") ?? photos[0] ?? null;
}

/**
 * Gallery layout: the hero on its own, then Before / During / After groups
 * holding the rest. Empty groups are dropped.
 */
export function groupPhotos(
  photos: ProjectPhoto[],
  heroUrl: string | null,
): { hero: ProjectPhoto | null; groups: { kind: PhotoKind; label: string; photos: ProjectPhoto[] }[] } {
  const hero = (heroUrl && photos.find((p) => p.url === heroUrl)) || pickHero(photos);
  const rest = photos.filter((p) => p !== hero);
  const groups = PHOTO_KINDS.map((kind) => ({
    kind,
    label: PHOTO_KIND_LABEL[kind],
    photos: rest.filter((p) => p.kind === kind),
  })).filter((g) => g.photos.length > 0);
  return { hero, groups };
}
