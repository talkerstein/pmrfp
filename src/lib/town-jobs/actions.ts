"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_DATA_TAG } from "@/lib/supabase/public-cache";
import { getSession, requireRole } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { isEnabledLocale } from "@/i18n/config";
import { emailLang } from "@/lib/pm-jobs/email-copy";
import { canManageTownJob, canUnpublish } from "./rules";
import { answerQuestion, askQuestion, inviteByEmail, issueAddendum, loadTownJob, sendTradeInvites, setQuestionDeadline, unpublishTownJob, type TownJob } from "./server";

/**
 * A town's job, from its dashboard (/buyer-dashboard/jobs/[id]) and its
 * listing (/rfps/[slug]): ask a question (any signed-in person), answer one,
 * issue an addendum, set the question deadline, invite trades (the town or
 * an admin), and unpublish (admins only). Each checks who's asking, then
 * writes with the service role (lib/town-jobs/server). Answers with a code;
 * the forms show it in the page's language.
 */
export interface TownActionState {
  done?: string;
  error?: string;
  /** Numbers the form shows ("emailed 12", "invites are off: 8 would be sent"). */
  n?: number;
  wouldSend?: number;
  overLimit?: number;
  emailsOn?: boolean;
  /** The addendum's number. */
  num?: number;
}

type Ctx = { job: TownJob; userId: string; organizationId: string | null; role: string };

/** The signed-in person and the town's job, or an error code. `manage`: only its town or an admin. */
async function context(fd: FormData, manage: boolean): Promise<Ctx | { error: string }> {
  if (!isSupabaseConfigured() || !isServiceConfigured()) return { error: "demo" };
  const session = await getSession();
  if (!session) return { error: "signin" };
  const rfpId = String(fd.get("rfpId") ?? "");
  if (!rfpId) return { error: "not_found" };
  const job = await loadTownJob(createServiceClient(), rfpId);
  if (!job) return { error: "not_found" };
  const actor = { userId: session.userId, organizationId: session.organization?.id ?? null, role: session.profile.primary_role };
  if (manage && !canManageTownJob(job, actor)) return { error: "not_owner" };
  return { job, ...actor };
}

function refresh(job: TownJob, publicChange = false) {
  revalidatePath(`/buyer-dashboard/jobs/${job.id}`);
  revalidatePath("/buyer-dashboard/jobs");
  revalidatePath("/buyer-dashboard");
  if (job.slug) revalidatePath(`/rfps/${job.slug}`);
  // A published answer or addendum: the listing's public reads (cached) show it now. Rare, so a purge is fine.
  if (publicChange) revalidateTag(PUBLIC_DATA_TAG, { expire: 0 });
}

const langOfForm = (fd: FormData) => emailLang(isEnabledLocale(fd.get("lang")) ? fd.get("lang") : "en");

/** A signed-in person asks a question privately (a town's quote request, before its question deadline). */
export async function askQuestionAction(_prev: TownActionState, fd: FormData): Promise<TownActionState> {
  const ctx = await context(fd, false);
  if ("error" in ctx) return { error: ctx.error };
  const res = await askQuestion(createServiceClient(), { job: ctx.job, userId: ctx.userId, organizationId: ctx.organizationId, question: fd.get("question"), lang: langOfForm(fd) });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/buyer-dashboard/jobs/${ctx.job.id}`);
  return { done: "asked" };
}

/** The town answers a question once; it's published without the asker and sent to everyone engaged. */
export async function answerQuestionAction(_prev: TownActionState, fd: FormData): Promise<TownActionState> {
  const ctx = await context(fd, true);
  if ("error" in ctx) return { error: ctx.error };
  const res = await answerQuestion(createServiceClient(), {
    job: ctx.job,
    questionId: String(fd.get("questionId") ?? ""),
    answer: fd.get("answer"),
    publicQuestion: fd.get("publicQuestion"),
    actorUserId: ctx.userId,
  });
  if (!res.ok) return { error: res.error };
  refresh(ctx.job, true);
  return { done: "answered", n: res.broadcast.notified, wouldSend: res.broadcast.wouldEmail, emailsOn: res.broadcast.emailsOn };
}

/** The town issues an addendum (and may move the closing date). */
export async function issueAddendumAction(_prev: TownActionState, fd: FormData): Promise<TownActionState> {
  const ctx = await context(fd, true);
  if ("error" in ctx) return { error: ctx.error };
  const res = await issueAddendum(createServiceClient(), {
    job: ctx.job,
    body: fd.get("body"),
    officialUrl: fd.get("officialUrl"),
    newDeadline: fd.get("newDeadline"),
    actorUserId: ctx.userId,
  });
  if (!res.ok) return { error: res.error };
  refresh(ctx.job, true);
  return { done: "issued", num: res.number, n: res.broadcast.notified, wouldSend: res.broadcast.wouldEmail, emailsOn: res.broadcast.emailsOn };
}

/** The town sets (or clears) the last day to ask questions. */
export async function setQuestionDeadlineAction(_prev: TownActionState, fd: FormData): Promise<TownActionState> {
  const ctx = await context(fd, true);
  if ("error" in ctx) return { error: ctx.error };
  const res = await setQuestionDeadline(createServiceClient(), { job: ctx.job, value: String(fd.get("questionDeadline") ?? "").trim(), actorUserId: ctx.userId });
  if (!res.ok) return { error: res.error };
  refresh(ctx.job);
  return { done: "saved" };
}

/** "Invite N matching trades" (behind TOWN_INVITES_ENABLED; off, it says how many would be sent). */
export async function sendTradeInvitesAction(_prev: TownActionState, fd: FormData): Promise<TownActionState> {
  const ctx = await context(fd, true);
  if ("error" in ctx) return { error: ctx.error };
  const res = await sendTradeInvites(createServiceClient(), ctx.job, ctx.userId);
  refresh(ctx.job);
  if (res.state === "off") return { done: "off", wouldSend: res.wouldSend, overLimit: res.overLimit };
  if (res.state === "blocked") return { error: res.reason ?? "blocked", wouldSend: res.wouldSend };
  return { done: "sent", n: res.sent, overLimit: res.overLimit };
}

/** "Invite by email": a contractor who isn't on PMRFP gets a free sign-up link back to the job. */
export async function inviteByEmailAction(_prev: TownActionState, fd: FormData): Promise<TownActionState> {
  const ctx = await context(fd, true);
  if ("error" in ctx) return { error: ctx.error };
  const res = await inviteByEmail(createServiceClient(), ctx.job, ctx.userId, fd.get("email"), langOfForm(fd));
  refresh(ctx.job);
  if (res.state === "off") return { done: "off", wouldSend: 1 };
  if (res.state === "refused") return { error: res.reason };
  return { done: "sent", n: 1 };
}

/** Admin: take a town's live job off the board (back to the review queue). */
export async function unpublishTownJobAction(fd: FormData): Promise<void> {
  const session = await requireRole(["admin", "super_admin"]);
  if (!canUnpublish({ role: session.profile.primary_role })) redirect("/admin/rfps");
  const id = String(fd.get("id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500) || null;
  const res = id && isServiceConfigured() ? await unpublishTownJob(createServiceClient(), id, session.userId, reason) : { ok: false };
  revalidatePath("/rfps");
  revalidatePath("/admin/rfps");
  redirect(`/admin/rfps?${res.ok ? `unpublished=${encodeURIComponent(id)}` : "unpublish=failed"}`);
}
