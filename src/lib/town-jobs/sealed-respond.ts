import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/access/access";
import { validAttachments } from "@/lib/projects/attach";
import { isEnabledLocale } from "@/i18n/config";
import { emailLang } from "@/lib/pm-jobs/email-copy";
import { parseQuoteAmount, parseQuoteKind, respondDecision, REFUSAL_STATUS } from "@/lib/pm-jobs/rules";
import type { InterestInput } from "@/lib/validations";
import { sealedHttpStatus, type SealedError } from "./sealed";
import { submitSealedQuote, withdrawSealedQuote } from "./sealed-server";
import type { TownJob } from "./server";

/**
 * A trade sends, replaces or withdraws a sealed quote (the respond dialog's
 * /api/rfp-interest and the listing's /api/town-jobs/sealed-quote). The same
 * checks as any response first (company type, not its own job, open), then
 * the database's (closing time, membership). Always free for trades.
 */

export interface SealedReply {
  status: number;
  body: { ok: true; sealed: true; action: "received" | "replaced" | "withdrawn"; version?: number; closesAt?: string | null } | { ok: false; error: string; reason: string; closesAt?: string | null };
}

const refused = (reason: string, status: number): SealedReply => ({ status, body: { ok: false, error: reason, reason } });

function precheck(session: SessionContext, job: TownJob): SealedReply | null {
  const org = session.organization;
  if (!org) return refused("org", 400);
  const decision = respondDecision({
    signedIn: true,
    org: { id: org.id, organization_type: org.organization_type, status: org.status, profile_status: org.profile_status },
    pro: session.hasTradeAccess,
    rfp: { status: job.status, source_type: job.source_type, posted_by_user_id: job.posted_by_user_id, posted_by_organization_id: job.posted_by_organization_id, post_kind: job.post_kind },
    userId: session.userId,
    usedThisMonth: 0,
  });
  if (decision.refusal) return refused(decision.refusal, REFUSAL_STATUS[decision.refusal]);
  return null;
}

const fromDb = (e: SealedError, closesAt?: string | null): SealedReply => ({ status: sealedHttpStatus(e), body: { ok: false, error: e, reason: e === "not_member" ? "org" : e, closesAt: closesAt ?? null } });

/** Send (or replace) the company's sealed quote. */
export async function respondSealed(db: SupabaseClient, session: SessionContext, job: TownJob, data: InterestInput): Promise<SealedReply> {
  const early = precheck(session, job);
  if (early) return early;
  const org = session.organization!;
  const caseStudyIds = data.caseStudyIds?.length ? await validAttachments({ organizationId: org.id, userId: session.userId, ids: data.caseStudyIds, label: `Sealed quote: ${job.title}` }) : [];
  const amount = parseQuoteAmount(data.quoteAmount);
  const res = await submitSealedQuote(
    db,
    job,
    { userId: session.userId, orgId: org.id, email: session.profile.email || null },
    {
      message: data.message,
      relevantExperience: data.relevantExperience ?? null,
      availability: data.availability ?? null,
      amount,
      kind: amount != null ? parseQuoteKind(data.quoteKind) : null,
      notes: data.quoteNotes?.trim() || null,
      startDate: data.startDate || null,
      caseStudyIds,
      lang: emailLang(isEnabledLocale(data.lang) ? data.lang : "en"),
    },
  );
  if (!res.ok) return fromDb(res.error);
  return { status: 200, body: { ok: true, sealed: true, action: res.action, version: res.version, closesAt: res.closes_at } };
}

/** Withdraw the company's sealed quote before closing (erased unopened). */
export async function withdrawSealed(db: SupabaseClient, session: SessionContext, job: TownJob, lang: unknown): Promise<SealedReply> {
  const org = session.organization;
  if (!org) return refused("org", 400);
  const res = await withdrawSealedQuote(db, job, { userId: session.userId, orgId: org.id, email: session.profile.email || null }, emailLang(isEnabledLocale(lang) ? lang : "en"));
  if (!res.ok) return fromDb(res.error);
  return { status: 200, body: { ok: true, sealed: true, action: "withdrawn" } };
}
