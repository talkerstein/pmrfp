"use server";

/**
 * Concierge "Post it for me" server action.
 *
 * A property manager / owner who won't self-serve the full RFP form can hand us
 * a loosely-described project; we draft and post the RFP for them. This captures
 * the supply-side lead that the 15-field self-serve form would otherwise lose.
 *
 * Persistence is email + GHL-driven for v1 (same pattern as the referral lanes):
 * admin gets a triage email, the PM gets a confirmation, and the lead lands in
 * GHL tagged `pmrfp-concierge-lead` so it can be worked from the CRM.
 */
import { headers } from "next/headers";
import { postForMeSchema } from "@/lib/validations";
import { sendAdminConciergeRfp, sendConciergeConfirmation } from "@/lib/email/send";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/analytics";
import { syncPmrfpUserToGhl } from "@/lib/ghl/sync";

export interface ConciergeActionState {
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

export async function submitPostForMeAction(
  _prev: ConciergeActionState,
  formData: FormData,
): Promise<ConciergeActionState> {
  if (await checkRateLimitByIp(await ip(), "contact")) {
    return { error: "Too many submissions. Please wait a minute and try again." };
  }

  const parsed = postForMeSchema.safeParse({
    projectDescription: formData.get("projectDescription"),
    city: formData.get("city"),
    province: formData.get("province"),
    category: formData.get("category") ?? "",
    propertyType: formData.get("propertyType") ?? "",
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone") ?? "",
    company_website: formData.get("company_website") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please complete the required fields." };
  }

  // Honeypot tripped — pretend success, do nothing.
  if (parsed.data.company_website && parsed.data.company_website.length > 0) {
    return { success: "Thanks — we received your project and will be in touch." };
  }

  const d = parsed.data;
  await Promise.all([
    sendAdminConciergeRfp({
      projectDescription: d.projectDescription,
      city: d.city,
      province: d.province,
      category: d.category || undefined,
      propertyType: d.propertyType || undefined,
      contactName: d.contactName,
      contactEmail: d.contactEmail,
      contactPhone: d.contactPhone || undefined,
    }),
    sendConciergeConfirmation(d.contactEmail, d.city),
  ]);

  await trackEvent("post_for_me_requested" as never, {
    city: d.city,
    province: d.province,
    hasCategory: !!d.category,
  });

  await syncPmrfpUserToGhl(
    {
      email: d.contactEmail,
      fullName: d.contactName,
      phone: d.contactPhone || null,
      role: "property_manager",
      city: d.city,
      province: d.province,
      subscriptionStatus: "none",
    },
    { extraTags: ["pmrfp-concierge-lead"] },
  );

  return {
    success:
      "Thanks — we've got your project. Our team reviews it within one business day, drafts a clear RFP, and sends it to you to approve before it goes live to trades in your region. Check your email for confirmation.",
  };
}
