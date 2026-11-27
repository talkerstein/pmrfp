"use server";

import { UUID } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { activeRequestAdmin } from "@/lib/d1/customer-requests";
import { submitVpsProjectReview } from "@/lib/d1/vps-project-reviews";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { sendAdminNewReview } from "@/lib/email/send";
import { karmaSyncAfter } from "@/lib/karma/sync";
import { hashReviewToken, isWellFormedToken } from "@/lib/projects/tokens";

async function ip(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Pick a star rating.").max(5, "Pick a star rating."),
  body: z.string().trim().min(20, "Write a sentence or two about how it went.").max(3000),
  name: z.string().trim().min(2, "Add your name.").max(100),
  company: z.string().trim().max(120).default(""),
  showBuilding: z.boolean(),
  referenceOk: z.boolean(),
});

export interface ReviewFormState {
  error?: string;
  done?: boolean;
  /** The link was already used (or never existed) by the time they submitted. */
  expired?: boolean;
}

/**
 * A client submits a review through their one-time link. Every review goes
 * to moderation, whatever the rating: no review gating. The invite is
 * claimed first (used_at set only if still null) so a double-submit can't
 * create two reviews; if the insert then fails the claim is released.
 */
export async function submitReviewAction(
  token: string,
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  if (String(formData.get("website") ?? "")) return { done: true }; // honeypot
  if (await checkRateLimitByIp(await ip(), "review")) {
    return { error: "Too many tries. Wait a few minutes and try again." };
  }
  const native=process.env.PMRFP_VPS_CUSTOMER_ENGINE==="d1";
  if (!isWellFormedToken(token) || (!native && !isServiceConfigured())) return { expired: true };

  const parsed = reviewSchema.safeParse({
    rating: formData.get("rating") ?? 0,
    body: formData.get("body") ?? "",
    name: formData.get("name") ?? "",
    company: formData.get("company") ?? "",
    showBuilding: formData.get("showBuilding") === "on",
    referenceOk: formData.get("referenceOk") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;

  if (native) {
    try {
      const row=await submitVpsProjectReview(token,d);
      if (!row) return {expired:true};
      await sendAdminNewReview({tradeName:row.company,projectTitle:row.project_context,rating:d.rating});
      return {done:true};
    } catch { return {error:"Couldn't save your review. Please try again."}; }
  }

  const db = createServiceClient();
  const { data: claimed, error: claimErr } = await db
    .from("review_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashReviewToken(token))
    .is("used_at", null)
    .select("id,case_study_id,organization_id,client_email")
    .maybeSingle();
  const invite = claimed as { id: string; case_study_id: string; organization_id: string; client_email: string } | null;
  if (claimErr || !invite) return { expired: true };

  const [{ data: cs }, { data: org }] = await Promise.all([
    db.from("case_studies").select("title").eq("id", invite.case_study_id).maybeSingle(),
    db.from("organizations").select("name").eq("id", invite.organization_id).maybeSingle(),
  ]);
  const projectTitle = (cs as { title: string } | null)?.title ?? "";

  const { error } = await db.from("vendor_reviews").insert({
    organization_id: invite.organization_id,
    case_study_id: invite.case_study_id,
    reviewer_name: d.name,
    reviewer_company: d.company || null,
    reviewer_email: invite.client_email,
    rating: d.rating,
    body: d.body,
    project_context: projectTitle || null,
    status: "pending_review",
    verified_via: "project_invite",
    show_building: d.showBuilding,
    reference_ok: d.referenceOk,
  });
  if (error) {
    console.error("[reviews/submit]", error.message);
    await db.from("review_invites").update({ used_at: null }).eq("id", invite.id);
    return { error: "Couldn't save your review. Please try again." };
  }

  await sendAdminNewReview({
    tradeName: (org as { name: string } | null)?.name ?? "Unknown company",
    projectTitle,
    rating: d.rating,
  });
  return { done: true };
}

/** Admin: publish or reject a pending review. */
export async function moderateReviewAction(formData: FormData): Promise<void> {
  const session=await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!UUID.test(id) || !["published", "rejected"].includes(decision)) redirect("/admin/reviews");

  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE==="d1") {
    const row=await vpsAppDatabase().prepare(`UPDATE vendor_reviews SET status=? WHERE id=? AND ${activeRequestAdmin}
      RETURNING organization_id,(SELECT slug FROM organizations WHERE id=organization_id) AS organization_slug,
      (SELECT slug FROM case_studies WHERE id=case_study_id) AS project_slug`).bind(decision,id,session.userId)
      .first<{organization_id:string;organization_slug:string|null;project_slug:string|null}>();
    if (row) {
      await karmaSyncAfter({orgIds:[row.organization_id]});
      if (row.organization_slug) revalidatePath(`/directory/${row.organization_slug}`);
      if (row.project_slug) revalidatePath(`/case-studies/${row.project_slug}`);
    }
    revalidatePath("/admin/reviews");
    redirect("/admin/reviews");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("vendor_reviews")
    .update({ status: decision })
    .eq("id", id)
    .select("organization_id,organizations(slug),case_studies(slug)")
    .maybeSingle();

  // The profile and the project page show this review (and the star average).
  const r = data as unknown as { organization_id: string | null; organizations: { slug: string } | null; case_studies: { slug: string } | null } | null;
  // A published (or rejected) verified client review adds (or claws back) reputation.
  await karmaSyncAfter({ orgIds: [r?.organization_id] });
  if (r?.organizations?.slug) revalidatePath(`/directory/${r.organizations.slug}`);
  if (r?.case_studies?.slug) revalidatePath(`/case-studies/${r.case_studies.slug}`);
  revalidatePath("/admin/reviews");
  redirect("/admin/reviews");
}
