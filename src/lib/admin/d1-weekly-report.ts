import "server-only";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { torontoDay } from "@/lib/attribution/cookie";
import { getStripe } from "@/lib/stripe/server";
import { fetchD1SiteReport } from "@/lib/tracking/d1-report";
import { rangeEnding } from "@/lib/tracking/report-server";
import { buildWeeklyReport, type ReportInput } from "./weekly-report";
import { fetchStripeRevenue } from "./stripe-revenue";

export async function buildD1WeeklyReport(now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const week = rangeEnding(torontoDay(now), 7);
  const db = vpsAppDatabase();
  const [rows, traffic, stripe] = await Promise.all([
    db.batch([
      db.prepare("SELECT email,primary_role,created_at FROM users_profile WHERE julianday(created_at)>=julianday(?) ORDER BY created_at DESC,id LIMIT 5000").bind(twoWeeksAgo),
      db.prepare(`SELECT s.status,s.amount,s.stripe_price_id,s.created_at,s.updated_at,s.cancel_at_period_end,o.name AS orgName
        FROM subscriptions s LEFT JOIN organizations o ON o.id=s.organization_id ORDER BY s.id LIMIT 5000`),
      db.prepare(`SELECT title,slug,created_at FROM rfp_posts WHERE source_type IS NOT 'public_source'
        AND julianday(created_at)>=julianday(?) ORDER BY created_at DESC,id LIMIT 200`).bind(weekAgo),
      db.prepare(`SELECT count(*) AS total,count(*) FILTER(WHERE slug LIKE '%-us-%') AS us FROM rfp_posts
        WHERE source_type='public_source' AND julianday(created_at)>=julianday(?)`).bind(weekAgo),
      db.prepare(`SELECT count(*) FILTER(WHERE julianday(created_at)>=julianday(?)) AS recent,
        count(*) FILTER(WHERE julianday(created_at)<julianday(?)) AS previous
        FROM rfp_interests WHERE julianday(created_at)>=julianday(?)`).bind(weekAgo,weekAgo,twoWeeksAgo),
      db.prepare("SELECT count(*) AS n FROM contact_requests WHERE julianday(created_at)>=julianday(?)").bind(weekAgo),
    ]),
    fetchD1SiteReport(week.from, week.to),
    process.env.STRIPE_SECRET_KEY ? fetchStripeRevenue(getStripe()) : Promise.resolve(null),
  ]);
  const [users, subs, pmRfps, tenders, interests, contacts] = rows;
  return buildWeeklyReport({
    now, users:users.results as ReportInput["users"],
    subscriptions:(subs.results as ReportInput["subscriptions"]).map(s => ({
      ...s, amount:s.amount == null ? null : Number(s.amount), cancel_at_period_end:Boolean(s.cancel_at_period_end),
    })),
    pmRfps:pmRfps.results as ReportInput["pmRfps"],
    tenders:tenders.results[0] as ReportInput["tenders"],
    interests:Number(interests.results[0].recent), interestsPrev:Number(interests.results[0].previous),
    contactRequests:Number(contacts.results[0].n),stripe,traffic,
  });
}
