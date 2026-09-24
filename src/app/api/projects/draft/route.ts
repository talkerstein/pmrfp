import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getProjectSessionFromRequest } from "@/lib/projects/server";
import { draftProject } from "@/lib/projects/ai";
import { isOwnPhotoUrl, PHOTO_KINDS } from "@/lib/projects/photos";
import { getCategories, getPropertyTypes } from "@/lib/data/taxonomy";

// Reading photos + writing takes a while on a busy model.
export const maxDuration = 60;

const bodySchema = z.object({
  photos: z
    .array(z.object({ url: z.string().max(500), kind: z.enum(PHOTO_KINDS) }))
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
  const auth = await getProjectSessionFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Sign in to your company account first." }, { status: 401 });
  const { session } = auth;

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (body.photos.some((p) => !isOwnPhotoUrl(p.url, supabaseUrl, session.organization.id))) {
    return NextResponse.json({ error: "One of those photos isn't from this project." }, { status: 400 });
  }
  if (!body.notes.trim() && body.photos.length === 0) {
    return NextResponse.json({ error: "Add a photo or a line about the job first." }, { status: 400 });
  }

  const [categories, propertyTypes] = await Promise.all([getCategories(), getPropertyTypes()]);
  const result = await draftProject({
    notes: body.notes,
    // After photos first: they carry the result, and only the first few are sent.
    photos: [...body.photos].sort((a, b) => kindRank(a.kind) - kindRank(b.kind)),
    categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
    propertyTypes,
  });

  if (!result.ok) {
    if (result.reason !== "unavailable") console.warn("[projects/draft]", result.error);
    return NextResponse.json({ error: WRITE_IT_YOURSELF, reason: result.reason }, { status: 503 });
  }
  return NextResponse.json({ draft: result.draft });
}

function kindRank(kind: string): number {
  return kind === "after" ? 0 : kind === "before" ? 1 : 2;
}
