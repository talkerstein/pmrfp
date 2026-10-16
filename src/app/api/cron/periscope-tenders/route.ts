import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { ENABLED_PERISCOPE_SITES } from "@/lib/tenders/periscope-sites";
import { periscopeSource } from "@/lib/tenders/periscope-source";
import { syncPublicSources } from "@/lib/tenders/sync";

/** The open-bid list is two requests (search page + CSV export). */
const LIST_BUDGET_MS = 40_000;
/** New bids' detail pages, 2.5 s apart; whatever doesn't fit waits a day. */
const DETAIL_BUDGET_MS = 200_000;

export const maxDuration = 300;

/**
 * Daily Periscope S2G / BuySpeed public-tender import (Vercel cron, 12:45 UTC
 * — after us-local-tenders, before the 13:00 rfp-alerts run). Only sites
 * marked `enabled` in lib/tenders/periscope-sites run (COMMBUYS today). One
 * polite pass per site per day. `?dry=1` reports what would change without
 * writing (and reads only a few detail pages). CRON_SECRET-protected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  // Sites enrich one after another: before enabling a second site, split
  // DETAIL_BUDGET_MS between them (or give it its own route) to stay under 300 s.
  const sources = ENABLED_PERISCOPE_SITES.map((site) =>
    periscopeSource(site, { listSignal: () => AbortSignal.timeout(LIST_BUDGET_MS), detailBudgetMs: DETAIL_BUDGET_MS }),
  );
  const { status, body } = await syncPublicSources(createServiceClient(), sources, {
    today: new Date().toISOString().slice(0, 10),
    dry: new URL(request.url).searchParams.get("dry") === "1",
  });
  return NextResponse.json(body, { status });
}
