"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession } from "@/lib/access/access";
import { companyProfileSchema, rfpPostSchema } from "@/lib/validations";
import { sendAdminNewRfp } from "@/lib/email/send";
import type { ActionState } from "@/lib/auth/actions";

const DEMO = "Demo mode: connect a Supabase project to save changes.";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "rfp";
}

function completion(fields: Record<string, unknown>, cats: number, regs: number): number {
  const checks = [
    Boolean(fields.shortDescription),
    Boolean(fields.fullDescription),
    Boolean(fields.website),
    Boolean(fields.phone),
    Boolean(fields.city),
    Boolean(fields.insuranceStatus),
    cats > 0,
    regs > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export async function updateCompanyProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: DEMO };
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!session.organization) return { error: "No organization found." };

  const categories = formData.getAll("categories").map(String);
  const regions = formData.getAll("regions").map(String);
  const propertyTypes = formData.getAll("propertyTypes").map(String);

  const parsed = companyProfileSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email"),
    addressLine1: formData.get("addressLine1") ?? "",
    city: formData.get("city") ?? "",
    province: formData.get("province") ?? "",
    postalCode: formData.get("postalCode") ?? "",
    shortDescription: formData.get("shortDescription") ?? "",
    fullDescription: formData.get("fullDescription") ?? "",
    yearsInBusiness: formData.get("yearsInBusiness") || undefined,
    employeeCountRange: formData.get("employeeCountRange") ?? "",
    insuranceStatus: formData.get("insuranceStatus") ?? "",
    wsibStatus: formData.get("wsibStatus") ?? "",
    emergencyService: formData.get("emergencyService") === "on",
    publicContactVisibility: (formData.get("publicContactVisibility") as string) ?? "request_intro",
    categories,
    regions,
    propertyTypes,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;

  const supabase = await createClient();
  const orgId = session.organization.id;
  const score = completion(d, categories.length, regions.length);

  const { error } = await supabase
    .from("organizations")
    .update({
      name: d.name,
      website: d.website || null,
      phone: d.phone || null,
      email: d.email,
      address_line_1: d.addressLine1 || null,
      city: d.city || null,
      province: d.province || null,
      postal_code: d.postalCode || null,
      short_description: d.shortDescription || null,
      full_description: d.fullDescription || null,
      years_in_business: d.yearsInBusiness ?? null,
      employee_count_range: d.employeeCountRange || null,
      insurance_status: d.insuranceStatus || null,
      wsib_status: d.wsibStatus || null,
      emergency_service: d.emergencyService ?? false,
      public_contact_visibility: d.publicContactVisibility,
      profile_completion_score: score,
      profile_status: "pending_review",
    })
    .eq("id", orgId);
  if (error) return { error: "Could not save profile." };

  // Replace taxonomy links.
  const [{ data: catRows }, { data: regRows }, { data: ptRows }] = await Promise.all([
    supabase.from("trade_categories").select("id,slug").in("slug", categories.length ? categories : ["__"]),
    supabase.from("regions").select("id,slug").in("slug", regions.length ? regions : ["__"]),
    supabase.from("property_types").select("id,slug").in("slug", propertyTypes.length ? propertyTypes : ["__"]),
  ]);
  await Promise.all([
    supabase.from("organization_categories").delete().eq("organization_id", orgId),
    supabase.from("organization_regions").delete().eq("organization_id", orgId),
    supabase.from("organization_property_types").delete().eq("organization_id", orgId),
  ]);
  if (catRows?.length)
    await supabase.from("organization_categories").insert(catRows.map((c: { id: string }) => ({ organization_id: orgId, category_id: c.id })));
  if (regRows?.length)
    await supabase.from("organization_regions").insert(regRows.map((r: { id: string }) => ({ organization_id: orgId, region_id: r.id })));
  if (ptRows?.length)
    await supabase.from("organization_property_types").insert(ptRows.map((p: { id: string }) => ({ organization_id: orgId, property_type_id: p.id })));

  revalidatePath("/dashboard/company");
  return { success: "Profile saved. It will be reviewed before going live." };
}

export async function createRfpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: DEMO };
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const categories = formData.getAll("categories").map(String);
  const parsed = rfpPostSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary"),
    scope: formData.get("scope"),
    requirements: formData.get("requirements") ?? "",
    categories,
    propertyType: formData.get("propertyType") || undefined,
    regionSlug: formData.get("regionSlug"),
    city: formData.get("city") ?? "",
    province: formData.get("province") ?? "",
    budgetMin: formData.get("budgetMin") || undefined,
    budgetMax: formData.get("budgetMax") || undefined,
    budgetPublic: formData.get("budgetPublic") === "on",
    deadline: formData.get("deadline"),
    submissionInstructions: formData.get("submissionInstructions") ?? "",
    contactVisibility: (formData.get("contactVisibility") as string) ?? "pmrfp_mediated",
    contactName: formData.get("contactName") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    acceptTerms: formData.get("acceptTerms") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please complete the required fields." };
  const d = parsed.data;

  const supabase = await createClient();
  const [{ data: region }, { data: pt }] = await Promise.all([
    supabase.from("regions").select("id").eq("slug", d.regionSlug).maybeSingle<{ id: string }>(),
    d.propertyType
      ? supabase.from("property_types").select("id").eq("slug", d.propertyType).maybeSingle<{ id: string }>()
      : Promise.resolve({ data: null }),
  ]);

  const slug = `${slugify(d.title)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: rfp, error } = await supabase
    .from("rfp_posts")
    .insert({
      title: d.title,
      slug,
      summary: d.summary,
      scope: d.scope,
      requirements: d.requirements || null,
      property_type_id: pt?.id ?? null,
      region_id: region?.id ?? null,
      city: d.city || null,
      province: d.province || null,
      budget_min: d.budgetMin ?? null,
      budget_max: d.budgetMax ?? null,
      budget_public: d.budgetPublic ?? false,
      deadline: d.deadline.toISOString().slice(0, 10),
      submission_instructions: d.submissionInstructions || null,
      contact_visibility: d.contactVisibility,
      contact_name: d.contactName || null,
      contact_email: d.contactEmail || null,
      contact_phone: d.contactPhone || null,
      posted_by_user_id: session.userId,
      posted_by_organization_id: session.organization?.id ?? null,
      source_type: session.profile.primary_role === "admin" || session.profile.primary_role === "super_admin" ? "admin_seeded" : "property_manager_direct",
      status: "pending_review",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !rfp) return { error: "Could not create the RFP." };

  const { data: catRows } = await supabase.from("trade_categories").select("id,slug").in("slug", categories);
  if (catRows?.length)
    await supabase.from("rfp_categories").insert(catRows.map((c: { id: string }) => ({ rfp_id: rfp.id, category_id: c.id })));

  await sendAdminNewRfp({ title: d.title, postedBy: session.organization?.name, region: d.regionSlug });

  redirect("/pm-dashboard/rfps?posted=1");
}
