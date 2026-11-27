import "server-only";
import { isEnabledLocale } from "@/i18n/config";
import { sendTradeContactShared, sendTradeDeclined, sendTradeNotSelected, sendTradePicked } from "@/lib/email/send";
import { posterKindOf, type DecisionResult, type JobForDecision } from "@/lib/pm-jobs/decisions";
import { canPickOn, isOpenResponse, OPEN_RESPONSE_STATUSES, pmContactCard } from "@/lib/pm-jobs/rules";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, UUID, type D1Binding, type D1Statement } from "./contracts";
import { vpsAppDatabase } from "./http-binding";

export type BidDecision = "shortlist" | "decline" | "pick" | "share";

// Recheck membership and the actor's current status in the database on every write.
export const canManageBidJob = `EXISTS (
  SELECT 1 FROM users_profile actor WHERE actor.id=? AND actor.status='active'
  AND (actor.primary_role IN ('admin','super_admin') OR actor.id=r.posted_by_user_id
    OR EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id=actor.id AND m.organization_id=r.posted_by_organization_id))
)`;

const openStatuses = OPEN_RESPONSE_STATUSES.map(status => "'" + status + "'").join(",");
const stateFrom = `FROM rfp_posts r LEFT JOIN rfp_interests i ON i.rfp_id=r.id AND i.id=?
  LEFT JOIN users_profile p ON p.id=r.posted_by_user_id
  LEFT JOIN organizations o ON o.id=r.posted_by_organization_id
  WHERE r.id=? AND r.is_demo=0 AND (r.sealed=0 OR EXISTS(SELECT 1 FROM town_job_log l WHERE l.rfp_id=r.id AND l.event='quotes_opened'))`;
const notSelected = `i.rfp_id=? AND i.id<>? AND i.status IN (${openStatuses})`;

type State = JobForDecision & {
  can_manage: number; interest_id: string | null; interest_status: string | null; pm_contact_shared: number | null;
  poster_name: string | null; poster_email: string | null; poster_phone: string | null;
  company_name: string | null; company_email: string | null; company_phone: string | null;
};
type Recipient = {
  id: string; email: string | null; lang: string | null; company: string | null;
};

export async function decideVpsBid(
  kind: BidDecision, actorId: string, rfpId: string, interestId: string, note: string | null,
  db: D1Binding = vpsAppDatabase(), comparisonClaim?: D1Statement,
): Promise<DecisionResult & { job?: JobForDecision }> {
  if (!UUID.test(actorId) || !UUID.test(rfpId) || !UUID.test(interestId)) return { ok: false, error: "not_found" };
  const job = await db.prepare(`SELECT r.id,r.title,r.slug,r.source_type,r.status,r.contact_name,r.contact_email,r.contact_phone,
      ${canManageBidJob} AS can_manage,i.id AS interest_id,i.status AS interest_status,i.pm_contact_shared,
      p.full_name AS poster_name,p.email AS poster_email,p.phone AS poster_phone,
      o.name AS company_name,o.email AS company_email,o.phone AS company_phone ${stateFrom}
      AND ${customerAppAuthority}`).bind(actorId, interestId, rfpId).first<State>();
  if (!job) return { ok: false, error: "not_found" };
  if (!job.can_manage) return { ok: false, error: "not_owner" };
  if (!job.interest_id || !job.interest_status) return { ok: false, error: "not_found" };
  if (kind === "pick" && !canPickOn(job.status)) return { ok: false, error: "closed" };
  if (kind === "pick" && ["declined", "picked"].includes(job.interest_status)) return { ok: false, error: "invalid" };
  if ((kind === "shortlist" || kind === "decline") && !isOpenResponse(job.interest_status)) return { ok: false, error: "closed" };
  if (kind === "share" && ["declined", "not_selected"].includes(job.interest_status)) return { ok: false, error: "closed" };
  if (kind === "share" && (job.pm_contact_shared || job.interest_status === "picked")) return { ok: true, job };
  const now = new Date().toISOString();
  const cleanNote = note?.trim().slice(0, 1000) || null;
  const effects = {
    shortlist: { type: "", title: "", status: job.interest_status === "shortlisted" ? "viewed" : "shortlisted" },
    decline: { type: "response_declined", title: "Your response was declined", status: "declined" },
    pick: { type: "response_picked", title: "You were picked", status: "picked" },
    share: { type: "response_contact_shared", title: "The poster shared their contact", status: job.interest_status },
  }[kind];
  const competitors = kind === "pick" ? ` OR (${notSelected} AND i.outcome_notified_at IS NULL)` : "";
  const competitorArgs = kind === "pick" ? [rfpId, interestId] : [];
  const statements = [
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND EXISTS (
      SELECT 1 ${stateFrom} AND ${canManageBidJob} AND r.status=? AND i.status=? AND i.pm_contact_shared=?
        AND (?<>'pick' OR NOT EXISTS (SELECT 1 FROM rfp_interests picked WHERE picked.rfp_id=r.id AND picked.status='picked'))
    ) THEN 1 ELSE json('bid_decision_changed') END`)
      .bind(interestId, rfpId, actorId, job.status, job.interest_status, job.pm_contact_shared, kind),
  ];
  if (kind !== "shortlist") {
    statements.push(
      db.prepare(`SELECT i.id,o.name AS company,COALESCE(CASE WHEN p.status<>'suspended' THEN p.email END,o.email) AS email,
        COALESCE(NULLIF(i.lang,''),a.lang) AS lang
        FROM rfp_interests i LEFT JOIN organizations o ON o.id=i.trade_organization_id
        LEFT JOIN users_profile p ON p.id=i.submitted_by_user_id LEFT JOIN signup_attribution a ON a.user_id=p.id
        WHERE i.id=?${competitors}`).bind(interestId, ...competitorArgs),
      db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,link_url)
        SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
        i.submitted_by_user_id,CASE WHEN i.id=? THEN ? ELSE 'response_not_selected' END,
        CASE WHEN i.id=? THEN ? ELSE 'The job went to another company' END,?, '/dashboard/interests'
        FROM rfp_interests i WHERE i.submitted_by_user_id IS NOT NULL AND (i.id=?${competitors})`)
        .bind(interestId, effects.type, interestId, effects.title, job.title, interestId, ...competitorArgs),
    );
  }
  statements.push(db.prepare(`UPDATE rfp_interests SET status=?,updated_at=?,
    pm_contact_shared=CASE WHEN ? IN ('pick','share') THEN 1 ELSE pm_contact_shared END,
    contact_revealed=CASE WHEN ?='pick' THEN 1 ELSE contact_revealed END,
    decision_note=CASE WHEN ?='decline' THEN ? ELSE decision_note END,
    decided_at=CASE WHEN ? IN ('pick','decline') THEN ? ELSE decided_at END,
    outcome_notified_at=CASE WHEN ? IN ('pick','decline') THEN ? ELSE outcome_notified_at END
    WHERE id=? AND rfp_id=?`).bind(effects.status, now, kind, kind, kind, cleanNote, kind, now, kind, now, interestId, rfpId));
  if (kind === "pick") {
    statements.push(
      db.prepare(`UPDATE rfp_interests AS i SET status='not_selected',decided_at=?,updated_at=?,
        outcome_notified_at=COALESCE(outcome_notified_at,?) WHERE ${notSelected}`).bind(now, now, now, rfpId, interestId),
      db.prepare("UPDATE rfp_posts SET status='awarded',closed_at=?,updated_at=? WHERE id=?").bind(now, now, rfpId),
    );
  }
  if (comparisonClaim) {
    statements.push(comparisonClaim, db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('comparison_award_changed') END"));
  }
  const results = await db.batch<Recipient>(statements);
  if (results.length !== statements.length || results.some(result => !result.success)) {
    throw new D1ApiError(503, "bid_decision_unavailable");
  }
  if (kind !== "shortlist") {
    const contact = pmContactCard({ rfp: job,
      poster: { full_name: job.poster_name, email: job.poster_email, phone: job.poster_phone },
      posterOrg: { name: job.company_name, email: job.company_email, phone: job.company_phone },
    });
    await Promise.allSettled(results[1].results.map(async recipient => {
      if (!recipient.email) return;
      const lang = isEnabledLocale(recipient.lang) ? recipient.lang : "en";
      const message = { lang, rfpTitle: job.title, posterKind: posterKindOf(job.source_type) } as const;
      if (recipient.id !== interestId) await sendTradeNotSelected(recipient.email, message);
      else if (kind === "decline") await sendTradeDeclined(recipient.email, { ...message, note: cleanNote });
      else if (kind === "pick") await sendTradePicked(recipient.email, { ...message, contact, company: recipient.company ?? "" });
      else await sendTradeContactShared(recipient.email, { ...message, contact, company: recipient.company ?? "" });
    }));
  }
  return { ok: true, job };
}
