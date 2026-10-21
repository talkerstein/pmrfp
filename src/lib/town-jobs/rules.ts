/**
 * PMRFP for Towns, Part B2: the rules for a public buyer's own jobs (pure,
 * unit-tested in test/unit/town-jobs.test.ts). The database side is
 * ./server.ts, the migration 20261021000060_towns_part_b2.sql.
 *
 * A town's job is an rfp_posts row with source_type 'public_buyer_direct'.
 * It rides the PM job flow (lib/pm-jobs): review, same-day alerts, responses,
 * shortlist / decline / pick. What's different:
 *
 *   Kinds        'quote_request': an RFQ below the town's own purchasing
 *                limit. Trades respond on PMRFP. 'tender_mirror': the
 *                official posting lives on another portal (bids&tenders, APC,
 *                MERX…). PMRFP shows the summary and the official link and
 *                takes no responses: bids go to the official portal.
 *   Free         Responding to a public buyer is always free and never one
 *                of the free account's 3 a month. The official link and the
 *                details are never behind the paywall.
 *   Review       A verified public buyer (its organization manages the town's
 *                page) publishes at once. Anyone else waits for PMRFP review,
 *                like a property manager. An admin can unpublish.
 *   Fairness     Questions are asked privately and answered once, for
 *                everyone: the answer is published without the asker's name
 *                and sent to everyone engaged with the job. Addenda are
 *                numbered and timestamped; one that moves the closing date
 *                updates the listing and shows in its change history.
 *   Invites      A town can invite matching trades, or a contractor by
 *                email: behind TOWN_INVITES_ENABLED (default off), at most
 *                INVITE_DAILY_MAX a town per day, never to anyone who
 *                unsubscribed or is on the do-not-contact list.
 *   Emails       Answer and addendum emails go behind TOWN_QA_EMAILS_ENABLED
 *                (default off); in-app notices always.
 */

export const TOWN_SOURCE = "public_buyer_direct" as const;

export const POST_KINDS = ["quote_request", "tender_mirror"] as const;
export type PostKind = (typeof POST_KINDS)[number];

export function parsePostKind(v: unknown): PostKind | null {
  return v === "quote_request" || v === "tender_mirror" ? v : null;
}

export function isTownJob(rfp: { source_type?: string | null } | null | undefined): boolean {
  return rfp?.source_type === TOWN_SOURCE;
}

export function isTownSource(sourceType: string | null | undefined): boolean {
  return sourceType === TOWN_SOURCE;
}

/** A mirror of a formal tender: link and summary only, no responses on PMRFP. */
export function isTenderMirror(rfp: { source_type?: string | null; post_kind?: string | null } | null | undefined): boolean {
  return isTownJob(rfp) && rfp?.post_kind === "tender_mirror";
}

/** Organization types that post as a public buyer. */
export const PUBLIC_BUYER_ORG_TYPES = ["public_buyer"] as const;

// ── Posting ──────────────────────────────────────────────────────────

/**
 * Where a new town post goes: straight to the board when the posting
 * organization manages the town's page (verified), otherwise PMRFP review.
 */
export function townPostStatus(p: { verified: boolean }): "published" | "pending_review" {
  return p.verified ? "published" : "pending_review";
}

/** The label a listing carries ("Posted by the Town of X (verified)" / "Official tender, bid on bids&tenders"). */
export type TownLabel =
  | { kind: "posted"; buyer: string; verified: boolean }
  | { kind: "official"; buyer: string; portal: string | null; url: string };

export function townLabel(p: { buyer_name: string | null; verified: boolean | null; post_kind: string | null; official_url: string | null; official_portal: string | null }): TownLabel {
  const buyer = p.buyer_name?.trim() || "";
  if (p.post_kind === "tender_mirror" && p.official_url) return { kind: "official", buyer, portal: p.official_portal?.trim() || null, url: p.official_url };
  return { kind: "posted", buyer, verified: Boolean(p.verified) };
}

/** What a listing offers a visitor: respond on PMRFP, or go to the official portal (never a response form). */
export function townCta(p: { post_kind: string | null; status: string; deadline: string | null }, today: string = todayToronto()): "respond" | "official" | "closed" {
  if (p.post_kind === "tender_mirror") return "official";
  if (p.status !== "published" || (p.deadline && p.deadline < today)) return "closed";
  return "respond";
}

/** A safe official link: http(s) only, no spaces, at most 500 characters. Null otherwise. */
export function cleanOfficialUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? s : null;
  } catch {
    return null;
  }
}

// ── Dates (Toronto, like the free allowance) ────────────────────────

export const TOWN_TIME_ZONE = "America/Toronto";

/** "2026-10-21": today in Toronto. */
export function todayToronto(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOWN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Minutes `tz` is ahead of UTC at `at` (Toronto: -240 in summer, -300 in winter). */
function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant today began in Toronto, as an ISO string (the invite limit's day). */
export function dayStartToronto(now: Date = new Date()): string {
  const [y, m, d] = todayToronto(now).split("-").map(Number);
  let t = Date.UTC(y, m - 1, d);
  // Midnight local: start from midnight UTC and correct by the offset at that moment (twice, across a DST change).
  for (let i = 0; i < 2; i++) t = Date.UTC(y, m - 1, d) - tzOffsetMinutes(new Date(t), TOWN_TIME_ZONE) * 60_000;
  return new Date(t).toISOString();
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(v: unknown): v is string {
  return typeof v === "string" && ISO_DAY.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

// ── Questions ────────────────────────────────────────────────────────

export type AskRefusal = "signin" | "not_town_job" | "mirror" | "not_open" | "deadline" | "own_job" | null;

/**
 * May this signed-in person ask a question now? Only on a town's quote
 * request that is still open, up to the question deadline (inclusive) and
 * the closing date; never the town itself. Questions on a formal tender go
 * through its official portal.
 */
export function askDecision(p: {
  signedIn: boolean;
  job: { source_type: string | null; post_kind: string | null; status: string; deadline: string | null; question_deadline: string | null; posted_by_user_id: string | null; posted_by_organization_id: string | null };
  userId?: string | null;
  organizationId?: string | null;
  today?: string;
}): AskRefusal {
  if (!p.signedIn) return "signin";
  if (!isTownJob(p.job)) return "not_town_job";
  if (p.job.post_kind === "tender_mirror") return "mirror";
  const today = p.today ?? todayToronto();
  if (p.job.status !== "published" || (p.job.deadline && p.job.deadline < today)) return "not_open";
  if (p.job.question_deadline && p.job.question_deadline < today) return "deadline";
  if ((p.userId && p.job.posted_by_user_id === p.userId) || (p.organizationId && p.job.posted_by_organization_id === p.organizationId)) return "own_job";
  return null;
}

export const QUESTION_MAX = 2000;
export const ANSWER_MAX = 4000;

/** A question as typed → trimmed, or null when too short or too long. */
export function cleanQuestion(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\r\n/g, "\n").trim();
  return s.length >= 5 && s.length <= QUESTION_MAX ? s : null;
}

export function cleanAnswer(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\r\n/g, "\n").trim();
  return s.length >= 2 && s.length <= ANSWER_MAX ? s : null;
}

export interface QuestionRow {
  id: string;
  question: string;
  public_question?: string | null;
  answer?: string | null;
  answered_at?: string | null;
  status: string;
  asker_user_id?: string | null;
  asker_organization_id?: string | null;
  created_at?: string;
}

export interface PublicQa {
  id: string;
  question: string;
  answer: string;
  answeredAt: string;
}

/**
 * The public Q&A: answered questions only, in the town's published wording,
 * oldest first, and nothing about who asked (only these four fields leave).
 */
export function publicQa(rows: readonly QuestionRow[]): PublicQa[] {
  return rows
    .filter((r) => r.status === "answered" && r.answer && r.answered_at)
    .map((r) => ({ id: r.id, question: (r.public_question?.trim() || r.question).trim(), answer: r.answer!.trim(), answeredAt: r.answered_at! }))
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
}

/** Can this question still be answered (once)? */
export function canAnswer(q: Pick<QuestionRow, "status" | "answer">): boolean {
  return q.status === "open" && !q.answer;
}

// ── Addenda and the closing date ─────────────────────────────────────

export interface AddendumRow {
  number: number;
  body: string;
  official_url?: string | null;
  old_deadline?: string | null;
  new_deadline?: string | null;
  created_at: string;
}

export interface DeadlineChange {
  number: number;
  from: string;
  to: string;
  at: string;
}

/** The closing date's change history, oldest first (one entry per addendum that moved it). */
export function deadlineHistory(addenda: readonly AddendumRow[]): DeadlineChange[] {
  return addenda
    .filter((a) => a.old_deadline && a.new_deadline && a.old_deadline !== a.new_deadline)
    .map((a) => ({ number: a.number, from: a.old_deadline!, to: a.new_deadline!, at: a.created_at }))
    .sort((a, b) => a.number - b.number);
}

/** The next addendum's number. */
export function nextAddendumNumber(addenda: readonly Pick<AddendumRow, "number">[]): number {
  return addenda.reduce((m, a) => Math.max(m, a.number), 0) + 1;
}

export type AddendumError = "body" | "url" | "deadline_past" | "deadline_same" | "closed" | null;

export interface AddendumPlan {
  body: string;
  officialUrl: string | null;
  /** Both set when the addendum moves the closing date. */
  oldDeadline: string | null;
  newDeadline: string | null;
  /** The question deadline, pulled back when it would fall after the new closing date. */
  questionDeadline: string | null;
}

/**
 * Check an addendum before it's issued: text (5 to 4,000 characters), an
 * optional http(s) link, and an optional new closing date (today or later,
 * different from the current one). A question deadline after the new
 * closing date moves back to it.
 */
export function planAddendum(
  input: { body: unknown; officialUrl?: unknown; newDeadline?: unknown },
  job: { status: string; deadline: string | null; question_deadline: string | null },
  today: string = todayToronto(),
): { ok: true; plan: AddendumPlan } | { ok: false; error: Exclude<AddendumError, null> } {
  if (job.status !== "published" && job.status !== "closed") return { ok: false, error: "closed" };
  const body = typeof input.body === "string" ? input.body.replace(/\r\n/g, "\n").trim() : "";
  if (body.length < 5 || body.length > 4000) return { ok: false, error: "body" };
  const rawUrl = typeof input.officialUrl === "string" ? input.officialUrl.trim() : "";
  const officialUrl = rawUrl ? cleanOfficialUrl(rawUrl) : null;
  if (rawUrl && !officialUrl) return { ok: false, error: "url" };
  const raw = typeof input.newDeadline === "string" ? input.newDeadline.trim() : "";
  let oldDeadline: string | null = null;
  let newDeadline: string | null = null;
  let questionDeadline = job.question_deadline;
  // Only a live listing's closing date moves (a closed one takes notices only).
  if (raw && job.status !== "published") return { ok: false, error: "closed" };
  if (raw) {
    if (!isIsoDay(raw) || raw < today) return { ok: false, error: "deadline_past" };
    if (raw === job.deadline) return { ok: false, error: "deadline_same" };
    oldDeadline = job.deadline ?? raw;
    newDeadline = raw;
    if (questionDeadline && questionDeadline > raw) questionDeadline = raw;
  }
  return { ok: true, plan: { body, officialUrl, oldDeadline, newDeadline, questionDeadline } };
}

/** A question deadline must fall on or before the closing date (and not in the past). Null clears it. */
export function checkQuestionDeadline(v: unknown, closing: string | null, today: string = todayToronto()): { ok: true; value: string | null } | { ok: false } {
  if (v === "" || v == null) return { ok: true, value: null };
  if (!isIsoDay(v) || v < today || (closing && v > closing)) return { ok: false };
  return { ok: true, value: v };
}

// ── Invites ──────────────────────────────────────────────────────────

/** Most invitations one town sends in a day (Toronto time). Keep in step with the SQL trigger. */
export const INVITE_DAILY_MAX = 50;

export function townInvitesEnabled(env: string | undefined = process.env.TOWN_INVITES_ENABLED): boolean {
  return env === "1" || env === "true";
}

export function townQaEmailsEnabled(env: string | undefined = process.env.TOWN_QA_EMAILS_ENABLED): boolean {
  return env === "1" || env === "true";
}

/** Invitations left today. */
export function inviteBudget(sentToday: number, max: number = INVITE_DAILY_MAX): number {
  return Math.max(0, max - Math.max(0, sentToday));
}

export function emailKey(v: string): string {
  return v.trim().toLowerCase();
}

const EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;

/** An address typed into "Invite by email" → its key, or null. */
export function cleanInviteEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = emailKey(v);
  return s.length >= 6 && s.length <= 254 && EMAIL.test(s) ? s : null;
}

export interface InviteCandidate {
  orgId: string;
  orgName: string;
  city: string | null;
  /** The people at the company, owner first: { userId, email }. */
  people: { userId: string; email: string | null; status?: string | null }[];
}

export interface InviteTarget {
  orgId: string;
  orgName: string;
  city: string | null;
  userId: string;
  email: string;
}

export interface InvitePlan {
  /** Who gets an invitation now, one person a company. */
  send: InviteTarget[];
  /** Matching companies that won't be invited, and why. */
  skipped: { already: number; unsubscribed: number; noEmail: number };
  /** Matching companies past today's limit (they can be invited tomorrow). */
  overLimit: InviteTarget[];
}

/**
 * "Invite N matching trades": one person a matching company (the first who
 * hasn't turned opportunity emails off and isn't on the do-not-contact
 * list), never a company or address already invited to this job, and no
 * more than today's budget.
 */
export function planTradeInvites(p: {
  candidates: readonly InviteCandidate[];
  alreadyOrgIds: ReadonlySet<string>;
  alreadyEmails: ReadonlySet<string>;
  optedOutUserIds: ReadonlySet<string>;
  suppressedEmails: ReadonlySet<string>;
  budget: number;
}): InvitePlan {
  const send: InviteTarget[] = [];
  const overLimit: InviteTarget[] = [];
  const skipped = { already: 0, unsubscribed: 0, noEmail: 0 };
  const seen = new Set<string>();
  for (const c of p.candidates) {
    if (seen.has(c.orgId)) continue;
    seen.add(c.orgId);
    if (p.alreadyOrgIds.has(c.orgId)) {
      skipped.already++;
      continue;
    }
    const reachable = c.people.filter((x) => x.email && x.status !== "suspended" && x.status !== "deleted");
    if (!reachable.length) {
      skipped.noEmail++;
      continue;
    }
    const ok = reachable.find((x) => !p.optedOutUserIds.has(x.userId) && !p.suppressedEmails.has(emailKey(x.email!)) && !p.alreadyEmails.has(emailKey(x.email!)));
    if (!ok) {
      if (reachable.some((x) => p.alreadyEmails.has(emailKey(x.email!)))) skipped.already++;
      else skipped.unsubscribed++;
      continue;
    }
    const target = { orgId: c.orgId, orgName: c.orgName, city: c.city, userId: ok.userId, email: emailKey(ok.email!) };
    if (send.length < p.budget) send.push(target);
    else overLimit.push(target);
  }
  return { send, skipped, overLimit };
}

export type EmailInviteRefusal = "email" | "already" | "unsubscribed" | "limit" | "off" | null;

/** "Invite by email": a valid address, not invited to this job yet, not unsubscribed, within today's budget. */
export function emailInviteDecision(p: {
  email: string | null;
  alreadyEmails: ReadonlySet<string>;
  suppressed: boolean;
  optedOutUser: boolean;
  budget: number;
}): Exclude<EmailInviteRefusal, "off"> {
  if (!p.email) return "email";
  if (p.alreadyEmails.has(p.email)) return "already";
  if (p.suppressed || p.optedOutUser) return "unsubscribed";
  if (p.budget <= 0) return "limit";
  return null;
}

/** The SQL trigger's refusal (P0001 'town invite limit reached'). */
export function isInviteCapError(e: { message?: string | null; hint?: string | null } | null | undefined): boolean {
  if (!e) return false;
  return e.hint === "pmrfp_town_invite_cap" || /town invite limit/i.test(e.message ?? "");
}

// ── Broadcasts (answers and addenda) ─────────────────────────────────

/**
 * Who hears about an answer or an addendum: everyone who responded to the
 * job or asked a question, plus the town's followers (the hook in
 * ./followers), once each, never the town's own people, and (for email)
 * never anyone who turned opportunity emails off or is on the do-not-contact
 * list. Transactional: it goes only to people engaged with this job.
 */
export function broadcastAudience(p: {
  responders: readonly (string | null | undefined)[];
  askers: readonly (string | null | undefined)[];
  followers: readonly string[];
  townUserIds: ReadonlySet<string>;
  users: ReadonlyMap<string, { email: string | null; status?: string | null }>;
  optedOut: ReadonlySet<string>;
  suppressedEmails: ReadonlySet<string>;
}): { notify: string[]; email: { userId: string; email: string }[]; skipped: { optedOut: number; noEmail: number } } {
  const ids = [...new Set([...p.responders, ...p.askers, ...p.followers].filter((x): x is string => Boolean(x)))].filter((id) => !p.townUserIds.has(id));
  const notify: string[] = [];
  const email: { userId: string; email: string }[] = [];
  const skipped = { optedOut: 0, noEmail: 0 };
  for (const id of ids) {
    const u = p.users.get(id);
    if (u?.status === "suspended" || u?.status === "deleted") continue;
    notify.push(id);
    if (!u?.email) {
      skipped.noEmail++;
      continue;
    }
    if (p.optedOut.has(id) || p.suppressedEmails.has(emailKey(u.email))) {
      skipped.optedOut++;
      continue;
    }
    email.push({ userId: id, email: u.email });
  }
  return { notify, email, skipped };
}

// ── Who may do what ──────────────────────────────────────────────────

export interface TownActor {
  userId: string;
  organizationId: string | null;
  role: string;
}

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export function isAdminActor(a: Pick<TownActor, "role">): boolean {
  return ADMIN_ROLES.has(a.role);
}

/**
 * Manage a town's job (answer, issue addenda, set the question deadline,
 * invite): a member of the posting organization, the person who posted it,
 * or a PMRFP admin.
 */
export function canManageTownJob(job: { source_type: string | null; posted_by_user_id: string | null; posted_by_organization_id: string | null }, a: TownActor): boolean {
  if (!isTownJob(job)) return false;
  if (isAdminActor(a)) return true;
  if (job.posted_by_user_id && job.posted_by_user_id === a.userId) return true;
  return Boolean(job.posted_by_organization_id && a.organizationId && job.posted_by_organization_id === a.organizationId);
}

/** Unpublishing a town's job is PMRFP's call: admins only. */
export function canUnpublish(a: Pick<TownActor, "role">): boolean {
  return isAdminActor(a);
}

/** Posting as a town: a public-buyer account in a public-buyer organization that has a page (verified or claimed). */
export function canPostAsTown(p: { role: string; organizationType: string | null; hasPage: boolean }): boolean {
  return p.role === "public_buyer" && p.organizationType === "public_buyer" && p.hasPage;
}

// ── The town's record ────────────────────────────────────────────────

export const LOG_EVENTS = [
  "posted",
  "published",
  "sent_to_review",
  "rejected",
  "unpublished",
  "question_asked",
  "question_answered",
  "addendum_issued",
  "deadline_changed",
  "question_deadline_set",
  "invites_sent",
  "invites_off",
  "invite_email_sent",
  "broadcast",
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];
