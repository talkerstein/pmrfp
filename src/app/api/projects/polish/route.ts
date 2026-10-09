import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getProjectSessionFromRequest } from "@/lib/projects/server";
import { polishCaseStudy } from "@/lib/projects/polish";

export const maxDuration = 60;

const bodySchema = z.object({
  summary: z.string().max(400).default(""),
  scope: z.string().max(1500).default(""),
  challenge: z.string().max(3000).default(""),
  approach: z.string().max(3000).default(""),
  outcome: z.string().max(3000).default(""),
});

/**
 * POST /api/projects/polish — the builder's "Tidy my wording". Takes only
 * the text the trade typed and returns re-worded fields that passed the
 * fact guard (no new numbers or names), plus the fields where the AI's
 * version was thrown away. The builder shows the result as an AI draft the
 * trade must read and confirm before saving.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "project-draft");
  if (limited) return rateLimitResponse(limited);

  const auth = await getProjectSessionFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Sign in to your company account first." }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await polishCaseStudy(body);
  if (!result.ok) {
    if (result.reason === "empty") return NextResponse.json({ error: "Write a few lines first.", reason: result.reason }, { status: 400 });
    if (result.reason !== "unavailable") console.warn("[projects/polish]", result.error);
    return NextResponse.json({ error: "Couldn't tidy it right now. Your text is unchanged.", reason: result.reason }, { status: 503 });
  }
  return NextResponse.json({ fields: result.fields, kept: result.kept });
}
