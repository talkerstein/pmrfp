import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { countActiveProjects, getProjectSessionFromRequest, listMyProjects, projectsReady } from "@/lib/projects/server";
import { canAddProject, photoLimit } from "@/lib/projects/limits";
import { publishProject, willAutoPublish } from "@/lib/projects/publish";

/**
 * JSON API for the mobile app's Projects screens. The web dashboard uses
 * server actions for the same things; both run the rules in
 * lib/projects/publish. Auth: cookie session or `Authorization: Bearer
 * <supabase access token>`.
 */

const SIGN_IN = "Sign in to your company account first.";

/**
 * GET /api/projects — this company's projects, newest first, plus what the
 * plan allows so the app can mirror the web (photo limit, free project
 * used, publish vs send for review).
 */
export async function GET(request: Request) {
  const limited = await checkRateLimit(request, "default");
  if (limited) return rateLimitResponse(limited);

  const auth = await getProjectSessionFromRequest(request);
  if (!auth) return NextResponse.json({ error: SIGN_IN }, { status: 401 });
  const { session, db } = auth;
  const orgId = session.organization.id;
  const paid = session.hasTradeAccess;

  const [projects, existing, ready] = await Promise.all([
    listMyProjects(orgId, db),
    countActiveProjects(orgId, db),
    projectsReady(),
  ]);

  return NextResponse.json(
    {
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        hero_url: p.heroUrl,
        slug: p.slug,
        created_at: p.createdAt,
      })),
      plan: {
        ready,
        paid,
        autoPublish: willAutoPublish(session),
        photoLimit: photoLimit(paid),
        canAddProject: canAddProject(paid, existing),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * POST /api/projects — publish a captured project. Body is the same shape
 * the web capture form sends (see PublishInput). 201 with {id, slug, live}:
 * live means it's on the profile now; otherwise it's in the review queue.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "project-publish");
  if (limited) return rateLimitResponse(limited);

  const auth = await getProjectSessionFromRequest(request);
  if (!auth) return NextResponse.json({ error: SIGN_IN }, { status: 401 });
  if (!isJson(request)) return NextResponse.json({ error: "Send JSON." }, { status: 415 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const res = await publishProject(auth.session, body, auth.db);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ id: res.id, slug: res.slug, live: res.live }, { status: 201 });
}

/** A cross-site form can't send application/json without a CORS preflight. */
function isJson(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}
