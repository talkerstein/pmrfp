import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getProjectSessionFromRequest } from "@/lib/projects/server";
import { requestReview } from "@/lib/projects/publish";

/**
 * POST /api/projects/[id]/review-invite — {clientName, clientEmail}. Emails
 * the client a one-time review link for one published project. Same rules
 * as the web "Ask for a review" form (Trade Pro only, one link per client,
 * 10 per project, per-user rate limit): both run requestReview.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(request, "default");
  if (limited) return rateLimitResponse(limited);

  const auth = await getProjectSessionFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Sign in to your company account first." }, { status: 401 });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Send JSON." }, { status: 415 });
  }

  let body: { clientName?: unknown; clientEmail?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await params;
  const res = await requestReview(auth.session, {
    caseStudyId: id,
    clientName: body.clientName,
    clientEmail: body.clientEmail,
  });
  if (!res.ok) return NextResponse.json({ error: res.error, code: res.code }, { status: res.code === "plan" ? 403 : 400 });
  return NextResponse.json({ ok: true, message: res.message });
}
