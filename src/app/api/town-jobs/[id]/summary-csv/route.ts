import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { canManageTownJob } from "@/lib/town-jobs/rules";
import { loadTownJob } from "@/lib/town-jobs/server";
import { loadResults } from "@/lib/town-jobs/results-server";
import { summaryCsv } from "@/lib/town-jobs/results";
import { getDictionary } from "@/i18n/dictionaries";
import { isEnabledLocale } from "@/i18n/config";

/**
 * The council summary's table as CSV (PMRFP for Towns, Part C): one row a
 * quote, lowest price first, with the recommendation marked. The town (or an
 * admin) only, and only once results are ready (a sealed box opened, or
 * after closing). Headers in the page's language.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured() || !isServiceConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const db = createServiceClient();
  const job = await loadTownJob(db, id);
  if (!job || !canManageTownJob(job, { userId: session.userId, organizationId: session.organization?.id ?? null, role: session.profile.primary_role })) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const results = await loadResults(db, job, session.userId);
  if (!results.ready || !results.summary) return NextResponse.json({ error: "Results aren't ready yet" }, { status: 409 });
  const langParam = new URL(request.url).searchParams.get("lang");
  const t = getDictionary(isEnabledLocale(langParam) ? langParam : "en").townResults;
  const r = t.results;
  const csv = summaryCsv(
    results.summary,
    {
      company: r.cols.company,
      amount: r.cols.amount,
      kind: r.cols.kind,
      start: r.cols.start,
      notes: r.cols.notes,
      status: r.cols.status,
      profile: r.cols.profile,
      insurance: r.insurance,
      wsib: r.wsib,
      received: r.received,
      recommended: r.recommend.title,
      yes: "✓",
      firm: r.firm,
      estimate: r.estimate,
      notOnFile: r.notOnFile,
      statuses: r.statuses,
      profiles: r.profile,
    },
    results.saved?.recommended_interest_id ?? null,
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="council-summary-${job.slug.replace(/[^a-z0-9-]/gi, "")}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
