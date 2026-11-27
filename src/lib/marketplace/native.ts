import "server-only";
import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/access/access";
import { UUID, type D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { validateVpsListingPhotos } from "./native-media";
import { FREE_LISTING_LIMIT, listingSlug, renewedExpiry, type Currency, type ListingInput } from "./rules";

export const publicVpsListing = `l.status='active' AND l.expires_at>? AND
  EXISTS(SELECT 1 FROM users_profile u WHERE u.id=l.user_id AND u.status='active')`;
export const vpsMarketMember = `EXISTS(SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active')`;
export const vpsMarketAdmin = `EXISTS(SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active'
  AND u.primary_role IN ('admin','super_admin'))`;
const slotAvailable = `(?=1 OR (SELECT count(*) FROM marketplace_listings WHERE user_id=?
  AND status='active' AND expires_at>? AND id<>?) < ${FREE_LISTING_LIMIT})`;
const owner = `user_id=? AND ${vpsMarketMember} AND ${customerAppAuthority}`;

export async function saveVpsListing(session: SessionContext, id: string, data: ListingInput,
  db: D1Binding = vpsAppDatabase(), now: Date = new Date()) {
  if (id && !UUID.test(id)) return { error: "notFound" } as const;
  const { userId } = session;
  const time = now.toISOString();
  const expires = renewedExpiry(now).toISOString();
  const existing = id ? await db.prepare(`SELECT status FROM marketplace_listings WHERE id=? AND ${owner}`)
    .bind(id, userId, userId).first<{ status: string }>() : null;
  if (id && (!existing || existing.status === "removed")) return { error: "notFound" } as const;
  const photos = await validateVpsListingPhotos(data.photos, userId, db);
  const listingId = id || randomUUID();
  const status = data.publish ? "active" : "draft";
  const orgId = session.organization?.id ?? null;
  const fields = [
    data.title, data.category, data.condition, data.description, Number(data.priceOnRequest),
    data.priceOnRequest || data.price == null ? null : Math.round(data.price * 100),
    data.currency, data.city || null, data.regionSlug || null, data.country, JSON.stringify(photos), status,
  ];
  const capacity = [Number(!data.publish || session.hasTradeAccess), userId, time, listingId];
  const organization = `(SELECT m.organization_id FROM organization_members m WHERE m.user_id=? AND m.organization_id=?)`;
  const row = existing
    ? await db.prepare(`UPDATE marketplace_listings SET title=?,category=?,condition=?,description=?,price_on_request=?,
      price_cents=?,currency=?,city=?,region_slug=?,country=?,photos=?,status=?,organization_id=${organization},
      updated_at=?,expires_at=CASE WHEN ?=1 AND status<>'active' THEN ? ELSE expires_at END
      WHERE id=? AND ${owner} AND status<>'removed' AND ${slotAvailable} RETURNING slug`)
      .bind(...fields, userId, orgId, time, Number(data.publish), expires, id, userId, userId, ...capacity)
      .first<{ slug: string }>()
    : await db.prepare(`INSERT INTO marketplace_listings(id,user_id,title,category,condition,description,price_on_request,
      price_cents,currency,city,region_slug,country,photos,status,organization_id,slug,created_at,updated_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,${organization},?,?,?,?
      WHERE ${vpsMarketMember} AND ${customerAppAuthority} AND ${slotAvailable} RETURNING slug`)
      .bind(listingId, userId, ...fields, userId, orgId, listingSlug(data.title), time, time, expires, userId, ...capacity)
      .first<{ slug: string }>();
  if (row) return { slug: row.slug } as const;
  return { error: data.publish && !session.hasTradeAccess ? "limit" : "save" } as const;
}

export async function setVpsListingStatus(session: SessionContext, id: string, status: string,
  db: D1Binding = vpsAppDatabase(), now: Date = new Date()) {
  if (!UUID.test(id) || !["sold", "active", "draft"].includes(status)) return false;
  const { userId } = session;
  const time = now.toISOString();
  const row = await db.prepare(`UPDATE marketplace_listings SET status=?,updated_at=?,
    expires_at=CASE WHEN ?='active' THEN ? ELSE expires_at END
    WHERE id=? AND ${owner} AND status<>'removed' AND ${slotAvailable} RETURNING id`)
    .bind(status, time, status, renewedExpiry(now).toISOString(), id, userId, userId,
      Number(status !== "active" || session.hasTradeAccess), userId, time, id).first<{ id: string }>();
  return Boolean(row);
}

export async function deleteVpsListing(userId: string, id: string, db: D1Binding = vpsAppDatabase()) {
  if (UUID.test(id)) await db.prepare(`DELETE FROM marketplace_listings WHERE id=? AND ${owner}`).bind(id, userId, userId).run();
}

export async function moderateVpsListing(userId: string, id: string, status: string, db: D1Binding = vpsAppDatabase()) {
  if (!UUID.test(id) || !["removed", "active"].includes(status)) return;
  await db.prepare(`UPDATE marketplace_listings SET status=?,updated_at=? WHERE id=?
    AND ${vpsMarketAdmin} AND ${customerAppAuthority}`).bind(status, new Date().toISOString(), id, userId).run();
}

export async function vpsFeatureListing(id: string, userId: string, db: D1Binding = vpsAppDatabase()) {
  if (!UUID.test(id)) return null;
  return db.prepare(`SELECT id,slug,title,user_id,status,currency FROM marketplace_listings l
    WHERE id=? AND user_id=? AND ${publicVpsListing} AND ${customerAppAuthority}`).bind(id, userId, new Date().toISOString())
    .first<{ id: string; slug: string; title: string; user_id: string; status: string; currency: Currency }>();
}

export async function recordVpsMarketplaceContact(input: { slug: string; email: string; name: string; message: string },
  db: D1Binding = vpsAppDatabase(), now: Date = new Date()) {
  const id = randomUUID();
  const result = await db.batch<{ id?: string; title?: string; email?: string }>([
    db.prepare(`INSERT INTO marketplace_messages(id,listing_id,sender_email,sender_name,body,created_at)
      SELECT ?,l.id,?,?,?,? FROM marketplace_listings l JOIN users_profile u ON u.id=l.user_id
      WHERE l.slug=? AND length(trim(u.email))>0 AND ${publicVpsListing} AND ${customerAppAuthority} RETURNING id`)
      .bind(id, input.email, input.name, input.message, now.toISOString(), input.slug, now.toISOString()),
    db.prepare(`SELECT l.title,u.email FROM marketplace_messages m JOIN marketplace_listings l ON l.id=m.listing_id
      JOIN users_profile u ON u.id=l.user_id WHERE m.id=? AND ${customerAppAuthority}`).bind(id),
  ]);
  const target = result[1]?.results[0];
  if (result.some(row => !row.success) || result.length !== 2) throw new Error("Marketplace message could not be saved");
  return result[0].results[0]?.id === id && target?.title && target.email ? { title: target.title, email: target.email } : null;
}
