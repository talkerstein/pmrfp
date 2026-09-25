"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, type SessionContext } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { FREE_JOB_LIMIT, JOB_DAYS, canPostJob, jobSchema, jobSlug } from "./rules";

export interface JobFormState {
  error?: string;
}

type Employer = { session: SessionContext; orgId: string } | { error: string };

/** A signed-in member of an approved company (any kind: trade, supplier, PM, GC). */
async function employer(): Promise<Employer> {
  const session = await getSession();
  if (!session) return { error: "Sign in to post a job." };
  const org = session.organization;
  if (!org) return { error: "Finish setting up your company profile first." };
  if (org.profile_status !== "approved" || org.status !== "active") {
    return { error: "Your company profile needs to be approved before you can post jobs." };
  }
  if (!isServiceConfigured()) return { error: "This isn't available right now." };
  return { session, orgId: org.id };
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function createJobAction(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const e = await employer();
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
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;

  const admin = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
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
    return {
      error: `Free accounts can have ${FREE_JOB_LIMIT} open jobs at a time. Close one, or upgrade to Trade Pro for unlimited job posts.`,
    };
  }
  if (!cat) return { error: "Pick the trade." };
  if (!reg) return { error: "Pick the region." };

  const slug = jobSlug(d.title, d.city);
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
    return { error: /job_posts/.test(error.message) ? "Job posting is switching on. Try again in a few minutes." : "Could not post the job. Please try again." };
  }
  revalidatePath("/jobs");
  revalidatePath("/jobs/manage");
  redirect(`/jobs/manage?posted=${slug}`);
}

/** Close a job (stop applications) or renew it for another 30 days. */
export async function setJobStatusAction(jobId: string, action: "close" | "renew"): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(jobId).success) return { error: "Unknown job." };
  const e = await employer();
  if ("error" in e) return { error: e.error };
  const admin = createServiceClient();
  const { data: job } = await admin
    .from("job_posts")
    .select("slug,organization_id,status")
    .eq("id", jobId)
    .maybeSingle<{ slug: string; organization_id: string; status: string }>();
  if (!job || job.organization_id !== e.orgId) return { error: "That job isn't yours." };

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
      return { error: `Free accounts can have ${FREE_JOB_LIMIT} open jobs at a time. Close one first, or upgrade to Trade Pro.` };
    }
  }
  const { error } = await admin
    .from("job_posts")
    .update(action === "close" ? { status: "closed" } : { status: "open", expires_at: addDays(JOB_DAYS) })
    .eq("id", jobId);
  if (error) return { error: "Could not update the job." };
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${job.slug}`);
  revalidatePath("/jobs/manage");
  return {};
}
