"use server";

/**
 * Server actions for the referral program.
 *
 * TWO lanes:
 *  - PROJECT referral → fee triggers on RFP-PUBLISHED (listing moment, NOT
 *    work-awarded). $25 paid to referrer.
 *  - TRADE referral → fee triggers on TRADE-PRO-ACTIVATED (direct-revenue
 *    listing moment). $75 paid to referrer.
 *
 * Persistence: email-driven for v1. Admin manually triages + tracks fee
 * eligibility. Will add a `referrals` table + admin UI + auto-fee-tracking
 * once volume justifies it.
 */
import { headers } from "next/headers";
import { projectReferralSchema, tradeReferralSchema } from "@/lib/validations";
import {
  sendAdminReferral,
  sendAdminTradeReferral,
  sendReferralConfirmation,
  sendTradeReferralConfirmation,
} from "@/lib/email/send";
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

/**
 * PROJECT referral lane — anyone introduces a project. Fee paid on RFP
 * published live (listing) — not on award (downstream + non-revenue).
 */
export async function submitReferralAction(
  _prev: ReferralActionState,
  formData: FormData,
): Promise<ReferralActionState> {
  if (await checkRateLimitByIp(await ip(), "contact")) {
    return { error: "Too many submissions. Please wait a minute and try again." };
  }

  const parsed = projectReferralSchema.safeParse({
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
      "Thanks for the referral. We'll review within one business day and reach out to you or the property contact next. The $25 finder's fee triggers when the RFP goes live.",
  };
}

/**
 * TRADE referral lane — the direct-revenue play. Fee paid on Trade Pro
 * activation, when PMRFP gets the $249/yr subscription.
 */
export async function submitTradeReferralAction(
  _prev: ReferralActionState,
  formData: FormData,
): Promise<ReferralActionState> {
  if (await checkRateLimitByIp(await ip(), "contact")) {
    return { error: "Too many submissions. Please wait a minute and try again." };
  }

  const parsed = tradeReferralSchema.safeParse({
    tradeCompanyName: formData.get("tradeCompanyName"),
    tradeCategory: formData.get("tradeCategory") ?? "",
    tradeCity: formData.get("tradeCity"),
    tradeProvince: formData.get("tradeProvince"),
    tradeContactName: formData.get("tradeContactName") ?? "",
    tradeContactEmail: formData.get("tradeContactEmail") ?? "",
    tradeContactPhone: formData.get("tradeContactPhone") ?? "",
    tradeWebsite: formData.get("tradeWebsite") ?? "",
    whyThemNote: formData.get("whyThemNote") ?? "",
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

  if (parsed.data.company_website && parsed.data.company_website.length > 0) {
    return { success: "Thanks — we received your referral and will be in touch." };
  }

  const d = parsed.data;
  await Promise.all([
    sendAdminTradeReferral({
      tradeCompanyName: d.tradeCompanyName,
      tradeCategory: d.tradeCategory || undefined,
      tradeCity: d.tradeCity,
      tradeProvince: d.tradeProvince,
      tradeContactName: d.tradeContactName || undefined,
      tradeContactEmail: d.tradeContactEmail || undefined,
      tradeContactPhone: d.tradeContactPhone || undefined,
      tradeWebsite: d.tradeWebsite || undefined,
      whyThemNote: d.whyThemNote || undefined,
      referrerName: d.referrerName,
      referrerEmail: d.referrerEmail,
      referrerPhone: d.referrerPhone || undefined,
      referrerAffiliation: d.referrerAffiliation || undefined,
    }),
    sendTradeReferralConfirmation(d.referrerEmail, d.tradeCompanyName),
  ]);

  await trackEvent("trade_referred" as never, {
    city: d.tradeCity,
    province: d.tradeProvince,
    hasTradeContact: !!(d.tradeContactEmail || d.tradeContactPhone),
    hasAffiliation: !!d.referrerAffiliation,
  });

  return {
    success:
      "Thanks for the referral. We'll review within one business day and reach out to you or the trade contact next. The $75 finder's fee triggers when they activate Trade Pro.",
  };
}
