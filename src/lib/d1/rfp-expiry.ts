import { D1ApiError, UUID, type D1Binding } from "./contracts";

const authority = "EXISTS (SELECT 1 FROM _customer_app_authority WHERE id=1 AND mode='native-v1')";
const canExtend = "coalesce(sealed,0)=0 AND status IN ('published','expired')";
const dayMs = 86_400_000;
const expiredCandidates = `SELECT id FROM rfp_posts WHERE status='published'
  AND deadline<? AND julianday(expiry_notice_sent_at)<julianday(?) ORDER BY deadline,id LIMIT 200`;
const noticeCandidates = `SELECT id FROM rfp_posts WHERE status='published'
  AND deadline<? AND expiry_notice_sent_at IS NULL AND posted_by_user_id IS NOT NULL ORDER BY deadline,id LIMIT 200`;
export const RFP_EXTENSION_DAYS = 30;

function requireAuthority(db: D1Binding) {
  return db.prepare(`SELECT CASE WHEN ${authority} THEN 1 ELSE json('native_app_authority_unavailable') END`);
}

interface ExpiryRow {
  title: string;
  slug: string;
  keep_alive_token: string;
  posted_by_user_id: string;
  email: string | null;
}

export async function sweepD1RfpExpiry(db: D1Binding, now = new Date()) {
  const stamp = now.toISOString();
  const today = stamp.slice(0, 10);
  const cutoff = new Date(now.getTime() - 7 * dayMs).toISOString();
  const [, expired, claimed] = await db.batch<ExpiryRow>([
    requireAuthority(db),
    db.prepare(`UPDATE rfp_posts SET status='expired', closed_at=? WHERE id IN (${expiredCandidates})`)
      .bind(stamp, today, cutoff),
    db.prepare(`UPDATE rfp_posts SET expiry_notice_sent_at=?
      WHERE id IN (${noticeCandidates})
      RETURNING title,slug,keep_alive_token,posted_by_user_id,
        (SELECT email FROM users_profile WHERE id=rfp_posts.posted_by_user_id) AS email`).bind(stamp, today),
  ]);
  if (!expired?.success || !claimed?.success || typeof expired.meta.changes !== "number") {
    throw new D1ApiError(503, "expiry_sweep_unavailable");
  }
  return { expired: expired.meta.changes, claimed: claimed.results };
}

export async function previewD1RfpExpiry(db: D1Binding, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - 7 * dayMs).toISOString();
  const [, counts] = await db.batch<{ wouldExpire: number; wouldNotify: number }>([
    requireAuthority(db),
    db.prepare(`SELECT (SELECT count(*) FROM (${expiredCandidates})) AS wouldExpire,
      (SELECT count(*) FROM (${noticeCandidates}) n
        JOIN rfp_posts r ON r.id=n.id JOIN users_profile u ON u.id=r.posted_by_user_id
        WHERE u.email IS NOT NULL AND u.email<>'') AS wouldNotify`).bind(today, cutoff, today),
  ]);
  if (!counts?.success || !counts.results[0]) throw new D1ApiError(503, "expiry_preview_unavailable");
  return { dry: true, ...counts.results[0] };
}

export async function keepD1RfpAlive(db: D1Binding, token: string, now = new Date()) {
  if (!UUID.test(token)) return "invalid";
  const deadline = new Date(now.getTime() + RFP_EXTENSION_DAYS * dayMs).toISOString().slice(0, 10);
  const [, update, lookup] = await db.batch<{ id: string }>([
    requireAuthority(db),
    db.prepare(`UPDATE rfp_posts SET deadline=?, expiry_notice_sent_at=NULL, status='published'
      WHERE keep_alive_token=? AND ${canExtend} RETURNING id`).bind(deadline, token.toLowerCase()),
    db.prepare("SELECT id FROM rfp_posts WHERE keep_alive_token=?").bind(token.toLowerCase()),
  ]);
  if (!update?.success || !lookup?.success) throw new D1ApiError(503, "rfp_extension_unavailable");
  if (update.results.length === 1) return "ok";
  return lookup.results.length === 1 ? "notlive" : "invalid";
}
