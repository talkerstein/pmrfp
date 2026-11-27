import type { SessionContext } from "../access/access";
import { websiteDomain } from "../dedupe/company";
import { escapeLike } from "../dedupe/email";
import { isUsState } from "../geo";
import { isInternalEmail } from "../lifecycle/rescue";
import { parseReviewChanges, profileStatusPatch, reviewChanges, type ReviewField } from "../organizations/profile-review";
import type { CompanyProfileInput } from "../validations";
import { loadListingRisk } from "../../../workers/d1-api/customer-onboarding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, RFP_SLUG, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { publicImageSource } from "./public-asset-preview";
import { companyMediaMember, companyMediaRoute } from "./vps-company-media";
import { UUID } from "./contracts";

const eligible = `o.status='active' AND o.is_demo=0 AND o.organization_type IN ('trade_company','supplier') AND ${companyMediaMember}`;
const taxonomies = [
  { field: "categories", table: "trade_categories", join: "organization_categories", column: "category_id" },
  { field: "regions", table: "regions", join: "organization_regions", column: "region_id" },
  { field: "propertyTypes", table: "property_types", join: "organization_property_types", column: "property_type_id" },
] as const;

type Identity = { userId: string; organization: { id: string } | null };
type Company = Record<ReviewField, string | null> & {
  id: string; country: string; account_email: string; updated_at: string; profile_status: string; link_trusted: number;
  review_changes: string | null; review_flagged_at: string | null; risk_flagged: number;
};

export async function readVpsCompanySelections(session: Identity, db: D1Binding = vpsAppDatabase()) {
  const id = session.organization?.id;
  if (!id) return { categories: [], regions: [], propertyTypes: [], paid: false };
  const results = await db.batch<{ slug?: string; paid?: number }>([
    ...taxonomies.map(({ table, join, column }) => db.prepare(`SELECT t.slug FROM ${join} j
      JOIN ${table} t ON t.id=j.${column} JOIN organizations o ON o.id=j.organization_id
      WHERE o.id=? AND ${eligible} AND ${customerAppAuthority}`).bind(id, session.userId)),
    db.prepare(`SELECT EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id AND s.status IN ('active','comped')) AS paid
      FROM organizations o WHERE o.id=? AND ${eligible} AND ${customerAppAuthority}`).bind(id, session.userId),
  ]);
  if (results.length !== 4 || results.some(row => !row.success) || !results[3].results[0]) {
    throw new D1ApiError(503, "company_profile_unavailable");
  }
  const slugs = (index: number) => results[index].results.flatMap(row => row.slug ? [row.slug] : []);
  return { categories: slugs(0), regions: slugs(1), propertyTypes: slugs(2), paid: results[3].results[0].paid === 1 };
}

export async function updateVpsCompanyProfile(session: Pick<SessionContext, "userId" | "organization">,
  data: CompanyProfileInput, logo: string | null, completion: number, db: D1Binding = vpsAppDatabase()) {
  const id = session.organization?.id;
  if (!id || data.website && !/^https?:\/\//i.test(data.website)) throw new D1ApiError(400, "invalid_company_profile");
  const selections = taxonomies.map(({ field }) => [...new Set(data[field] ?? [])]);
  if (selections.some(slugs => slugs.length > 100 || slugs.some(slug => !RFP_SLUG.test(slug)))) {
    throw new D1ApiError(400, "invalid_company_taxonomy");
  }
  const before = await db.prepare(`SELECT o.id,o.name,o.website,o.email,o.logo_url,o.short_description,o.full_description,
    o.country,o.updated_at,o.profile_status,o.link_trusted,o.review_changes,o.review_flagged_at,o.risk_flagged,p.email AS account_email
    FROM organizations o CROSS JOIN users_profile p WHERE o.id=? AND p.id=? AND ${eligible} AND ${customerAppAuthority}`)
    .bind(id, session.userId, session.userId).first<Company>();
  if (!before) throw new D1ApiError(403, "company_edit_unavailable");
  const storedLogo = before.logo_url;
  const retainsLogo = logo === null || (storedLogo !== null && (logo === storedLogo || logo === publicImageSource(storedLogo).src));
  const nextLogo = retainsLogo ? storedLogo : logo || null;
  const uploadedLogo = !retainsLogo && logo ? logo.split("/").at(-1) : null;
  if (uploadedLogo !== null && (!uploadedLogo || !UUID.test(uploadedLogo) || logo !== companyMediaRoute(uploadedLogo))) {
    throw new D1ApiError(400, "invalid_company_logo");
  }
  const country = data.province ? isUsState(data.province) ? "United States" : "Canada" : before.country;
  const patch = { name: data.name, website: data.website || null, email: data.email, logo_url: nextLogo,
    short_description: data.shortDescription || null, full_description: data.fullDescription || null };
  const changes = reviewChanges(before, patch);
  const approved = before.profile_status === "approved";
  const reviewedStatus = profileStatusPatch(before.profile_status) ?? before.profile_status;
  const site = websiteDomain(data.website);
  const countryChanged = country !== before.country;
  const mails = [data.email, before.account_email].filter(Boolean);
  const screen = before.link_trusted !== 1 && !mails.every(email => isInternalEmail(email)) &&
    (!approved || countryChanged || changes.some(({ field }) => field === "name" || field === "website" || field === "email"));
  const websites = screen && site ? await db.prepare(`SELECT id,website FROM organizations WHERE status<>'deleted' AND id<>?
    AND lower(website) LIKE ? ESCAPE '\\' LIMIT 501`).bind(id, `%${escapeLike(site)}%`).all<{ id: string; website: string | null }>() : null;
  if (websites && (!websites.success || websites.results.length > 500)) throw new D1ApiError(503, "company_checks_unavailable");
  const risk = screen ? await loadListingRisk(db, session.userId, before.account_email, data, country, websites?.results ?? [], id) : null;

  const timestamp = new Date(Math.max(Date.now(), (Date.parse(before.updated_at) || 0) + 1)).toISOString();
  const review = Object.fromEntries(parseReviewChanges(JSON.parse(before.review_changes ?? "{}"))
    .map(({ field, from, to }) => [field, { from, to }]));
  const previousReview = JSON.stringify(review);
  if (approved) {
    for (const change of changes) {
      const from = review[change.field] ? review[change.field].from : change.from;
      if (from === change.to) delete review[change.field];
      else review[change.field] = { from, to: change.to };
    }
  }
  const flagged = JSON.stringify(review);
  const reviewChanged = flagged !== previousReview;
  const status = risk?.reject ? "rejected" : reviewedStatus;
  const newWebsite = websiteDomain(before.website) !== site;

  const writes = [
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND EXISTS (SELECT 1 FROM organizations o
      WHERE o.id=? AND o.updated_at=? AND ${eligible}) THEN 1 ELSE json('company_profile_changed') END`)
      .bind(id, before.updated_at, session.userId),
    ...(uploadedLogo ? [db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM _company_media
      WHERE id=? AND organization_id=? AND kind='logo' AND ready=1) THEN 1 ELSE json('company_logo_not_found') END`)
      .bind(uploadedLogo, id)] : []),
    ...taxonomies.flatMap(({ table, join, column }, index) => {
      const slugs = JSON.stringify(selections[index]);
      return [
        db.prepare(`SELECT CASE WHEN (SELECT count(*) FROM ${table} WHERE slug IN (SELECT value FROM json_each(?)))
          = json_array_length(?) THEN 1 ELSE json('invalid_company_taxonomy') END`).bind(slugs, slugs),
        db.prepare(`DELETE FROM ${join} WHERE organization_id=? AND ${column} NOT IN
          (SELECT id FROM ${table} WHERE slug IN (SELECT value FROM json_each(?)))`).bind(id, slugs),
        db.prepare(`INSERT INTO ${join}(id,organization_id,${column}) SELECT lower(hex(randomblob(16))),?,id FROM ${table}
          WHERE slug IN (SELECT value FROM json_each(?)) ON CONFLICT(organization_id,${column}) DO NOTHING`).bind(id, slugs),
      ];
    }),
    db.prepare(`UPDATE organizations SET name=?,website=?,email=?,logo_url=?,short_description=?,full_description=?,
      phone=?,address_line_1=?,city=?,province=?,country=?,postal_code=?,years_in_business=?,employee_count_range=?,
      insurance_status=?,wsib_status=?,emergency_service=?,public_contact_visibility=?,profile_completion_score=?,
      profile_status=?,review_changes=?,review_flagged_at=?,risk_flagged=?,
      link_badge=CASE WHEN ? THEN 0 ELSE link_badge END,link_earned_at=CASE WHEN ? THEN NULL ELSE link_earned_at END,
      updated_at=? WHERE id=?`).bind(patch.name, patch.website, patch.email, patch.logo_url, patch.short_description,
      patch.full_description, data.phone || null, data.addressLine1 || null, data.city || null, data.province || null,
      country, data.postalCode || null, data.yearsInBusiness ?? null, data.employeeCountRange || null,
      data.insuranceStatus || null, data.wsibStatus || null, Number(data.emergencyService ?? false), data.publicContactVisibility,
      completion, status, reviewChanged ? flagged : before.review_changes,
      before.review_flagged_at ?? (reviewChanged ? timestamp : null),
      risk ? Number(risk.hold) : before.risk_flagged, Number(newWebsite), Number(newWebsite), timestamp, id),
  ];
  if (risk?.hold) {
    writes.push(db.prepare(`INSERT INTO organization_risk(organization_id,score,reasons,held,blocked,source,evaluated_at)
      VALUES(?,?,?,?,?,'profile_edit',?) ON CONFLICT(organization_id) DO UPDATE SET score=excluded.score,
      reasons=excluded.reasons,held=excluded.held,blocked=excluded.blocked,source=excluded.source,
      decision=NULL,decided_by=NULL,decided_at=NULL,evaluated_at=excluded.evaluated_at`)
      .bind(id, risk.score, JSON.stringify(risk.reasons), Number(reviewedStatus !== "approved"), Number(risk.blocked), timestamp));
  } else if (risk) {
    writes.push(db.prepare(`UPDATE organization_risk SET score=?,reasons=?,held=0,blocked=0,source='profile_edit',evaluated_at=?
      WHERE organization_id=? AND decision IS NULL`).bind(risk.score, JSON.stringify(risk.reasons), timestamp, id));
  }
  const audit = (action: string, metadata: object) => db.prepare(`INSERT INTO audit_logs
    (id,actor_user_id,action,entity_type,entity_id,metadata) VALUES(?,?,?,'organization',?,?)`)
    .bind(crypto.randomUUID(), session.userId, action, id, JSON.stringify(metadata));
  if (approved && changes.length) writes.push(audit("organization.profile_edited", { changes }));
  if (risk?.hold) writes.push(audit(risk.reject ? "organization.spam_rejected" : "organization.spam_held",
    { score: risk.score, reasons: risk.reasons.map(reason => reason.detail) }));
  const results = await db.batch(writes);
  if (results.length !== writes.length || results.some(row => !row.success)) throw new D1ApiError(503, "company_edit_unavailable");
  return { stayedLive: status === "approved", rejected: risk?.reject ? risk : null };
}
