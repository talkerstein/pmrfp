"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession } from "@/lib/access/access";
import { companyProfileSchema, rfpPostSchema } from "@/lib/validations";
import { sendAdminNewRfp } from "@/lib/email/send";
import {
  GC_PACKAGE,
  GC_UNAVAILABLE_MESSAGE,
  gcPackageTitle,
  isGcSchemaMissingError,
  parseAwardRef,
} from "@/lib/gc/packages";
import { getLinkableAward } from "@/lib/gc/data";
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

  // Validate the logoUrl points at our own Supabase storage logos bucket. If it
  // doesn't (including empty/cleared), set logo_url to null. Prevents URL
  // injection from a malicious client.
  const rawLogoUrl = formData.get("logoUrl")?.toString().trim() ?? "";
  let logoUrl: string | null = null;
  if (rawLogoUrl) {
    try {
      const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
      const parsed = new URL(rawLogoUrl);
      if (
        parsed.protocol === "https:" &&
        parsed.host === supabaseHost &&
        parsed.pathname.includes("/storage/v1/object/public/logos/")
      ) {
        logoUrl = rawLogoUrl;
      }
    } catch {
      logoUrl = null;
    }
  }

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
      logo_url: logoUrl,
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

/**
 * Close an RFP — either as "awarded" (the PM picked a winner, finder's-fee
 * eligible if the project was referred via /refer-a-project) or as "closed"
 * (cancelled / no award). Public detail page shows the appropriate badge.
 *
 * Future v2: capture awarded-to org id, dollar amount, deadline-to-completion,
 * and trigger automated finder's-fee payout. v1 = status flip + closed_at.
 */
export async function closeRfpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: DEMO };
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const rfpId = formData.get("rfpId")?.toString();
  const outcome = formData.get("outcome")?.toString();
  if (!rfpId || (outcome !== "awarded" && outcome !== "closed" && outcome !== "expired")) {
    return { error: "Missing or invalid outcome." };
  }

  const supabase = await createClient();
  // RLS enforces that only the posting PM (or admin) can update — but we also
  // double-check ownership to fail fast with a friendly error.
  const { data: rfp } = await supabase
    .from("rfp_posts")
    .select("id,posted_by_user_id,status")
    .eq("id", rfpId)
    .maybeSingle<{ id: string; posted_by_user_id: string | null; status: string }>();
  if (!rfp) return { error: "RFP not found." };
  if (rfp.posted_by_user_id !== session.userId && session.profile.primary_role !== "admin" && session.profile.primary_role !== "super_admin") {
    return { error: "Only the posting PM can close this RFP." };
  }
  if (
    rfp.status === "awarded" ||
    rfp.status === "closed" ||
    rfp.status === "expired" ||
    rfp.status === "archived"
  ) {
    return { error: "This RFP is no longer active." };
  }

  const { error } = await supabase
    .from("rfp_posts")
    .update({
      status: outcome,
      closed_at: new Date().toISOString(),
    })
    .eq("id", rfpId);
  if (error) return { error: "Could not close the RFP." };

  revalidatePath("/rfps");
  revalidatePath(`/rfps`);
  revalidatePath("/pm-dashboard/rfps");
  return {
    success:
      outcome === "awarded"
        ? "RFP marked as awarded. If this project came through the referral program, the finder's fee is now eligible."
        : outcome === "expired"
          ? "RFP marked as expired. It's off the public board — re-post any time."
          : "RFP closed without award.",
  };
}

/**
 * A GC sub-trade package (the form sends kind=gc) is a regular RFP row with
 * source_type 'gc_package', titled from the trade + project. Returns null for
 * a regular RFP.
 */
async function gcPackageFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  categories: string[],
): Promise<null | { error: string } | { title: string; gcProjectName: string; awardedRfpId: string | null }> {
  if (formData.get("kind") !== "gc") return null;
  const project = String(formData.get("gcProjectName") ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (!project) return { error: "Project name is required" };
  if (!categories.length) return { error: "Pick the trade for this package" };
  const relatedInput = formData.get("relatedContract")?.toString().trim() ?? "";
  const [{ data: cat }, award] = await Promise.all([
    supabase.from("trade_categories").select("name").eq("slug", categories[0]).maybeSingle<{ name: string }>(),
    getLinkableAward(parseAwardRef(relatedInput)),
  ]);
  if (!cat) return { error: "Pick the trade for this package" };
  if (relatedInput && !award) {
    return { error: "That link isn't a public contract award on PMRFP. Paste the award page link, or leave it blank." };
  }
  return { title: gcPackageTitle(cat.name, project), gcProjectName: project, awardedRfpId: award?.id ?? null };
}

export async function createRfpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: DEMO };
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const categories = formData.getAll("categories").map(String);
  const supabase = await createClient();
  const gc = await gcPackageFields(supabase, formData, categories);
  if (gc && "error" in gc) return { error: gc.error };
  const parsed = rfpPostSchema.safeParse({
    title: gc ? gc.title : formData.get("title"),
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
      source_type: gc
        ? GC_PACKAGE
        : session.profile.primary_role === "admin" || session.profile.primary_role === "super_admin"
          ? "admin_seeded"
          : "property_manager_direct",
      ...(gc ? { gc_project_name: gc.gcProjectName, awarded_rfp_id: gc.awardedRfpId } : {}),
      status: "pending_review",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !rfp) {
    // Before the GC-package migration runs, say so plainly instead of failing vaguely.
    return { error: gc && isGcSchemaMissingError(error) ? GC_UNAVAILABLE_MESSAGE : "Could not create the RFP." };
  }

  const { data: catRows } = await supabase.from("trade_categories").select("id,slug").in("slug", categories);
  if (catRows?.length)
    await supabase.from("rfp_categories").insert(catRows.map((c: { id: string }) => ({ rfp_id: rfp.id, category_id: c.id })));

  // Persist photo URLs (uploaded client-side to rfp-photos public bucket) as
  // rfp_documents rows with visibility='public'. Only accept HTTPS URLs that
  // point at the project's own Supabase storage to avoid arbitrary-URL injection.
  const photoUrls = formData
    .getAll("photoUrls")
    .map(String)
    .filter((u) => u && typeof u === "string");
  if (photoUrls.length) {
    const supabaseHost = (() => {
      try {
        return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
      } catch {
        return "";
      }
    })();
    const safePhotos = photoUrls
      .slice(0, 12) // hard cap
      .filter((u) => {
        try {
          const parsed = new URL(u);
          return parsed.protocol === "https:" && parsed.host === supabaseHost && parsed.pathname.includes("/rfp-photos/");
        } catch {
          return false;
        }
      });
    if (safePhotos.length) {
      const rows = safePhotos.map((url) => {
        // Storage path is everything after `/object/public/rfp-photos/` — used
        // for later admin/owner deletion via the storage API.
        const m = url.match(/\/object\/public\/rfp-photos\/(.+)$/);
        const file_path = m ? m[1] : null;
        const file_name = file_path ? file_path.split("/").pop() ?? null : null;
        return {
          rfp_id: rfp.id,
          file_url: url,
          file_path,
          file_name,
          file_type: "image/*",
          visibility: "public" as const,
        };
      });
      await supabase.from("rfp_documents").insert(rows);
    }
  }

  await sendAdminNewRfp({ title: d.title, postedBy: session.organization?.name, region: d.regionSlug });

  redirect("/pm-dashboard/rfps?posted=1");
}
