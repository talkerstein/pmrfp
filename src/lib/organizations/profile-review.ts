/**
 * Approved companies stay approved when they edit their profile (pure;
 * tested in test/unit/keep-approval-on-edit.test.ts).
 *
 * Saving /dashboard/company used to put every company back in
 * pending_review, so an approved company that fixed a typo dropped out of
 * the directory, PM job alerts and free responses until an admin approved it
 * again. Now:
 *
 *   approved                     stays approved. Edits to the trust fields
 *                                below are flagged for a light admin check
 *                                (/admin/organizations?view=edited) without
 *                                unpublishing anything.
 *   draft / pending_review       pending_review, as before.
 *   rejected / suspended         pending_review, as before: an edit never
 *                                approves a company, only an admin does.
 *
 * The flag itself is set by the database (trigger track_profile_review in
 * supabase/migrations/20261021000030_keep_approval_on_edit.sql), so it holds
 * for any write by a member, not just this form. The app also writes one
 * audit_logs entry per flagged edit.
 */
import type { ProfileStatus } from "@/types/db";

/** The fields whose change on an approved company is worth an admin's look. Same list as the trigger. */
export const REVIEW_FIELDS = ["name", "website", "logo_url", "short_description", "full_description", "email"] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

export const REVIEW_FIELD_LABELS: Record<ReviewField, string> = {
  name: "Name",
  website: "Website",
  logo_url: "Logo",
  short_description: "Short description",
  full_description: "Description",
  email: "Contact email",
};

/** organizations.profile_status after the company's own member saves its profile. Never 'approved' unless it already was. */
export function statusAfterOwnEdit(current: ProfileStatus | string | null | undefined): ProfileStatus {
  return current === "approved" ? "approved" : "pending_review";
}

/** The profile_status to write with a member's save, or null to leave the column alone. */
export function profileStatusPatch(current: ProfileStatus | string | null | undefined): ProfileStatus | null {
  const next = statusAfterOwnEdit(current);
  return next === current ? null : next;
}

export interface ReviewChange {
  field: ReviewField;
  from: string | null;
  to: string | null;
}

function norm(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s === "" ? null : s;
}

/**
 * Trust fields that differ between the saved row and an update (fields the
 * update doesn't touch are skipped). Mirrors the trigger, for the audit log.
 */
export function reviewChanges(
  before: Partial<Record<ReviewField, unknown>>,
  after: Partial<Record<ReviewField, unknown>>,
): ReviewChange[] {
  const out: ReviewChange[] = [];
  for (const field of REVIEW_FIELDS) {
    if (!(field in after)) continue;
    const from = norm(before[field]);
    const to = norm(after[field]);
    if (from !== to) out.push({ field, from, to });
  }
  return out;
}

/** organizations.review_changes ({"field": {"from", "to"}}) as rows for the admin list. Unknown or malformed entries are dropped. */
export function parseReviewChanges(raw: unknown): ReviewChange[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const obj = raw as Record<string, unknown>;
  const out: ReviewChange[] = [];
  for (const field of REVIEW_FIELDS) {
    const c = obj[field];
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const { from, to } = c as { from?: unknown; to?: unknown };
    out.push({ field, from: norm(from), to: norm(to) });
  }
  return out;
}

/** Short preview for the admin diff ("—" for empty). */
export function clipValue(v: string | null, max = 160): string {
  if (!v) return "—";
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
