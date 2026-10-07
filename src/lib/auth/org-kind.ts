/**
 * Buyer organization kinds. Property managers, general contractors and
 * landlords all sign up with primary_role 'property_manager' (same posting
 * rights, same PM dashboard). What differs is the organization type:
 *
 *   property_manager → organizations.organization_type 'property_manager'
 *   builder (GC)     → 'builder'
 *   landlord         → 'landlord' (independent building owners)
 *
 * Until migration 20261007000001_landlord.sql is applied, the CHECK
 * constraint rejects 'landlord'; onboarding then falls back to
 * 'property_manager' and keeps org_kind 'landlord' in auth user metadata.
 *
 * Pure and client-safe: no server imports.
 */

/** The non-default buyer kinds a sign-up can carry (auth metadata `org_kind`). */
export const SPECIAL_BUYER_KINDS = ["builder", "landlord"] as const;
export type SpecialBuyerKind = (typeof SPECIAL_BUYER_KINDS)[number];
export type BuyerOrgKind = "property_manager" | SpecialBuyerKind;

/** Organization types that post work (RFPs / packages) rather than get listed. */
export const BUYER_ORG_TYPES = ["property_manager", "owner", "builder", "landlord"] as const;

/** True for organizations that post work: PMs, owners, GCs, landlords. Never listed in the directory. */
export function isBuyerOrgType(t: unknown): boolean {
  return typeof t === "string" && (BUYER_ORG_TYPES as readonly string[]).includes(t);
}

/** `orgKind` form value / `org_kind` metadata → a special buyer kind, or null for a plain PM. */
export function parseBuyerKind(v: unknown): SpecialBuyerKind | null {
  return v === "builder" || v === "landlord" ? v : null;
}

/** Is this organization a landlord? Covers the pre-migration fallback (PM org + landlord metadata). */
export function isLandlordOrg(orgType: unknown, metadataKind?: unknown): boolean {
  return orgType === "landlord" || (orgType === "property_manager" && metadataKind === "landlord");
}

/** Postgres CHECK violation (organizations_organization_type_check before the landlord migration). */
export function isCheckViolation(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "23514" || /organization_type_check/.test(err.message ?? "");
}

/** GHL tags for a sign-up / onboarding event. */
export function buyerTags(base: string, kind: SpecialBuyerKind | null): string[] {
  if (kind === "builder") return [base, "pmrfp-gc"];
  if (kind === "landlord") return [base, "pmrfp-landlord", "landlord"];
  return [base];
}

/** Human label for the admin sign-up alert. */
export function signupRoleLabel(role: string, kind: SpecialBuyerKind | null): string {
  if (role === "property_manager" && kind === "builder") return "General contractor";
  if (role === "property_manager" && kind === "landlord") return "Landlord";
  return role.replace(/_/g, " ");
}
