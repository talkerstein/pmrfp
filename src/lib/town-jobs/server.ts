import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAdminNewRfp, sendTownJobEmail } from "@/lib/email/send";
import { inviteUnsubscribeUrl, unsubscribeUrl } from "@/lib/email/unsubscribe";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { optedOutUsers, pmJobAlertsEnabled } from "@/lib/pm-jobs/alerts";
import { emailLang, type EmailLang } from "@/lib/pm-jobs/email-copy";
import { langOf, loadAlertAudience, loadJob, pendingReviewCount, recipientLangs, runPmJobAlerts } from "@/lib/pm-jobs/server";
import { answerEmail, addendumEmail, emailInviteEmail, questionWaitingEmail, tradeInviteEmail } from "./email-copy";
import { getBuyerFollowerIds } from "./followers";
import { isClosed, townClosesAt } from "./sealed";
import { sealedCounts, sealedResponderIds } from "./sealed-server";
import {
  askDecision,
  broadcastAudience,
  canAnswer,
  checkQuestionDeadline,
  cleanAnswer,
  cleanInviteEmail,
  cleanQuestion,
  dayStartToronto,
  emailInviteDecision,
  emailKey,
  inviteBudget,
  isInviteCapError,
  nextAddendumNumber,
  planAddendum,
  planTradeInvites,
  townInvitesEnabled,
  townPostStatus,
  townQaEmailsEnabled,
  TOWN_SOURCE,
  type AddendumError,
  type AddendumRow,
  type AskRefusal,
  type InvitePlan,
  type LogEvent,
  type QuestionRow,
} from "./rules";

/**
 * Database side of a town's job (service role; server only). Callers check
 * who's asking first (lib/town-jobs/actions, lib/dashboard/actions); these
 * re-check what they can from the rows. Every email is best effort and
 * gated (TOWN_INVITES_ENABLED, TOWN_QA_EMAILS_ENABLED): a failed or switched
 * off send never undoes the answer, addendum or invitation record. Tested in
 * test/unit/town-jobs.test.ts with an in-memory database.
 */

type Db = SupabaseClient;

const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
const mailingAddress = () => process.env.BUSINESS_MAILING_ADDRESS?.trim() || null;

// ── The job ──────────────────────────────────────────────────────────

export interface TownJob {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: string;
  source_type: string | null;
  post_kind: string | null;
  buyer_key: string | null;
  buyer_name: string | null;
  official_url: string | null;
  official_portal: string | null;
  deadline: string | null;
  question_deadline: string | null;
  posted_by_user_id: string | null;
  posted_by_organization_id: string | null;
  poster_lang?: string | null;
  created_at?: string;
  published_at?: string | null;
  /** "Sealed until closing" (Part C, migration 20261021000120). */
  sealed?: boolean | null;
}

const TOWN_JOB_BASE_COLS =
  "id,title,slug,summary,status,source_type,post_kind,buyer_key,buyer_name,official_url,official_portal,deadline,question_deadline,posted_by_user_id,posted_by_organization_id,poster_lang,created_at,published_at";
export const TOWN_JOB_COLS = `${TOWN_JOB_BASE_COLS},sealed`;

/** A public buyer's job by id, or null (not found, not a town's job, or before migration 20261021000060). */
export async function loadTownJob(db: Db, rfpId: string): Promise<TownJob | null> {
  let { data, error } = await db.from("rfp_posts").select(TOWN_JOB_COLS).eq("id", rfpId).maybeSingle();
  // Before Part C's migration there's no sealed column: nothing is sealed.
  if (error) ({ data, error } = await db.from("rfp_posts").select(TOWN_JOB_BASE_COLS).eq("id", rfpId).maybeSingle());
  if (error || !data) return null;
  const job = data as unknown as TownJob;
  return job.source_type === TOWN_SOURCE ? job : null;
}

// ── The town's page (who is posting) ─────────────────────────────────

export interface TownPage {
  buyerKey: string;
  buyerName: string;
  provinceCode: string;
  /** The organization manages the page (verified): its posts skip review. */
  verified: boolean;
}

/**
 * The page a public-buyer organization posts as: the one it manages
 * (verified), else the page its person claimed and is waiting on (not
 * verified: posts wait for PMRFP review). Null when it has neither.
 */
export async function townPageFor(db: Db, organizationId: string, userId: string): Promise<TownPage | null> {
  const { data: page } = await db.from("buyer_pages").select("buyer_key,buyer_name,province_code").eq("organization_id", organizationId).maybeSingle();
  const p = page as { buyer_key: string; buyer_name: string; province_code: string } | null;
  if (p) return { buyerKey: p.buyer_key, buyerName: p.buyer_name, provinceCode: p.province_code, verified: true };
  const { data: claim } = await db
    .from("buyer_claims")
    .select("buyer_key,buyer_name,province_code,status,created_at")
    .eq("user_id", userId)
    .in("status", ["pending", "verified"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const c = claim as { buyer_key: string; buyer_name: string; province_code: string } | null;
  return c ? { buyerKey: c.buyer_key, buyerName: c.buyer_name, provinceCode: c.province_code, verified: false } : null;
}

// ── The town's record ────────────────────────────────────────────────

/** Append one entry to the town's record (town_job_log). Never throws. */
export async function logTownEvent(
  db: Db,
  e: { rfpId: string | null; organizationId: string | null; buyerKey: string | null; actorUserId: string | null; event: LogEvent; detail?: Record<string, unknown> },
): Promise<void> {
  try {
    const { error } = await db.from("town_job_log").insert({
      rfp_id: e.rfpId,
      organization_id: e.organizationId,
      buyer_key: e.buyerKey,
      actor_user_id: e.actorUserId,
      event: e.event,
      detail: e.detail ?? {},
    });
    if (error && !isMissingTableError(error)) console.error("[town-jobs] log failed", error.message);
  } catch (err) {
    console.error("[town-jobs] log failed", err instanceof Error ? err.message : err);
  }
}

const logFor = (db: Db, job: TownJob, actorUserId: string | null, event: LogEvent, detail?: Record<string, unknown>) =>
  logTownEvent(db, { rfpId: job.id, organizationId: job.posted_by_organization_id, buyerKey: job.buyer_key, actorUserId, event, detail });

// ── Posting ──────────────────────────────────────────────────────────

export interface FinishResult {
  status: "published" | "pending_review";
  /** Same-day alerts: going out now, switched off (PM_JOB_ALERTS_ENABLED), blocked by a missing mailing address, or nobody matches. */
  alerts: "on" | "off" | "no_address" | "none";
  wouldEmail: number;
}

/**
 * After a town's job row exists (as pending_review): a verified town's job
 * goes live at once (same-day alerts to matching trades, an in-app notice
 * to the town's followers, an FYI to PMRFP); anyone else's waits for review
 * (PMRFP is emailed). Everything is logged. `schedule` runs the alert sends
 * after the response (next/server's after() in the action).
 */
export async function finishTownPost(
  db: Db,
  p: { rfpId: string; page: TownPage; organizationId: string; actorUserId: string; title: string; slug: string; postKind: string; postedBy: string | null; region: string | null; categories: string; schedule: (task: () => Promise<void>) => void; sealed?: boolean },
): Promise<FinishResult> {
  const base = { rfpId: p.rfpId, organizationId: p.organizationId, buyerKey: p.page.buyerKey, actorUserId: p.actorUserId };
  await logTownEvent(db, { ...base, event: "posted", detail: { kind: p.postKind, verified: p.page.verified, ...(p.sealed ? { sealed: true } : {}) } });
  const target = townPostStatus({ verified: p.page.verified });
  if (target === "published") {
    const { data, error } = await db
      .from("rfp_posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", p.rfpId)
      .eq("status", "pending_review")
      .select("id")
      .maybeSingle();
    if (!error && data) {
      // Followers at posting time, for the reach report (counts only).
      const followers = await getBuyerFollowerIds(p.page.buyerKey).catch(() => [] as string[]);
      await logTownEvent(db, { ...base, event: "published", detail: { auto: true, followers: followers.length } });
      const preview = await runPmJobAlerts(db, p.rfpId, { dry: true }).catch(() => null);
      const n = preview?.wouldEmail ?? 0;
      let alerts: FinishResult["alerts"] = "none";
      if (!pmJobAlertsEnabled()) alerts = "off";
      else if (!mailingAddress()) alerts = "no_address";
      else if (n > 0) {
        alerts = "on";
        const rfpId = p.rfpId;
        p.schedule(async () => {
          try {
            const res = await runPmJobAlerts(db, rfpId);
            console.info(`[pm-job-alerts] town ${rfpId}: ${res.state} sent=${res.sent} of ${res.wouldEmail}`);
          } catch (e) {
            console.error("[pm-job-alerts] town failed", e instanceof Error ? e.message : e);
          }
        });
      }
      await notifyFollowersOfNewJob(db, p.page.buyerKey, { title: p.title, slug: p.slug, buyerName: p.page.buyerName });
      await sendAdminNewRfp({ title: p.title, postedBy: p.postedBy ?? p.page.buyerName, region: p.region, category: p.categories || null, kind: TOWN_SOURCE, autoPublished: true }).catch(() => undefined);
      return { status: "published", alerts, wouldEmail: n };
    }
    console.error("[town-jobs] auto-publish failed", error?.message ?? "no row");
  }
  await logTownEvent(db, { ...base, event: "sent_to_review", detail: { verified: p.page.verified } });
  const pending = await pendingReviewCount(db).catch(() => null);
  await sendAdminNewRfp({ title: p.title, postedBy: p.postedBy ?? p.page.buyerName, region: p.region, category: p.categories || null, kind: TOWN_SOURCE, pending }).catch(() => undefined);
  return { status: "pending_review", alerts: "none", wouldEmail: 0 };
}

/** In-app notice to the town's followers (the Part B1 hook; empty until it's wired). */
async function notifyFollowersOfNewJob(db: Db, buyerKey: string, job: { title: string; slug: string; buyerName: string }): Promise<void> {
  const followers = await getBuyerFollowerIds(buyerKey).catch(() => []);
  if (!followers.length) return;
  await db.from("notifications").insert(
    [...new Set(followers)].map((user_id) => ({
      user_id,
      type: "town_new_job",
      title: `New from ${job.buyerName}`.slice(0, 200),
      message: job.title,
      link_url: `/rfps/${job.slug}`,
    })),
  );
}

// ── Questions ────────────────────────────────────────────────────────

export type QuestionError = Exclude<AskRefusal, null> | "invalid" | "failed" | "not_found" | "answered";

/** A signed-in person asks privately. The town is told (in-app; email behind TOWN_QA_EMAILS_ENABLED). */
export async function askQuestion(
  db: Db,
  p: { job: TownJob; userId: string; organizationId: string | null; question: unknown; lang: EmailLang },
): Promise<{ ok: true; id: string } | { ok: false; error: QuestionError }> {
  const refusal = askDecision({ signedIn: true, job: p.job, userId: p.userId, organizationId: p.organizationId });
  if (refusal) return { ok: false, error: refusal };
  const question = cleanQuestion(p.question);
  if (!question) return { ok: false, error: "invalid" };
  const { data, error } = await db
    .from("town_job_questions")
    .insert({ rfp_id: p.job.id, asker_user_id: p.userId, asker_organization_id: p.organizationId, question, lang: p.lang })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "failed" };
  const id = (data as { id: string }).id;
  await logFor(db, p.job, p.userId, "question_asked", { question_id: id });
  if (p.job.posted_by_user_id) {
    await db.from("notifications").insert({
      user_id: p.job.posted_by_user_id,
      type: "town_question",
      title: "New question on your job",
      message: p.job.title,
      link_url: `/buyer-dashboard/jobs/${p.job.id}#questions`,
    });
    if (townQaEmailsEnabled()) {
      const { data: poster } = await db.from("users_profile").select("email,status").eq("id", p.job.posted_by_user_id).maybeSingle();
      const to = poster as { email: string | null; status: string | null } | null;
      if (to?.email && to.status !== "suspended") {
        const lang = await langOf(db, p.job.posted_by_user_id, p.job.poster_lang);
        await sendTownJobEmail(to.email, questionWaitingEmail(lang, { base: BASE(), title: p.job.title, rfpId: p.job.id }), lang, "town-question").catch(() => undefined);
      }
    }
  }
  return { ok: true, id };
}

/**
 * The town answers once. The answer is published (town_job_qa_public, never
 * the asker) in the town's wording of the question, and sent to everyone
 * engaged with the job.
 */
export async function answerQuestion(
  db: Db,
  p: { job: TownJob; questionId: string; answer: unknown; publicQuestion: unknown; actorUserId: string },
): Promise<{ ok: true; broadcast: BroadcastResult } | { ok: false; error: QuestionError }> {
  const { data } = await db.from("town_job_questions").select("id,question,status,answer").eq("id", p.questionId).eq("rfp_id", p.job.id).maybeSingle();
  const q = data as Pick<QuestionRow, "id" | "question" | "status" | "answer"> | null;
  if (!q) return { ok: false, error: "not_found" };
  if (!canAnswer(q)) return { ok: false, error: "answered" };
  const answer = cleanAnswer(p.answer);
  if (!answer) return { ok: false, error: "invalid" };
  const typed = typeof p.publicQuestion === "string" && p.publicQuestion.trim() ? cleanQuestion(p.publicQuestion) : q.question;
  if (!typed) return { ok: false, error: "invalid" };
  const now = new Date().toISOString();
  const { data: updated, error } = await db
    .from("town_job_questions")
    .update({ answer, public_question: typed, answered_at: now, answered_by: p.actorUserId, status: "answered" })
    .eq("id", q.id)
    .eq("rfp_id", p.job.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "failed" };
  if (!updated) return { ok: false, error: "answered" };
  await logFor(db, p.job, p.actorUserId, "question_answered", { question_id: q.id });
  const broadcast = await broadcastToEngaged(db, p.job, { kind: "answer", question: typed, answer }, p.actorUserId);
  return { ok: true, broadcast };
}

/** The question deadline (or none). It can't fall after the closing date or in the past. */
export async function setQuestionDeadline(db: Db, p: { job: TownJob; value: unknown; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: "invalid" | "failed" }> {
  const checked = checkQuestionDeadline(p.value, p.job.deadline);
  if (!checked.ok) return { ok: false, error: "invalid" };
  const { error } = await db.from("rfp_posts").update({ question_deadline: checked.value }).eq("id", p.job.id);
  if (error) return { ok: false, error: "failed" };
  await logFor(db, p.job, p.actorUserId, "question_deadline_set", { value: checked.value });
  return { ok: true };
}

// ── Addenda ──────────────────────────────────────────────────────────

/**
 * Issue the next addendum. When it moves the closing date, the listing's
 * deadline follows (and a later question deadline comes back to it), and the
 * change is recorded on the addendum (the listing's change history).
 */
export async function issueAddendum(
  db: Db,
  p: { job: TownJob; body: unknown; officialUrl?: unknown; newDeadline?: unknown; actorUserId: string },
): Promise<{ ok: true; number: number; broadcast: BroadcastResult } | { ok: false; error: Exclude<AddendumError, null> | "failed" }> {
  const planned = planAddendum({ body: p.body, officialUrl: p.officialUrl, newDeadline: p.newDeadline }, p.job);
  if (!planned.ok) return { ok: false, error: planned.error };
  const plan = planned.plan;
  // A sealed box that has closed keeps its closing date (the database refuses it too): notices only.
  if (plan.newDeadline && p.job.sealed && isClosed(townClosesAt(p.job.deadline, p.job.buyer_key))) return { ok: false, error: "closed" };
  const { data: existing } = await db.from("town_job_addenda").select("number").eq("rfp_id", p.job.id);
  let number = nextAddendumNumber((existing ?? []) as { number: number }[]);
  let inserted = false;
  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    const { error } = await db.from("town_job_addenda").insert({
      rfp_id: p.job.id,
      number,
      body: plan.body,
      official_url: plan.officialUrl,
      old_deadline: plan.oldDeadline,
      new_deadline: plan.newDeadline,
      posted_by: p.actorUserId,
    });
    if (!error) inserted = true;
    else if (error.code === "23505") number++;
    else return { ok: false, error: "failed" };
  }
  if (!inserted) return { ok: false, error: "failed" };
  if (plan.newDeadline) {
    const { error } = await db.from("rfp_posts").update({ deadline: plan.newDeadline, question_deadline: plan.questionDeadline }).eq("id", p.job.id);
    if (error) console.error("[town-jobs] deadline update failed", error.message);
  }
  await logFor(db, p.job, p.actorUserId, "addendum_issued", { number, deadline_changed: Boolean(plan.newDeadline) });
  if (plan.newDeadline) await logFor(db, p.job, p.actorUserId, "deadline_changed", { number, from: plan.oldDeadline, to: plan.newDeadline });
  const broadcast = await broadcastToEngaged(db, p.job, { kind: "addendum", number, body: plan.body, officialUrl: plan.officialUrl, oldDeadline: plan.oldDeadline, newDeadline: plan.newDeadline }, p.actorUserId);
  return { ok: true, number, broadcast };
}

// ── Broadcasts ───────────────────────────────────────────────────────

export interface BroadcastResult {
  notified: number;
  emailed: number;
  /** People who would get the email (with TOWN_QA_EMAILS_ENABLED on). */
  wouldEmail: number;
  emailsOn: boolean;
}

type BroadcastPayload =
  | { kind: "answer"; question: string; answer: string }
  | { kind: "addendum"; number: number; body: string; officialUrl: string | null; oldDeadline: string | null; newDeadline: string | null };

async function inList<T>(ids: readonly string[], run: (chunk: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 150) {
    const { data } = await run(unique.slice(i, i + 150));
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/** Addresses on the do-not-contact list (bounces, complaints, unsubscribes, manual blocks). */
async function suppressedOf(db: Db, emails: readonly string[]): Promise<Set<string>> {
  const keys = [...new Set(emails.map(emailKey))];
  const rows = await inList<{ email_key: string }>(keys, (c) => db.from("email_suppressions").select("email_key").in("email_key", c));
  return new Set(rows.map((r) => r.email_key));
}

/** The town's own people: the poster and the posting organization's members. */
async function townUserIds(db: Db, job: TownJob): Promise<Set<string>> {
  const ids = new Set<string>(job.posted_by_user_id ? [job.posted_by_user_id] : []);
  if (job.posted_by_organization_id) {
    const { data } = await db.from("organization_members").select("user_id").eq("organization_id", job.posted_by_organization_id);
    for (const r of (data ?? []) as { user_id: string }[]) ids.add(r.user_id);
  }
  return ids;
}

/**
 * An answer or addendum, to everyone engaged with the job (responded or
 * asked, plus followers): in-app always; email behind TOWN_QA_EMAILS_ENABLED,
 * never to anyone who unsubscribed or is on the do-not-contact list.
 */
export async function broadcastToEngaged(db: Db, job: TownJob, payload: BroadcastPayload, actorUserId: string | null, opts: { emails?: boolean } = {}): Promise<BroadcastResult> {
  const [{ data: interests }, { data: askers }, followers, town] = await Promise.all([
    db.from("rfp_interests").select("submitted_by_user_id").eq("rfp_id", job.id),
    db.from("town_job_questions").select("asker_user_id").eq("rfp_id", job.id),
    job.buyer_key ? getBuyerFollowerIds(job.buyer_key).catch(() => []) : Promise.resolve([] as string[]),
    townUserIds(db, job),
  ]);
  const responders: (string | null)[] = ((interests ?? []) as { submitted_by_user_id: string | null }[]).map((r) => r.submitted_by_user_id);
  // A sealed box: everyone with a quote in it hears too (ids only; who they are never reaches the town).
  if (job.sealed) responders.push(...(await sealedResponderIds(db, job.id)));
  const asked = ((askers ?? []) as { asker_user_id: string | null }[]).map((r) => r.asker_user_id);
  const ids = [...new Set([...responders, ...asked, ...followers].filter((x): x is string => Boolean(x)))];
  const [profiles, prefs] = await Promise.all([
    inList<{ id: string; email: string | null; status: string | null }>(ids, (c) => db.from("users_profile").select("id,email,status").in("id", c)),
    inList<{ user_id: string; new_rfps: string | null; channel_email: boolean | null }>(ids, (c) => db.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", c)),
  ]);
  const suppressed = await suppressedOf(db, profiles.map((p) => p.email).filter((e): e is string => Boolean(e)));
  const audience = broadcastAudience({
    responders,
    askers: asked,
    followers,
    townUserIds: town,
    users: new Map(profiles.map((p) => [p.id, { email: p.email, status: p.status }])),
    optedOut: optedOutUsers(prefs),
    suppressedEmails: suppressed,
  });

  const anchor = payload.kind === "answer" ? "questions" : "addenda";
  if (audience.notify.length) {
    await db.from("notifications").insert(
      audience.notify.map((user_id) => ({
        user_id,
        type: payload.kind === "answer" ? "town_answer" : "town_addendum",
        title: payload.kind === "answer" ? "A question was answered" : `Addendum ${payload.number} issued`,
        message: job.title,
        link_url: `/rfps/${job.slug}#${anchor}`,
      })),
    );
  }

  const emailsOn = opts.emails ?? townQaEmailsEnabled();
  let emailed = 0;
  if (emailsOn && audience.email.length) {
    const base = BASE();
    const langs = await recipientLangs(db, audience.email.map((r) => r.userId));
    for (const r of audience.email) {
      const lang = langs.get(r.userId) ?? "en";
      const unsub = unsubscribeUrl(base, r.userId);
      const common = { base, buyer: job.buyer_name, title: job.title, slug: job.slug, unsubscribeUrl: unsub, mailingAddress: mailingAddress() };
      const built =
        payload.kind === "answer"
          ? answerEmail(lang, { ...common, question: payload.question, answer: payload.answer })
          : addendumEmail(lang, { ...common, number: payload.number, body: payload.body, officialUrl: payload.officialUrl, oldDeadline: payload.oldDeadline, newDeadline: payload.newDeadline });
      await sendTownJobEmail(r.email, built, lang, payload.kind === "answer" ? "town-answer" : "town-addendum", unsub).catch(() => undefined);
      emailed++;
    }
  }
  const result: BroadcastResult = { notified: audience.notify.length, emailed, wouldEmail: audience.email.length, emailsOn };
  await logFor(db, job, actorUserId, "broadcast", { kind: payload.kind, ...(payload.kind === "addendum" ? { number: payload.number } : {}), notified: result.notified, emailed, would_email: result.wouldEmail, emails_on: emailsOn });
  return result;
}

// ── Invites ──────────────────────────────────────────────────────────

/** Invitations this town sent today (Toronto time). */
export async function invitesSentToday(db: Db, organizationId: string, now: Date = new Date()): Promise<number> {
  const { count, error } = await db
    .from("town_invites")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "sent")
    .gte("created_at", dayStartToronto(now));
  return error ? 0 : (count ?? 0);
}

async function invitedTo(db: Db, rfpId: string): Promise<{ orgs: Set<string>; emails: Set<string> }> {
  const { data } = await db.from("town_invites").select("trade_organization_id,email_key").eq("rfp_id", rfpId);
  const rows = (data ?? []) as { trade_organization_id: string | null; email_key: string }[];
  return { orgs: new Set(rows.map((r) => r.trade_organization_id).filter((x): x is string => Boolean(x))), emails: new Set(rows.map((r) => r.email_key)) };
}

export interface InvitePreview {
  /** Matching approved companies in the job's trades and area (before skips). */
  matching: number;
  plan: InvitePlan;
  sentToday: number;
  budget: number;
  enabled: boolean;
}

/**
 * "Invite N matching trades": the approved trades within the job's region
 * (and its rollup) and trades, one person each, minus anyone already
 * invited, unsubscribed or on the do-not-contact list, up to today's limit.
 */
export async function previewTradeInvites(db: Db, job: TownJob, now: Date = new Date()): Promise<InvitePreview> {
  const enabled = townInvitesEnabled();
  const empty: InvitePreview = { matching: 0, plan: { send: [], skipped: { already: 0, unsubscribed: 0, noEmail: 0 }, overLimit: [] }, sentToday: 0, budget: 0, enabled };
  const full = await loadJob(db, job.id);
  if (!full || !job.posted_by_organization_id) return empty;
  const [res, invited, sentToday] = await Promise.all([loadAlertAudience(db, full, { forInvites: true }), invitedTo(db, job.id), invitesSentToday(db, job.posted_by_organization_id, now)]);
  const people = res.people;
  const candidates = res.audience.orgs.map((o) => ({
    orgId: o.id,
    orgName: o.name,
    city: o.city,
    people: (people?.usersByOrg.get(o.id) ?? []).map((userId) => ({ userId, email: people?.users.get(userId)?.email ?? null, status: people?.users.get(userId)?.status ?? null })),
  }));
  const suppressed = await suppressedOf(db, candidates.flatMap((c) => c.people.map((x) => x.email)).filter((e): e is string => Boolean(e)));
  const budget = inviteBudget(sentToday);
  const plan = planTradeInvites({
    candidates,
    alreadyOrgIds: invited.orgs,
    alreadyEmails: invited.emails,
    optedOutUserIds: people?.optedOut ?? new Set(),
    suppressedEmails: suppressed,
    budget,
  });
  return { matching: candidates.length, plan, sentToday, budget, enabled };
}

export type InviteRunState = "sent" | "off" | "blocked";

export interface InviteRunResult {
  state: InviteRunState;
  reason?: "mailing_address" | "unsubscribe" | "no_town";
  /** Invitations that would go out now (with TOWN_INVITES_ENABLED on). */
  wouldSend: number;
  sent: number;
  overLimit: number;
}

/** Send the planned invitations (behind TOWN_INVITES_ENABLED; CASL needs the mailing address). */
export async function sendTradeInvites(db: Db, job: TownJob, actorUserId: string, opts: { enabled?: boolean; now?: Date } = {}): Promise<InviteRunResult> {
  const preview = await previewTradeInvites(db, job, opts.now);
  const wouldSend = preview.plan.send.length;
  const overLimit = preview.plan.overLimit.length;
  const enabled = opts.enabled ?? preview.enabled;
  if (!job.posted_by_organization_id) return { state: "blocked", reason: "no_town", wouldSend, sent: 0, overLimit };
  if (!enabled) {
    await logFor(db, job, actorUserId, "invites_off", { kind: "trade", would_send: wouldSend });
    return { state: "off", wouldSend, sent: 0, overLimit };
  }
  const address = mailingAddress();
  if (!address) return { state: "blocked", reason: "mailing_address", wouldSend, sent: 0, overLimit };
  const base = BASE();
  if (!unsubscribeUrl(base, "check")) return { state: "blocked", reason: "unsubscribe", wouldSend, sent: 0, overLimit };
  const langs = await recipientLangs(db, preview.plan.send.map((t) => t.userId));
  let sent = 0;
  let capped = false;
  for (const t of preview.plan.send) {
    const lang = langs.get(t.userId) ?? "en";
    // Record first: the row (and the daily cap) decides whether this one goes.
    const { error } = await db.from("town_invites").insert({
      rfp_id: job.id,
      organization_id: job.posted_by_organization_id,
      buyer_key: job.buyer_key,
      kind: "trade",
      trade_organization_id: t.orgId,
      user_id: t.userId,
      email_key: t.email,
      lang,
      sent_by: actorUserId,
    });
    if (error) {
      if (isInviteCapError(error)) {
        capped = true;
        break;
      }
      continue;
    }
    const unsub = unsubscribeUrl(base, t.userId)!;
    await sendTownJobEmail(
      t.email,
      tradeInviteEmail(lang, {
        base,
        buyer: job.buyer_name,
        title: job.title,
        slug: job.slug,
        deadline: job.deadline,
        summary: job.summary,
        mirror: job.post_kind === "tender_mirror",
        portal: job.official_portal,
        company: t.orgName,
        unsubscribeUrl: unsub,
        mailingAddress: address,
      }),
      lang,
      "town-invite",
      unsub,
    ).catch(() => undefined);
    await db.from("notifications").insert({
      user_id: t.userId,
      type: "town_invite",
      title: `${job.buyer_name ?? "A town"} invited you to quote`.slice(0, 200),
      message: job.title,
      link_url: `/rfps/${job.slug}`,
    });
    sent++;
  }
  await logFor(db, job, actorUserId, "invites_sent", { kind: "trade", sent, over_limit: overLimit + (capped ? wouldSend - sent : 0), skipped: preview.plan.skipped });
  return { state: "sent", wouldSend, sent, overLimit: overLimit + (capped ? wouldSend - sent : 0) };
}

export type EmailInviteResult =
  | { state: "sent" }
  | { state: "off" }
  | { state: "refused"; reason: "email" | "already" | "unsubscribed" | "limit" | "blocked" };

/**
 * "Invite by email": a contractor who isn't on PMRFP (or is) gets a free
 * sign-up link that returns to the job. Never an address already invited
 * to this job, on the do-not-contact list, or of someone who unsubscribed.
 */
export async function inviteByEmail(db: Db, job: TownJob, actorUserId: string, raw: unknown, lang: EmailLang, opts: { enabled?: boolean; now?: Date } = {}): Promise<EmailInviteResult> {
  const email = cleanInviteEmail(raw);
  if (!email || !job.posted_by_organization_id) return { state: "refused", reason: "email" };
  const [invited, suppressedSet, { data: user }, sentToday] = await Promise.all([
    invitedTo(db, job.id),
    suppressedOf(db, [email]),
    db.from("users_profile").select("id,email,status").ilike("email", email).limit(1).maybeSingle(),
    invitesSentToday(db, job.posted_by_organization_id, opts.now),
  ]);
  const member = user as { id: string; email: string | null; status: string | null } | null;
  let optedOut = false;
  if (member) {
    const { data: pref } = await db.from("notification_preferences").select("user_id,new_rfps,channel_email").eq("user_id", member.id).maybeSingle();
    optedOut = pref ? optedOutUsers([pref as { user_id: string; new_rfps: string | null; channel_email: boolean | null }]).size > 0 : false;
    if (member.status === "suspended" || member.status === "deleted") optedOut = true;
  }
  const refusal = emailInviteDecision({ email, alreadyEmails: invited.emails, suppressed: suppressedSet.has(email), optedOutUser: optedOut, budget: inviteBudget(sentToday) });
  if (refusal) return { state: "refused", reason: refusal };
  if (!(opts.enabled ?? townInvitesEnabled())) {
    await logFor(db, job, actorUserId, "invites_off", { kind: "email", would_send: 1 });
    return { state: "off" };
  }
  const address = mailingAddress();
  const base = BASE();
  if (!address || !unsubscribeUrl(base, "check")) return { state: "refused", reason: "blocked" };
  const { data: row, error } = await db
    .from("town_invites")
    .insert({ rfp_id: job.id, organization_id: job.posted_by_organization_id, buyer_key: job.buyer_key, kind: "email", user_id: member?.id ?? null, email_key: email, lang, sent_by: actorUserId })
    .select("id")
    .maybeSingle();
  if (error || !row) {
    if (isInviteCapError(error)) return { state: "refused", reason: "limit" };
    if (error?.code === "23505") return { state: "refused", reason: "already" };
    return { state: "refused", reason: "blocked" };
  }
  const inviteId = (row as { id: string }).id;
  const unsub = member ? unsubscribeUrl(base, member.id)! : inviteUnsubscribeUrl(base, inviteId)!;
  await sendTownJobEmail(
    email,
    emailInviteEmail(lang, {
      base,
      buyer: job.buyer_name,
      title: job.title,
      slug: job.slug,
      deadline: job.deadline,
      summary: job.summary,
      mirror: job.post_kind === "tender_mirror",
      portal: job.official_portal,
      unsubscribeUrl: unsub,
      mailingAddress: address,
    }),
    lang,
    "town-invite-email",
    unsub,
  ).catch(() => undefined);
  await logFor(db, job, actorUserId, "invite_email_sent", { invite_id: inviteId });
  return { state: "sent" };
}

// ── Admin ────────────────────────────────────────────────────────────

/**
 * PMRFP takes a town's live job off the board (back to the review queue,
 * where it can be published again). The town is told in-app, with the reason.
 * The caller checks the admin role (canUnpublish).
 */
export async function unpublishTownJob(db: Db, rfpId: string, actorUserId: string, reason: string | null): Promise<{ ok: boolean }> {
  const job = await loadTownJob(db, rfpId);
  if (!job || job.status !== "published") return { ok: false };
  const { data, error } = await db
    .from("rfp_posts")
    .update({ status: "pending_review", published_at: null })
    .eq("id", rfpId)
    .eq("status", "published")
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false };
  await logFor(db, job, actorUserId, "unpublished", { reason: reason?.slice(0, 500) ?? null });
  if (job.posted_by_user_id) {
    await db.from("notifications").insert({
      user_id: job.posted_by_user_id,
      type: "town_unpublished",
      title: "PMRFP took your job off the board",
      message: (reason ? `${job.title}: ${reason}` : job.title).slice(0, 500),
      link_url: `/buyer-dashboard/jobs/${job.id}`,
    });
  }
  return { ok: true };
}

// ── The town's dashboard ─────────────────────────────────────────────

export interface TownJobSummary extends TownJob {
  responses: number;
  /** A sealed post's box: quotes in it (a count) and whether it's open. */
  sealedBox?: { received: number; opened: boolean } | null;
  questionsWaiting: number;
  questions: number;
  addenda: number;
  invites: number;
}

/** A town's jobs, newest first, with what's waiting on each. */
export async function townJobsFor(db: Db, organizationId: string): Promise<TownJobSummary[]> {
  const read = (cols: string) =>
    db.from("rfp_posts").select(cols).eq("posted_by_organization_id", organizationId).eq("source_type", TOWN_SOURCE).order("created_at", { ascending: false }).limit(200);
  let { data, error } = await read(TOWN_JOB_COLS);
  if (error) ({ data, error } = await read(TOWN_JOB_BASE_COLS));
  if (error || !data) return [];
  const jobs = data as unknown as TownJob[];
  const ids = jobs.map((j) => j.id);
  if (!ids.length) return [];
  const sealedIds = jobs.filter((j) => j.sealed).map((j) => j.id);
  const [interests, questions, addenda, invites, boxes] = await Promise.all([
    inList<{ rfp_id: string }>(ids, (c) => db.from("rfp_interests").select("rfp_id").in("rfp_id", c)),
    inList<{ rfp_id: string; status: string }>(ids, (c) => db.from("town_job_questions").select("rfp_id,status").in("rfp_id", c)),
    inList<{ rfp_id: string }>(ids, (c) => db.from("town_job_addenda").select("rfp_id").in("rfp_id", c)),
    inList<{ rfp_id: string }>(ids, (c) => db.from("town_invites").select("rfp_id").in("rfp_id", c)),
    sealedIds.length ? sealedCounts(db, sealedIds) : Promise.resolve(new Map<string, { received: number; opened: boolean }>()),
  ]);
  const count = <T extends { rfp_id: string }>(rows: T[], id: string, test: (r: T) => boolean = () => true) => rows.filter((r) => r.rfp_id === id && test(r)).length;
  return jobs
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .map((j) => ({
      ...j,
      responses: j.sealed && !boxes.get(j.id)?.opened ? (boxes.get(j.id)?.received ?? 0) : count(interests, j.id),
      sealedBox: j.sealed ? (boxes.get(j.id) ?? { received: 0, opened: false }) : null,
      questions: count(questions, j.id),
      questionsWaiting: count(questions, j.id, (r) => r.status === "open"),
      addenda: count(addenda, j.id),
      invites: count(invites, j.id),
    }));
}

export interface ManagedQuestion extends QuestionRow {
  /** Who asked (the town sees it; the public never does). */
  askerCompany: string | null;
}

export interface TownJobDetail {
  job: TownJob;
  questions: ManagedQuestion[];
  addenda: AddendumRow[];
  invites: { id: string; kind: string; email_key: string; company: string | null; created_at: string; status: string }[];
  log: { id: number; event: string; detail: Record<string, unknown>; created_at: string }[];
  /** Responses (rfp_interests). A sealed box's quotes are counted in its own state (sealed_box_state) until it opens. */
  responses: number;
}

/** Everything the town's job page shows (questions with who asked, addenda, invites, the record). */
export async function townJobDetail(db: Db, job: TownJob): Promise<TownJobDetail> {
  const [{ data: q }, { data: a }, { data: inv }, { data: log }, { count }] = await Promise.all([
    db.from("town_job_questions").select("id,question,public_question,answer,answered_at,status,asker_user_id,asker_organization_id,created_at").eq("rfp_id", job.id).order("created_at", { ascending: true }),
    db.from("town_job_addenda").select("number,body,official_url,old_deadline,new_deadline,created_at").eq("rfp_id", job.id).order("number", { ascending: true }),
    db.from("town_invites").select("id,kind,email_key,trade_organization_id,created_at,status").eq("rfp_id", job.id).order("created_at", { ascending: false }),
    db.from("town_job_log").select("id,event,detail,created_at").eq("rfp_id", job.id).order("created_at", { ascending: false }).limit(200),
    db.from("rfp_interests").select("id", { count: "exact", head: true }).eq("rfp_id", job.id),
  ]);
  const questions = (q ?? []) as QuestionRow[];
  const invites = (inv ?? []) as { id: string; kind: string; email_key: string; trade_organization_id: string | null; created_at: string; status: string }[];
  const orgIds = [...new Set([...questions.map((x) => x.asker_organization_id), ...invites.map((x) => x.trade_organization_id)].filter((x): x is string => Boolean(x)))];
  const orgs = await inList<{ id: string; name: string }>(orgIds, (c) => db.from("organizations").select("id,name").in("id", c));
  const name = new Map(orgs.map((o) => [o.id, o.name]));
  return {
    job,
    questions: questions.map((x) => ({ ...x, askerCompany: x.asker_organization_id ? (name.get(x.asker_organization_id) ?? null) : null })),
    addenda: ((a ?? []) as AddendumRow[]).sort((x, y) => x.number - y.number),
    invites: invites.map((x) => ({ id: x.id, kind: x.kind, email_key: x.email_key, company: x.trade_organization_id ? (name.get(x.trade_organization_id) ?? null) : null, created_at: x.created_at, status: x.status })),
    log: ((log ?? []) as { id: number; event: string; detail: Record<string, unknown> | null; created_at: string }[]).map((l) => ({ ...l, detail: l.detail ?? {} })),
    responses: count ?? 0,
  };
}

/** The emails' language for a town actor (their page language, else their sign-up language). */
export async function actorLang(db: Db, userId: string, preferred?: string | null): Promise<EmailLang> {
  return emailLang(await langOf(db, userId, preferred));
}
