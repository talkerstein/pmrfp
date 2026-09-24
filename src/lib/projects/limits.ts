/**
 * Plan limits for Projects. Free trades get a taste (one project, three
 * photos); Trade Pro (session.hasTradeAccess) gets the working tool. The
 * server enforces these in the upload route and the publish action; the
 * capture page only mirrors them so nobody hits a wall after uploading.
 */
export const FREE_PROJECT_LIMIT = 1;
export const FREE_PHOTO_LIMIT = 3;
/** Paid ceiling: a sanity cap, not a sales lever. */
export const PAID_PHOTO_LIMIT = 24;

export function photoLimit(paid: boolean): number {
  return paid ? PAID_PHOTO_LIMIT : FREE_PHOTO_LIMIT;
}

/** Can this org start another project? `existing` = projects not rejected/archived. */
export function canAddProject(paid: boolean, existing: number): boolean {
  return paid || existing < FREE_PROJECT_LIMIT;
}

/** Why a publish is blocked by the plan, or null when it's fine. */
export function publishLimitError(p: { paid: boolean; existingProjects: number; photoCount: number }): string | null {
  if (!canAddProject(p.paid, p.existingProjects)) {
    return "The free plan includes one project. Upgrade to Trade Pro to add more.";
  }
  const max = photoLimit(p.paid);
  if (p.photoCount > max) {
    return p.paid
      ? `Up to ${max} photos per project. Remove a few and try again.`
      : `The free plan allows ${max} photos per project. Remove some, or upgrade to Trade Pro for more.`;
  }
  return null;
}
