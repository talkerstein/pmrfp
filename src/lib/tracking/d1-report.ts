import "server-only";
import type { D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import type { RawReport } from "./report";

const market = (alias: string) => `CASE ${alias}.country WHEN 'CA' THEN 'CA' WHEN 'US' THEN 'US' ELSE 'other' END`;

export async function fetchD1SiteReport(from: string, to: string, db: D1Binding = vpsAppDatabase()): Promise<RawReport> {
  const bounded = await db.prepare("SELECT max(min(date(?),date(?)),date(?,'-400 day')) AS start,date(?) AS end")
    .bind(from,to,to,to).first<{start:string|null;end:string|null}>();
  if (!bounded?.start || !bounded.end) throw Error("Invalid analytics date range");
  const range = [bounded.start,bounded.end] as const;
  const dated = (column: string) => `julianday(${column})>=julianday(?) AND julianday(${column})<julianday(?, '+1 day')`;
  const results = await db.batch([
    db.prepare(`SELECT day,market,sum(visitors) AS visitors,sum(page_views) AS page_views FROM (
       SELECT s.day,${market("s")} AS market,count(*) AS visitors,0 AS page_views
        FROM site_visitors s WHERE s.day BETWEEN ? AND ? GROUP BY 1,2
       UNION ALL SELECT s.day,${market("s")},0,sum(s.views)
        FROM site_page_views s WHERE s.day BETWEEN ? AND ? GROUP BY 1,2
      ) GROUP BY day,market ORDER BY day,market`).bind(...range,...range),
    db.prepare(`SELECT market,path,views FROM (
      SELECT grouped.*,row_number() OVER(PARTITION BY market ORDER BY views DESC,path) AS rank
      FROM (SELECT ${market("s")} AS market,path,sum(views) AS views
        FROM site_page_views s WHERE day BETWEEN ? AND ? GROUP BY 1,2) grouped
      ) WHERE rank<=15 ORDER BY market,views DESC,path`).bind(...range),
    db.prepare(`SELECT market,host,visits FROM (
      SELECT grouped.*,row_number() OVER(PARTITION BY market ORDER BY visits DESC,host) AS rank
      FROM (SELECT ${market("s")} AS market,referrer_host AS host,sum(visits) AS visits
        FROM site_referrers s WHERE day BETWEEN ? AND ? GROUP BY 1,2) grouped
      ) WHERE rank<=15 ORDER BY market,visits DESC,host`).bind(...range),
    db.prepare(`SELECT ${market("s")} AS market,s.channel,coalesce(s.method,'unknown') AS method,
      coalesce(s.role,u.primary_role,'unknown') AS role,count(*) AS n FROM signup_attribution s
      LEFT JOIN users_profile u ON u.id=s.user_id WHERE ${dated("s.signed_up_at")} GROUP BY 1,2,3,4`).bind(...range),
    db.prepare(`SELECT count(*) AS total,count(*) FILTER(WHERE s.user_id IS NULL) AS without_row
      FROM users_profile u LEFT JOIN signup_attribution s ON s.user_id=u.id
      WHERE ${dated("u.created_at")} AND u.primary_role NOT IN ('admin','super_admin')`).bind(...range),
    db.prepare(`SELECT ${market("e")} AS market,e.event,
      CASE WHEN e.role IN ('trade','supplier') THEN 'trade'
        WHEN e.role IN ('property_manager','real_estate_agent') THEN 'pm'
        WHEN e.role='public_buyer' THEN 'town' ELSE 'other' END AS role_group,
      count(DISTINCT coalesce(e.user_id,e.anon_hash,CAST(e.id AS TEXT))) AS actors,count(*) AS n
      FROM site_events e WHERE ${dated("e.created_at")} GROUP BY 1,2,3`).bind(...range),
    db.prepare(`SELECT ${market("e")} AS market,e.event,coalesce(substr(json_extract(e.props,'$.step'),1,40),'') AS step,
      coalesce(substr(json_extract(e.props,'$.field'),1,40),'') AS field,
      count(DISTINCT coalesce(e.user_id,e.anon_hash,CAST(e.id AS TEXT))) AS actors,count(*) AS n
      FROM site_events e WHERE ${dated("e.created_at")} AND e.event IN ('signup_step','onboarding_step')
      GROUP BY 1,2,3,4`).bind(...range),
  ]);
  const [daily,pages,refs,signups,accounts,events,steps] = results;
  return {
    from:range[0],to:range[1], daily:daily.results as RawReport["daily"],top_pages:pages.results as RawReport["top_pages"],
    top_referrers:refs.results as RawReport["top_referrers"],signups:signups.results as RawReport["signups"],
    accounts:accounts.results[0] as RawReport["accounts"],events:events.results as RawReport["events"],steps:steps.results as RawReport["steps"],
  };
}
