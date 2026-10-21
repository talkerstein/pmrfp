import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { municipalInputSchema } from "@/lib/rfp-writer/municipal/schema";
import { composeMunicipal } from "@/lib/rfp-writer/municipal/compose";
import { EVENT, trackEvent } from "@/lib/analytics";

/**
 * POST /api/rfp-writer/municipal: the municipal writer's answers → a town's
 * quote request, small-works tender, consultant RFP or prequalified trades
 * list, with the province's dated clause pack. Template only (no AI), so
 * the clauses come out exactly as checked. Free for everyone.
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
  const parsed = municipalInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your answers", issues: parsed.error.flatten() }, { status: 422 });
  }
  const rfp = composeMunicipal(parsed.data);
  await trackEvent(EVENT.WRITER_DRAFT_GENERATED, { kind: "municipal", source: "template" });
  return NextResponse.json({ rfp, source: "template" });
}
