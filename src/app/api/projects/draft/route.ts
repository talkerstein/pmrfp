import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getProjectSession, getProjectSessionFromRequest } from "@/lib/projects/server";
import { UUID } from "@/lib/d1/contracts";
import { matchesCustomerOrigin } from "@/lib/d1/staging-config";
import { serveVpsProjectDraft, vpsProjectUploadsEnabled } from "@/lib/d1/vps-project-uploads";
import { draftProject, type FetchImage } from "@/lib/projects/ai";
import { PHOTO_KINDS, photoLocation, storedPhotoUrl } from "@/lib/projects/photos";
import { supabasePhotoStore } from "@/lib/projects/photo-storage";
import { getCategories, getPropertyTypes } from "@/lib/data/taxonomy";

// Reading photos + writing takes a while on a busy model.
export const maxDuration = 60;

const bodySchema = z.object({
  photos: z
    .array(z.object({ url: z.string().max(1200), kind: z.enum(PHOTO_KINDS) }))
    .max(24)
    .default([]),
  notes: z.string().max(3000).default(""),
});

const WRITE_IT_YOURSELF = "Couldn't write it right now. Write it yourself below.";

/**
 * POST /api/projects/draft — {photos: [{url, kind}], notes} → an editable
 * draft of the case study (title, summary, challenge / approach / outcome,
 * trade, property type) plus privacy flags. Photo URLs must be this
 * company's own processed uploads, so the server only ever fetches our
 * bucket. Any AI failure returns a plain message the form shows as-is.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "project-draft");
  if (limited) return rateLimitResponse(limited);

  // Cookie session (web) or bearer token (mobile app).
  const native = vpsProjectUploadsEnabled();
  if (native && !matchesCustomerOrigin(request)) return NextResponse.json({error:"Invalid origin"},{status:403});
  const session = native ? await getProjectSession(request) : (await getProjectSessionFromRequest(request))?.session;
  if (!session) return NextResponse.json({ error: "Sign in to your company account first." }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.notes.trim() && body.photos.length === 0) {
    return NextResponse.json({ error: "Add a photo or a line about the job first." }, { status: 400 });
  }
  let photos: typeof body.photos;
  let fetchImage: FetchImage | undefined;
  if (native) {
    const ids = new Map<string, string>();
    for (const photo of body.photos) {
      const id = photo.url.split("/").at(-1) ?? "";
      if (!UUID.test(id) || photo.url !== `/api/projects/photos/drafts/${id}`) {
        return NextResponse.json({error:"One of those photos isn't from this project."},{status:400});
      }
      ids.set(photo.url,id);
    }
    photos=body.photos;
    fetchImage = async url => {
      const id = ids.get(url);
      if (!id) return null;
      const image = await serveVpsProjectDraft(session,id,false).catch(() => null);
      if (!image?.ok || Number(image.headers.get("content-length"))>6*1024*1024) {
        await image?.body?.cancel();
        return null;
      }
      const bytes=Buffer.from(await image.arrayBuffer());
      return {data:bytes.toString("base64"),mimeType:"image/jpeg"};
    };
  } else {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const locs = body.photos.map((p) => photoLocation(p.url, supabaseUrl, session.organization.id));
    if (locs.some((l) => !l)) {
      return NextResponse.json({ error: "One of those photos isn't from this project." }, { status: 400 });
    }
    // Fetch from our own buckets only: public URLs as they are, private ones
    // through a fresh short-lived signature (never the URL the client sent).
    const privatePaths = locs.filter((l) => l!.bucket === "private").map((l) => l!.path);
    const signed = privatePaths.length ? await supabasePhotoStore().sign(privatePaths, 300) : new Map<string, string>();
    photos = body.photos
      .map((p, i) => {
        const l = locs[i]!;
        const url = l.bucket === "public" ? storedPhotoUrl(supabaseUrl, "public", l.path) : signed.get(l.path);
        return url ? { url, kind: p.kind } : null;
      })
      .filter((p): p is { url: string; kind: (typeof PHOTO_KINDS)[number] } => p !== null);

  }

  const [categories, propertyTypes] = await Promise.all([getCategories(), getPropertyTypes()]);
  const result = await draftProject({
    notes: body.notes,
    // After photos first: they carry the result, and only the first few are sent.
    photos: photos.sort((a, b) => kindRank(a.kind) - kindRank(b.kind)),
    categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
    propertyTypes,
  }, {fetchImage});

  if (!result.ok) {
    if (result.reason !== "unavailable") console.warn("[projects/draft]", result.error);
    return NextResponse.json({ error: WRITE_IT_YOURSELF, reason: result.reason }, { status: 503 });
  }
  return NextResponse.json({ draft: result.draft });
}

function kindRank(kind: string): number {
  return kind === "after" ? 0 : kind === "before" ? 1 : 2;
}
