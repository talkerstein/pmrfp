"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_DATA_TAG } from "@/lib/supabase/public-cache";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { isEnabledLocale } from "@/i18n/config";
import { emailLang } from "@/lib/pm-jobs/email-copy";
import { canManageTownJob, isAdminActor } from "./rules";
import { loadTownJob, type TownJob } from "./server";
import { breakGlass, cancelOpening, confirmOpening, requestOpening, resendWitnessLink, witnessConfirm, type BreakGlassQuote } from "./sealed-server";
import { publishAward, saveRecommendation } from "./results-server";

/**
 * Part C's buttons: the sealed box's opening (ask, confirm, cancel, resend
 * the witness link), the witness's confirmation, the recommendation, the
 * award, and the admin's break-glass. Each checks who's asking, then calls
 * lib/town-jobs (whose database functions check again). Answers with a code;
 * the forms show it in the page's language.
 */
export interface PartCState {
  done?: string;
  error?: string;
  /** Opening requests: who was asked, and whether the emails are on. */
  mode?: "colleague" | "witness";
  emailsOn?: boolean;
  n?: number;
  history?: boolean;
}

type Ctx = { job: TownJob; userId: string; name: string; organizationId: string | null; role: string };

async function context(fd: FormData): Promise<Ctx | { error: string }> {
  if (!isSupabaseConfigured() || !isServiceConfigured()) return { error: "demo" };
  const session = await getSession();
  if (!session) return { error: "signin" };
  const rfpId = String(fd.get("rfpId") ?? "");
  if (!rfpId) return { error: "not_found" };
  const job = await loadTownJob(createServiceClient(), rfpId);
  if (!job) return { error: "not_found" };
  const actor = { userId: session.userId, organizationId: session.organization?.id ?? null, role: session.profile.primary_role };
  if (!canManageTownJob(job, actor)) return { error: "not_owner" };
  return { job, ...actor, name: session.profile.full_name?.trim() || session.profile.email || "" };
}

function refresh(job: TownJob, publicChange = false) {
  revalidatePath(`/buyer-dashboard/jobs/${job.id}`);
  revalidatePath(`/buyer-dashboard/jobs/${job.id}/responses`);
  revalidatePath("/buyer-dashboard/jobs");
  revalidatePath("/buyer-dashboard");
  if (job.slug) revalidatePath(`/rfps/${job.slug}`);
  if (publicChange) revalidateTag(PUBLIC_DATA_TAG, { expire: 0 });
}

const langOfForm = (fd: FormData) => emailLang(isEnabledLocale(fd.get("lang")) ? fd.get("lang") : "en");

/** "Open quotes": step 1 (a colleague confirms, or the named witness). */
export async function requestOpeningAction(_prev: PartCState, fd: FormData): Promise<PartCState> {
  const ctx = await context(fd);
  if ("error" in ctx) return { error: ctx.error };
  const res = await requestOpening(createServiceClient(), { job: ctx.job, actorId: ctx.userId, actorName: ctx.name, witnessName: fd.get("witnessName"), witnessEmail: fd.get("witnessEmail"), lang: langOfForm(fd) });
  if (!res.ok) return { error: res.error };
  refresh(ctx.job);
  return { done: "requested", mode: res.mode, emailsOn: res.emailsOn, n: res.notified };
}

/** Step 2: a second, different member confirms, and the quotes open. */
export async function confirmOpeningAction(_prev: PartCState, fd: FormData): Promise<PartCState> {
  const ctx = await context(fd);
  if ("error" in ctx) return { error: ctx.error };
  const res = await confirmOpening(createServiceClient(), { job: ctx.job, actorId: ctx.userId });
  if (!res.ok) return { error: res.error };
  refresh(ctx.job, true);
  return { done: "opened", n: res.opened };
}

export async function cancelOpeningAction(_prev: PartCState, fd: FormData): Promise<PartCState> {
  const ctx = await context(fd);
  if ("error" in ctx) return { error: ctx.error };
  const res = await cancelOpening(createServiceClient(), { job: ctx.job, actorId: ctx.userId });
  if (!res.ok) return { error: res.error };
  refresh(ctx.job);
  return { done: "cancelled" };
}

export async function resendWitnessAction(_prev: PartCState, fd: FormData): Promise<PartCState> {
  const ctx = await context(fd);
  if ("error" in ctx) return { error: ctx.error };
  const res = await resendWitnessLink(createServiceClient(), { job: ctx.job, actorId: ctx.userId, actorName: ctx.name, lang: langOfForm(fd) });
  if (!res.ok) return { error: res.error };
  refresh(ctx.job);
  return { done: "resent", emailsOn: res.emailsOn };
}

/** The witness's one-time link: no account needed (the link is the credential, checked by its hash). */
export async function witnessConfirmAction(_prev: PartCState, fd: FormData): Promise<PartCState> {
  if (!isSupabaseConfigured() || !isServiceConfigured()) return { error: "demo" };
  const rfpId = String(fd.get("rfpId") ?? "");
  const token = String(fd.get("token") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(rfpId) || !/^[A-Za-z0-9_-]{16,100}$/.test(token)) return { error: "bad_link" };
  const db = createServiceClient();
  const res = await witnessConfirm(db, rfpId, token, fd.get("name"), loadTownJob);
  if (!res.ok) return { error: res.error };
  const job = await loadTownJob(db, rfpId);
  if (job) refresh(job, true);
  return { done: "opened", n: res.opened };
}

/** The town's recommendation and its short reason. */
export async function saveRecommendationAction(_prev: PartCState, fd: FormData): Promise<PartCState> {
  const ctx = await context(fd);
  if ("error" in ctx) return { error: ctx.error };
  const res = await saveRecommendation(createServiceClient(), { job: ctx.job, actorId: ctx.userId, interestId: fd.get("interestId"), rationale: fd.get("rationale") });
  if (!res.ok) return { error: res.error };
  refresh(ctx.job);
  return { done: "saved" };
}

/** "Publish award" (after the pick): the listing shows it, and it joins award history. */
export async function publishAwardAction(_prev: PartCState, fd: FormData): Promise<PartCState> {
  const ctx = await context(fd);
  if ("error" in ctx) return { error: ctx.error };
  const res = await publishAward(createServiceClient(), {
    job: ctx.job,
    actorId: ctx.userId,
    input: { winnerName: fd.get("winnerName"), amount: fd.get("amount"), amountPublic: fd.get("amountPublic"), awardDate: fd.get("awardDate") },
  });
  if (!res.ok) return { error: res.error };
  refresh(ctx.job, true);
  revalidatePath("/rfps");
  return { done: "published", history: res.history };
}

export interface BreakGlassState {
  error?: string;
  quotes?: BreakGlassQuote[];
}

/** Admin break-glass: see a sealed box's quotes early, with a reason (logged in the town's record; the town is told). */
export async function breakGlassAction(_prev: BreakGlassState, fd: FormData): Promise<BreakGlassState> {
  if (!isSupabaseConfigured() || !isServiceConfigured()) return { error: "demo" };
  const session = await getSession();
  if (!session || !isAdminRole(session.profile.primary_role) || !isAdminActor({ role: session.profile.primary_role })) return { error: "not_admin" };
  const rfpId = String(fd.get("rfpId") ?? "");
  const res = await breakGlass(createServiceClient(), rfpId, session.userId, fd.get("reason"));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/buyer-dashboard/jobs/${rfpId}`);
  return { quotes: res.quotes };
}
