/**
 * What a FREE account can do on an RFP page (pure, unit-tested). Trade Pro
 * keeps the paid details: full scope, documents, buyer contact, price band,
 * bid checklist, who won, daily alerts.
 *
 * - Save / bookmark: any signed-in trade or supplier account (the accounts
 *   with a saved-RFPs dashboard), and anyone with trade access.
 * - The official source link of a PUBLIC tender (the issuer's own notice,
 *   public on the portal anyway): any signed-in account. Private RFPs posted
 *   on PMRFP have no public notice; nothing changes for them.
 */

export const FREE_SAVE_ROLES = ["trade", "supplier"] as const;

export interface FreeActionViewer {
  primaryRole: string;
  hasTradeAccess: boolean;
}

export function canSaveRfps(v: FreeActionViewer | null | undefined): boolean {
  if (!v) return false;
  return v.hasTradeAccess || (FREE_SAVE_ROLES as readonly string[]).includes(v.primaryRole);
}

export function canOpenOfficialNotice(v: FreeActionViewer | null | undefined, sourceType: string | null | undefined): boolean {
  return Boolean(v) && sourceType === "public_source";
}

/**
 * The official link on an RFP page that's locked for this viewer. A public
 * buyer's listing never needs a paid plan: any account opens it, and a
 * listing published with the buyer's own permission (the city flow) opens
 * for every visitor, signed in or not.
 */
export function canOpenOfficialLink(
  v: FreeActionViewer | null | undefined,
  sourceType: string | null | undefined,
  listedWithPermission: boolean,
): boolean {
  if (sourceType !== "public_source") return false;
  return listedWithPermission || canOpenOfficialNotice(v, sourceType);
}

/** Session → the two facts the rules need. */
export function viewerOf(session: { profile: { primary_role: string }; hasTradeAccess: boolean } | null | undefined): FreeActionViewer | null {
  return session ? { primaryRole: session.profile.primary_role, hasTradeAccess: session.hasTradeAccess } : null;
}
