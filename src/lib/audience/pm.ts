/**
 * Who a page (or a visitor) is for: the property-manager side (property
 * managers, landlords, condo boards, public buyers) or the trade side.
 *
 * Trade-side interruptions (the "Free for trade companies" email popup, the
 * corner toasts, the "get tenders by email" bar) never show on the
 * property-manager side, nor to a visitor who chose a property-manager role
 * (the AUDIENCE_COOKIE). Persona QA 2026-10-21: the trade popup covered the
 * condo-board panel on the home page and swallowed a French property
 * manager's click.
 *
 * Pure and client-safe.
 */

/** Paths (without the /fr or /es prefix) for the property-manager side. */
export const PM_AUDIENCE_PATHS: readonly string[] = [
  "/for-property-managers",
  "/for/condo-boards",
  "/for/landlords",
  "/for-public-buyers",
  "/rfp-writer",
  "/rfp-templates",
  "/use-template",
  "/pm-dashboard",
  "/resources/how-to-post-a-quality-rfp",
  "/resources/how-to-write-a-commercial-property-maintenance-rfp",
];

/** True for a property-manager-side page. `path` has no locale prefix ("/for/condo-boards"). */
export function isPmAudiencePath(path: string | null | undefined): boolean {
  const p = (path ?? "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return PM_AUDIENCE_PATHS.some((x) => p === x || p.startsWith(`${x}/`));
}

/** Remembers the side a visitor picked: "pm" or "trade". Not personal data; one year. */
export const AUDIENCE_COOKIE = "pmrfp_aud";
export type Audience = "pm" | "trade";

/** Roles on the property-manager side (sign-up ?role=, users_profile.primary_role). */
export function audienceForRole(role: string | null | undefined): Audience | null {
  if (!role) return null;
  if (role === "property_manager" || role === "landlord" || role === "general_contractor" || role === "real_estate_agent") return "pm";
  if (role === "trade" || role === "supplier" || role === "talent") return "trade";
  return null;
}

/** Read the audience from a cookie string (document.cookie or a Cookie header). */
export function audienceFromCookie(cookie: string | null | undefined): Audience | null {
  const m = new RegExp(`(?:^|;\\s*)${AUDIENCE_COOKIE}=(pm|trade)(?:;|$)`).exec(cookie ?? "");
  return m ? (m[1] as Audience) : null;
}

/** Remember the visitor's side (browser only; ignores failures). */
export function rememberAudience(audience: Audience): void {
  try {
    document.cookie = `${AUDIENCE_COOKIE}=${audience}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`;
  } catch {
    /* cookies blocked */
  }
}
