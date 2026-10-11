import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { geminiAvailable } from "@/lib/ai/gemini";
import { extractBidCheck } from "@/lib/bid-check/ai";
import { publicTenderSource } from "@/lib/tenders/sources";

export const maxDuration = 60;

/** Per run: small enough for the free Gemini quota (runs every 15 minutes). */
const BATCH = 8;
/** Stop starting new extractions after this long, to finish inside maxDuration. */
const BUDGET_MS = 45_000;
/** Hard stop for an extraction already running (one slow model call took the whole run past 60s). */
const DEADLINE_MS = 52_000;

interface Candidate {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  scope: string | null;
  requirements: string | null;
  province: string | null;
  deadline: string | null;
  source_type: string | null;
}

/**
 * Fills "Can my company bid?" checklists for open RFPs that don't have one,
 * newest first (so today's alerts get them), then the backlog. Past contracts
 * and closed RFPs are skipped. A failed extraction is stored with its error
 * and not retried; a quota error ends the run early. `?dry=1` reports the
 * backlog without calling the model. CRON_SECRET-protected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  if (!geminiAvailable()) return NextResponse.json({ skipped: "no GEMINI_API_KEY" });

  const supabase = createServiceClient();
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // Runs every 15 minutes, so keep it light: ids only for the candidate list
  // (it used to pull scope + requirements text for up to 1,000 listings each
  // run), done-checks only for those candidates, full text only for the batch.
  const { data: open, error } = await supabase
    .from("rfp_posts")
    .select("id,slug,source_type")
    .eq("status", "published")
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order("published_at", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const candidates = ((open ?? []) as Pick<Candidate, "id" | "slug" | "source_type">[]).filter(
    (r) => !(r.source_type === "public_source" && publicTenderSource(r.slug).past),
  );
  // PostgREST returns at most 1,000 rows per request, so the old
  // `rfp_bid_checks … limit(10000)` silently missed rows past 1,000 and
  // re-extracted listings that already had a checklist. Ask per candidate chunk.
  const have = new Set<string>();
  for (let i = 0; i < candidates.length; i += 150) {
    const ids = candidates.slice(i, i + 150).map((r) => r.id);
    const { data: done, error: doneErr } = await supabase.from("rfp_bid_checks").select("rfp_id").in("rfp_id", ids);
    if (doneErr) return NextResponse.json({ error: doneErr.message }, { status: 500 });
    for (const d of (done ?? []) as { rfp_id: string }[]) have.add(d.rfp_id);
  }
  const backlog = candidates.filter((r) => !have.has(r.id));
  if (new URL(request.url).searchParams.get("dry") === "1") {
    return NextResponse.json({ dry: true, backlog: backlog.length, next: backlog.slice(0, BATCH).map((r) => r.slug) });
  }
  const batchIds = backlog.slice(0, BATCH).map((r) => r.id);
  const { data: full, error: fullErr } = batchIds.length
    ? await supabase
        .from("rfp_posts")
        .select("id,slug,title,summary,scope,requirements,province,deadline,source_type")
        .in("id", batchIds)
    : { data: [], error: null };
  if (fullErr) return NextResponse.json({ error: fullErr.message }, { status: 500 });
  const byId = new Map(((full ?? []) as Candidate[]).map((r) => [r.id, r]));
  const todo = batchIds.map((id) => byId.get(id)).filter((r): r is Candidate => Boolean(r));

  let written = 0;
  let failed = 0;
  let stoppedForQuota = false;
  for (const r of todo.slice(0, BATCH)) {
    if (Date.now() - started > BUDGET_MS) break;
    const signal = AbortSignal.timeout(Math.max(1_000, DEADLINE_MS - (Date.now() - started)));
    const res = await extractBidCheck({
      title: r.title,
      summary: r.summary,
      scope: r.scope,
      requirements: r.requirements,
      province: r.province,
      deadline: r.deadline,
      issuer: r.source_type === "public_source" ? publicTenderSource(r.slug).issuer : null,
    }, signal);
    // Ran out of time mid-call: leave it for the next run rather than marking it failed.
    if (!res.ok && res.aborted) break;
    if (!res.ok && res.quota) {
      stoppedForQuota = true; // try again next run; don't mark it failed
      break;
    }
    const row: { rfp_id: string; result: unknown; model: string | null; error: string | null } = res.ok
      ? { rfp_id: r.id, result: res.check, model: res.model, error: null }
      : { rfp_id: r.id, result: null, model: null, error: res.error.slice(0, 500) };
    const { error: upErr } = await supabase.from("rfp_bid_checks").upsert(row);
    if (upErr) {
      console.error("[bid-checks] write failed:", upErr.message);
      break;
    }
    if (res.ok) written++;
    else failed++;
  }

  return NextResponse.json({ written, failed, stoppedForQuota, backlog: Math.max(0, backlog.length - written - failed) });
}
