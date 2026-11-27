import "server-only";
import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/access/access";
import type { D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { FREE_LIMIT, handleFromName } from "./rules";

const ownerRole = "u.status='active' AND u.primary_role IN ('real_estate_agent','property_manager')";
const ownerScope = `EXISTS(SELECT 1 FROM users_profile u WHERE u.id=? AND ${ownerRole}) AND ${customerAppAuthority}`;
export const approvedTrustedTrade = "o.status='active' AND o.profile_status='approved' AND o.is_demo=0 AND o.organization_type IN ('trade_company','supplier')";
export const paidTrustedList = `EXISTS(SELECT 1 FROM subscriptions s JOIN organization_members m ON m.organization_id=s.organization_id
  WHERE m.user_id=l.owner_id AND m.organization_id=l.organization_id AND s.tier='realtor' AND s.status IN ('active','comped'))`;
export const visibleTrustedTrade = `(${paidTrustedList} OR (SELECT count(*) FROM trusted_list_items j
  JOIN organizations t ON t.id=j.organization_id
  WHERE j.owner_id=l.owner_id AND t.status='active' AND t.profile_status='approved' AND t.is_demo=0
  AND t.organization_type IN ('trade_company','supplier')
  AND (j.position,j.organization_id)<(i.position,i.organization_id))<${FREE_LIMIT})`;

async function vpsOwnerHandle(db: D1Binding, userId: string) {
  return db.prepare(`SELECT handle FROM trusted_lists WHERE owner_id=? AND ${ownerScope}`)
    .bind(userId, userId).first<{ handle: string }>();
}

async function ensureVpsTrustedList(db: D1Binding, session: SessionContext) {
  const current = await vpsOwnerHandle(db, session.userId);
  if (current) return current;
  const base = handleFromName(session.profile.full_name, session.organization?.name);
  const name = (session.profile.full_name?.trim() || session.organization?.name || "My trusted trades").slice(0, 80);
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = attempt ? `${base.slice(0, 31)}-${randomUUID().slice(0, 8)}` : base;
    const inserted = await db.prepare(`INSERT INTO trusted_lists(owner_id,organization_id,handle,display_name,brokerage)
      SELECT ?,(SELECT m.organization_id FROM organization_members m WHERE m.organization_id=? AND m.user_id=?),?,?,?
      WHERE ${ownerScope} ON CONFLICT DO NOTHING RETURNING handle`)
      .bind(session.userId, session.organization?.id ?? null, session.userId, handle,
        name.length >= 2 ? name : "My trusted trades", session.organization?.name?.slice(0, 80) ?? null, session.userId)
      .first<{ handle: string }>();
    const found = inserted ?? await vpsOwnerHandle(db, session.userId);
    if (found) return found;
  }
  return null;
}

export async function toggleVpsTrustedTrade(session: SessionContext, targetId: string, db: D1Binding = vpsAppDatabase()) {
  const list = await ensureVpsTrustedList(db, session);
  if (!list) return { error: "Could not create your page. Please try again." };
  const user = session.userId;
  const result = await db.batch<{ organization_id?: string; slug?: string; listed?: number }>([
    db.prepare(`DELETE FROM trusted_list_items WHERE owner_id=? AND organization_id=?
      AND ${ownerScope} RETURNING organization_id`).bind(user, targetId, user),
    db.prepare(`INSERT INTO trusted_list_items(owner_id,organization_id,position)
      SELECT l.owner_id,o.id,(SELECT coalesce(max(i.position)+1,0) FROM trusted_list_items i WHERE i.owner_id=l.owner_id)
      FROM trusted_lists l JOIN organizations o ON o.id=? WHERE l.owner_id=? AND ${ownerScope} AND changes()=0
        AND ${approvedTrustedTrade} AND (${paidTrustedList} OR (SELECT count(*) FROM trusted_list_items i WHERE i.owner_id=l.owner_id)<?)
      ON CONFLICT DO NOTHING RETURNING organization_id`).bind(targetId, user, user, FREE_LIMIT),
    db.prepare(`SELECT slug,${approvedTrustedTrade} AS listed FROM organizations o WHERE id=?`).bind(targetId),
  ]);
  if (result.length !== 3 || result.some(row => !row.success)) throw new Error("Trusted list update failed");
  const slug = result[2].results[0]?.slug;
  if (result[0].results[0]) return { saved: false, handle: list.handle, slug };
  if (result[1].results[0]) return { saved: true, handle: list.handle, slug };
  if (result[2].results[0]?.listed !== 1) return { error: "That company isn't listed in the directory." };
  return { error: `A free page holds ${FREE_LIMIT} trades. Realtor Pro makes it unlimited.`, limit: true, handle: list.handle };
}

export async function updateVpsTrustedNote(user: string, target: string, note: string, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`UPDATE trusted_list_items SET note=? WHERE owner_id=? AND organization_id=? AND ${ownerScope}
    RETURNING (SELECT handle FROM trusted_lists WHERE owner_id=?) AS handle`)
    .bind(note || null, user, target, user, user).first<{ handle: string }>();
  return row?.handle ?? null;
}

export async function updateVpsTrustedPage(session: SessionContext, data: {
  handle: string; displayName: string; brokerage: string; headline: string; contactPhone: string; contactEmail: string; published: boolean;
}, db: D1Binding = vpsAppDatabase()) {
  const list = await ensureVpsTrustedList(db, session);
  if (!list) return { error: "Could not create your page. Please try again." };
  const row = await db.prepare(`UPDATE trusted_lists AS l SET handle=?,display_name=?,brokerage=?,headline=?,
    contact_phone=CASE WHEN ${paidTrustedList} THEN ? ELSE NULL END,
    contact_email=CASE WHEN ${paidTrustedList} THEN ? ELSE NULL END,published=?,updated_at=?
    WHERE owner_id=? AND ${ownerScope} AND NOT EXISTS(SELECT 1 FROM trusted_lists t WHERE t.handle=? AND t.owner_id<>l.owner_id)
    RETURNING handle`).bind(data.handle, data.displayName, data.brokerage || null, data.headline || null,
    data.contactPhone || null, data.contactEmail || null, Number(data.published), new Date().toISOString(), session.userId,
    session.userId, data.handle).first<{ handle: string }>();
  return row ? { previousHandle: list.handle } : { error: "That link is taken. Try another." };
}

export async function isVpsTrustedTradeSaved(userId: string, targetId: string, db: D1Binding = vpsAppDatabase()) {
  return Boolean(await db.prepare(`SELECT 1 AS saved FROM trusted_list_items WHERE owner_id=? AND organization_id=? AND ${ownerScope}`)
    .bind(userId, targetId, userId).first());
}

export async function recordVpsTrustedQuote(input: { handle: string; organizationId: string; name: string; email: string; phone: string; message: string },
  db: D1Binding = vpsAppDatabase()) {
  const id = randomUUID();
  const result = await db.batch<{ id?: string; to?: string | null; tradeName?: string; displayName?: string; brokerage?: string | null;
    contactEmail?: string | null; ownerEmail?: string | null }>([
    db.prepare(`INSERT INTO contact_requests(id,request_type,requester_name,requester_email,requester_phone,target_organization_id,message)
      SELECT ?,'directory_intro',?,?,?,o.id,? FROM trusted_lists l
      JOIN users_profile u ON u.id=l.owner_id AND ${ownerRole}
      JOIN trusted_list_items i ON i.owner_id=l.owner_id JOIN organizations o ON o.id=i.organization_id
      WHERE l.handle=? AND l.published=1 AND o.id=? AND ${approvedTrustedTrade} AND ${customerAppAuthority}
        AND ${visibleTrustedTrade}
      RETURNING id`).bind(id, input.name, input.email, input.phone || null,
      `[Quote request via /trusted/${input.handle}] ${input.message}`, input.handle, input.organizationId),
    db.prepare(`SELECT o.email AS 'to',o.name AS tradeName,l.display_name AS displayName,l.brokerage,
      CASE WHEN ${paidTrustedList} THEN l.contact_email END AS contactEmail,u.email AS ownerEmail
      FROM trusted_lists l JOIN users_profile u ON u.id=l.owner_id JOIN contact_requests c ON c.id=?
      JOIN organizations o ON o.id=c.target_organization_id WHERE l.handle=? AND ${customerAppAuthority}`).bind(id, input.handle),
  ]);
  if (result.length !== 2 || result.some(row => !row.success)) throw new Error("Quote request could not be saved");
  const row = result[1].results[0];
  if (result[0].results[0]?.id !== id || !row?.tradeName || !row.displayName) return null;
  return { to: row.to ?? null, tradeName: row.tradeName,
    recommender: row.brokerage ? `${row.displayName} (${row.brokerage})` : row.displayName,
    cc: [...new Set([row.contactEmail, row.ownerEmail].filter((email): email is string => Boolean(email)))],
  };
}
