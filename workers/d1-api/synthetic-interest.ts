import { D1ApiError, readD1Json, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { interestSchema } from "../../src/lib/validations";
import { isEnabledLocale } from "../../src/i18n/config";
import { monthStart, parseQuoteAmount, parseQuoteKind, REFUSAL_STATUS, respondDecision, responseAllowance } from "../../src/lib/pm-jobs/rules";
import { responsesPath } from "../../src/lib/pm-jobs/email-copy";

const contextSql = `
  SELECT json_object(
    'profileStatus', p.status, 'orgId', o.id, 'orgType', o.organization_type,
    'orgStatus', o.status, 'profileReviewStatus', o.profile_status, 'rfpStatus', r.status,
    'source', r.source_type, 'posterId', r.posted_by_user_id, 'posterOrg', r.posted_by_organization_id,
    'postKind', r.post_kind, 'sealed', r.sealed,
    'pro', EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id
      AND s.status IN ('active','comped') AND s.tier IN ('pro','featured'))
      OR (o.organization_type='trade_company' AND EXISTS (
        SELECT 1 FROM trade_trials t WHERE t.organization_id=o.id AND julianday(t.ends_at)>julianday(args.now)
      )),
    'used', (SELECT COUNT(*) FROM rfp_interests i WHERE i.trade_organization_id=o.id
      AND i.used_free_allowance=1 AND julianday(i.created_at)>=julianday(args.month)),
    'duplicate', EXISTS (SELECT 1 FROM rfp_interests i WHERE i.trade_organization_id=o.id AND i.rfp_id=r.id)
  ) AS fingerprint
  FROM (SELECT ? AS actor, ? AS rfp, ? AS now, ? AS month) args
  LEFT JOIN users_profile p ON p.id=args.actor
  LEFT JOIN organizations o ON o.id=(
    SELECT CASE WHEN COUNT(*)=1 THEN MAX(organization_id) END
    FROM organization_members WHERE user_id=p.id
  )
  LEFT JOIN rfp_posts r ON r.id=args.rfp
`;

interface InterestContext {
  profileStatus: string | null;
  orgId: string | null;
  orgType: string;
  orgStatus: string;
  profileReviewStatus: string;
  rfpStatus: string | null;
  source: string | null;
  posterId: string | null;
  posterOrg: string | null;
  postKind: string | null;
  sealed: number | null;
  pro: number | null;
  used: number;
  duplicate: number;
}

/** Rehearse an ordinary response and its outbox entry in the same transaction. */
export async function submitSyntheticInterest(db: D1Binding, request: Request, userId: string, now = new Date()) {
  const parsed = interestSchema.strict().safeParse(await readD1Json(request, 32768));
  if (!parsed.success || !UUID.test(parsed.data.rfpId)) throw new D1ApiError(422, "invalid_interest");
  const input = parsed.data;
  if (input.caseStudyIds?.length || input.attachmentUrl) throw new D1ApiError(422, "attachments_not_in_rehearsal");
  const amount = parseQuoteAmount(input.quoteAmount);
  const lang = isEnabledLocale(input.lang) ? input.lang : "en";
  const timestamp = now.toISOString();
  const selectors = [userId, input.rfpId, timestamp, monthStart(now)];
  const interestId = crypto.randomUUID();

  // D1 can't hold a transaction while application code evaluates the decision.
  // Recheck every fact used by the decision inside the write statement. A
  // concurrent allowance change, suspension or publication change forces a retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.prepare(contextSql).bind(...selectors).first<{ fingerprint: string }>();
    if (!row) throw new D1ApiError(503, "interest_context_unavailable");
    const state: InterestContext = JSON.parse(row.fingerprint);
    if (state.profileStatus !== "active") throw new D1ApiError(403, "account_inactive");
    if (!state.rfpStatus) throw new D1ApiError(404, "not_open");
    if (state.sealed) throw new D1ApiError(422, "sealed_response_required");
    const decision = respondDecision({
      signedIn: true, userId, pro: state.pro === 1, usedThisMonth: state.used,
      org: state.orgId ? { id: state.orgId, organization_type: state.orgType,
        status: state.orgStatus, profile_status: state.profileReviewStatus } : null,
      rfp: { status: state.rfpStatus, source_type: state.source, posted_by_user_id: state.posterId,
        posted_by_organization_id: state.posterOrg, post_kind: state.postKind },
    });
    if (decision.refusal) throw new D1ApiError(REFUSAL_STATUS[decision.refusal], decision.refusal);
    if (state.duplicate) throw new D1ApiError(409, "already");
    const results = await db.batch([
      db.prepare(`
        INSERT INTO rfp_interests(id,rfp_id,trade_organization_id,submitted_by_user_id,message,relevant_experience,
          availability,quote_amount,quote_kind,quote_notes,start_date,used_free_allowance,lang,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE ?=(${contextSql})
        ON CONFLICT(rfp_id,trade_organization_id) DO NOTHING
      `).bind(interestId, input.rfpId, state.orgId, userId, input.message, input.relevantExperience ?? null,
        input.availability ?? null, amount === null ? null : amount.toFixed(2), amount === null ? null : parseQuoteKind(input.quoteKind),
        input.quoteNotes?.trim() || null, input.startDate || null, Number(decision.free), lang, timestamp, timestamp,
        row.fingerprint, ...selectors),
      db.prepare("INSERT INTO _d1_interest_outbox(interest_id,created_at) SELECT id,? FROM rfp_interests WHERE id=? AND changes()=1")
        .bind(timestamp, interestId),
      db.prepare(`
        INSERT INTO notifications(id,user_id,type,title,message,link_url,created_at)
        SELECT i.id,r.posted_by_user_id,'pm_new_response',substr('New response from '||o.name,1,200),r.title,?,?
        FROM _d1_interest_outbox q
        JOIN rfp_interests i ON i.id=q.interest_id
        JOIN rfp_posts r ON r.id=i.rfp_id
        JOIN organizations o ON o.id=i.trade_organization_id
        WHERE i.id=? AND r.posted_by_user_id IS NOT NULL
      `).bind(responsesPath(input.rfpId, state.source === "public_buyer_direct" ? "town" : "pm"), timestamp, interestId),
      db.prepare(`
        SELECT CASE WHEN EXISTS(SELECT 1 FROM rfp_interests WHERE id=?)
          = EXISTS(SELECT 1 FROM _d1_interest_outbox WHERE interest_id=?)
          AND (NOT EXISTS(SELECT 1 FROM _d1_interest_outbox WHERE interest_id=?) OR ? IS NULL
            OR EXISTS(SELECT 1 FROM notifications WHERE id=? AND user_id=?))
          THEN 1 ELSE json_extract('invalid interest outbox','$') END AS consistent
      `).bind(interestId, interestId, interestId, state.posterId, interestId, state.posterId),
    ]);
    if (results.length !== 4 || results.some(result => !result.success)) throw new D1ApiError(503, "interest_write_unavailable");
    if (results[0].meta.changes === 1 && results[1].meta.changes === 1) {
      const allowance = responseAllowance({
        pro: state.pro === 1 || state.source === "public_buyer_direct",
        usedThisMonth: state.used + Number(decision.free),
      });
      return { ok: true, allowance: allowance.unlimited
        ? { unlimited: true } : { unlimited: false, left: allowance.left, limit: allowance.limit } };
    }
  }
  throw new D1ApiError(409, "interest_context_changed");
}
