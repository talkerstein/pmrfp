import { NextResponse } from "next/server";
import { interestSchema } from "@/lib/validations";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionFromRequest } from "@/lib/access/request-session";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { loadTownJob } from "@/lib/town-jobs/server";
import { respondSealed, withdrawSealed } from "@/lib/town-jobs/sealed-respond";

/**
 * A trade's sealed quote on a town's "Sealed until closing" quote request
 * (PMRFP for Towns, Part C). POST sends or replaces it, DELETE withdraws it
 * (its contents are erased, returned unopened). Until closing only; the
 * database refuses anything later and records the refusal. Free for trades.
 */
async function setup(request: Request) {
  const limited = await checkRateLimit(request, "rfp-interest");
  if (limited) return { error: rateLimitResponse(limited) };
  if (!isSupabaseConfigured() || !isServiceConfigured()) return { error: NextResponse.json({ ok: false, error: "Not available right now", reason: "demo" }, { status: 503 }) };
  const session = (await getSessionFromRequest(request))?.session ?? null;
  if (!session) return { error: NextResponse.json({ ok: false, error: "Sign in required", reason: "signin" }, { status: 401 }) };
  return { session, db: createServiceClient() };
}

export async function POST(request: Request) {
  const s = await setup(request);
  if ("error" in s) return s.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request", reason: "invalid" }, { status: 400 });
  }
  const parsed = interestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Validation failed", reason: "invalid", issues: parsed.error.flatten() }, { status: 422 });
  const job = await loadTownJob(s.db, parsed.data.rfpId);
  if (!job?.sealed) return NextResponse.json({ ok: false, error: "Not a sealed quote request", reason: "not_sealed" }, { status: 404 });
  const reply = await respondSealed(s.db, s.session, job, parsed.data);
  return NextResponse.json(reply.body, { status: reply.status });
}

export async function DELETE(request: Request) {
  const s = await setup(request);
  if ("error" in s) return s.error;
  const url = new URL(request.url);
  const rfpId = url.searchParams.get("rfpId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(rfpId)) return NextResponse.json({ ok: false, error: "Invalid request", reason: "invalid" }, { status: 400 });
  const job = await loadTownJob(s.db, rfpId);
  if (!job?.sealed) return NextResponse.json({ ok: false, error: "Not a sealed quote request", reason: "not_sealed" }, { status: 404 });
  const reply = await withdrawSealed(s.db, s.session, job, url.searchParams.get("lang"));
  return NextResponse.json(reply.body, { status: reply.status });
}
