import { NextResponse } from "next/server";
import { correctionSchema, toCorrectionRow } from "@/lib/corrections/rules";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession } from "@/lib/access/access";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * "Report an error or request removal" (POST, JSON). Validates, rate-limits
 * per IP and stores the request in correction_requests with the service
 * role; admins work the queue at /admin/corrections. Same-origin only.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await checkRateLimit(request, "correction");
  if (limited) return rateLimitResponse(limited);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = correctionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  // Honeypot: accept silently, store nothing.
  if (parsed.data.company_website) return NextResponse.json({ ok: true });

  if (!isServiceConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const session = isSupabaseConfigured() ? await getSession().catch(() => null) : null;
  const { error } = await createServiceClient().from("correction_requests").insert(toCorrectionRow(parsed.data, session?.userId ?? null));
  if (error) {
    console.error("[corrections] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save your request" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
