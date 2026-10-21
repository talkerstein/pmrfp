import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { torontoDay } from "@/lib/attribution/cookie";
import { EMPTY_REPORT, normalizeReport, type RawReport } from "./report";

/**
 * The aggregated site report (one RPC, everything grouped in SQL), cached
 * for 5 minutes per date range. Callers gate access first: /admin/analytics
 * runs requireRole(admin) before calling this, and the RPC itself is
 * service-role only. Never a full table load.
 */

export const SITE_ANALYTICS_TAG = "site-analytics";
export const SITE_ANALYTICS_REVALIDATE = 300;

async function fetchReport(from: string, to: string): Promise<RawReport & { missing?: boolean }> {
  const { data, error } = await createServiceClient().rpc("site_analytics_report", { p_from: from, p_to: to });
  if (error) {
    // Before migration 20261021000200 the function doesn't exist: say so instead of failing.
    if (/site_analytics_report|function|schema cache/i.test(error.message)) return { ...EMPTY_REPORT, from, to, missing: true };
    throw new Error(error.message);
  }
  return normalizeReport(data);
}

const cachedReport = unstable_cache(fetchReport, ["site-analytics-report-v1"], {
  tags: [SITE_ANALYTICS_TAG],
  revalidate: SITE_ANALYTICS_REVALIDATE,
});

/** YYYY-MM-DD, `days` days before `to` (inclusive range of `days` days). */
export function rangeEnding(to: string, days: number): { from: string; to: string } {
  const end = new Date(`${to}T12:00:00Z`);
  const start = new Date(end.getTime() - (Math.max(1, days) - 1) * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to };
}

export async function loadSiteReport(days: number, now = new Date()): Promise<(RawReport & { missing?: boolean }) | null> {
  if (!isServiceConfigured()) return null;
  const { from, to } = rangeEnding(torontoDay(now), days);
  return cachedReport(from, to);
}

/** Uncached, for the weekly cron (runs once). */
export async function fetchSiteReport(from: string, to: string): Promise<RawReport | null> {
  if (!isServiceConfigured()) return null;
  try {
    const r = await fetchReport(from, to);
    return r.missing ? null : r;
  } catch (e) {
    console.warn("[site-analytics] report failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
