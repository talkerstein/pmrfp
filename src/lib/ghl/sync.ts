/**
 * GHL sync helpers — high-level operations triggered by PMRFP events.
 *
 * Each function:
 *   1. Builds a GHL contact payload from the PMRFP entity
 *   2. Upserts the contact
 *   3. Tags it appropriately
 *   4. Optionally places it on a pipeline at the right stage
 *
 * All ops are fire-and-forget — they log but never throw. Callers don't need
 * to await beyond ensuring the response fires; failures are visible in
 * Vercel function logs but don't break user-facing flows.
 *
 * Pipeline stage IDs are read from env vars set by the GHL admin after
 * pipeline creation. If the IDs aren't set, opportunities are skipped (but
 * the contact is still upserted). See briefs/ghl-setup.md.
 */
import { addGhlTags, ensureGhlOpportunity, upsertGhlContact } from "./client";

const PIPELINE_TRADE_ID = process.env.GHL_PIPELINE_TRADE_ID;
const PIPELINE_PROJECT_REFERRAL_ID = process.env.GHL_PIPELINE_PROJECT_REFERRAL_ID;
const PIPELINE_PM_ID = process.env.GHL_PIPELINE_PM_ID;

// Stage IDs would come from GHL after pipeline creation. We use stage NAME
// matching at the GHL workflow level instead of stage IDs in code — keeps
// the integration loose (admin can rename stages without breaking sync).
// If you want stage-level precision, populate these env vars too:
const STAGE_TRADE_SIGNED_UP = process.env.GHL_STAGE_TRADE_SIGNED_UP;
const STAGE_TRADE_PROFILE_COMPLETE = process.env.GHL_STAGE_TRADE_PROFILE_COMPLETE;
const STAGE_TRADE_PRO_ACTIVE = process.env.GHL_STAGE_TRADE_PRO_ACTIVE;
const STAGE_TRADE_CHURNED = process.env.GHL_STAGE_TRADE_CHURNED;
const STAGE_PM_SIGNED_UP = process.env.GHL_STAGE_PM_SIGNED_UP;
const STAGE_PM_FIRST_RFP = process.env.GHL_STAGE_PM_FIRST_RFP;
const STAGE_PROJECT_REFERRAL_NEW = process.env.GHL_STAGE_PROJECT_REFERRAL_NEW;

interface PmrfpUserSnapshot {
  email: string;
  fullName?: string | null;
  phone?: string | null;
  role: "trade" | "supplier" | "property_manager" | "real_estate_agent" | "visitor" | "admin" | "super_admin";
  orgId?: string | null;
  orgSlug?: string | null;
  orgName?: string | null;
  city?: string | null;
  province?: string | null;
  tradeCategory?: string | null;
  subscriptionStatus?: "none" | "trial" | "active" | "past_due" | "canceled" | null;
  profileCompletionPct?: number | null;
  referrerName?: string | null;
}

function nameParts(fullName?: string | null): { firstName?: string; lastName?: string } {
  if (!fullName) return {};
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function customFieldsFor(user: PmrfpUserSnapshot) {
  return {
    pmrfp_role: user.role,
    pmrfp_org_id: user.orgId ?? "",
    pmrfp_org_slug: user.orgSlug ?? "",
    pmrfp_org_name: user.orgName ?? "",
    pmrfp_city: user.city ?? "",
    pmrfp_province: user.province ?? "",
    pmrfp_category: user.tradeCategory ?? "",
    pmrfp_sub_status: user.subscriptionStatus ?? "none",
    pmrfp_profile_pct: user.profileCompletionPct ?? 0,
    pmrfp_referrer_name: user.referrerName ?? "",
  };
}

/**
 * Called on every signup + onboarding-complete + subscription-change event.
 * Idempotent — re-running with the same data is safe.
 */
export async function syncPmrfpUserToGhl(
  user: PmrfpUserSnapshot,
  options: { extraTags?: string[] } = {},
): Promise<string | null> {
  const { firstName, lastName } = nameParts(user.fullName);
  const tags = [`pmrfp-${user.role}`, ...(options.extraTags ?? [])];
  const contactId = await upsertGhlContact({
    email: user.email,
    firstName,
    lastName,
    phone: user.phone ?? undefined,
    customFields: customFieldsFor(user),
    tags,
  });
  if (!contactId) return null;

  // Place on the appropriate pipeline if we know the stage IDs.
  try {
    if (user.role === "trade" && PIPELINE_TRADE_ID) {
      const stageId =
        user.subscriptionStatus === "active"
          ? STAGE_TRADE_PRO_ACTIVE
          : user.subscriptionStatus === "canceled" || user.subscriptionStatus === "past_due"
            ? STAGE_TRADE_CHURNED
            : (user.profileCompletionPct ?? 0) >= 80
              ? STAGE_TRADE_PROFILE_COMPLETE
              : STAGE_TRADE_SIGNED_UP;
      if (stageId) {
        await ensureGhlOpportunity({
          contactId,
          pipelineId: PIPELINE_TRADE_ID,
          pipelineStageId: stageId,
          name: user.orgName ?? user.email,
          monetaryValue: user.subscriptionStatus === "active" ? 249 : undefined,
        });
      }
    } else if (user.role === "property_manager" && PIPELINE_PM_ID && STAGE_PM_SIGNED_UP) {
      await ensureGhlOpportunity({
        contactId,
        pipelineId: PIPELINE_PM_ID,
        pipelineStageId: STAGE_PM_SIGNED_UP,
        name: user.orgName ?? user.email,
      });
    }
  } catch (e) {
    console.error("[ghl] pipeline placement threw", e);
  }

  return contactId;
}

/**
 * PM posted their first RFP — move them in the PM activation pipeline.
 */
export async function syncPmFirstRfpPosted(params: {
  email: string;
  fullName?: string | null;
  rfpTitle: string;
}): Promise<void> {
  if (!PIPELINE_PM_ID || !STAGE_PM_FIRST_RFP) return;
  const { firstName, lastName } = nameParts(params.fullName);
  const contactId = await upsertGhlContact({
    email: params.email,
    firstName,
    lastName,
    tags: ["pmrfp-pm-first-rfp"],
  });
  if (!contactId) return;
  await ensureGhlOpportunity({
    contactId,
    pipelineId: PIPELINE_PM_ID,
    pipelineStageId: STAGE_PM_FIRST_RFP,
    name: `First RFP: ${params.rfpTitle}`,
  });
}

/**
 * A new project referral was submitted on /refer-a-project. Creates the
 * referrer in GHL + places them in the Project Referral pipeline.
 */
export async function syncProjectReferralToGhl(params: {
  referrerEmail: string;
  referrerName: string;
  referrerPhone?: string;
  referrerAffiliation?: string;
  projectCity: string;
  projectProvince: string;
}): Promise<void> {
  const { firstName, lastName } = nameParts(params.referrerName);
  const contactId = await upsertGhlContact({
    email: params.referrerEmail,
    firstName,
    lastName,
    phone: params.referrerPhone,
    tags: ["project-referral", "pmrfp-referrer"],
    customFields: {
      pmrfp_role: "referrer",
      pmrfp_city: params.projectCity,
      pmrfp_province: params.projectProvince,
      pmrfp_org_name: params.referrerAffiliation ?? "",
    },
  });
  if (!contactId) return;
  if (PIPELINE_PROJECT_REFERRAL_ID && STAGE_PROJECT_REFERRAL_NEW) {
    await ensureGhlOpportunity({
      contactId,
      pipelineId: PIPELINE_PROJECT_REFERRAL_ID,
      pipelineStageId: STAGE_PROJECT_REFERRAL_NEW,
      name: `Project: ${params.projectCity}, ${params.projectProvince}`,
    });
  }
  await addGhlTags(contactId, ["referrer-needs-followup"]);
}

/**
 * A trade referral was submitted. Creates the referrer + the referred trade
 * (if email known) as separate contacts.
 */
export async function syncTradeReferralToGhl(params: {
  referrerEmail: string;
  referrerName: string;
  referrerPhone?: string;
  referrerAffiliation?: string;
  tradeCompanyName: string;
  tradeCategory?: string;
  tradeCity: string;
  tradeProvince: string;
  tradeContactName?: string;
  tradeContactEmail?: string;
  tradeContactPhone?: string;
}): Promise<void> {
  // Referrer contact
  const { firstName: refFn, lastName: refLn } = nameParts(params.referrerName);
  await upsertGhlContact({
    email: params.referrerEmail,
    firstName: refFn,
    lastName: refLn,
    phone: params.referrerPhone,
    tags: ["trade-referral", "pmrfp-referrer"],
    customFields: {
      pmrfp_role: "referrer",
      pmrfp_org_name: params.referrerAffiliation ?? "",
    },
  });

  // Referred trade (if email provided, otherwise we can't create — fine)
  if (params.tradeContactEmail) {
    const { firstName, lastName } = nameParts(params.tradeContactName);
    const tradeContactId = await upsertGhlContact({
      email: params.tradeContactEmail,
      firstName,
      lastName,
      phone: params.tradeContactPhone,
      tags: ["pmrfp-trade", "referred-trade", "needs-outreach"],
      customFields: {
        pmrfp_role: "trade",
        pmrfp_org_name: params.tradeCompanyName,
        pmrfp_city: params.tradeCity,
        pmrfp_province: params.tradeProvince,
        pmrfp_category: params.tradeCategory ?? "",
        pmrfp_referrer_name: params.referrerName,
        pmrfp_sub_status: "none",
      },
    });
    // Place on Trade Pipeline at "Cold lead" stage.
    if (tradeContactId && PIPELINE_TRADE_ID && STAGE_TRADE_SIGNED_UP) {
      await ensureGhlOpportunity({
        contactId: tradeContactId,
        pipelineId: PIPELINE_TRADE_ID,
        pipelineStageId: STAGE_TRADE_SIGNED_UP,
        name: params.tradeCompanyName,
      });
    }
  }
}
