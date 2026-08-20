"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession, requireRole } from "@/lib/access/access";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "project";
}

// Substance floors: a case study with a two-line "challenge" is a testimonial,
// not a case study — it wouldn't help the trade×city pages or read as citable
// evidence to an answer engine. The form's helper text sets the expectation.
const caseStudySchema = z.object({
  title: z.string().min(10, "Give the project a descriptive title (10+ characters)"),
  categorySlug: z.string().optional(),
  regionSlug: z.string().optional(),
  propertyType: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  province: z.string().max(80).optional(),
  challenge: z.string().min(80, "Describe the challenge in at least a few sentences (80+ characters)"),
  approach: z.string().min(80, "Describe your approach in at least a few sentences (80+ characters)"),
  outcome: z.string().min(80, "Describe the outcome in at least a few sentences (80+ characters)"),
  timeline: z.string().max(120).optional(),
  budgetBand: z.string().max(60).optional(),
});

export async function submitCaseStudyAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/dashboard?cs=demo");
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!session.organization) redirect("/onboarding");

  const parsed = caseStudySchema.safeParse({
    title: formData.get("title"),
    categorySlug: formData.get("categorySlug") || undefined,
    regionSlug: formData.get("regionSlug") || undefined,
    propertyType: formData.get("propertyType") || undefined,
    city: formData.get("city") || undefined,
    province: formData.get("province") || undefined,
    challenge: formData.get("challenge"),
    approach: formData.get("approach"),
    outcome: formData.get("outcome"),
    timeline: formData.get("timeline") || undefined,
    budgetBand: formData.get("budgetBand") || undefined,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Please complete the required fields.";
    redirect(`/dashboard/case-studies/new?error=${encodeURIComponent(msg)}`);
  }
  const d = parsed.data;

  const supabase = await createClient();
  const [{ data: cat }, { data: reg }] = await Promise.all([
    d.categorySlug
      ? supabase.from("trade_categories").select("id").eq("slug", d.categorySlug).maybeSingle()
      : Promise.resolve({ data: null }),
    d.regionSlug
      ? supabase.from("regions").select("id").eq("slug", d.regionSlug).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { error } = await supabase.from("case_studies").insert({
    organization_id: session.organization.id,
    submitted_by_user_id: session.userId,
    title: d.title,
    slug: `${slugify(d.title)}-${Math.random().toString(36).slice(2, 6)}`,
    category_id: cat?.id ?? null,
    region_id: reg?.id ?? null,
    property_type: d.propertyType ?? null,
    city: d.city ?? null,
    province: d.province ?? null,
    challenge: d.challenge,
    approach: d.approach,
    outcome: d.outcome,
    timeline: d.timeline ?? null,
    budget_band: d.budgetBand ?? null,
    status: "pending_review",
  });
  if (error) redirect(`/dashboard/case-studies/new?error=${encodeURIComponent("Could not save — please try again.")}`);
  redirect("/dashboard?cs=submitted");
}

/** Admin: publish or reject a pending study. */
export async function reviewCaseStudyAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !["published", "rejected"].includes(decision)) redirect("/admin/case-studies");

  const supabase = await createClient();
  await supabase
    .from("case_studies")
    .update({
      status: decision,
      published_at: decision === "published" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  revalidatePath("/case-studies");
  revalidatePath("/admin/case-studies");
  redirect("/admin/case-studies");
}
