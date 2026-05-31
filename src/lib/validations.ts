import { z } from "zod";

/** Zod schemas — single source of truth for client + server validation (§24). */

export const signUpSchema = z.object({
  fullName: z.string().min(1, "Your name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["trade", "property_manager", "visitor", "supplier", "real_estate_agent"]),
  // Honeypot — must stay empty.
  company_website: z.string().max(0).optional(),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string().min(8),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export const companyProfileSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  website: z.union([z.string().url("Enter a valid URL"), z.literal("")]).optional(),
  phone: z.string().optional(),
  email: z.string().email("Enter a valid email"),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  shortDescription: z.string().max(300, "Keep this under 300 characters").optional(),
  fullDescription: z.string().max(2500, "Keep this under 2500 characters").optional(),
  yearsInBusiness: z.coerce.number().int().min(0).max(200).optional(),
  employeeCountRange: z.string().optional(),
  insuranceStatus: z.string().optional(),
  wsibStatus: z.string().optional(),
  emergencyService: z.boolean().optional(),
  publicContactVisibility: z.enum(["show_contact", "request_intro", "hide_contact"]),
  categories: z.array(z.string()).min(1, "Select at least one service category"),
  regions: z.array(z.string()).min(1, "Select at least one service region"),
  propertyTypes: z.array(z.string()).optional(),
});
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const rfpPostSchema = z.object({
  title: z.string().min(1, "Title is required"),
  summary: z.string().min(1, "A short summary is required"),
  scope: z.string().min(1, "Project scope is required"),
  requirements: z.string().optional(),
  categories: z.array(z.string()).min(1, "Select at least one category"),
  propertyType: z.string().optional(),
  regionSlug: z.string().min(1, "Region is required"),
  city: z.string().optional(),
  province: z.string().optional(),
  exactAddress: z.string().optional(),
  showExactAddress: z.boolean().optional(),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
  budgetPublic: z.boolean().optional(),
  desiredStartDate: z.string().optional(),
  deadline: z.coerce.date().refine((d) => d >= today(), "Deadline cannot be in the past"),
  siteVisitDate: z.string().optional(),
  submissionInstructions: z.string().optional(),
  insuranceRequired: z.boolean().optional(),
  wsibRequired: z.boolean().optional(),
  contactVisibility: z.enum(["public_contact", "pmrfp_mediated", "anonymous_until_interest_approved"]),
  contactName: z.string().optional(),
  contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
  contactPhone: z.string().optional(),
  acceptTerms: z.literal(true, { message: "You must accept the terms" }),
});
export type RfpPostInput = z.infer<typeof rfpPostSchema>;

export const interestSchema = z.object({
  rfpId: z.string().min(1),
  message: z.string().min(1, "A message is required").max(2000, "Keep this under 2000 characters"),
  relevantExperience: z.string().max(2000).optional(),
  availability: z.string().max(500).optional(),
  attachmentUrl: z.string().optional(),
  acceptDisclaimer: z.literal(true, {
    message: "Please confirm you understand PMRFP does not guarantee the job",
  }),
});
export type InterestInput = z.infer<typeof interestSchema>;

/**
 * Refer-a-project intake. Fee paid when the RFP is PUBLISHED LIVE (admin-
 * approved) — the LISTING moment that creates inventory value for PMRFP.
 * Not "work awarded" (downstream + non-revenue).
 */
export const projectReferralSchema = z.object({
  type: z.literal("project").default("project"),
  // The project
  projectDescription: z.string().min(30, "Tell us a bit more (30+ characters)").max(2500),
  projectCity: z.string().min(1, "City is required"),
  projectProvince: z.string().min(1, "Province is required"),
  projectCategory: z.string().optional(),
  projectPropertyType: z.string().optional(),
  // Owner / property contact (optional — referrer might not yet have permission to share)
  ownerName: z.string().optional(),
  ownerEmail: z.union([z.string().email(), z.literal("")]).optional(),
  ownerPhone: z.string().optional(),
  // The referrer (required — we need to pay the finder's fee + send updates)
  referrerName: z.string().min(1, "Your name is required"),
  referrerEmail: z.string().email("Enter a valid email"),
  referrerPhone: z.string().optional(),
  referrerAffiliation: z.string().max(200).optional(),
  // Permission / disclosure
  permission: z
    .literal(true, {
      message: "Please confirm you have the property contact's permission, or that you're introducing them to PMRFP yourself.",
    }),
  // Honeypot
  company_website: z.string().max(0).optional(),
});
export type ProjectReferralInput = z.infer<typeof projectReferralSchema>;

// Backward-compat alias for callers that still import the old name.
export const referralSchema = projectReferralSchema;

/**
 * Refer-a-trade intake. Fee paid when the referred trade activates their
 * Trade Pro subscription ($249/yr) — the direct-revenue listing event. This
 * is the highest-value referral lane because PMRFP gets paid the moment the
 * trade lists.
 */
export const tradeReferralSchema = z.object({
  type: z.literal("trade").default("trade"),
  // The trade
  tradeCompanyName: z.string().min(1, "Trade company name is required"),
  tradeCategory: z.string().optional(),
  tradeCity: z.string().min(1, "City is required"),
  tradeProvince: z.string().min(1, "Province is required"),
  tradeContactName: z.string().optional(),
  tradeContactEmail: z.union([z.string().email(), z.literal("")]).optional(),
  tradeContactPhone: z.string().optional(),
  tradeWebsite: z.union([z.string().url(), z.literal("")]).optional(),
  whyThemNote: z.string().max(1000).optional(),
  // The referrer
  referrerName: z.string().min(1, "Your name is required"),
  referrerEmail: z.string().email("Enter a valid email"),
  referrerPhone: z.string().optional(),
  referrerAffiliation: z.string().max(200).optional(),
  // Permission
  permission: z
    .literal(true, {
      message: "Please confirm you have the trade contact's permission, or that you're introducing them to PMRFP yourself.",
    }),
  company_website: z.string().max(0).optional(),
});
export type TradeReferralInput = z.infer<typeof tradeReferralSchema>;

export const contactRequestSchema = z.object({
  requestType: z
    .enum(["directory_intro", "property_manager_help", "general_contact", "vendor_question"])
    .default("general_contact"),
  name: z.string().min(1, "Your name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
  organization: z.string().optional(),
  targetOrganizationId: z.string().optional(),
  message: z.string().min(1, "A message is required").max(3000),
  // Honeypot — must stay empty.
  company_website: z.string().max(0).optional(),
});
export type ContactRequestInput = z.infer<typeof contactRequestSchema>;
