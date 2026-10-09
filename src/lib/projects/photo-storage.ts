import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import {
  bucketId,
  isPrivatePhotoRef,
  photoLocation,
  pickHero,
  PRIVATE_PHOTO_BUCKET,
  sanitizePhotos,
  storedPhotoUrl,
  targetBucket,
  type PhotoBucket,
  type ProjectPhoto,
} from "./photos";
import { canViewProjectPhotos, type PhotoProject, type PhotoViewer } from "./photo-access";
import { isSchemaMissing } from "./compat";

/**
 * Where project photos are stored and who gets to see the private ones.
 *
 * - Uploads land in the private bucket.
 * - After every save (publish, builder, visibility switch) syncProjectPhotos
 *   moves the project's photos to the bucket its visibility calls for:
 *   public → project-photos, unlisted/private → project-photos-private.
 *   Moving deletes the old object, so an old public URL stops working.
 * - Pages sign private photos for one viewer at a time, after
 *   canViewProjectPhotos says yes. No yes, no URL.
 *
 * Server only (service role).
 */

/** Signed URLs live an hour: long enough for a page visit or a print, short enough to go stale fast. */
export const SIGNED_URL_TTL = 60 * 60;
/** The unlisted-photo redirect only needs the browser to follow it once. */
export const REDIRECT_URL_TTL = 120;

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** What we need from Storage (injectable for tests). */
export interface PhotoStore {
  /** path → signed URL for each path in the private bucket that could be signed. */
  sign(paths: string[], ttlSeconds: number): Promise<Map<string, string>>;
  /** Make `path` live in `to` and nowhere else. True once it's only in `to`. */
  move(path: string, from: PhotoBucket, to: PhotoBucket): Promise<boolean>;
}

let bucketChecked = false;

/** Create the private bucket if it isn't there yet (the SQL migration may not have been able to). */
export async function ensurePrivateBucket(db: SupabaseClient = createServiceClient()): Promise<boolean> {
  if (bucketChecked) return true;
  const { data } = await db.storage.getBucket(PRIVATE_PHOTO_BUCKET);
  if (data) {
    if (data.public) {
      // Never serve this bucket publicly, whoever flipped it.
      await db.storage.updateBucket(PRIVATE_PHOTO_BUCKET, { public: false });
    }
    bucketChecked = true;
    return true;
  }
  const { error } = await db.storage.createBucket(PRIVATE_PHOTO_BUCKET, {
    public: false,
    allowedMimeTypes: ["image/jpeg"],
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (error && !/already exists/i.test(error.message)) {
    console.error("[projects/photos] private bucket", error.message);
    return false;
  }
  bucketChecked = true;
  return true;
}

export function supabasePhotoStore(db: SupabaseClient = createServiceClient()): PhotoStore {
  return {
    async sign(paths, ttl) {
      const out = new Map<string, string>();
      if (paths.length === 0) return out;
      const { data, error } = await db.storage.from(PRIVATE_PHOTO_BUCKET).createSignedUrls([...new Set(paths)], ttl);
      if (error || !data) {
        if (error) console.error("[projects/photos] sign", error.message);
        return out;
      }
      for (const d of data) if (d.path && d.signedUrl && !d.error) out.set(d.path, d.signedUrl);
      return out;
    },

    async move(path, from, to) {
      if (from === to) return true;
      if (to === "private" || from === "private") await ensurePrivateBucket(db);
      const src = db.storage.from(bucketId(from));
      const dst = db.storage.from(bucketId(to));
      // 1. Server-side move across buckets (copies, then deletes the source).
      const moved = await src.move(path, path, { destinationBucket: bucketId(to) });
      if (!moved.error) return true;
      // 2. Already there (an earlier run moved it, or a retry): just make sure the source is gone.
      const there = await dst.exists(path);
      if (there.data) {
        const { error } = await src.remove([path]);
        return !error;
      }
      // 3. Copy by hand: download, upload, delete.
      const file = await src.download(path);
      if (file.error || !file.data) {
        console.error("[projects/photos] move", path, moved.error.message);
        return false;
      }
      const up = await dst.upload(path, file.data, { contentType: "image/jpeg", cacheControl: "3600", upsert: true });
      if (up.error) {
        console.error("[projects/photos] move upload", path, up.error.message);
        return false;
      }
      const { error } = await src.remove([path]);
      if (error) console.error("[projects/photos] move remove", path, error.message);
      return !error;
    },
  };
}

// ── Showing photos to one viewer ─────────────────────────────────────

/**
 * Display URLs for a list of stored photo URLs, one viewer, any number of
 * projects. Public-bucket URLs pass through; private references are signed
 * (one Storage call) for projects the viewer may see, and come back null
 * for everyone else. Anything that isn't our photo is null.
 */
export async function resolvePhotoUrls(
  entries: { project: PhotoProject; url: string | null | undefined }[],
  viewer: PhotoViewer,
  deps: { store?: PhotoStore; ttl?: number } = {},
): Promise<(string | null)[]> {
  const sb = supabaseUrl();
  const allowed = entries.map((e) => canViewProjectPhotos(e.project, viewer));
  const toSign: string[] = [];
  const locs = entries.map((e, i) => {
    if (!allowed[i] || !e.url) return null;
    const loc = photoLocation(e.url, sb, e.project.organizationId);
    if (!loc) return null;
    // Only stored references: a signed URL coming back in from somewhere is not re-signed.
    if (loc.bucket === "private" && !isPrivatePhotoRef(e.url, sb)) return null;
    if (loc.bucket === "private") toSign.push(loc.path);
    return loc;
  });
  const store = deps.store ?? (isServiceConfigured() ? supabasePhotoStore() : null);
  const signed = toSign.length && store ? await store.sign(toSign, deps.ttl ?? SIGNED_URL_TTL) : new Map<string, string>();
  return locs.map((l, i) => {
    if (!l) return null;
    return l.bucket === "public" ? entries[i].url! : (signed.get(l.path) ?? null);
  });
}

/**
 * One project's photos + hero for one viewer. A viewer who may not see the
 * project gets nothing; a photo that couldn't be signed is left out.
 */
export async function photosForViewer(
  project: PhotoProject,
  viewer: PhotoViewer,
  photos: ProjectPhoto[],
  heroUrl: string | null,
  deps: { store?: PhotoStore; ttl?: number } = {},
): Promise<{ photos: ProjectPhoto[]; heroUrl: string | null }> {
  if (!canViewProjectPhotos(project, viewer)) return { photos: [], heroUrl: null };
  const urls = await resolvePhotoUrls(
    photos.map((p) => ({ project, url: p.url })),
    viewer,
    deps,
  );
  const out: ProjectPhoto[] = [];
  photos.forEach((p, i) => {
    if (urls[i]) out.push({ ...p, url: urls[i]! });
  });
  // The hero is one of the photos: find it by path, so it maps to the same display URL.
  const heroPath = heroUrl ? photoLocation(heroUrl, supabaseUrl())?.path : null;
  const hero = (heroPath && out.find((p) => p.path === heroPath)) || pickHero(out);
  return { photos: out, heroUrl: hero?.url ?? null };
}

/**
 * Unlisted projects render on the cached (ISR) case-study page, where a
 * signed URL would outlive its hour. Their photos point at a stable
 * redirect instead (/api/projects/<id>/photo/<file>), which re-checks the
 * project on every request and only then signs a two-minute URL.
 */
export function proxiedPhotos(
  caseStudyId: string,
  photos: ProjectPhoto[],
  heroUrl: string | null,
): { photos: ProjectPhoto[]; heroUrl: string | null } {
  const sb = supabaseUrl();
  const map = (url: string, path: string) =>
    isPrivatePhotoRef(url, sb) ? `/api/projects/${caseStudyId}/photo/${path.split("/")[1].replace(/\.jpg$/i, "")}` : url;
  const out = photos.map((p) => ({ ...p, url: map(p.url, p.path) }));
  const heroPath = heroUrl ? photoLocation(heroUrl, sb)?.path : null;
  const hero = (heroPath && out.find((p) => p.path === heroPath)) || pickHero(out);
  return { photos: out, heroUrl: hero?.url ?? null };
}

// ── Keeping photos in the right bucket ───────────────────────────────

export interface PhotoMove {
  path: string;
  from: PhotoBucket;
  to: PhotoBucket;
}

/** Which of a project's photos (and hero) sit in the wrong bucket for its visibility. */
export function planPhotoMoves(
  rawPhotos: unknown,
  heroUrl: string | null | undefined,
  visibility: string | null | undefined,
  organizationId: string,
): PhotoMove[] {
  const sb = supabaseUrl();
  const to = targetBucket(visibility);
  const seen = new Set<string>();
  const moves: PhotoMove[] = [];
  const urls = sanitizePhotos(rawPhotos, sb, organizationId, { includePrivate: true }).map((p) => p.url);
  if (heroUrl) urls.push(heroUrl);
  for (const url of urls) {
    const loc = photoLocation(url, sb, organizationId);
    if (!loc || loc.bucket === to || seen.has(loc.path)) continue;
    seen.add(loc.path);
    moves.push({ path: loc.path, from: loc.bucket, to });
  }
  return moves;
}

/** Rewrite the stored URLs of the photos that moved. Everything else is left exactly as it was. */
export function applyPhotoMoves(
  rawPhotos: unknown,
  heroUrl: string | null | undefined,
  moved: Map<string, PhotoBucket>,
): { photos: unknown; heroUrl: string | null } {
  const sb = supabaseUrl();
  const rewrite = (url: string) => {
    const loc = photoLocation(url, sb);
    const to = loc ? moved.get(loc.path) : undefined;
    return loc && to ? storedPhotoUrl(sb, to, loc.path) : url;
  };
  const photos = Array.isArray(rawPhotos)
    ? rawPhotos.map((p) =>
        p && typeof p === "object" && typeof (p as { url?: unknown }).url === "string"
          ? { ...(p as object), url: rewrite((p as { url: string }).url) }
          : p,
      )
    : rawPhotos;
  return { photos, heroUrl: heroUrl ? rewrite(heroUrl) : null };
}

export interface SyncResult {
  ok: boolean;
  /** Photos moved this run. */
  moved: PhotoMove[];
  /** Paths that couldn't be moved (still in the old bucket; a re-run retries them). */
  failed: string[];
}

interface SyncRow {
  id: string;
  organization_id: string;
  visibility?: string | null;
  photos: unknown;
  hero_url: string | null;
}

/**
 * Put one project's photos in the bucket its visibility calls for, and
 * point the row at the new URLs. Idempotent: run it after any save; a
 * second run with nothing to move is a single read.
 */
export async function syncProjectPhotos(
  caseStudyId: string,
  deps: { db?: SupabaseClient; store?: PhotoStore } = {},
): Promise<SyncResult> {
  if (!isServiceConfigured() && !deps.db) return { ok: true, moved: [], failed: [] };
  const db = deps.db ?? createServiceClient();
  const read = (cols: string) => db.from("case_studies").select(cols).eq("id", caseStudyId).maybeSingle();
  let { data, error } = await read("id,organization_id,visibility,photos,hero_url");
  // Before the portfolio migration every project is public.
  if (isSchemaMissing(error)) ({ data, error } = await read("id,organization_id,photos,hero_url"));
  if (error || !data) return { ok: !error, moved: [], failed: [] };
  return syncRow(db, data as unknown as SyncRow, deps.store ?? supabasePhotoStore(db));
}

async function syncRow(db: SupabaseClient, row: SyncRow, store: PhotoStore): Promise<SyncResult> {
  const moves = planPhotoMoves(row.photos, row.hero_url, row.visibility, row.organization_id);
  if (moves.length === 0) return { ok: true, moved: [], failed: [] };
  const done = new Map<string, PhotoBucket>();
  const failed: string[] = [];
  for (const m of moves) {
    if (await store.move(m.path, m.from, m.to)) done.set(m.path, m.to);
    else failed.push(m.path);
  }
  if (done.size) {
    const next = applyPhotoMoves(row.photos, row.hero_url, done);
    const { error } = await db
      .from("case_studies")
      .update({ photos: next.photos, hero_url: next.heroUrl })
      .eq("id", row.id);
    if (error) {
      // The objects moved but the row still points at the old bucket: the
      // next run finds them already in place (move() step 2) and retries this.
      console.error("[projects/photos] sync update", error.message);
      return { ok: false, moved: [], failed: moves.map((m) => m.path) };
    }
  }
  return { ok: failed.length === 0, moved: moves.filter((m) => done.has(m.path)), failed };
}

// ── Backfill (existing projects) ─────────────────────────────────────

export interface BackfillReport {
  apply: boolean;
  scanned: number;
  /** Projects with at least one photo in the wrong bucket. */
  projects: {
    id: string;
    slug: string;
    visibility: string;
    toPrivate: number;
    toPublic: number;
    failed?: number;
  }[];
  photosToPrivate: number;
  photosToPublic: number;
  failed: number;
  /**
   * Old public URLs of photos now in the private bucket. Purge these from
   * the Vercel image cache (next/image keeps optimized copies for a year).
   */
  purgeUrls: string[];
  skipped?: string;
}

/**
 * Every project with photos, checked against its visibility. Dry run by
 * default: reports what would move. `apply` moves them (same code as a
 * save). Safe to re-run; a finished backfill reports nothing to move.
 */
export async function backfillProjectPhotos(
  opts: { apply: boolean },
  deps: { db?: SupabaseClient; store?: PhotoStore } = {},
): Promise<BackfillReport> {
  const report: BackfillReport = {
    apply: opts.apply,
    scanned: 0,
    projects: [],
    photosToPrivate: 0,
    photosToPublic: 0,
    failed: 0,
    purgeUrls: [],
  };
  const db = deps.db ?? createServiceClient();
  const store = deps.store ?? supabasePhotoStore(db);
  if (opts.apply && !deps.store && !(await ensurePrivateBucket(db))) {
    return { ...report, skipped: `Couldn't create the ${PRIVATE_PHOTO_BUCKET} bucket. Create it (private) in Storage and re-run.` };
  }
  const sb = supabaseUrl();
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("case_studies")
      .select("id,slug,organization_id,visibility,photos,hero_url")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (isSchemaMissing(error)) return { ...report, skipped: "The portfolio migration (20261009000002) isn't applied: every project is public, nothing to move." };
    if (error) return { ...report, skipped: `Read failed: ${error.message}` };
    const rows = (data ?? []) as unknown as (SyncRow & { slug: string })[];
    for (const row of rows) {
      report.scanned++;
      const moves = planPhotoMoves(row.photos, row.hero_url, row.visibility, row.organization_id);
      if (moves.length === 0) continue;
      const toPrivate = moves.filter((m) => m.to === "private");
      const entry: BackfillReport["projects"][number] = {
        id: row.id,
        slug: row.slug,
        visibility: row.visibility ?? "public",
        toPrivate: toPrivate.length,
        toPublic: moves.length - toPrivate.length,
      };
      let movedPrivate = toPrivate;
      if (opts.apply) {
        const res = await syncRow(db, row, store);
        if (res.failed.length) entry.failed = res.failed.length;
        report.failed += res.failed.length;
        movedPrivate = res.moved.filter((m) => m.to === "private");
      }
      for (const m of movedPrivate) report.purgeUrls.push(storedPhotoUrl(sb, "public", m.path));
      report.photosToPrivate += entry.toPrivate;
      report.photosToPublic += entry.toPublic;
      report.projects.push(entry);
    }
    if (rows.length < PAGE) break;
  }
  return report;
}
