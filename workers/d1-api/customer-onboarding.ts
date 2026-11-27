import { z } from "zod";
import { parseBuyerKind } from "../../src/lib/auth/org-kind";
import { resolveRolePick } from "../../src/lib/auth/oauth";
import { wordingVersionFor } from "../../src/lib/consent/email";
import { companyEmailDomain, nameSearchToken, phoneLikePattern, rankCompanyMatches, websiteDomain, type CompanyCandidate } from "../../src/lib/dedupe/company";
import { escapeLike } from "../../src/lib/dedupe/email";
import { orderedPair } from "../../src/lib/dedupe/review";
import { decideMemberSubscribe, MEMBER_CONSENT_VERSION, MEMBER_SOURCE } from "../../src/lib/digest/config";
import { D1ApiError, RFP_SLUG, UUID, type D1Binding, type D1Statement } from "../../src/lib/d1/contracts";
import { isUsState } from "../../src/lib/geo";
import { scoreOrgRisk, statusFromRisk, type OrgRiskInput } from "../../src/lib/spam/org-risk";
import { companyProfileSchema, signUpSchema } from "../../src/lib/validations";
import { customerAppAuthority } from "./customer-signup";
import type { UserRole } from "../../src/types/db";

const slugList = z.array(z.string().regex(RFP_SLUG)).max(100);
const company = companyProfileSchema.pick({
  name: true, website: true, phone: true, email: true, city: true, province: true,
  shortDescription: true, publicContactVisibility: true,
}).extend({
  name: z.string().trim().min(1).max(240),
  website: z.string().max(2048).refine(value => !value || /^https?:\/\//i.test(value)).optional(),
  phone: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  province: z.string().max(120).optional(),
  email: z.string().email().max(254),
  categories: slugList,
  regions: slugList,
}).strict();
const inputSchema = z.strictObject({
  lang: z.enum(["en", "fr", "es"]),
  marketing: z.boolean(),
  weeklyEmail: z.boolean().optional(),
  browsing: z.boolean(),
  buyerKind: z.enum(["builder", "landlord"]).nullable(),
  acknowledged: z.array(z.string().regex(UUID)).max(5),
  company: company.nullable(),
});
type CompanyInput = z.infer<typeof company>;
type Profile = { primary_role: string; status: string; email: string; onboarding_completed: number };

export async function customerRolePick(db: D1Binding, userId: string) {
  return db.prepare("SELECT role AS primary_role,org_kind,award AS gc_award FROM _customer_role_picks WHERE user_id=?")
    .bind(userId).first<{ primary_role: string; org_kind: string | null; gc_award: string | null }>();
}

export async function chooseCustomerRole(db: D1Binding, userId: string, metadataRole: unknown, input: unknown) {
  const parsed = z.strictObject({ role: z.string().max(40), award: z.string().max(160).nullable() }).safeParse(input);
  if (!parsed.success) throw new D1ApiError(400, "invalid_role");
  const profile = await db.prepare(`SELECT primary_role,status,email,onboarding_completed FROM users_profile
    WHERE id=? AND ${customerAppAuthority}`).bind(userId).first<Profile>();
  if (!profile || profile.status !== "active") throw new D1ApiError(403, "onboarding_unavailable");
  const prior = await customerRolePick(db, userId);
  const pick = resolveRolePick({
    primaryRole: profile.primary_role as UserRole, onboardingCompleted: profile.onboarding_completed === 1,
    metadataRole: prior?.primary_role ?? metadataRole,
  }, parsed.data.role);
  if (!pick.ok) {
    if (pick.reason === "invalid_role") throw new D1ApiError(400, "invalid_role");
    return { ok: true };
  }
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND EXISTS (
      SELECT 1 FROM users_profile WHERE id=? AND primary_role='trade' AND status='active' AND onboarding_completed=0
    ) AND NOT EXISTS (SELECT 1 FROM _customer_role_picks WHERE user_id=?)
      THEN 1 ELSE json('onboarding_role_changed') END`).bind(userId, userId),
    db.prepare("INSERT INTO _customer_role_picks(user_id,role,org_kind,award) VALUES(?,?,?,?)")
      .bind(userId, pick.role, pick.orgKind, pick.builder ? parsed.data.award : null),
    db.prepare("UPDATE users_profile SET primary_role=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
      .bind(pick.role, userId),
  ]);
  if (results.length !== 3 || results.some(row => !row.success)) throw new D1ApiError(503, "onboarding_unavailable");
  return { ok: true };
}

function companyCandidates(db: D1Binding, data: CompanyInput) {
  const name = nameSearchToken(data.name);
  const site = websiteDomain(data.website);
  const mail = companyEmailDomain(data.email);
  return db.prepare(`SELECT id,slug,name,website,phone,email,city,province,status,profile_status,organization_type,created_at
    FROM organizations WHERE status<>'deleted' AND is_demo=0 AND (
      (?<>'' AND lower(name) LIKE ? ESCAPE '\\') OR
      (?<>'' AND lower(website) LIKE ? ESCAPE '\\') OR
      (?<>'' AND phone LIKE ?) OR
      (?<>'' AND (lower(email) LIKE ? ESCAPE '\\' OR lower(website) LIKE ? ESCAPE '\\')))
    ORDER BY created_at,id LIMIT 101`).bind(name, `%${escapeLike(name)}%`,
    site, `%${escapeLike(site)}%`, phoneLikePattern(data.phone), phoneLikePattern(data.phone),
    mail, `%@${escapeLike(mail)}`, `%${escapeLike(mail)}%`);
}

export async function completeCustomerOnboarding(db: D1Binding, userId: string, input: unknown, verifiedEmail?: string) {
  const parsed = inputSchema.safeParse(input);
  if (!UUID.test(userId) || !parsed.success) throw new D1ApiError(400, "invalid_onboarding");
  const { company: data, lang, marketing, browsing, acknowledged } = parsed.data;
  const profile = await db.prepare(`SELECT primary_role,status,email,onboarding_completed FROM users_profile
    WHERE id=? AND ${customerAppAuthority}`).bind(userId).first<Profile>();
  if (!profile || profile.status !== "active" || !signUpSchema.shape.role.safeParse(profile.primary_role).success) {
    throw new D1ApiError(403, "onboarding_unavailable");
  }
  if (profile.onboarding_completed === 1) return { ok: true, alreadyComplete: true };
  const role = profile.primary_role;
  const listing = role === "trade" || role === "supplier";
  const skipCompany = browsing || role === "visitor" || role === "talent";
  const buyerKind = role === "property_manager" ? parseBuyerKind(parsed.data.buyerKind) : null;
  const writes: D1Statement[] = [
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND EXISTS (
      SELECT 1 FROM users_profile WHERE id=? AND primary_role=? AND status='active' AND onboarding_completed=0
    ) THEN 1 ELSE json('onboarding_state_changed') END`).bind(userId, role),
  ];
  let organizationId: string | null = null;
  if (!skipCompany) {
    if (!data || (listing && (!data.categories.length || !data.regions.length))) {
      throw new D1ApiError(400, "invalid_onboarding");
    }
    const membership = await db.prepare("SELECT 1 AS present FROM organization_members WHERE user_id=? LIMIT 1")
      .bind(userId).first<{ present: number }>();
    if (!membership) {
      const candidates = await companyCandidates(db, data).all<CompanyCandidate>();
      if (!candidates.success || candidates.results.length > 100) throw new D1ApiError(503, "company_checks_unavailable");
      const matches = rankCompanyMatches(data, candidates.results.filter(row => row.status === "active" &&
        row.profile_status === "approved" && (row.organization_type === "trade_company" || row.organization_type === "supplier")));
      if (matches.some(({ candidate }) => !acknowledged.includes(candidate.id))) {
        return { duplicates: matches.map(({ candidate, reasons }) => ({
          id: candidate.id, slug: candidate.slug, name: candidate.name,
          city: candidate.city ?? null, province: candidate.province ?? null, listed: true, reasons,
        })) };
      }
      organizationId = crypto.randomUUID();
      const slug = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "company"}-${organizationId.slice(0, 8)}`;
      const orgType = role === "supplier" ? "supplier" : listing ? "trade_company" : buyerKind ?? "property_manager";
      const country = isUsState(data.province ?? "") ? "United States" : "Canada";
      const risk = listing ? await loadListingRisk(db, userId, profile.email, data, country, candidates.results) : null;
      const status = risk ? statusFromRisk(risk, "approved") : "approved";
      writes.push(
        db.prepare(`SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id=?)
          AND NOT EXISTS (SELECT 1 FROM organization_join_requests WHERE user_id=? AND status='pending')
          THEN 1 ELSE json('onboarding_membership_changed') END`).bind(userId, userId),
        db.prepare(`INSERT INTO organizations(id,name,slug,organization_type,website,phone,email,city,province,
          country,short_description,public_contact_visibility,profile_status,risk_flagged)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(organizationId, data.name, slug, orgType, data.website || null,
          data.phone || null, data.email, data.city || null, data.province || null, country,
          data.shortDescription || null, data.publicContactVisibility, status, Number(risk?.hold ?? false)),
        db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES(?,?,?,'owner')")
          .bind(crypto.randomUUID(), organizationId, userId),
      );
      if (listing) writes.push(...taxonomyWrites(db, organizationId, data));
      if (listing && status !== "rejected" && parsed.data.weeklyEmail && verifiedEmail &&
          verifiedEmail.toLowerCase() === profile.email.toLowerCase()) {
        const consent = await weeklyEmailConsent(db, userId, verifiedEmail, data, lang);
        if (consent) writes.push(consent);
      }
      if (risk?.hold) writes.push(db.prepare(`INSERT INTO organization_risk(organization_id,score,reasons,held,blocked,source)
        VALUES(?,?,?,?,?,'onboarding')`).bind(organizationId, risk.score, JSON.stringify(risk.reasons),
        Number(status === "pending_review"), Number(risk.blocked)));
      for (const { candidate, reasons } of matches) {
        const [a, b] = orderedPair(organizationId, candidate.id);
        writes.push(db.prepare(`INSERT INTO duplicate_reviews(id,kind,a_id,b_id,source,reasons)
          VALUES(?,'company',?,?,'onboarding',?) ON CONFLICT(kind,a_id,b_id) DO NOTHING`)
          .bind(crypto.randomUUID(), a, b, JSON.stringify(reasons)));
      }
    }
  }
  writes.push(
    db.prepare("UPDATE users_profile SET onboarding_completed=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(userId),
    db.prepare("UPDATE digest_subscribers SET user_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email_key=lower(?) AND user_id IS NULL").bind(userId, profile.email),
    db.prepare(`INSERT INTO signup_attribution (user_id,org_id,role,lang) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET org_id=coalesce(excluded.org_id,signup_attribution.org_id)`)
      .bind(userId, organizationId, role, lang),
  );
  for (const scope of marketing ? ["service", "marketing"] as const : ["service"] as const) {
    writes.push(db.prepare(`INSERT INTO email_consents(user_id,scope,source,wording_version,lang)
      VALUES(?,?,'onboarding',?,?) ON CONFLICT(user_id,scope,source) DO NOTHING`)
      .bind(userId, scope, wordingVersionFor(scope), lang));
  }
  const results = await db.batch(writes);
  if (results.length !== writes.length || results.some(row => !row.success)) throw new D1ApiError(503, "onboarding_unavailable");
  return { ok: true, alreadyComplete: false };
}

async function weeklyEmailConsent(db: D1Binding, userId: string, email: string, data: CompanyInput, lang: string) {
  const key = email.toLowerCase();
  const existing = await db.prepare("SELECT id,status,confirm_sent_at,trades FROM digest_subscribers WHERE email_key=?")
    .bind(key).first<{ id: string; status: string; confirm_sent_at: string | null; trades: string | null }>();
  const previousTrades: string[] = existing?.trades ? JSON.parse(existing.trades) : [];
  const asked = [...new Set([...data.categories, ...previousTrades])];
  const valid = await db.prepare("SELECT slug FROM trade_categories WHERE active=1 AND slug IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(asked)).all<{ slug: string }>();
  if (!valid.success) throw new D1ApiError(503, "onboarding_unavailable");
  const decision = decideMemberSubscribe({
    emailConfirmed: true,
    existing: existing ? { ...existing, trades: previousTrades } : null,
    suppressed: false, // The INSERT checks the suppression table in the onboarding transaction.
    provinceRaw: data.province, trades: data.categories, validTrades: new Set(valid.results.map(row => row.slug)),
  });
  if (decision.kind !== "write") return null;
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO digest_subscribers
    (id,email,country,province,trades,lang,status,confirmed_at,source,consent_text_version,consent_at,updated_at,user_id,send_bucket)
    SELECT ?,?,?,?,?,?,'active',?,?,?,?,?,?,abs(random() % 4)
    WHERE NOT EXISTS (SELECT 1 FROM email_suppressions WHERE email_key=?)
    ON CONFLICT(email_key) DO UPDATE SET country=excluded.country,province=excluded.province,
      trades=excluded.trades,lang=excluded.lang,status='active',confirmed_at=excluded.confirmed_at,
      confirm_sent_at=NULL,confirm_token_hash=NULL,unsubscribed_at=NULL,source=excluded.source,
      consent_text_version=excluded.consent_text_version,consent_at=excluded.consent_at,
      updated_at=excluded.updated_at,user_id=excluded.user_id
    WHERE digest_subscribers.id=? AND digest_subscribers.status=? AND digest_subscribers.confirm_sent_at IS ?
      AND (digest_subscribers.user_id IS NULL OR digest_subscribers.user_id=excluded.user_id)`).bind(
    crypto.randomUUID(), email, decision.country, decision.province, JSON.stringify(decision.trades), lang,
    now, MEMBER_SOURCE, MEMBER_CONSENT_VERSION, now, now, userId, key,
    existing?.id ?? null, existing?.status ?? null, existing?.confirm_sent_at ?? null,
  );
}

function taxonomyWrites(db: D1Binding, id: string, data: CompanyInput) {
  const categories = JSON.stringify([...new Set(data.categories)]);
  const regions = JSON.stringify([...new Set(data.regions)]);
  return [
    db.prepare(`SELECT CASE WHEN
      (SELECT count(*) FROM trade_categories WHERE active=1 AND slug IN (SELECT value FROM json_each(?)))=json_array_length(?)
      AND (SELECT count(*) FROM regions WHERE active=1 AND status<>'hidden' AND slug IN (SELECT value FROM json_each(?)))=json_array_length(?)
      THEN 1 ELSE json('invalid_onboarding_taxonomy') END`).bind(categories, categories, regions, regions),
    db.prepare(`INSERT INTO organization_categories(id,organization_id,category_id)
      SELECT lower(hex(randomblob(16))),?,id FROM trade_categories WHERE slug IN (SELECT value FROM json_each(?))`).bind(id, categories),
    db.prepare(`INSERT INTO organization_regions(id,organization_id,region_id)
      SELECT lower(hex(randomblob(16))),?,id FROM regions WHERE slug IN (SELECT value FROM json_each(?))`).bind(id, regions),
  ];
}

export async function loadListingRisk(db: D1Binding, userId: string, accountEmail: string,
  data: Pick<OrgRiskInput, "name" | "website" | "email" | "phone" | "city" | "province" | "shortDescription" | "fullDescription">,
  country: string, candidates: Pick<CompanyCandidate, "id" | "website">[], exceptOrg: string | null = null) {
  const site = websiteDomain(data.website);
  const domains = [...new Set([companyEmailDomain(accountEmail), companyEmailDomain(data.email)].filter(Boolean))];
  const [blocked, attribution, ...owners] = await db.batch<{ domain?: string; country?: string; n?: number }>([
    db.prepare("SELECT domain FROM blocked_domains LIMIT 5001"),
    db.prepare("SELECT country FROM signup_attribution WHERE user_id=?").bind(userId),
    ...domains.map(domain => db.prepare(`SELECT count(DISTINCT organization_id) AS n FROM (
      SELECT id AS organization_id FROM organizations WHERE status<>'deleted' AND lower(email) LIKE ? ESCAPE '\\'
      UNION SELECT m.organization_id FROM organization_members m JOIN users_profile p ON p.id=m.user_id
      JOIN organizations o ON o.id=m.organization_id WHERE o.status<>'deleted' AND lower(p.email) LIKE ? ESCAPE '\\'
    ) WHERE organization_id IS NOT ?`).bind(`%@${escapeLike(domain)}`, `%@${escapeLike(domain)}`, exceptOrg)),
  ]);
  if (!blocked?.success || blocked.results.length > 5000 || !attribution?.success || owners.some(row => !row.success)) {
    throw new D1ApiError(503, "company_checks_unavailable");
  }
  return scoreOrgRisk({
    ...data, accountEmail, country, signupCountry: attribution.results[0]?.country,
    blockedDomains: blocked.results.flatMap(row => row.domain ? [row.domain] : []),
    othersOnEmailDomain: Math.max(0, ...owners.map(row => row.results[0]?.n ?? 0)),
    othersOnWebsiteDomain: site ? candidates.filter(row => row.id !== exceptOrg && websiteDomain(row.website) === site).length : 0,
  });
}
