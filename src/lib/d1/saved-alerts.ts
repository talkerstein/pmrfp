import { addDays, buildSavedAlerts, CLOSING_SOON_DAYS, ENDED_STATUSES, rfpLink, type SavedAlertDigest, type SavedRfp } from "@/lib/alerts/saved";
import { displayTitle } from "@/lib/tenders/title";
import { D1ApiError, UUID, type D1Binding } from "./contracts";

const authority = "EXISTS (SELECT 1 FROM _customer_app_authority WHERE id=1 AND mode='native-v1')";
const columns = "id,slug,title,status,deadline,source_type";
const candidates = `WITH closing AS (
  SELECT ${columns} FROM rfp_posts WHERE status='published' AND deadline BETWEEN ? AND ?
  ORDER BY deadline,id LIMIT 2000
), ended AS (
  SELECT ${columns} FROM rfp_posts WHERE status IN (${ENDED_STATUSES.map(() => "?").join(",")})
    AND (julianday(closed_at)>=julianday(?) OR julianday(updated_at)>=julianday(?))
  ORDER BY updated_at DESC,id LIMIT 2000
), candidates AS (SELECT * FROM closing UNION ALL SELECT * FROM ended)`;

function windows(now: Date) {
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  return {
    today,
    bounds: [today, addDays(today, CLOSING_SOON_DAYS), ...ENDED_STATUSES, weekAgo, weekAgo],
    since: new Date(now.getTime() - 90 * 86_400_000).toISOString(),
  };
}

function gate(db: D1Binding) {
  return db.prepare(`SELECT CASE WHEN ${authority} THEN 1 ELSE json('native_app_authority_unavailable') END`);
}

const authorized = "u.status='active' AND u.email<>'' AND coalesce(p.new_rfps,'daily')<>'off' AND coalesce(p.channel_email,1)=1";
const alertType = "CASE WHEN c.status='published' THEN 'saved_closing' ELSE 'saved_status:'||c.status END";
const noReceipt = `NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id=u.id
  AND n.type=(${alertType}) AND n.link_url='/rfps/'||c.slug AND julianday(n.created_at)>=julianday(?))`;

export async function readD1SavedAlerts(db: D1Binding, now: Date) {
  const { today, bounds, since } = windows(now);
  const [, count, selected] = await db.batch([
    gate(db),
    db.prepare(`${candidates} SELECT count(*) AS count FROM candidates`).bind(...bounds),
    db.prepare(`${candidates}
      SELECT c.*, u.id AS user_id, u.email FROM candidates c
      JOIN saved_rfps s ON s.rfp_id=c.id JOIN users_profile u ON u.id=s.user_id
      LEFT JOIN notification_preferences p ON p.user_id=u.id
      WHERE ${authorized} AND ${noReceipt}`).bind(...bounds, since),
  ]);
  if (!count?.success || !selected?.success || typeof count.results[0]?.count !== "number") {
    throw new D1ApiError(503, "saved_alerts_unavailable");
  }
  const rows = selected.results as unknown as (SavedRfp & { source_type: string | null; user_id: string; email: string })[];
  return { candidates: count.results[0].count, digests: buildSavedAlerts({
    today, rfps: new Map(rows.map(r => [r.id, { ...r, title: displayTitle(r.title, r.source_type).title }])),
    saved: rows.map(r => ({ user_id: r.user_id, rfp_id: r.id })),
    emailByUser: new Map(rows.map(r => [r.user_id, r.email])), optedOut: new Set(), alreadySent: new Set(),
  }) };
}

export async function claimD1SavedAlerts(db: D1Binding, digest: SavedAlertDigest, now: Date) {
  if (!digest.items.length) return digest;
  const { bounds, since } = windows(now);
  const receipts = digest.items.map(item => ({
    id: crypto.randomUUID(), rfp: item.rfp.id, type: item.type, link: rfpLink(item.rfp.slug), message: item.rfp.title,
    title: item.kind === "closing" ? "Saved tender closing soon" : "Saved tender status changed",
  }));
  const [, result] = await db.batch<{ id: string }>([
    gate(db),
    db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,link_url,created_at)
      SELECT json_extract(j.value,'$.id'),u.id,(${alertType}),json_extract(j.value,'$.title'),
        json_extract(j.value,'$.message'),'/rfps/'||c.slug,?
      FROM json_each(?) j JOIN rfp_posts c ON c.id=json_extract(j.value,'$.rfp')
      JOIN saved_rfps s ON s.rfp_id=c.id JOIN users_profile u ON u.id=s.user_id
      LEFT JOIN notification_preferences p ON p.user_id=u.id
      WHERE u.id=? AND u.email=? AND ${authorized} AND ${noReceipt}
        AND json_extract(j.value,'$.type')=(${alertType}) AND json_extract(j.value,'$.link')='/rfps/'||c.slug
        AND ((c.status='published' AND c.deadline BETWEEN ? AND ?) OR
          (c.status IN (${ENDED_STATUSES.map(() => "?").join(",")}) AND
            (julianday(c.closed_at)>=julianday(?) OR julianday(c.updated_at)>=julianday(?))))
      RETURNING id`).bind(now.toISOString(), JSON.stringify(receipts), digest.userId, digest.email, since, ...bounds),
  ]);
  if (!result?.success) throw new D1ApiError(503, "saved_alerts_unavailable");
  const claimed = new Set(result.results.map(row => row.id));
  return { ...digest, items: digest.items.filter((_, i) => claimed.has(receipts[i].id)) };
}

export async function unsubscribeD1Opportunities(db: D1Binding, userId: string, legacyDigest?: string) {
  if (!UUID.test(userId)) return false;
  const proof = legacyDigest
    ? "AND EXISTS (SELECT 1 FROM _legacy_opportunity_unsubscribe WHERE user_id=users_profile.id AND token_sha256=?)"
    : "";
  const [, result] = await db.batch([
    gate(db),
    db.prepare(`INSERT INTO notification_preferences(user_id,new_rfps)
      SELECT id,'off' FROM users_profile WHERE id=? ${proof}
      ON CONFLICT(user_id) DO UPDATE SET new_rfps='off'`).bind(...(legacyDigest ? [userId, legacyDigest] : [userId])),
  ]);
  return result?.success === true && result.meta.changes === 1;
}
