"use server";

/**
 * Server action for /refer-a-project. No auth required — anyone can submit
 * a referral. Sends two emails (admin notification + referrer confirmation).
 *
 * Persistence: we do NOT write to a DB table today. Admin manually triages
 * from email; once volume justifies it (after the program proves out), we'll
 * add a `referred_projects` table + admin UI. v1 = email-driven.
 */
import { headers } from "next/headers";
import { referralSchema } from "@/lib/validations";
import { sendAdminReferral, sendReferralConfirmation } from "@/lib/email/send";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/analytics";

export interface ReferralActionState {
  error?: string;
  success?: string;
}

async function ip(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

export async function submitReferralAction(
  _prev: ReferralActionState,
  formData: FormData,
): Promise<ReferralActionState> {
  // Rate-limit by IP — contact bucket (5/min) is appropriate for an unauthed
  // intake form.
  if (await checkRateLimitByIp(await ip(), "contact")) {
    return { error: "Too many submissions. Please wait a minute and try again." };
  }

  const parsed = referralSchema.safeParse({
    projectDescription: formData.get("projectDescription"),
    projectCity: formData.get("projectCity"),
    projectProvince: formData.get("projectProvince"),
    projectCategory: formData.get("projectCategory") ?? "",
    projectPropertyType: formData.get("projectPropertyType") ?? "",
    ownerName: formData.get("ownerName") ?? "",
    ownerEmail: formData.get("ownerEmail") ?? "",
    ownerPhone: formData.get("ownerPhone") ?? "",
    referrerName: formData.get("referrerName"),
    referrerEmail: formData.get("referrerEmail"),
    referrerPhone: formData.get("referrerPhone") ?? "",
    referrerAffiliation: formData.get("referrerAffiliation") ?? "",
    permission: formData.get("permission") === "on",
    company_website: formData.get("company_website") ?? "",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please complete the required fields.",
    };
  }

  // Honeypot: silently accept but no-op so bots don't learn the field is a trap.
  if (parsed.data.company_website && parsed.data.company_website.length > 0) {
    return { success: "Thanks — we received your referral and will be in touch." };
  }

  const d = parsed.data;
  await Promise.all([
    sendAdminReferral({
      projectDescription: d.projectDescription,
      projectCity: d.projectCity,
      projectProvince: d.projectProvince,
      projectCategory: d.projectCategory || undefined,
      ownerName: d.ownerName || undefined,
      ownerEmail: d.ownerEmail || undefined,
      ownerPhone: d.ownerPhone || undefined,
      referrerName: d.referrerName,
      referrerEmail: d.referrerEmail,
      referrerPhone: d.referrerPhone || undefined,
      referrerAffiliation: d.referrerAffiliation || undefined,
    }),
    sendReferralConfirmation(d.referrerEmail, d.projectCity),
  ]);

  await trackEvent("project_referred" as never, {
    city: d.projectCity,
    province: d.projectProvince,
    hasOwnerContact: !!(d.ownerEmail || d.ownerPhone),
    hasAffiliation: !!d.referrerAffiliation,
  });

  return {
    success:
      "Thanks for the referral. We'll review within one business day and reach out to you or the property contact next. Watch your inbox for the confirmation.",
  };
}
