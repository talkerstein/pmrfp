import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, RFP_SLUG, UUID, type D1Binding } from "./contracts";
import { DETAIL_IDS, DETAIL_TEXT, detailRow } from "./detail-contracts";
import { vpsAppDatabase } from "./http-binding";
import { publicRfpPhotoSource } from "./public-asset-preview";

const actorAccess = `(r.posted_by_user_id=p.id OR p.primary_role IN ('admin','super_admin') OR
  EXISTS(SELECT 1 FROM organization_members o WHERE o.user_id=p.id AND o.organization_id=r.posted_by_organization_id)
  OR (r.status='published' AND EXISTS(SELECT 1 FROM organization_members m
    JOIN organizations o ON o.id=m.organization_id
    LEFT JOIN subscriptions s ON s.organization_id=o.id
    LEFT JOIN trade_trials t ON t.organization_id=o.id
    WHERE m.user_id=p.id AND o.status='active' AND o.organization_type IN ('trade_company','supplier') AND (
      (s.status IN ('active','comped') AND s.tier IN ('pro','featured'))
      OR (o.organization_type='trade_company' AND julianday(t.started_at)<=julianday('now') AND julianday(t.ends_at)>julianday('now'))
    ))))`;

export async function readVpsRfpDetail(slug: string, userId: string, db: D1Binding = vpsAppDatabase()) {
  if (!UUID.test(userId) || !RFP_SLUG.test(slug)) return null;
  const row = await db.prepare(`SELECT r.id,r.slug,r.title,r.status,r.contact_visibility,r.is_demo,r.budget_public,r.budget_min,r.budget_max,
    ${[...DETAIL_TEXT, ...DETAIL_IDS].map(column => "r." + column).join(",")},
    region.name AS region_name, property.name AS property_type_name,
    (SELECT json_group_array(name) FROM (SELECT category.name FROM rfp_categories c
      JOIN trade_categories category ON category.id=c.category_id
      WHERE c.rfp_id=r.id ORDER BY category.name)) AS category_names,
    (SELECT json_group_array(file_url) FROM (SELECT d.file_url FROM rfp_documents d WHERE d.rfp_id=r.id
       AND d.visibility='public' AND d.file_type GLOB 'image/*' AND d.file_url IS NOT NULL AND d.file_url<>''
       ORDER BY d.created_at,d.id LIMIT 40)) AS photos
    FROM rfp_posts r JOIN users_profile p ON p.id=? AND p.status='active'
    LEFT JOIN regions region ON region.id=r.region_id
    LEFT JOIN property_types property ON property.id=r.property_type_id
    WHERE r.slug=? AND r.is_demo=0 AND ${customerAppAuthority} AND ${actorAccess}`).bind(userId, slug)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const budget = (value: unknown) => value === null ? null : Number(value);
  const list = (value: unknown): string[] => {
    const decoded: unknown = JSON.parse(String(value));
    if (!Array.isArray(decoded) || decoded.some(item => typeof item !== "string")) {
      throw new D1ApiError(503, "authorization_unavailable");
    }
    return decoded;
  };
  return {
    item: detailRow({ ...row, is_demo: row.is_demo === 1, budget_public: row.budget_public === 1,
      budget_min: budget(row.budget_min), budget_max: budget(row.budget_max) }),
    categories: list(row.category_names),
    photos: list(row.photos).filter(url => publicRfpPhotoSource(url).unoptimized),
    regionName: typeof row.region_name === "string" ? row.region_name : null,
    propertyTypeName: typeof row.property_type_name === "string" ? row.property_type_name : null,
  };
}

export async function readVpsPublicTenderUrl(slug: string, db: D1Binding = vpsAppDatabase()) {
  if (!RFP_SLUG.test(slug)) return null;
  const row = await db.prepare(`SELECT source_url FROM rfp_posts WHERE slug=? AND is_demo=0 AND status='published'
    AND source_type='public_source' AND ${customerAppAuthority}`).bind(slug).first<{ source_url: string | null }>();
  const url = row?.source_url;
  return url && /^https?:\/\//i.test(url) ? url : null;
}
