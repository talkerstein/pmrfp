import { type D1Binding, D1ApiError } from "./contracts";

const records = [
  ["site_events", "julianday(created_at) < julianday(?)", "timestamp"],
  ["site_visitors", "day < ?", "day"],
  ["site_page_views", "day < ?", "day"],
  ["site_referrers", "day < ?", "day"],
  ["rfp_views", "visitor_hash IS NOT NULL AND julianday(created_at) < julianday(?)", "timestamp"],
] as const;

/** The same minimum retention as the existing 13-calendar-month policy. */
export async function purgeD1SiteTracking(db: D1Binding, now = new Date(), dry = false) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 13);
  const lastDay = new Date(cutoff);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  cutoff.setUTCDate(Math.min(now.getUTCDate(), lastDay.getUTCDate()));
  const before = cutoff.toISOString();
  const day = before.slice(0, 10);
  const results = await db.batch<{ n: number }>([
    db.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM _customer_app_authority WHERE id=1 AND mode='native-v1')
      THEN 1 ELSE json('native_app_authority_unavailable') END`),
    ...records.map(([table, predicate, format]) => db.prepare(
      `${dry ? "SELECT count(*) AS n" : "DELETE"} FROM ${table} WHERE ${predicate}`,
    ).bind(format === "day" ? day : before)),
  ]);
  const changes = results.slice(1).map(result => dry ? result.results[0]?.n : result.meta.changes);
  if (results.length !== 6 || results.some(result => !result.success) ||
      changes.some(change => typeof change !== "number" || !Number.isSafeInteger(change) || change < 0)) {
    throw new D1ApiError(503, "retention_receipt_unavailable");
  }
  const [events, visitors, pages, referrers, views] = changes;
  return { cutoff: before, events, visitors, pages, referrers, views };
}
