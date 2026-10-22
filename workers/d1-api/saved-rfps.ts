import { D1ApiError, type D1Binding, type SaveRfpInput, type SavedRfpItem } from "../../src/lib/d1/contracts";

// Matches the app's free-saving rule and the current paid/trial entitlement.
// Profile, organization and subscription decisions come from D1, never headers or JWT metadata.
const ELIGIBLE = `EXISTS (
  SELECT 1 FROM users_profile p WHERE p.id = ? AND p.status = 'active' AND (
    p.primary_role IN ('trade','supplier') OR EXISTS (
      SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
      WHERE m.user_id=p.id AND o.status <> 'suspended' AND (
        (o.organization_type IN ('trade_company','supplier') AND EXISTS (
          SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id
          AND s.status IN ('active','comped') AND s.tier IN ('pro','featured')
        )) OR (o.organization_type='trade_company' AND EXISTS (
          SELECT 1 FROM trade_trials t WHERE t.organization_id=o.id AND julianday(t.ends_at)>julianday(?)
        ))
      )
    )
  )
)`;

export async function requireSaveAccess(db: D1Binding, userId: string, now: string): Promise<void> {
  const profile = await db.prepare("SELECT status FROM users_profile WHERE id=?").bind(userId).first<{ status: string }>();
  if (!profile) throw new D1ApiError(409, "profile_not_synced");
  if (profile.status !== "active") throw new D1ApiError(403, "account_inactive");
  const access = await db.prepare(`SELECT ${ELIGIBLE} AS allowed`).bind(userId, now).first<{ allowed: number }>();
  if (!access?.allowed) throw new D1ApiError(403, "trade_or_supplier_required");
}

/** Explicit public projection: no buyer email, scope, price or documents cross this boundary. */
export async function listSavedRfps(db: D1Binding, userId: string, now: string): Promise<SavedRfpItem[]> {
  await requireSaveAccess(db, userId, now);
  const { results } = await db.prepare(`
    SELECT r.id AS rfpId,r.title,r.slug,s.created_at AS savedAt
    FROM saved_rfps s JOIN rfp_posts r ON r.id=s.rfp_id
    WHERE s.user_id=? AND r.status='published' AND ${ELIGIBLE}
    ORDER BY julianday(s.created_at) DESC,s.id DESC LIMIT 500
  `).bind(userId, userId, now).all<SavedRfpItem>();
  return results;
}

export async function changeSavedRfp(db: D1Binding, userId: string, input: SaveRfpInput, now: string): Promise<void> {
  await requireSaveAccess(db, userId, now);
  const byId = input.rfpId !== undefined;
  const selector = byId ? "r.id=?" : "r.slug=?";
  const value = (byId ? input.rfpId : input.rfpSlug)!;
  if (input.action === "unsave") {
    // An own bookmark can be removed even after its listing becomes private/archived.
    // Slug resolution remains public-only to avoid probing unpublished slugs.
    await db.prepare(`DELETE FROM saved_rfps WHERE user_id=? AND ${ELIGIBLE}
      AND rfp_id IN (SELECT r.id FROM rfp_posts r WHERE ${selector}${byId ? "" : " AND r.status='published'"})
    `).bind(userId, userId, now, value).run();
    return;
  }
  const rfp = await db.prepare(`SELECT r.id FROM rfp_posts r WHERE r.status='published' AND ${selector}`).bind(value).first<{ id: string }>();
  if (!rfp) throw new D1ApiError(404, "not_found");
  // Every candidate condition is checked again in the write statement; ON CONFLICT never overwrites another user's data.
  await db.prepare(`INSERT INTO saved_rfps(id,user_id,organization_id,rfp_id,created_at)
    SELECT ?,?,(SELECT CASE WHEN COUNT(*)=1 THEN MAX(organization_id) ELSE NULL END
      FROM organization_members WHERE user_id=?),r.id,?
    FROM rfp_posts r WHERE r.id=? AND r.status='published' AND ${ELIGIBLE}
    ON CONFLICT(user_id,rfp_id) DO NOTHING
  `).bind(crypto.randomUUID(), userId, userId, now, rfp.id, userId, now).run();
}
