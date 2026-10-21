/**
 * "List your tenders on PMRFP, free" (/for-public-buyers): what a public
 * buyer's request may contain, what admins can do with it, and the email
 * fallback. Pure (zod only), so the form, both routes and the tests share it.
 * Table: buyer_source_requests (migration 20261021000010_buyer_sources.sql).
 *
 * Canada only for now (country-first: the U.S. is never mixed in).
 */
import { z } from "zod";
import { PERMISSION_METHODS, type PermissionMethod } from "./permissions";

export { FOR_PUBLIC_BUYERS_PATH, HONEYPOT, NOTICES_EMAIL, emailMatchesSite, listYourTendersHref, mailtoFallback } from "./source-links";

export const CA_PROVINCE_CODES = ["ON", "BC", "AB", "NS", "MB", "SK", "QC", "NB", "PE", "NL", "YT", "NT", "NU"] as const;
export type CaProvinceCode = (typeof CA_PROVINCE_CODES)[number];

export const REQUEST_STATUSES = ["new", "approved", "rejected"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Buyer slugs as in src/lib/buyers/directory.json. */
export const SLUG = /^[a-z0-9][a-z0-9-]{1,119}$/;
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url("Enter a full web address (https://…)")
  .refine((u) => /^https?:\/\//i.test(u), "Enter a full web address (https://…)");

export const buyerSourceRequestSchema = z
  .object({
    organization: z.string().trim().min(2, "Enter your organization").max(200),
    contactName: z.string().trim().min(2, "Enter your name").max(200),
    workEmail: z.string().trim().email("Enter a valid email").max(254),
    tendersUrl: httpUrl,
    method: z.enum(PERMISSION_METHODS),
    feedUrl: z.union([httpUrl, z.literal("")]).optional(),
    provinceCode: z.enum(CA_PROVINCE_CODES),
    buyerSlug: z.union([z.string().regex(SLUG), z.literal("")]).optional(),
    authorized: z.literal(true, { message: "Confirm you're authorized to give this permission" }),
    lang: z.enum(["en", "fr", "es"]).default("en"),
  })
  .refine((v) => v.method !== "feed" || Boolean(v.feedUrl), { message: "Enter the feed URL", path: ["feedUrl"] });
export type BuyerSourceRequestInput = z.infer<typeof buyerSourceRequestSchema>;

/** The row the route inserts (service role). */
export function toRequestRow(input: BuyerSourceRequestInput) {
  return {
    organization: input.organization,
    contact_name: input.contactName,
    work_email: input.workEmail.toLowerCase(),
    tenders_url: input.tendersUrl,
    method: input.method,
    feed_url: input.method === "feed" ? input.feedUrl || null : null,
    province_code: input.provinceCode,
    country: "CA" as const,
    buyer_slug: input.buyerSlug || null,
    authorized: true,
    lang: input.lang,
    status: "new" as const,
  };
}

/** Admin decisions (/admin/buyer-sources). */
export const decisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    id: z.string().uuid(),
    method: z.enum(PERMISSION_METHODS),
    buyerSlug: z.string().trim().regex(SLUG, "Use the buyer's slug (lowercase, dashes)"),
    notes: z.string().trim().max(4000).optional(),
  }),
  z.object({ action: z.literal("reject"), id: z.string().uuid(), notes: z.string().trim().max(4000).optional() }),
  z.object({ action: z.literal("note"), id: z.string().uuid(), notes: z.string().trim().max(4000) }),
]);
export type Decision = z.infer<typeof decisionSchema>;

/** The registry row an approval writes (buyer_permissions upsert). */
export function approvalPermissionRow(
  req: { id: string; organization: string; contact_name: string; work_email: string; province_code: string; feed_url: string | null },
  decision: { buyerSlug: string; method: PermissionMethod; notes?: string },
  today: string,
  adminId: string,
) {
  return {
    buyer_slug: decision.buyerSlug,
    buyer_name: req.organization,
    province_code: req.province_code,
    country: "CA",
    scope: "buyer",
    status: "yes",
    method: decision.method,
    feed_url: decision.method === "feed" ? req.feed_url : null,
    granted_on: today,
    contact: `${req.contact_name} · ${req.work_email}`,
    reply_quote: `Submitted through pmrfp.com/for-public-buyers by ${req.contact_name} (${req.work_email}), who confirmed they are authorized to give this permission.`,
    notes: decision.notes || null,
    source_request_id: req.id,
    updated_by: adminId,
    updated_at: new Date().toISOString(),
  };
}
