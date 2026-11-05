import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { getCategories } from "@/lib/data/taxonomy";
import { REPORT_COLUMNS, runExtraction, type ReportRow } from "@/lib/report-quotes/server";

// A long report can take the model a minute or more to read.
export const maxDuration = 120;

/**
 * POST /api/report-quotes/extract {id} — read the stored report with the AI
 * and save the repair items it lists. The report is read through the user's
 * own client first (RLS: their organization only). Never a dead end: on any
 * failure the answer says so and the editor opens for typing items by hand.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "ai");
  if (limited) return rateLimitResponse(limited);
  const session = await getSession();
  if (!session || !session.organization) return NextResponse.json({ error: "signIn" }, { status: 401 });
  if (!["property_manager", "real_estate_agent"].includes(session.profile.primary_role)) return NextResponse.json({ error: "role" }, { status: 403 });
  if (!isServiceConfigured()) return NextResponse.json({ status: "manual", reason: "unavailable" });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = z.uuid().safeParse(body?.id);
  if (!id.success) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const db = await createClient();
  const { data: report } = await db.from("quote_reports").select(REPORT_COLUMNS).eq("id", id.data).maybeSingle<ReportRow>();
  if (!report) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const trades = (await getCategories()).map((c) => ({ slug: c.slug, name: c.name }));
  const outcome = await runExtraction(createServiceClient(), report, trades);
  return NextResponse.json(outcome);
}
