import { readAtValidatedCheckpoint } from "./checkpoint";
import { customerAppAuthority } from "./customer-signup";
import { D1ApiError, RFP_SLUG, type D1Binding } from '../../src/lib/d1/contracts';

/** Public directory projection only. Hidden contacts never leave D1. */
export async function listPublicDirectory(db: D1Binding, url: URL, native = false) {
  const keys = [...url.searchParams.keys()];
  const slug = url.searchParams.get('slug');
  const type = url.searchParams.get('type');
  if (new Set(keys).size !== keys.length || keys.some(k => !['slug', 'type'].includes(k)) ||
      (slug !== null && !RFP_SLUG.test(slug)) ||
      (type !== null && !['trade_company', 'supplier'].includes(type))) throw new D1ApiError(400, 'invalid_request');
  const params: string[] = [];
  let where = "o.profile_status='approved' AND o.status='active' AND o.is_demo=0 AND o.organization_type IN ('trade_company','supplier')";
  if (slug !== null) { where += ' AND o.slug=?'; params.push(slug); }
  if (type !== null) { where += ' AND o.organization_type=?'; params.push(type); }
  const query = db.prepare(`SELECT o.id,o.slug,o.name,o.organization_type,o.city,o.province,
    o.short_description,o.full_description,o.logo_url,o.verified,o.featured,o.platinum,
    o.years_in_business,o.employee_count_range,o.insurance_status,o.wsib_status,o.emergency_service,
    o.public_contact_visibility,o.google_rating,o.google_review_count,o.email_domain_verified,
    CASE WHEN o.public_contact_visibility='show_contact' THEN o.website ELSE NULL END AS website,
    CASE WHEN o.public_contact_visibility='show_contact' THEN o.email ELSE NULL END AS email,
    CASE WHEN o.public_contact_visibility='show_contact' THEN o.phone ELSE NULL END AS phone,
    ${native ? "o.profile_status,o.status,o.approved_at,o.link_trusted,o.link_paid,o.link_badge,o.risk_flagged," : ""}
    (SELECT json_group_array(json_object('trade_categories',json_object('name',t.name,'slug',t.slug))) FROM organization_categories c JOIN trade_categories t ON t.id=c.category_id WHERE c.organization_id=o.id) AS organization_categories,
    (SELECT json_group_array(json_object('regions',json_object('name',r.name,'slug',r.slug,'country',r.country))) FROM organization_regions c JOIN regions r ON r.id=c.region_id WHERE c.organization_id=o.id) AS organization_regions,
    (SELECT json_group_array(json_object('property_types',json_object('name',p.name,'slug',p.slug))) FROM organization_property_types c JOIN property_types p ON p.id=c.property_type_id WHERE c.organization_id=o.id) AS organization_property_types
    FROM organizations o WHERE ${where} ORDER BY o.id LIMIT 1001`).bind(...params);
  const { dataset, results } = native ? await readNativeDirectory(db, query)
    : await readAtValidatedCheckpoint<Record<string, unknown>>(db, query);
  // Refuse truncation rather than silently omitting companies.
  if (results.length > 1000) throw new D1ApiError(503, 'directory_capacity_exceeded');
  const items = results.map(row => {
    const item = {...row};
    for (const k of ['verified','featured','platinum','emergency_service','email_domain_verified']) item[k] = row[k] === 1;
    if (native) for (const k of ['link_trusted','link_paid','link_badge','risk_flagged']) item[k] = row[k] === 1;
    for (const k of ['organization_categories','organization_regions','organization_property_types']) item[k] = JSON.parse(String(row[k]));
    item.google_rating = row.google_rating === null ? null : Number(row.google_rating);
    return item;
  });
  return {items,dataset};
}

async function readNativeDirectory(db: D1Binding, query: ReturnType<D1Binding["prepare"]>) {
  const [authority, data] = await db.batch([
    db.prepare(`SELECT 1 AS ready WHERE ${customerAppAuthority}`), query,
  ]);
  if (authority?.results[0]?.ready !== 1 || !authority?.success || !data?.success) throw new D1ApiError(503, "directory_unavailable");
  return { dataset: null, results: data.results };
}
