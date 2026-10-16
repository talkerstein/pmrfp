/**
 * The "intel" entitlement: Award Intelligence, a paid add-on of its own,
 * separate from Trade Pro (table intel_access, migration 20261017000001).
 * Intel does not unlock Trade Pro and Trade Pro does not unlock Intel.
 *
 * An organization has Intel when its intel_access row is active, comped
 * (an admin grant) or trialing, hasn't passed an admin-set end date, and the
 * organization isn't suspended. PMRFP admins always have it (to support
 * customers). The one place that decides is loadSessionContext()
 * (src/lib/access/access.ts) via intelEntitled(); the SQL mirror is
 * has_intel_access(). Pure, so it is unit tested and safe anywhere.
 */

export const INTEL_ENTITLED_STATUSES = ["active", "comped", "trialing"] as const;

/** An intel_access row as the app reads it. */
export interface IntelAccessRow {
  status: string;
  expires_at?: string | null;
}

export function isIntelRowActive(row: IntelAccessRow | null | undefined, now: Date = new Date()): boolean {
  if (!row) return false;
  if (!(INTEL_ENTITLED_STATUSES as readonly string[]).includes(row.status)) return false;
  if (row.expires_at) {
    const end = Date.parse(row.expires_at);
    if (Number.isFinite(end) && end <= now.getTime()) return false;
  }
  return true;
}

/** THE Intel rule: admins, or a non-suspended organization with an active row. */
export function intelEntitled(p: {
  admin: boolean;
  organizationStatus?: string | null;
  row: IntelAccessRow | null | undefined;
  now?: Date;
}): boolean {
  if (p.admin) return true;
  if (p.organizationStatus === "suspended") return false;
  return isIntelRowActive(p.row, p.now);
}

/** Stripe subscription status → intel_access.status. */
export function intelStatusFromStripe(s: string): string {
  switch (s) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "unpaid":
      return s;
    default:
      return "inactive";
  }
}
