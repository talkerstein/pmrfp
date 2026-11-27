import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import {
  adjustNativeSealedOpening, breakNativeSealedGlass, confirmNativeSealedOpening, confirmNativeWitness,
  loadNativeSealedPost, nativeSealedTownMembers, notifyNativeOpened, readNativeOwnQuote,
  readNativeSealedState, readNativeWitness, requestNativeSealedOpening, submitNativeSealedQuote,
  withdrawNativeSealedQuote, writeNativeTownNotifications,
} from "./native-sealed";
import { sendTownJobEmail } from "@/lib/email/send";
import { emailLang, type EmailLang } from "@/lib/pm-jobs/email-copy";
import { langOf, recipientLangs } from "@/lib/pm-jobs/server";
import { colleagueOpeningEmail, sealedReceiptEmail, witnessEmail } from "./sealed-email-copy";
import { cleanWitnessName, sealedAnswer, townSealedEmailsEnabled, townTimeZone, witnessPath, type OwnSealedQuote, type SealedError, type SealedState } from "./sealed";
import type { TownJob } from "./server";

/**
 * Sealed quote workflows shared by the VPS and the legacy backend. The
 * database rechecks the actor and opening state for each protected operation.
 * Only the bidder's own quote or an explicitly audited admin request can
 * reveal quote contents before opening. In-app notices follow successful
 * changes, and email delivery respects TOWN_SEALED_EMAILS_ENABLED.
 */

type Db = SupabaseClient | null;

const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

type Answer<T extends object = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: SealedError };

async function rpc<T extends object>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Answer<T>> {
  try {
    const { data, error } = await db.rpc(fn, args);
    if (error) console.error(`[sealed] ${fn} failed`, error.message);
    return sealedAnswer<T>(data, error);
  } catch (e) {
    console.error(`[sealed] ${fn} failed`, e instanceof Error ? e.message : e);
    return { ok: false, error: "failed" };
  }
}

// ── Reads ────────────────────────────────────────────────────────────

/** The town's (or an admin's) view of a sealed post: counts and the opening, never a quote. Null when not sealed or not theirs. */
export async function sealedStateFor(db: Db, rfpId: string, actorId: string): Promise<SealedState | null> {
  if (!db) return readNativeSealedState(rfpId, actorId).catch(() => null);
  const { data, error } = await db.rpc("sealed_box_state", { p_rfp: rfpId, p_actor: actorId });
  if (error || !data) return null;
  return data as SealedState;
}

/** Quotes in the box per post (counts only), and whether each box is open. */
export async function sealedCounts(db: Db, rfpIds: readonly string[]): Promise<Map<string, { received: number; opened: boolean }>> {
  const out = new Map<string, { received: number; opened: boolean }>();
  if (!db || !rfpIds.length) return out;
  const { data, error } = await db.rpc("sealed_counts", { p_rfps: [...new Set(rfpIds)] });
  if (error || !Array.isArray(data)) return out;
  for (const r of data as { rfp_id: string; received: number; opened: boolean }[]) out.set(r.rfp_id, { received: Number(r.received) || 0, opened: Boolean(r.opened) });
  return out;
}

/** A trade's own quote on a sealed post (its company's), or null. */
export async function ownSealedQuote(db: Db, rfpId: string, actorId: string, orgId: string): Promise<OwnSealedQuote | null> {
  if (!db) return readNativeOwnQuote(rfpId, actorId, orgId).catch(() => null);
  const { data, error } = await db.rpc("sealed_quote_own", { p_rfp: rfpId, p_actor: actorId, p_org: orgId });
  if (error || !data) return null;
  return data as OwnSealedQuote;
}

/** The people to tell about an answer or addendum while the box is sealed (ids only, never shown). */
export async function sealedResponderIds(db: Db, rfpId: string): Promise<string[]> {
  if (!db) {
    const rows = await vpsAppDatabase().prepare(`SELECT DISTINCT submitted_by_user_id FROM _town_sealed_quotes
      WHERE rfp_id=? AND status='active' AND submitted_by_user_id IS NOT NULL`).bind(rfpId).all<{ submitted_by_user_id: string }>();
    return rows.results.map((row) => row.submitted_by_user_id);
  }
  const { data, error } = await db.rpc("sealed_responder_ids", { p_rfp: rfpId });
  return error || !Array.isArray(data) ? [] : (data as string[]);
}

// ── A trade's quote ──────────────────────────────────────────────────

export interface SealedQuoteInput {
  message: string;
  relevantExperience?: string | null;
  availability?: string | null;
  amount: number | null;
  kind: "estimate" | "firm" | null;
  notes: string | null;
  startDate: string | null;
  caseStudyIds?: string[];
  lang: EmailLang;
}

interface Who {
  userId: string;
  orgId: string;
  email: string | null;
}

/** Send or replace a sealed quote (until closing). The town hears "a quote arrived", never from whom. */
export async function submitSealedQuote(db: Db, job: TownJob, who: Who, q: SealedQuoteInput): Promise<Answer<{ id: string; action: "received" | "replaced"; version: number; closes_at: string }>> {
  const res = !db
    ? await submitNativeSealedQuote(job, who.userId, who.orgId, q).catch(() => ({ ok:false, error:"failed" } as const))
    : await rpc<{ id: string; action: "received" | "replaced"; version: number; closes_at: string }>(db, "sealed_quote_submit", {
    p_rfp: job.id,
    p_actor: who.userId,
    p_org: who.orgId,
    p_message: q.message,
    p_experience: q.relevantExperience ?? null,
    p_availability: q.availability ?? null,
    p_amount: q.amount,
    p_kind: q.amount == null ? null : q.kind,
    p_notes: q.notes,
    p_start: q.startDate,
    p_case_study_ids: q.caseStudyIds ?? [],
    p_lang: q.lang,
  });
  if (!res.ok) return res;
  await afterQuoteChange(db, job, who, res.action, q.lang, res.closes_at);
  return res;
}

/** Withdraw a sealed quote before closing: its contents are erased (returned unopened). */
export async function withdrawSealedQuote(db: Db, job: TownJob, who: Who, lang: EmailLang): Promise<Answer<{ id: string }>> {
  const res = !db
    ? await withdrawNativeSealedQuote(job, who.userId, who.orgId).catch(() => ({ ok:false, error:"failed" } as const))
    : await rpc<{ id: string }>(db, "sealed_quote_withdraw", { p_rfp: job.id, p_actor: who.userId, p_org: who.orgId });
  if (res.ok) await afterQuoteChange(db, job, who, "withdrawn", lang, null);
  return res;
}

async function afterQuoteChange(db: Db, job: TownJob, who: Who, kind: "received" | "replaced" | "withdrawn", lang: EmailLang, closesAt: string | null): Promise<void> {
  const rows = [{
    user_id: who.userId,
    type: `sealed_quote_${kind}`,
    title: kind === "received" ? "Your sealed quote is in" : kind === "replaced" ? "Your sealed quote was replaced" : "Your sealed quote was withdrawn",
    message: job.title,
    link_url: `/rfps/${job.slug}#sealed-quote`,
  }];
  // The town sees an updated count and no bidder identity or price.
  if (job.posted_by_user_id && kind !== "replaced") {
    rows.push({
      user_id: job.posted_by_user_id,
      type: kind === "received" ? "sealed_quote_in" : "sealed_quote_out",
      title: kind === "received" ? "A sealed quote arrived" : "A sealed quote was withdrawn",
      message: job.title,
      link_url: `/buyer-dashboard/jobs/${job.id}#sealed`,
    });
  }
  const tasks: PromiseLike<unknown>[] = [db ? db.from("notifications").insert(rows) : writeNativeTownNotifications(rows)];
  if (townSealedEmailsEnabled() && who.email) {
    const tz = townTimeZone(job.buyer_key);
    tasks.push(
      sendTownJobEmail(who.email, sealedReceiptEmail(lang, { base: BASE(), buyer: job.buyer_name, title: job.title, timeZone: tz, kind, slug: job.slug, at: new Date().toISOString(), closesAt }), lang, `sealed-${kind}`).catch(() => undefined),
    );
  }
  await Promise.allSettled(tasks);
}

// ── Opening ──────────────────────────────────────────────────────────

/** A one-time witness link: the token goes in the email, only its SHA-256 goes to the database. */
export function newWitnessToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: createHash("sha256").update(token, "utf8").digest("hex") };
}

export interface OpeningRequestResult {
  mode: "colleague" | "witness";
  expiresAt: string;
  /** Emails on (TOWN_SEALED_EMAILS_ENABLED): the witness or colleagues were emailed. */
  emailsOn: boolean;
  /** People told in-app (colleague mode). */
  notified: number;
}

async function townMembers(db: SupabaseClient, orgId: string | null): Promise<{ id: string; email: string | null; full_name: string | null; status: string | null }[]> {
  if (!orgId) return [];
  const { data } = await db.from("organization_members").select("user_id").eq("organization_id", orgId);
  const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: people } = await db.from("users_profile").select("id,email,full_name,status").in("id", ids);
  return ((people ?? []) as { id: string; email: string | null; full_name: string | null; status: string | null }[]).filter((p) => p.status !== "suspended" && p.status !== "deleted");
}

/**
 * "Open quotes" (step 1, after closing). A town of two or more: the others
 * are asked to confirm (in-app; email behind the flag). A one-person town
 * names a witness, who gets a one-time link (email behind the flag).
 */
export async function requestOpening(
  db: Db,
  p: { job: TownJob; actorId: string; actorName: string; witnessName?: unknown; witnessEmail?: unknown; lang: EmailLang },
): Promise<Answer<OpeningRequestResult>> {
  const witnessGiven = Boolean((typeof p.witnessEmail === "string" && p.witnessEmail.trim()) || (typeof p.witnessName === "string" && p.witnessName.trim()));
  const name = witnessGiven ? cleanWitnessName(p.witnessName) : null;
  if (witnessGiven && !name) return { ok: false, error: "witness_name" };
  const link = witnessGiven ? newWitnessToken() : null;
  const res = !db
    ? await requestNativeSealedOpening(p.job, p.actorId, { name, email:p.witnessEmail, hash: link?.hash ?? null }).catch(() => ({ok:false,error:"failed"} as const))
    : await rpc<{ expires_at: string; witness: boolean; members: number }>(db, "sealed_open_request", {
    p_rfp: p.job.id,
    p_actor: p.actorId,
    p_witness_name: name,
    p_witness_email: witnessGiven ? String(p.witnessEmail ?? "") : null,
    p_token_hash: link?.hash ?? null,
  });
  if (!res.ok) return res;
  const emailsOn = townSealedEmailsEnabled();
  const tz = townTimeZone(p.job.buyer_key);
  if (res.witness && link) {
    if (emailsOn) await emailWitness(db, p.job, { token: link.token, actorName: p.actorName, lang: p.lang, expiresAt: res.expires_at, to: String(p.witnessEmail ?? "").trim().toLowerCase() });
    return { ok: true, mode: "witness", expiresAt: res.expires_at, emailsOn, notified: 0 };
  }
  const others = (db ? await townMembers(db, p.job.posted_by_organization_id) : await nativeSealedTownMembers(p.job.id)).filter((m) => m.id !== p.actorId);
  if (others.length) {
    const rows = others.map((m) => ({
      user_id: m.id,
      type: "sealed_open_requested",
      title: `${p.actorName} asked to open the sealed quotes`.slice(0, 200),
      message: p.job.title,
      link_url: `/buyer-dashboard/jobs/${p.job.id}#sealed`,
    }));
    if (db) await db.from("notifications").insert(rows);
    else await writeNativeTownNotifications(rows);
    if (emailsOn) {
      const langs = await recipientLangs(db ?? vpsAppDatabase(), others.map((m) => m.id));
      for (const m of others) {
        if (!m.email) continue;
        const lang = langs.get(m.id) ?? p.lang;
        await sendTownJobEmail(m.email, colleagueOpeningEmail(lang, { base: BASE(), buyer: p.job.buyer_name, title: p.job.title, timeZone: tz, who: p.actorName, rfpId: p.job.id, expiresAt: res.expires_at }), lang, "sealed-confirm").catch(() => undefined);
      }
    }
  }
  return { ok: true, mode: "colleague", expiresAt: res.expires_at, emailsOn, notified: others.length };
}

async function emailWitness(db: Db, job: TownJob, x: { token: string; actorName: string; lang: EmailLang; expiresAt: string; to: string }): Promise<void> {
  if (!x.to) return;
  const info = await witnessInfo(db, job.id, x.token);
  await sendTownJobEmail(
    x.to,
    witnessEmail(x.lang, {
      base: BASE(),
      buyer: job.buyer_name,
      title: job.title,
      timeZone: townTimeZone(job.buyer_key),
      who: x.actorName,
      rfpId: job.id,
      path: witnessPath(job.id, x.token),
      received: info.ok ? info.received : 0,
      closesAt: info.ok ? info.closes_at : null,
      expiresAt: x.expiresAt,
    }),
    x.lang,
    "sealed-witness",
  ).catch(() => undefined);
}

/** A fresh one-time link for the same witness (the old one stops working). Email behind the flag. */
export async function resendWitnessLink(db: Db, p: { job: TownJob; actorId: string; actorName: string; lang: EmailLang }): Promise<Answer<{ emailsOn: boolean }>> {
  const link = newWitnessToken();
  const res = !db
    ? await adjustNativeSealedOpening(p.job.id, p.actorId, link.hash).catch(() => ({ok:false,error:"failed"} as const))
    : await rpc<{ witness_email: string; witness_name: string; expires_at: string }>(db, "sealed_open_witness_relink", { p_rfp: p.job.id, p_actor: p.actorId, p_token_hash: link.hash });
  if (!res.ok) return res;
  const emailsOn = townSealedEmailsEnabled();
  if (emailsOn) await emailWitness(db, p.job, { token: link.token, actorName: p.actorName, lang: p.lang, expiresAt: res.expires_at, to: res.witness_email });
  return { ok: true, emailsOn };
}

/** Step 2: a different member of the town confirms, and the box opens. */
export async function confirmOpening(db: Db, p: { job: TownJob; actorId: string }): Promise<Answer<{ opened: number }>> {
  const res = !db
    ? await confirmNativeSealedOpening(p.job.id, p.actorId).catch(() => ({ok:false,error:"failed"} as const))
    : await rpc<{ opened: number }>(db, "sealed_open_confirm", { p_rfp: p.job.id, p_actor: p.actorId });
  if (res.ok && db) await afterOpening(db, p.job);
  else if (res.ok) await notifyNativeOpened(p.job).catch(() => undefined);
  return res;
}

/** Any member cancels a pending request. */
export async function cancelOpening(db: Db, p: { job: TownJob; actorId: string }): Promise<Answer> {
  if (!db) return adjustNativeSealedOpening(p.job.id, p.actorId, null).catch(() => ({ok:false,error:"failed"} as const));
  return rpc(db, "sealed_open_cancel", { p_rfp: p.job.id, p_actor: p.actorId });
}

/** The witness page: what they're confirming (counts only), when the link is good. */
export async function witnessInfo(db: Db, rfpId: string, token: string): Promise<Answer<{ title: string; buyer_name: string | null; closes_at: string | null; received: number; requested_by_name: string | null; requested_at: string; expires_at: string; witness_name: string | null }>> {
  if (!db) return readNativeWitness(rfpId, token).catch(() => ({ok:false,error:"failed"} as const));
  return rpc(db, "sealed_witness_info", { p_rfp: rfpId, p_token: token });
}

/** The witness confirms (single use), and the box opens. */
export async function witnessConfirm(db: Db, rfpId: string, token: string, name: unknown, loadJob: (db: SupabaseClient, id: string) => Promise<TownJob | null>): Promise<Answer<{ opened: number }>> {
  const typed = cleanWitnessName(name);
  if (!typed) return { ok: false, error: "witness_name" };
  if (!db) {
    const res = await confirmNativeWitness(rfpId, token, typed).catch(() => ({ok:false,error:"failed"} as const));
    if (res.ok) {
      const job = await loadNativeSealedPost(rfpId).catch(() => null);
      if (job) await notifyNativeOpened(job).catch(() => undefined);
    }
    return res;
  }
  const res = await rpc<{ opened: number }>(db, "sealed_open_witness", { p_rfp: rfpId, p_token: token, p_name: typed });
  if (res.ok) {
    const job = await loadJob(db, rfpId);
    if (job) await afterOpening(db, job);
  }
  return res;
}

/** After opening: the town and every trade that quoted are told (in-app). */
async function afterOpening(db: SupabaseClient, job: TownJob): Promise<void> {
  const [members, { data: interests }] = await Promise.all([townMembers(db, job.posted_by_organization_id), db.from("rfp_interests").select("submitted_by_user_id").eq("rfp_id", job.id)]);
  const traders = [...new Set(((interests ?? []) as { submitted_by_user_id: string | null }[]).map((r) => r.submitted_by_user_id).filter((x): x is string => Boolean(x)))];
  const rows = [
    ...members.map((m) => ({ user_id: m.id, type: "sealed_opened", title: "The sealed quotes are open", message: job.title, link_url: `/buyer-dashboard/jobs/${job.id}#results` })),
    ...traders.map((id) => ({ user_id: id, type: "sealed_opened_trade", title: "The town opened the sealed quotes", message: job.title, link_url: "/dashboard/interests" })),
  ];
  if (rows.length) await db.from("notifications").insert(rows);
}

// ── Admin ────────────────────────────────────────────────────────────

export interface BreakGlassQuote {
  quote: string;
  status: string;
  company: string | null;
  organization_id: string;
  quote_amount: number | null;
  quote_kind: string | null;
  start_date: string | null;
  quote_notes: string | null;
  message: string | null;
  version: number;
  updated_at: string;
}

/** Break-glass: an admin looks inside before opening, with a reason. Logged in the town's record; the town is told. */
export async function breakGlass(db: Db, rfpId: string, adminId: string, reason: unknown): Promise<Answer<{ quotes: BreakGlassQuote[]; count: number }>> {
  if (!db) return breakNativeSealedGlass(rfpId, adminId, reason).catch(() => ({ok:false,error:"failed"} as const));
  return rpc(db, "sealed_break_glass", { p_rfp: rfpId, p_actor: adminId, p_reason: typeof reason === "string" ? reason : "" });
}

/** The language for a town actor's emails. */
export async function sealedActorLang(db: Db, userId: string, preferred?: string | null): Promise<EmailLang> {
  if (!db) return preferred ? emailLang(preferred) : (await recipientLangs(vpsAppDatabase(), [userId])).get(userId) ?? "en";
  return emailLang(await langOf(db, userId, preferred));
}
