/**
 * "Report an error or request removal": what a request may contain and the
 * admin workflow. Pure (zod only) so the form, the route and the tests share
 * it. Table: correction_requests (migration 20261017000050). Policy page:
 * /corrections.
 */
import { z } from "zod";

export const PAGE_KINDS = ["rfp", "contract_winner", "intel_company", "intel_buyer", "intel_award", "major_project", "benchmark", "insight", "forum_post", "forum_thread", "other"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const REASONS = ["wrong_info", "outdated", "personal_info", "removal", "defamation", "other"] as const;
export type CorrectionReason = (typeof REASONS)[number];

export const STATUSES = ["new", "in_review", "corrected", "removed", "declined", "closed"] as const;
export type CorrectionStatus = (typeof STATUSES)[number];
/** Statuses that end a request: they need a resolution note and a date. */
export const FINAL_STATUSES: readonly CorrectionStatus[] = ["corrected", "removed", "declined", "closed"];

/** Personal-information requests are handled first (privacy law). */
export const URGENT_REASONS: readonly CorrectionReason[] = ["personal_info", "removal", "defamation"];

export const correctionSchema = z.object({
  pageKind: z.enum(PAGE_KINDS),
  // A site path, never a full URL (no open redirect, no foreign hosts).
  pagePath: z
    .string()
    .min(1)
    .max(500)
    .regex(/^\/(?!\/)[^\s]*$/, "Invalid page"),
  pageRef: z.string().max(300).optional(),
  reason: z.enum(REASONS),
  details: z.string().trim().min(10, "Tell us a little more (10 characters or more)").max(5000),
  contactEmail: z.string().trim().email("Enter a valid email").max(254),
  contactName: z.string().trim().max(200).optional(),
  lang: z.enum(["en", "fr", "es"]).default("en"),
  // Honeypot: must stay empty.
  company_website: z.string().max(0).optional(),
});
export type CorrectionInput = z.infer<typeof correctionSchema>;

/** The row the route inserts (service role). */
export function toCorrectionRow(input: CorrectionInput, reporterUserId: string | null) {
  return {
    page_kind: input.pageKind,
    page_path: input.pagePath,
    page_ref: input.pageRef?.trim() || null,
    reason: input.reason,
    details: input.details,
    contact_email: input.contactEmail.toLowerCase(),
    contact_name: input.contactName?.trim() || null,
    lang: input.lang,
    reporter_user_id: reporterUserId,
    status: "new" as const,
  };
}

export const resolutionSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(STATUSES),
    resolution: z.string().trim().max(5000).optional(),
  })
  .refine((v) => !FINAL_STATUSES.includes(v.status) || (v.resolution ?? "").length > 0, {
    message: "Write what was done before closing the request",
    path: ["resolution"],
  });

/** Business days since a request arrived (Mon–Fri), for the queue's "overdue" flag. */
export function businessDaysSince(createdIso: string, now: Date = new Date()): number {
  const start = new Date(createdIso);
  let days = 0;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  while (d.getTime() < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days++;
  }
  return days;
}

/** Targets from the /corrections policy: acknowledge in 2 business days, resolve in 10. */
export const ACK_TARGET_DAYS = 2;
export const RESOLVE_TARGET_DAYS = 10;
