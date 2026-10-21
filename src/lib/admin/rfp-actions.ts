"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPmRfpPublished, sendPmRfpRejected } from "@/lib/email/send";
import { karmaSyncAfter } from "@/lib/karma/sync";
import { isSchemaMissing } from "@/lib/projects/compat";
import { pmJobAlertsEnabled } from "@/lib/pm-jobs/alerts";
import { isPmJob } from "@/lib/pm-jobs/rules";
import { langOf, runPmJobAlerts } from "@/lib/pm-jobs/server";
import { posterKindOf } from "@/lib/pm-jobs/decisions";
import { loadTownJob, logTownEvent } from "@/lib/town-jobs/server";

/**
 * Admin: publish or reject an RFP or GC package waiting for review. Property
 * manager RFPs and GC packages are created as pending_review. Only moves rows
 * still waiting.
 *
 * Publish: the poster is told it's live; for a PM job, matching trades are
 * emailed the same day (lib/pm-jobs/server, behind PM_JOB_ALERTS_ENABLED,
 * sent right after the response so the admin isn't kept waiting; the hourly
 * cron/pm-job-alerts finishes anything left). The admin sees how many trades
 * were (or, with alerts off, would have been) emailed.
 * Reject: the poster gets the short reason the admin typed.
 */
export async function reviewRfpAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !["published", "rejected"].includes(decision)) redirect("/admin/rfps");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000) || null;

  const svc = createServiceClient();
  const patch: Record<string, unknown> = { status: decision, ...(decision === "published" ? { published_at: new Date().toISOString() } : {}) };
  const update = (p: Record<string, unknown>) =>
    svc
      .from("rfp_posts")
      .update(p)
      .eq("id", id)
      .in("status", ["pending_review", "draft"])
      .select("id, title, slug, contact_email, posted_by_user_id, posted_by_organization_id, source_type")
      .maybeSingle<{ id: string; title: string; slug: string; contact_email: string | null; posted_by_user_id: string | null; posted_by_organization_id: string | null; source_type: string | null }>();
  const first = await update(decision === "rejected" && reason ? { ...patch, review_note: reason } : patch);
  // Before migration 20261021000020 there's no review_note column: reject without storing the reason (it's still emailed).
  const rfp = first.error && isSchemaMissing(first.error) ? (await update(patch)).data : first.data;

  let query = "";
  if (rfp) {
    const to = await posterEmail(svc, rfp);
    const lang = await posterLang(svc, rfp.id, rfp.posted_by_user_id);
    // A town's job (lib/town-jobs): its own dashboard links, and the town's record.
    const posterKind = posterKindOf(rfp.source_type);
    const town = posterKind === "town";
    if (town) {
      const job = await loadTownJob(svc, rfp.id);
      if (job) await logTownEvent(svc, { rfpId: job.id, organizationId: job.posted_by_organization_id, buyerKey: job.buyer_key, actorUserId: admin.userId, event: decision === "published" ? "published" : "rejected", detail: decision === "published" ? { auto: false } : { reason } });
    }
    if (decision === "published") {
      let alerts = "none";
      let n = 0;
      if (isPmJob(rfp)) {
        const preview = await runPmJobAlerts(svc, rfp.id, { dry: true });
        n = preview.wouldEmail;
        if (!pmJobAlertsEnabled()) alerts = "off";
        else if (!process.env.BUSINESS_MAILING_ADDRESS?.trim()) alerts = "no_address";
        else {
          alerts = "on";
          const rfpId = rfp.id;
          after(async () => {
            try {
              const res = await runPmJobAlerts(createServiceClient(), rfpId);
              console.info(`[pm-job-alerts] ${rfpId}: ${res.state} sent=${res.sent} of ${res.wouldEmail}${res.reason ? ` (${res.reason})` : ""}`);
            } catch (e) {
              console.error("[pm-job-alerts] failed", e instanceof Error ? e.message : e);
            }
          });
        }
      }
      if (to) await sendPmRfpPublished(to, { title: rfp.title, slug: rfp.slug, id: rfp.id, lang, alertsOn: alerts === "on" && n > 0, posterKind });
      await notifyPoster(svc, rfp.posted_by_user_id, "rfp_published", "Your job is live", rfp.title, town ? `/buyer-dashboard/jobs/${rfp.id}` : `/pm-dashboard/rfps/${rfp.id}/interests`);
      query = `?published=${encodeURIComponent(rfp.id)}&alerts=${alerts}&n=${n}`;
    } else {
      if (to) await sendPmRfpRejected(to, { lang, title: rfp.title, reason, posterKind });
      await notifyPoster(svc, rfp.posted_by_user_id, "rfp_rejected", "Your listing wasn't published", rfp.title, town ? `/buyer-dashboard/jobs/${rfp.id}` : "/pm-dashboard/rfps");
      query = `?rejected=${encodeURIComponent(rfp.id)}`;
    }
    // A package posted from a public award earns its poster reputation once published.
    await karmaSyncAfter({ userIds: [rfp.posted_by_user_id] });
  }

  revalidatePath("/rfps");
  revalidatePath("/admin/rfps");
  redirect(`/admin/rfps${query}`);
}

type Svc = ReturnType<typeof createServiceClient>;

async function posterEmail(svc: Svc, rfp: { contact_email: string | null; posted_by_user_id: string | null }): Promise<string | null> {
  if (rfp.contact_email?.trim()) return rfp.contact_email.trim();
  if (!rfp.posted_by_user_id) return null;
  const { data: p } = await svc.from("users_profile").select("email").eq("id", rfp.posted_by_user_id).maybeSingle<{ email: string | null }>();
  return p?.email ?? null;
}

/** The poster's language: what they posted in (rfp_posts.poster_lang), else their sign-up language. */
async function posterLang(svc: Svc, rfpId: string, userId: string | null) {
  const { data, error } = await svc.from("rfp_posts").select("poster_lang").eq("id", rfpId).maybeSingle<{ poster_lang: string | null }>();
  return langOf(svc, userId, error ? null : data?.poster_lang);
}

async function notifyPoster(svc: Svc, userId: string | null, type: string, title: string, message: string, link: string): Promise<void> {
  if (!userId) return;
  await svc.from("notifications").insert({ user_id: userId, type, title, message, link_url: link });
}
