"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, type SessionContext } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createVpsJob, updateVpsJob } from "@/lib/d1/vps-jobs";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { upsertGhlContact } from "@/lib/ghl/client";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { JOB_DAYS, JOB_MESSAGES, canPostJob, jobSchema, jobSlug, localMessage } from "./rules";

export interface JobFormState {
  error?: string;
}

type Employer = { session: SessionContext; orgId: string } | { error: string };

/**
 * The language of the form or button that called (a hidden "lang" input, or
 * an argument, from useLang()). Missing or unknown: English, exactly as before.
 */
function langOf(v: unknown): Locale {
  return isEnabledLocale(v) ? v : DEFAULT_LOCALE;
}

/** The messages returned to the form, in its language (English is JOB_MESSAGES). */
function messages(lang: Locale) {
  return getDictionary(lang).jobsClient.errors.jobs;
}

/** A signed-in member of an approved company (any kind: trade, supplier, PM, GC). */
async function employer(lang: Locale): Promise<Employer> {
  const m = messages(lang);
  const session = await getSession();
  if (!session) return { error: m.signInToPost };
  const org = session.organization;
  if (!org) return { error: m.finishProfile };
  if (org.profile_status !== "approved" || org.status !== "active") {
    return { error: m.needsApproval };
  }
  if (!isVpsLiveCustomerAuth() && !isServiceConfigured()) return { error: m.unavailable };
  return { session, orgId: org.id };
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function createJobAction(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const lang = langOf(formData.get("lang"));
  const m = messages(lang);
  const e = await employer(lang);
  if ("error" in e) return { error: e.error };
  const num = (k: string) => {
    const v = formData.get(k)?.toString().trim();
    return v ? v : undefined;
  };
  const parsed = jobSchema.safeParse({
    title: formData.get("title") ?? "",
    category: formData.get("category") ?? "",
    region: formData.get("region") ?? "",
    city: formData.get("city") ?? "",
    employmentType: formData.get("employmentType") ?? "",
    payMin: num("payMin"),
    payMax: num("payMax"),
    payUnit: num("payUnit"),
    description: formData.get("description") ?? "",
    requirements: formData.get("requirements")?.toString() || undefined,
  });
  if (!parsed.success) return { error: localMessage(parsed.error.issues[0]?.message, lang, JOB_MESSAGES, m, m.checkForm) };
  const d = parsed.data;
  const slug = jobSlug(d.title, d.city);
  const today = new Date().toISOString().slice(0, 10);
  if (isVpsLiveCustomerAuth()) {
    const result = await createVpsJob({ orgId: e.orgId, userId: e.session.userId, pro: e.session.hasTradeAccess },
      d, slug, today, addDays(JOB_DAYS)).catch(() => "couldNotPost" as const);
    if (result !== "posted") return { error: m[result] };
  } else {
    const error = await createLegacyJob(e, d, slug, today, m);
    if (error) return { error };
  }

  // CRM: employers hiring, by trade. Never blocks the post.
  const [firstName, ...rest] = (e.session.profile.full_name ?? "").trim().split(/\s+/);
  await Promise.allSettled([
    upsertGhlContact({
      email: e.session.profile.email,
      firstName: firstName || undefined,
      lastName: rest.join(" ") || undefined,
      tags: ["pmrfp-employer", `pmrfp-hiring-${d.category}`],
      customFields: { pmrfp_org_id: e.orgId, pmrfp_org_name: e.session.organization?.name ?? "" },
    }),
  ]);
  revalidatePath("/jobs");
  revalidatePath("/jobs/manage");
  redirect(localizePath(`/jobs/manage?posted=${slug}`, lang));
}

async function createLegacyJob(
  e: Extract<Employer, { orgId: string }>, d: z.infer<typeof jobSchema>, slug: string, today: string, m: ReturnType<typeof messages>,
) {
  const admin = createServiceClient();
  const [{ count }, { data: cat }, { data: reg }] = await Promise.all([
    admin
      .from("job_posts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", e.orgId)
      .eq("status", "open")
      .gte("expires_at", today),
    admin.from("trade_categories").select("id").eq("slug", d.category).maybeSingle<{ id: string }>(),
    admin.from("regions").select("id").eq("slug", d.region).maybeSingle<{ id: string }>(),
  ]);
  if (!canPostJob(count ?? 0, e.session.hasTradeAccess)) {
    return m.freeLimitPost;
  }
  if (!cat) return m.pickTrade;
  if (!reg) return m.pickRegion;

  const { error } = await admin.from("job_posts").insert({
    slug,
    organization_id: e.orgId,
    posted_by: e.session.userId,
    title: d.title,
    category_id: cat.id,
    region_id: reg.id,
    city: d.city,
    employment_type: d.employmentType,
    pay_min: d.payMin ?? null,
    pay_max: d.payMax ?? null,
    pay_unit: d.payMin != null || d.payMax != null ? d.payUnit ?? "hour" : null,
    description: d.description,
    requirements: d.requirements || null,
    expires_at: addDays(JOB_DAYS),
  });
  if (error) {
    return /job_posts/.test(error.message) ? m.switchingOn : m.couldNotPost;
  }
}

/** Close a job (stop applications) or renew it for another 30 days. `lang`: the caller's, for the messages. */
export async function setJobStatusAction(jobId: string, action: "close" | "renew", lang?: string): Promise<{ error?: string }> {
  const l = langOf(lang);
  const m = messages(l);
  if (!z.uuid().safeParse(jobId).success) return { error: m.unknownJob };
  if (action !== "close" && action !== "renew") return { error: m.couldNotUpdate };
  const e = await employer(l);
  if ("error" in e) return { error: e.error };
  if (isVpsLiveCustomerAuth()) {
    const result = await updateVpsJob({ orgId: e.orgId, userId: e.session.userId, pro: e.session.hasTradeAccess },
      jobId, action, new Date().toISOString().slice(0, 10), addDays(JOB_DAYS))
      .catch(() => ({ error: "couldNotUpdate" as const }));
    if (result.error) return { error: m[result.error] };
    refreshJob(result.slug);
    return {};
  }
  const admin = createServiceClient();
  const { data: job } = await admin
    .from("job_posts")
    .select("slug,organization_id,status")
    .eq("id", jobId)
    .maybeSingle<{ slug: string; organization_id: string; status: string }>();
  if (!job || job.organization_id !== e.orgId) return { error: m.notYours };

  if (action === "renew") {
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await admin
      .from("job_posts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", e.orgId)
      .eq("status", "open")
      .gte("expires_at", today)
      .neq("id", jobId);
    if (!canPostJob(count ?? 0, e.session.hasTradeAccess)) {
      return { error: m.freeLimitRenew };
    }
  }
  const { error } = await admin
    .from("job_posts")
    .update(action === "close" ? { status: "closed" } : { status: "open", expires_at: addDays(JOB_DAYS) })
    .eq("id", jobId);
  if (error) return { error: m.couldNotUpdate };
  refreshJob(job.slug);
  return {};
}

function refreshJob(slug: string) {
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${slug}`);
  revalidatePath("/jobs/manage");
}
