import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendAdminNewInterest,
  sendInterestConfirmation,
  sendPmNewInterest,
  sendTradeContactShared,
  sendTradeDeclined,
  sendTradeNotSelected,
  sendTradePicked,
} from "@/lib/email/send";
import { isUsState } from "@/lib/geo";
import { escHtml } from "@/lib/email/parts";
import { responsesPath, type EmailLang, type PosterKind, type QuoteInfo } from "./email-copy";
import { langOf } from "./server";
import { canPickOn, isOpenResponse, pickPlan, pmContactCard, type Allowance, type ContactCard } from "./rules";

/**
 * Notifications and PM decisions on responses (service role, server only).
 * Callers check who's asking first (lib/pm-jobs/bid-actions, the
 * rfp-interest route); these re-check what they can from the rows
 * themselves. Every email is best effort: a failed send never undoes a
 * decision. Tested in test/unit/pm-job-flow.test.ts with an in-memory DB.
 */

type Db = SupabaseClient;

export interface JobForDecision {
  id: string;
  title: string;
  slug?: string | null;
  status: string;
  source_type: string | null;
  province?: string | null;
  posted_by_user_id: string | null;
  posted_by_organization_id: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  poster_lang?: string | null;
  /** Public buyers' jobs (migration 20261021000060): 'quote_request' or 'tender_mirror'. */
  post_kind?: string | null;
}

export const JOB_DECISION_COLS =
  "id,title,slug,status,source_type,province,posted_by_user_id,posted_by_organization_id,contact_name,contact_email,contact_phone";

export function posterKindOf(sourceType: string | null | undefined): PosterKind {
  return sourceType === "gc_package" ? "gc" : sourceType === "public_buyer_direct" ? "town" : "pm";
}

/** The job, with poster_lang (migration 20261021000020) and post_kind (20261021000060) when those columns exist. */
export async function loadJobForDecision(db: Db, rfpId: string): Promise<JobForDecision | null> {
  for (const extra of [",poster_lang,post_kind", ",poster_lang", ""]) {
    const res = await db.from("rfp_posts").select(`${JOB_DECISION_COLS}${extra}`).eq("id", rfpId).maybeSingle();
    if (!res.error || !extra) return (res.data as JobForDecision | null) ?? null;
  }
  return null;
}

export interface Actor {
  userId: string;
  organizationId: string | null;
  admin: boolean;
}

/** The poster (or a member of the posting company, or an admin). */
export function ownsJob(job: Pick<JobForDecision, "posted_by_user_id" | "posted_by_organization_id">, actor: Actor): boolean {
  if (actor.admin) return true;
  if (job.posted_by_user_id && job.posted_by_user_id === actor.userId) return true;
  return Boolean(job.posted_by_organization_id && actor.organizationId && job.posted_by_organization_id === actor.organizationId);
}

/** The poster's contact for a trade (listing contact, then their account and company). */
export async function posterContact(db: Db, job: JobForDecision): Promise<ContactCard> {
  const [{ data: poster }, { data: org }] = await Promise.all([
    job.posted_by_user_id
      ? db.from("users_profile").select("full_name,email,phone").eq("id", job.posted_by_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    job.posted_by_organization_id
      ? db.from("organizations").select("name,phone,email").eq("id", job.posted_by_organization_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return pmContactCard({
    rfp: job,
    poster: poster as { full_name?: string | null; email?: string | null; phone?: string | null } | null,
    posterOrg: org as { name?: string | null; phone?: string | null; email?: string | null } | null,
  });
}

// ── A trade responded ────────────────────────────────────────────────

export interface NewInterestNotice {
  interestId: string;
  job: JobForDecision;
  vendorName: string;
  message: string;
  quote?: QuoteInfo;
  trade: { userId: string; email: string | null; lang: EmailLang };
  allowance?: Allowance;
}

/**
 * Tell the poster (email + in-app), confirm to the trade, copy the admin.
 * Only once the response row really exists. The poster's email comes from
 * their account (service role: a trade's own session can't read another
 * member's profile), else the listing's contact email.
 */
export async function notifyNewInterest(db: Db, n: NewInterestNotice): Promise<{ pmEmail: string | null; skipped?: "no_row" }> {
  const { data: row } = await db.from("rfp_interests").select("id,rfp_id").eq("id", n.interestId).maybeSingle();
  const r = row as { id: string; rfp_id: string } | null;
  if (!r || r.rfp_id !== n.job.id) return { pmEmail: null, skipped: "no_row" };

  let pmEmail: string | null = null;
  if (n.job.posted_by_user_id) {
    const { data: profile } = await db.from("users_profile").select("email,status").eq("id", n.job.posted_by_user_id).maybeSingle();
    const p = profile as { email: string | null; status?: string | null } | null;
    if (p?.email && p.status !== "suspended" && p.status !== "deleted") pmEmail = p.email;
  }
  pmEmail ??= n.job.contact_email?.trim() || null;

  const posterKind = posterKindOf(n.job.source_type);
  const currency = isUsState(n.job.province) ? "USD" : "CAD";
  const tasks: Promise<unknown>[] = [];
  if (pmEmail) {
    const lang = await langOf(db, n.job.posted_by_user_id, n.job.poster_lang);
    tasks.push(
      sendPmNewInterest(pmEmail, { vendorName: n.vendorName, rfpTitle: n.job.title, rfpId: n.job.id, lang, quote: n.quote ? { ...n.quote, currency } : undefined, posterKind }),
    );
  }
  if (n.job.posted_by_user_id) {
    tasks.push(
      Promise.resolve(
        db.from("notifications").insert({
          user_id: n.job.posted_by_user_id,
          type: "pm_new_response",
          title: `New response from ${n.vendorName}`.slice(0, 200),
          message: n.job.title,
          link_url: responsesPath(n.job.id, posterKind),
        }),
      ),
    );
  }
  if (n.trade.email) {
    tasks.push(
      sendInterestConfirmation(n.trade.email, n.job.title, {
        lang: n.trade.lang,
        posterKind,
        allowance: n.allowance ? { unlimited: n.allowance.unlimited, left: n.allowance.left, limit: n.allowance.limit } : undefined,
      }),
    );
  }
  tasks.push(sendAdminNewInterest({ vendor: escHtml(n.vendorName), rfpTitle: escHtml(n.job.title), message: escHtml(n.message) }));
  await Promise.allSettled(tasks);
  return { pmEmail };
}

// ── The poster decides ───────────────────────────────────────────────

interface InterestRow {
  id: string;
  rfp_id: string;
  status: string;
  trade_organization_id: string;
  submitted_by_user_id: string | null;
  lang?: string | null;
  pm_contact_shared?: boolean | null;
  outcome_notified_at?: string | null;
}

const INTEREST_COLS = "id,rfp_id,status,trade_organization_id,submitted_by_user_id,lang,pm_contact_shared,outcome_notified_at";

async function interestsOf(db: Db, rfpId: string): Promise<InterestRow[]> {
  const { data } = await db.from("rfp_interests").select(INTEREST_COLS).eq("rfp_id", rfpId);
  return (data ?? []) as InterestRow[];
}

async function interestOf(db: Db, rfpId: string, interestId: string): Promise<InterestRow | null> {
  const { data } = await db.from("rfp_interests").select(INTEREST_COLS).eq("id", interestId).eq("rfp_id", rfpId).maybeSingle();
  return (data as InterestRow | null) ?? null;
}

/** Who to tell about a response: the person who sent it (else the company inbox), in their language. */
async function responder(db: Db, i: InterestRow): Promise<{ email: string | null; lang: EmailLang; company: string; userId: string | null }> {
  const [{ data: org }, { data: profile }] = await Promise.all([
    db.from("organizations").select("name,email").eq("id", i.trade_organization_id).maybeSingle(),
    i.submitted_by_user_id ? db.from("users_profile").select("email,status").eq("id", i.submitted_by_user_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const o = org as { name?: string | null; email?: string | null } | null;
  const p = profile as { email?: string | null; status?: string | null } | null;
  const email = (p?.status !== "suspended" && p?.email) || o?.email || null;
  return { email, lang: await langOf(db, i.submitted_by_user_id, i.lang), company: o?.name ?? "", userId: i.submitted_by_user_id };
}

async function tellTrade(db: Db, i: InterestRow, type: string, title: string, rfpTitle: string): Promise<void> {
  if (!i.submitted_by_user_id) return;
  await db.from("notifications").insert({ user_id: i.submitted_by_user_id, type, title, message: rfpTitle, link_url: "/dashboard/interests" });
}

export type DecisionError = "not_found" | "not_owner" | "closed" | "invalid" | "failed";
export type DecisionResult = { ok: true } | { ok: false; error: DecisionError };

/** Shortlist (or un-shortlist) a response. No email: the trade hears about the outcome. */
export async function toggleShortlist(db: Db, job: JobForDecision, interestId: string): Promise<DecisionResult> {
  const i = await interestOf(db, job.id, interestId);
  if (!i) return { ok: false, error: "not_found" };
  if (!isOpenResponse(i.status)) return { ok: false, error: "closed" };
  const next = i.status === "shortlisted" ? "viewed" : "shortlisted";
  const { error } = await db.from("rfp_interests").update({ status: next }).eq("id", i.id).eq("rfp_id", job.id);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

/** Decline one response, with an optional polite note to the trade. */
export async function declineResponse(db: Db, job: JobForDecision, interestId: string, note: string | null): Promise<DecisionResult> {
  const i = await interestOf(db, job.id, interestId);
  if (!i) return { ok: false, error: "not_found" };
  if (!isOpenResponse(i.status)) return { ok: false, error: "closed" };
  const clean = note?.trim().slice(0, 1000) || null;
  const now = new Date().toISOString();
  const { error } = await db
    .from("rfp_interests")
    .update({ status: "declined", decision_note: clean, decided_at: now, outcome_notified_at: now })
    .eq("id", i.id)
    .eq("rfp_id", job.id);
  if (error) return { ok: false, error: "failed" };
  const who = await responder(db, i);
  await Promise.allSettled([
    who.email ? sendTradeDeclined(who.email, { lang: who.lang, rfpTitle: job.title, posterKind: posterKindOf(job.source_type), note: clean }) : null,
    tellTrade(db, i, "response_declined", "Your response was declined", job.title),
  ]);
  return { ok: true };
}

/**
 * Pick one response: the job is awarded, the picked trade gets the poster's
 * contact (email + in-app) and its own contact opens to the poster; every
 * other open response becomes "not selected" and its trade gets a short
 * thank-you, once.
 */
export async function pickResponse(db: Db, job: JobForDecision, interestId: string): Promise<DecisionResult> {
  if (!canPickOn(job.status)) return { ok: false, error: "closed" };
  const all = await interestsOf(db, job.id);
  if (all.some((r) => r.status === "picked")) return { ok: false, error: "closed" };
  const plan = pickPlan(all, interestId);
  if (!plan.picked) return { ok: false, error: all.some((r) => r.id === interestId) ? "invalid" : "not_found" };
  const now = new Date().toISOString();

  const { error } = await db
    .from("rfp_interests")
    .update({ status: "picked", contact_revealed: true, pm_contact_shared: true, decided_at: now, outcome_notified_at: now })
    .eq("id", plan.picked)
    .eq("rfp_id", job.id);
  if (error) return { ok: false, error: "failed" };
  if (plan.notSelected.length) {
    await db.from("rfp_interests").update({ status: "not_selected", decided_at: now }).in("id", plan.notSelected).eq("rfp_id", job.id);
  }
  await db.from("rfp_posts").update({ status: "awarded", closed_at: now }).eq("id", job.id).in("status", ["published", "closed", "expired"]);

  const posterKind = posterKindOf(job.source_type);
  const picked = all.find((r) => r.id === plan.picked)!;
  const [contact, who] = await Promise.all([posterContact(db, job), responder(db, picked)]);
  const tasks: (Promise<unknown> | null)[] = [
    who.email ? sendTradePicked(who.email, { lang: who.lang, rfpTitle: job.title, posterKind, company: who.company, contact }) : null,
    tellTrade(db, picked, "response_picked", "You were picked", job.title),
  ];
  for (const id of plan.notify) {
    const r = all.find((x) => x.id === id)!;
    tasks.push(
      (async () => {
        const w = await responder(db, r);
        if (w.email) await sendTradeNotSelected(w.email, { lang: w.lang, rfpTitle: job.title, posterKind });
        await tellTrade(db, r, "response_not_selected", "The job went to another company", job.title);
        await db.from("rfp_interests").update({ outcome_notified_at: now }).eq("id", r.id);
      })(),
    );
  }
  await Promise.allSettled(tasks);
  return { ok: true };
}

/** "Share my contact with this trade": the poster's contact goes to that trade (email + in-app), once. */
export async function shareContactWith(db: Db, job: JobForDecision, interestId: string): Promise<DecisionResult> {
  const i = await interestOf(db, job.id, interestId);
  if (!i) return { ok: false, error: "not_found" };
  if (i.status === "declined" || i.status === "not_selected") return { ok: false, error: "closed" };
  if (i.pm_contact_shared || i.status === "picked") return { ok: true };
  const { error } = await db.from("rfp_interests").update({ pm_contact_shared: true }).eq("id", i.id).eq("rfp_id", job.id);
  if (error) return { ok: false, error: "failed" };
  const [contact, who] = await Promise.all([posterContact(db, job), responder(db, i)]);
  await Promise.allSettled([
    who.email ? sendTradeContactShared(who.email, { lang: who.lang, rfpTitle: job.title, posterKind: posterKindOf(job.source_type), company: who.company, contact }) : null,
    tellTrade(db, i, "response_contact_shared", "The poster shared their contact", job.title),
  ]);
  return { ok: true };
}
