import { randomUUID } from "node:crypto";
import { sanitizePath } from "@/lib/attribution/cookie";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { UUID } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { Batch } from "./buffer";
import { countryCode, isSiteEvent, sanitizeProps } from "./events";

const dayPattern = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const hashPattern = /^[a-f0-9]{32}$/;
const slugPattern = /^[A-Za-z0-9-]{1,200}$/;
const referrerPattern = /^[a-z0-9.-]{1,100}$/;
const rolePattern = /^[a-z_]{1,40}$/;
const lang = (s: string | null) => s === "en" || s === "fr" || s === "es" ? s : null;
const uid = (s: string | null) => s && UUID.test(s) ? s : null;
const tally = (s: number) => Number.isFinite(s) ? Math.max(0, Math.min(100000, Math.floor(s))) : 0;

function eventTime(at: string, now: Date) {
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(Math.max(now.getTime()-86_400_000, Math.min(now.getTime(),t))).toISOString() : now.toISOString();
}

/** Each transport batch contains parameterized JSON rows and gates writes on D1 authority. */
export async function flushNativeTracking(batch: Batch, db: D1Binding = vpsAppDatabase(), now = new Date()) {
  const rows = {
    visitors: batch.visitors.filter((r) => dayPattern.test(r.day) && hashPattern.test(r.h))
      .map((r) => ({...r,country:countryCode(r.country) ?? "",lang:lang(r.lang) ?? "",signed_in:Number(r.signed_in)})),
    pages: batch.pages.filter((r) => dayPattern.test(r.day) && r.path.startsWith("/"))
      .map((r) => ({...r,path:sanitizePath(r.path).slice(0,200),country:countryCode(r.country) ?? "",n:tally(r.n)})).filter((r) => r.path && r.n),
    referrers: batch.referrers.filter((r) => dayPattern.test(r.day) && referrerPattern.test(r.host))
      .map((r) => ({...r,country:countryCode(r.country) ?? "",n:tally(r.n)})).filter((r) => r.n),
    views: batch.views.filter((r) => dayPattern.test(r.day) && hashPattern.test(r.h) && slugPattern.test(r.slug))
      .map((r) => ({...r,id:randomUUID(),country:countryCode(r.country),lang:lang(r.lang),user_id:uid(r.user_id)})),
    events: batch.events.filter((r) => isSiteEvent(r.event)).map((r) => {
      const props = JSON.stringify(sanitizeProps(r.props));
      return {
        ...r,path:r.path?.startsWith("/") ? sanitizePath(r.path).slice(0,200) || null : null,country:countryCode(r.country),
        lang:lang(r.lang),role:r.role && rolePattern.test(r.role) ? r.role : null,user_id:uid(r.user_id),
        anon_hash:r.anon_hash && hashPattern.test(r.anon_hash) ? r.anon_hash : null,
        utm_source:r.utm_source?.slice(0,80) || null,utm_medium:r.utm_medium?.slice(0,80) || null,
        utm_campaign:r.utm_campaign?.slice(0,80) || null,
        props:Buffer.byteLength(props)<=1000 ? props : "{}",at:eventTime(r.at,now),
      };
    }),
  };
  const queries: { statement:D1Statement; bytes:number }[] = [];
  function append(payload: object[], sql: string) {
    for (let offset=0;offset<payload.length;offset+=100) {
      const argument = JSON.stringify(payload.slice(offset,offset+100));
      queries.push({
        statement:db.prepare(sql).bind(argument),
        bytes:Buffer.byteLength(JSON.stringify({sql,params:[argument]}))+1,
      });
    }
  }

  append(rows.visitors,`INSERT INTO site_visitors(day,visitor_hash,country,lang,signed_in)
    SELECT json_extract(value,'$.day'),json_extract(value,'$.h'),json_extract(value,'$.country'),
      json_extract(value,'$.lang'),json_extract(value,'$.signed_in') FROM json_each(?) WHERE ${customerAppAuthority}
    ON CONFLICT(day,visitor_hash) DO UPDATE SET signed_in=1 WHERE excluded.signed_in=1 AND site_visitors.signed_in=0`);
  append(rows.pages,`INSERT INTO site_page_views(day,path,country,views)
    SELECT json_extract(value,'$.day'),json_extract(value,'$.path'),json_extract(value,'$.country'),
      json_extract(value,'$.n') FROM json_each(?) WHERE ${customerAppAuthority}
    ON CONFLICT(day,path,country) DO UPDATE SET views=site_page_views.views+excluded.views`);
  append(rows.referrers,`INSERT INTO site_referrers(day,referrer_host,country,visits)
    SELECT json_extract(value,'$.day'),json_extract(value,'$.host'),json_extract(value,'$.country'),
      json_extract(value,'$.n') FROM json_each(?) WHERE ${customerAppAuthority}
    ON CONFLICT(day,referrer_host,country) DO UPDATE SET visits=site_referrers.visits+excluded.visits`);
  append(rows.views,`INSERT INTO rfp_views(id,rfp_id,viewed_by_user_id,organization_id,view_day,visitor_hash,country,lang)
    SELECT json_extract(j.value,'$.id'),r.id,u.id,(SELECT m.organization_id FROM organization_members m WHERE m.user_id=u.id ORDER BY m.id LIMIT 1),
      json_extract(j.value,'$.day'),json_extract(j.value,'$.h'),json_extract(j.value,'$.country'),json_extract(j.value,'$.lang')
    FROM json_each(?) j JOIN rfp_posts r ON r.slug=json_extract(j.value,'$.slug')
    LEFT JOIN users_profile u ON u.id=json_extract(j.value,'$.user_id') AND u.status='active'
    WHERE ${customerAppAuthority} AND r.is_demo=0 AND r.status IN ('published','closed','awarded','expired')
      AND (u.id IS NULL OR (r.posted_by_user_id IS NOT u.id AND u.primary_role NOT IN ('admin','super_admin')
        AND NOT EXISTS(SELECT 1 FROM organization_members m WHERE m.user_id=u.id AND m.organization_id=r.posted_by_organization_id)))
    ON CONFLICT(rfp_id,view_day,visitor_hash) WHERE visitor_hash IS NOT NULL AND view_day IS NOT NULL DO NOTHING`);
  append(rows.events,`INSERT INTO site_events(event,path,lang,country,role,user_id,anon_hash,utm_source,utm_medium,utm_campaign,props,created_at)
    SELECT json_extract(j.value,'$.event'),json_extract(j.value,'$.path'),json_extract(j.value,'$.lang'),
      coalesce(json_extract(j.value,'$.country'),(SELECT CASE o.country WHEN 'Canada' THEN 'CA' WHEN 'United States' THEN 'US'
        WHEN 'USA' THEN 'US' WHEN 'US' THEN 'US' WHEN 'CA' THEN 'CA' END FROM organization_members m
        JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=u.id ORDER BY m.id LIMIT 1)),
      coalesce(json_extract(j.value,'$.role'),u.primary_role),u.id,json_extract(j.value,'$.anon_hash'),
      json_extract(j.value,'$.utm_source'),json_extract(j.value,'$.utm_medium'),json_extract(j.value,'$.utm_campaign'),
      json_extract(j.value,'$.props'),json_extract(j.value,'$.at')
    FROM json_each(?) j LEFT JOIN users_profile u ON u.id=json_extract(j.value,'$.user_id') AND u.status='active'
    WHERE ${customerAppAuthority}`);

  let group: D1Statement[] = [];
  let bytes = 16;
  async function flush() {
    if (!group.length) return;
    const result = await db.batch(group);
    if (result.length!==group.length || result.some((r) => !r.success)) throw Error("tracking_write_failed");
    group = [];
    bytes = 16;
  }
  // Count serialized bytes to leave room under the 512 KiB transport cap.
  for (const query of queries) {
    if (group.length>=20 || bytes+query.bytes>450*1024) await flush();
    group.push(query.statement);
    bytes+=query.bytes;
  }
  await flush();
}
