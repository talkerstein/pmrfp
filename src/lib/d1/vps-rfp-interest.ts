import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { SessionContext } from "../access/access";
import { sendAdminNewInterest, sendInterestConfirmation, sendPmNewInterest } from "../email/send";
import { escHtml } from "../email/parts";
import { isUsState } from "../geo";
import { posterKindOf, type JobForDecision } from "../pm-jobs/decisions";
import { responsesPath } from "../pm-jobs/email-copy";
import { FREE_MONTHLY_RESPONSES, isPmJob, monthStart, parseQuoteAmount, parseQuoteKind, pmContactCard, respondDecision, responseAllowance } from "../pm-jobs/rules";
import type { RespondState } from "../pm-jobs/server";
import { generateReviewToken } from "../projects/tokens";
import type { interestSchema } from "../validations";
import { isEnabledLocale } from "../../i18n/config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";

type Input = z.infer<typeof interestSchema>;
type Job = JobForDecision & { updated_at: string; sealed: number; pm_email: string | null };
const eligiblePro = `(EXISTS(SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id
  AND s.status IN ('active','comped') AND s.tier IN ('pro','featured')) OR
  (o.organization_type='trade_company' AND EXISTS(SELECT 1 FROM trade_trials t WHERE t.organization_id=o.id
  AND julianday(t.started_at)<=julianday('now') AND julianday(t.ends_at)>julianday('now'))))`;
const monthCount = `(SELECT count(*) FROM rfp_interests i WHERE i.trade_organization_id=o.id
  AND i.used_free_allowance=1 AND julianday(i.created_at)>=julianday(?))`;
const currentMember = `EXISTS(SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
  WHERE m.organization_id=o.id AND m.user_id=? AND u.status='active')`;

export async function readVpsInterestHistory(session: SessionContext, db: D1Binding = vpsAppDatabase()) {
  const org = session.organization;
  if (!org) return { interests: [], used: null };
  const authorized = `o.id=? AND o.is_demo=0 AND o.organization_type IN ('trade_company','supplier')
    AND ${currentMember} AND ${customerAppAuthority}`;
  const [history, allowance] = await db.batch([
    db.prepare(`SELECT i.id,i.rfp_id,i.status,i.created_at,CAST(i.quote_amount AS REAL) AS quote_amount,i.decision_note,
        r.slug,r.title,r.province,shared.id AS shared_id,shared.contact_name,shared.contact_email,shared.contact_phone,
        p.full_name AS poster_name,p.email AS poster_email,p.phone AS poster_phone,
        company.name AS company_name,company.email AS company_email,company.phone AS company_phone
      FROM organizations o JOIN rfp_interests i ON i.trade_organization_id=o.id
      JOIN rfp_posts r ON r.id=i.rfp_id AND r.is_demo=0
      LEFT JOIN rfp_posts shared ON shared.id=r.id AND (i.status='picked' OR i.pm_contact_shared=1)
      LEFT JOIN users_profile p ON p.id=shared.posted_by_user_id
      LEFT JOIN organizations company ON company.id=shared.posted_by_organization_id
      WHERE ${authorized} ORDER BY i.created_at DESC`).bind(org.id, session.userId),
    db.prepare(`SELECT ${monthCount} AS used FROM organizations o WHERE ${authorized}`)
      .bind(monthStart(), org.id, session.userId),
  ]);
  if (!history?.success || !allowance?.success) throw new D1ApiError(503, "interest_history_unavailable");
  const rows = history.results as {
    id: string; rfp_id: string; status: string; created_at: string; quote_amount: number | null; decision_note: string | null;
    slug: string; title: string; province: string | null; shared_id: string | null;
    contact_name: string | null; contact_email: string | null; contact_phone: string | null;
    poster_name: string | null; poster_email: string | null; poster_phone: string | null;
    company_name: string | null; company_email: string | null; company_phone: string | null;
  }[];
  return {
    used: (allowance.results[0] as { used: number } | undefined)?.used ?? null,
    interests: rows.map((row) => ({
      id: row.id, rfp_id: row.rfp_id, status: row.status, created_at: row.created_at,
      quote_amount: row.quote_amount, decision_note: row.decision_note,
      job: { slug: row.slug, title: row.title, province: row.province },
      contact: row.shared_id ? pmContactCard({
        rfp: row,
        poster: { full_name: row.poster_name, email: row.poster_email, phone: row.poster_phone },
        posterOrg: { name: row.company_name, email: row.company_email, phone: row.company_phone },
      }) : null,
    })),
  };
}

export async function readVpsRfpRespondState(slug: string, session: SessionContext, db: D1Binding = vpsAppDatabase()): Promise<RespondState | null> {
  const org = session.organization;
  if (!org || !["trade_company", "supplier"].includes(org.organization_type)) return null;
  const row = await db.prepare(`SELECT r.id,r.title,r.status,r.source_type,r.province,r.posted_by_user_id,r.posted_by_organization_id,
    r.post_kind,r.sealed,${eligiblePro} AS pro,${monthCount} AS used,
    (SELECT created_at FROM rfp_interests WHERE rfp_id=r.id AND trade_organization_id=o.id) AS already
    FROM rfp_posts r CROSS JOIN organizations o WHERE r.slug=? AND o.id=? AND r.is_demo=0
    AND o.status='active' AND ${currentMember} AND ${customerAppAuthority}`)
    .bind(monthStart(), slug, org.id, session.userId)
    .first<Job & { pro: number; used: number; already: string | null }>();
  if (!row || row.sealed || row.source_type === "public_source" || (!row.pro && !isPmJob(row))) return null;
  const pro = row.pro === 1;
  const town = row.source_type === "public_buyer_direct";
  const decision = respondDecision({ signedIn: true, org, pro, rfp: row, userId: session.userId, usedThisMonth: row.used });
  return { rfpId: row.id, title: row.title, already: row.already, ...decision,
    allowance: responseAllowance({ pro: pro || town, usedThisMonth: row.used }),
    currency: isUsState(row.province) ? "USD" : "CAD", ...(town ? { town: true } : {}) };
}

export async function submitVpsRfpInterest(session: SessionContext, data: Input, db: D1Binding = vpsAppDatabase()) {
  if (!session.organization) return { ok: false as const, reason: "org" as const };
  const orgId = session.organization.id;
  const userId = session.userId;
  const month = monthStart();
  const [jobs, organizations] = await db.batch([
    db.prepare(`SELECT r.id,r.title,r.slug,r.status,r.source_type,r.province,r.posted_by_user_id,r.posted_by_organization_id,
      r.contact_email,r.poster_lang,r.post_kind,r.updated_at,r.sealed,
      COALESCE(CASE WHEN p.status='active' THEN p.email END,r.contact_email) AS pm_email
      FROM rfp_posts r LEFT JOIN users_profile p ON p.id=r.posted_by_user_id
      WHERE r.id=? AND r.is_demo=0 AND ${customerAppAuthority}`).bind(data.rfpId),
    db.prepare(`SELECT o.id,o.name,o.organization_type,o.status,o.profile_status,${eligiblePro} AS pro,${monthCount} AS used
      FROM organizations o WHERE o.id=? AND o.is_demo=0 AND ${currentMember} AND ${customerAppAuthority}`).bind(month, orgId, userId),
  ]);
  if (!jobs?.success || !organizations?.success) throw new D1ApiError(503, "interest_unavailable");
  const rfp = jobs.results[0] as unknown as Job | undefined;
  const org = organizations.results[0] as unknown as (NonNullable<Parameters<typeof respondDecision>[0]["org"]> & {
    name: string; pro: number; used: number;
  }) | undefined;
  if (!rfp) return { ok: false as const, reason: "not_open" as const };
  if (!org) return { ok: false as const, reason: "org" as const };
  if (org.status !== "active") return { ok: false as const, reason: "suspended" as const };
  // Sealed responses require the separate sealed inbox, never a standard interest row.
  if (rfp.sealed) throw new D1ApiError(503, "sealed_inbox_unavailable");
  const pro = org.pro === 1;
  const decision = respondDecision({ signedIn: true, org, pro, userId, rfp, usedThisMonth: org.used });
  if (decision.refusal) return { ok: false as const, reason: decision.refusal };
  const already = await db.prepare("SELECT id FROM rfp_interests WHERE rfp_id=? AND trade_organization_id=?")
    .bind(rfp.id, org.id).first();
  if (already) return { ok: false as const, reason: "already" as const };

  const id = randomUUID();
  const selected = [...new Set(data.caseStudyIds ?? [])].slice(0, 3);
  const lang = isEnabledLocale(data.lang) ? data.lang : "en";
  const quote = { amount: parseQuoteAmount(data.quoteAmount), kind: parseQuoteKind(data.quoteKind),
    notes: data.quoteNotes?.trim() || null, startDate: data.startDate || null };
  // Imported quote_amount has TEXT affinity with a lexical range check.
  // Keep its exact cents and the existing numeric read contract.
  const storedAmount = quote.amount === 1_000_000_000 ? "1000000000" : (quote.amount?.toFixed(2).padStart(13, "0") ?? null);
  const posterKind = posterKindOf(rfp.source_type);
  const statements = [
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority}
      AND EXISTS(SELECT 1 FROM rfp_posts WHERE id=? AND updated_at=? AND status='published' AND sealed=0)
      AND EXISTS(SELECT 1 FROM organizations o WHERE o.id=? AND o.status=? AND o.profile_status=? AND o.organization_type=?
        AND ${currentMember} AND ${eligiblePro}=? AND (?=0 OR ${monthCount}<?))
      THEN 1 ELSE json('interest_changed') END`)
      .bind(rfp.id, rfp.updated_at, org.id, org.status, org.profile_status, org.organization_type, userId,
        Number(pro), Number(decision.free), month, FREE_MONTHLY_RESPONSES),
  ];
  for (const project of selected) {
    statements.push(db.prepare(`INSERT INTO case_study_share_links(id,case_study_id,organization_id,token,label,created_by_user_id)
      SELECT ?,c.id,c.organization_id,?,?,? FROM case_studies c
      WHERE c.id=? AND c.organization_id=? AND c.status='published' AND c.visibility='private'
      AND NOT EXISTS(SELECT 1 FROM case_study_share_links l WHERE l.case_study_id=c.id AND l.revoked_at IS NULL)`)
      .bind(randomUUID(), generateReviewToken(), ('Interest: ' + rfp.title).slice(0, 120), userId, project, org.id));
  }
  statements.push(
    db.prepare(`INSERT INTO rfp_interests(id,rfp_id,trade_organization_id,submitted_by_user_id,message,relevant_experience,
      availability,attachment_url,case_study_ids,quote_amount,quote_kind,quote_notes,start_date,used_free_allowance,lang)
      VALUES(?,?,?,?,?,?,?,?,(SELECT json_group_array(c.id) FROM json_each(?) s
        JOIN case_studies c ON c.id=s.value AND c.organization_id=? AND c.status='published'
        WHERE c.visibility IN ('public','unlisted') OR EXISTS(SELECT 1 FROM case_study_share_links l
          WHERE l.case_study_id=c.id AND l.revoked_at IS NULL)),?,?,?,?,?,?)`)
      .bind(id, rfp.id, org.id, userId, data.message, data.relevantExperience ?? null,
        data.availability ?? null, data.attachmentUrl ?? null, JSON.stringify(selected), org.id, storedAmount,
        quote.amount === null ? null : quote.kind, quote.notes, quote.startDate, Number(decision.free), lang),
    db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,link_url)
      SELECT ?,id,'pm_new_response',?,?,? FROM users_profile WHERE id=? AND status='active'`)
      .bind(randomUUID(), `New response from ${org.name}`.slice(0, 200), rfp.title, responsesPath(rfp.id, posterKind), rfp.posted_by_user_id),
  );
  try {
    const results = await db.batch(statements);
    if (results.length !== statements.length || results.some(result => !result.success)) throw new D1ApiError(503, "interest_unavailable");
  } catch (error) {
    // A concurrent submit may own the unique response already. Never duplicate
    // notifications or report success for a change this request didn't write.
    if (await db.prepare("SELECT id FROM rfp_interests WHERE rfp_id=? AND trade_organization_id=?")
      .bind(rfp.id, org.id).first()) return { ok: false as const, reason: "already" as const };
    throw error;
  }
  const allowance = responseAllowance({ pro: pro || rfp.source_type === "public_buyer_direct",
    usedThisMonth: org.used + Number(decision.free) });
  return { ok: true as const, allowance, rfp, org, lang, quote, posterKind, id };
}

export async function deliverVpsRfpInterestMail(result: Extract<Awaited<ReturnType<typeof submitVpsRfpInterest>>, { ok: true }>,
  email: string, data: Input) {
  const { rfp, org, lang, quote, posterKind, allowance } = result;
  const pmLang = isEnabledLocale(rfp.poster_lang) ? rfp.poster_lang : "en";
  await Promise.allSettled([
    rfp.pm_email ? sendPmNewInterest(rfp.pm_email, { vendorName: org.name, rfpTitle: rfp.title, rfpId: rfp.id, lang: pmLang,
      posterKind, quote: { ...quote, availability: data.availability ?? null, currency: isUsState(rfp.province) ? "USD" : "CAD" } }) : null,
    email ? sendInterestConfirmation(email, rfp.title, { lang, posterKind, allowance }) : null,
    sendAdminNewInterest({ vendor: escHtml(org.name), rfpTitle: escHtml(rfp.title), message: escHtml(data.message) }),
  ]);
}
