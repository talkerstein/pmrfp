import { z } from "zod";

/**
 * Project photos live in the public `project-photos` bucket at
 * {orgId}/{uuid}.jpg, written only by our upload route (service role, after
 * sharp strips EXIF/GPS). The case_studies.photos jsonb is re-checked against
 * that prefix on every read, so a row edited through the API can't point the
 * page at an arbitrary host (next/image would throw on it, and it's not ours).
 */

export const PROJECT_PHOTO_BUCKET = "project-photos";

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
  url: z.string().max(500),
  path: z.string().max(200),
  kind: z.enum(PHOTO_KINDS),
  width: z.number().int().positive().max(10000),
  height: z.number().int().positive().max(10000),
});

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^(${UUID})/${UUID}\\.jpg$`, "i");

/** Public URL prefix for the bucket, or for one org's folder in it. */
export function photoUrlPrefix(supabaseUrl: string, orgId?: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PROJECT_PHOTO_BUCKET}/${orgId ? `${orgId}/` : ""}`;
}

/** Storage path for a new photo. */
export function photoPath(orgId: string, id: string): string {
  return `${orgId}/${id}.jpg`;
}

/**
 * True when `url` is one of our processed photos (optionally in one org's
 * folder): exact bucket prefix, then {uuid}/{uuid}.jpg and nothing else.
 */
export function isOwnPhotoUrl(url: string, supabaseUrl: string, orgId?: string): boolean {
  if (!supabaseUrl) return false;
  const prefix = photoUrlPrefix(supabaseUrl);
  if (!url.startsWith(prefix)) return false;
  const m = PATH_RE.exec(url.slice(prefix.length));
  if (!m) return false;
  return orgId ? m[1].toLowerCase() === orgId.toLowerCase() : true;
}

/** Parse the stored jsonb into photos we're willing to render. Anything off is dropped. */
export function sanitizePhotos(raw: unknown, supabaseUrl: string, orgId?: string): ProjectPhoto[] {
  if (!Array.isArray(raw)) return [];
  const out: ProjectPhoto[] = [];
  for (const item of raw) {
    const p = projectPhotoSchema.safeParse(item);
    if (!p.success) continue;
    if (!isOwnPhotoUrl(p.data.url, supabaseUrl, orgId)) continue;
    if (!p.data.url.endsWith(`/${p.data.path}`)) continue;
    out.push(p.data);
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
