import { parseRoleChoice } from "./oauth";

/** Roles a /sign-up link may start on (the form's role picker values). */
export const SIGNUP_LINK_ROLES = ["trade", "supplier", "property_manager", "visitor", "real_estate_agent", "general_contractor", "landlord", "talent"] as const;
export type SignupLinkRole = (typeof SIGNUP_LINK_ROLES)[number];

/**
 * `/sign-up?role=…` (and `&kind=landlord|gc`) → the role the form starts on,
 * already picked: `?role=property_manager` starts as a property manager,
 * `?role=landlord` (or `?role=property_manager&kind=landlord`) as a landlord,
 * `?role=property_manager&kind=gc` as a general contractor. Never "just
 * looking" (visitor): that has to be a deliberate pick. Unknown → undefined.
 */
export function signupRoleFromLink(role: unknown, kind?: unknown): SignupLinkRole | undefined {
  if (typeof role !== "string" || role === "visitor") return undefined;
  const choice = parseRoleChoice(role, kind);
  if (choice) return choice;
  return (SIGNUP_LINK_ROLES as readonly string[]).includes(role) ? (role as SignupLinkRole) : undefined;
}
