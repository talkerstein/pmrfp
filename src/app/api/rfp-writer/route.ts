import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { wizardInputSchema } from "@/lib/rfp-writer/schema";
import { composeRfp, pickTemplate } from "@/lib/rfp-writer/compose";
import { tailorRfp } from "@/lib/rfp-writer/ai";

// Claude tailoring can take up to a minute; the template path is instant.
export const maxDuration = 120;

/**
 * POST /api/rfp-writer — wizard answers → a complete RFP draft.
 * Always answers: Claude tailors the draft when ANTHROPIC_API_KEY is set,
 * otherwise (or on any failure) the template composer's draft is returned.
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
  const tailored = await tailorRfp(input, base, pickTemplate(input));
  return NextResponse.json({ rfp: tailored ?? base, source: tailored ? "ai" : "template" });
}
