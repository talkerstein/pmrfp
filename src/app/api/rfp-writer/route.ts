import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/access/access";
import { wizardInputSchema } from "@/lib/rfp-writer/schema";
import { composeRfp, pickTemplate } from "@/lib/rfp-writer/compose";
import { aiAvailable, tailorRfp } from "@/lib/rfp-writer/ai";

// AI tailoring can take up to a minute; the template path is instant.
export const maxDuration = 90;

const AI_ROLES = new Set(["property_manager", "admin", "super_admin"]);

/**
 * POST /api/rfp-writer — wizard answers → a complete RFP draft.
 * Everyone gets the expert-template version. Signed-in property managers get
 * it tailored by AI (Gemini) — the reason to create a free PM account.
 * Always answers: any AI failure falls back to the template draft.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "ai");
  if (limited) return rateLimitResponse(limited);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = wizardInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your answers", issues: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  const base = composeRfp(input);
  const session = await getSession();
  const canUseAi = Boolean(session && AI_ROLES.has(session.profile.primary_role));
  const tailored = canUseAi ? await tailorRfp(input, base, pickTemplate(input)) : null;

  return NextResponse.json({
    rfp: tailored ?? base,
    source: tailored ? "ai" : "template",
    // Tell the wizard to offer the free PM account (only if AI is actually on).
    aiLocked: !canUseAi && aiAvailable(),
  });
}
