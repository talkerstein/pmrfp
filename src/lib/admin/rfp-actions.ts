"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPmRfpPublished } from "@/lib/email/send";

/**
 * Admin: publish or reject an RFP or GC package waiting for review. Property
 * manager RFPs and GC packages are created as pending_review, and until now
 * there was no button to publish them. Only moves rows still waiting, and
 * tells the poster when their listing goes live.
 */
export async function reviewRfpAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !["published", "rejected"].includes(decision)) redirect("/admin/rfps");

  const svc = createServiceClient();
  const { data: rfp } = await svc
    .from("rfp_posts")
    .update({ status: decision, ...(decision === "published" ? { published_at: new Date().toISOString() } : {}) })
    .eq("id", id)
    .in("status", ["pending_review", "draft"])
    .select("title, slug, contact_email, posted_by_user_id")
    .maybeSingle<{ title: string; slug: string; contact_email: string | null; posted_by_user_id: string | null }>();

  if (rfp && decision === "published") {
    let to = rfp.contact_email;
    if (!to && rfp.posted_by_user_id) {
      const { data: p } = await svc
        .from("users_profile")
        .select("email")
        .eq("id", rfp.posted_by_user_id)
        .maybeSingle<{ email: string | null }>();
      to = p?.email ?? null;
    }
    if (to) await sendPmRfpPublished(to, { title: rfp.title, slug: rfp.slug });
  }

  revalidatePath("/rfps");
  revalidatePath("/admin/rfps");
  redirect("/admin/rfps");
}
