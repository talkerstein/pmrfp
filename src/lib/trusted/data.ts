import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { listVendorsByIds } from "@/lib/data/directory";
import type { VendorListItem } from "@/lib/data/types";
import { visibleTrades } from "./rules";
import { getSession } from "@/lib/access/access";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { approvedTrustedTrade, paidTrustedList, visibleTrustedTrade } from "./native";

export interface TrustedList {
  ownerId: string;
  organizationId: string | null;
  handle: string;
  displayName: string;
  brokerage: string | null;
  headline: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  published: boolean;
}

export interface TrustedTrade {
  organizationId: string;
  note: string | null;
  vendor: VendorListItem;
}

interface ListRow {
  owner_id: string;
  organization_id: string | null;
  handle: string;
  display_name: string;
  brokerage: string | null;
  headline: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  published: boolean;
}

interface ItemRow {
  organization_id: string;
  note: string | null;
  position: number;
}

const LIST_COLS = "owner_id,organization_id,handle,display_name,brokerage,headline,contact_phone,contact_email,published";

function toList(r: ListRow): TrustedList {
  return {
    ownerId: r.owner_id,
    organizationId: r.organization_id,
    handle: r.handle,
    displayName: r.display_name,
    brokerage: r.brokerage,
    headline: r.headline,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    published: Boolean(r.published),
  };
}

/** Items in saved order, joined to live directory listings (hidden/removed trades drop out). */
async function tradesFor(items: ItemRow[]): Promise<TrustedTrade[]> {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const vendors = await listVendorsByIds(sorted.map((i) => i.organization_id));
  return sorted.flatMap((i) => {
    const vendor = vendors.get(i.organization_id);
    return vendor ? [{ organizationId: i.organization_id, note: i.note, vendor }] : [];
  });
}

/**
 * Is this organization on an active Realtor Pro subscription? Uses the service
 * client because the public page must know it for a visitor who can't read
 * subscriptions. False on any error (e.g. the tier column not migrated yet).
 */
export async function isRealtorPro(organizationId: string | null): Promise<boolean> {
  if (isVpsLiveCustomerAuth() && organizationId) return Boolean(await vpsAppDatabase().prepare(`SELECT 1 FROM subscriptions
    WHERE organization_id=? AND status IN ('active','comped') AND tier='realtor' AND ${customerAppAuthority}`)
    .bind(organizationId).first());
  if (!organizationId || !isServiceConfigured()) return false;
  const { data, error } = await createServiceClient()
    .from("subscriptions")
    .select("status,tier")
    .eq("organization_id", organizationId)
    .maybeSingle<{ status: string; tier: string }>();
  if (error || !data) return false;
  return (data.status === "active" || data.status === "comped") && data.tier === "realtor";
}

/**
 * The signed-in owner's list and its trades. `ready: false` means the
 * trusted-trades tables don't exist yet (migration pending), so the caller
 * hides the feature instead of erroring.
 */
export async function getMyTrustedList(
  userId: string,
): Promise<{ ready: boolean; list: TrustedList | null; trades: TrustedTrade[]; savedIds: string[] }> {
  if (isVpsLiveCustomerAuth()) {
    const session = await getSession();
    if (session?.userId !== userId || session.profile.status !== "active") return { ready: false, list: null, trades: [], savedIds: [] };
    const db = vpsAppDatabase();
    const list = await db.prepare(`SELECT ${LIST_COLS} FROM trusted_lists WHERE owner_id=? AND ${customerAppAuthority}`)
      .bind(userId).first<ListRow>();
    if (!list) return { ready: true, list: null, trades: [], savedIds: [] };
    const items = await db.prepare("SELECT organization_id,note,position FROM trusted_list_items WHERE owner_id=? ORDER BY position,organization_id")
      .bind(userId).all<ItemRow>();
    return { ready: items.success, list: toList(list), trades: await tradesFor(items.results), savedIds: items.results.map((r) => r.organization_id) };
  }
  if (!isSupabaseConfigured()) return { ready: false, list: null, trades: [], savedIds: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.from("trusted_lists").select(LIST_COLS).eq("owner_id", userId).maybeSingle<ListRow>();
  if (error) return { ready: false, list: null, trades: [], savedIds: [] };
  if (!data) return { ready: true, list: null, trades: [], savedIds: [] };
  const { data: items } = await supabase
    .from("trusted_list_items")
    .select("organization_id,note,position")
    .eq("owner_id", userId);
  const rows = (items as ItemRow[] | null) ?? [];
  return { ready: true, list: toList(data), trades: await tradesFor(rows), savedIds: rows.map((r) => r.organization_id) };
}

/** A published page by handle, for /trusted/[handle]. */
export async function getPublicTrustedList(
  handle: string,
): Promise<{ list: TrustedList; trades: TrustedTrade[]; pro: boolean } | null> {
  if (isVpsLiveCustomerAuth()) {
    const db = vpsAppDatabase();
    const data = await db.prepare(`SELECT ${LIST_COLS},${paidTrustedList} AS pro FROM trusted_lists l
      WHERE handle=? AND published=1 AND ${customerAppAuthority}
      AND EXISTS(SELECT 1 FROM users_profile u WHERE u.id=owner_id AND u.status='active'
        AND u.primary_role IN ('real_estate_agent','property_manager'))`).bind(handle).first<ListRow & { pro: number }>();
    if (!data) return null;
    const items = await db.prepare(`SELECT i.organization_id,i.note,i.position FROM trusted_list_items i
      JOIN trusted_lists l ON l.owner_id=i.owner_id JOIN organizations o ON o.id=i.organization_id
      WHERE l.owner_id=? AND l.published=1 AND l.handle=? AND ${approvedTrustedTrade} AND ${visibleTrustedTrade}
      ORDER BY i.position,i.organization_id`).bind(data.owner_id, handle).all<ItemRow>();
    const pro = data.pro === 1;
    const list = toList(pro ? data : { ...data, contact_phone: null, contact_email: null });
    return { list, trades: await tradesFor(items.results), pro };
  }
  if (!isSupabaseConfigured()) return null;
  const supabase = createReadClient();
  const { data, error } = await supabase
    .from("trusted_lists")
    .select(LIST_COLS)
    .eq("handle", handle)
    .eq("published", true)
    .maybeSingle<ListRow>();
  if (error || !data) return null;
  const [{ data: items }, pro] = await Promise.all([
    supabase.from("trusted_list_items").select("organization_id,note,position").eq("owner_id", data.owner_id),
    isRealtorPro(data.organization_id),
  ]);
  const trades = visibleTrades(await tradesFor((items as ItemRow[] | null) ?? []), pro);
  return { list: toList(data), trades, pro };
}

export interface Recommender {
  handle: string;
  displayName: string;
  brokerage: string | null;
}

/** Published trusted-trades pages that include this company ("Recommended by …"). */
export async function getRecommendedBy(organizationId: string): Promise<Recommender[]> {
  if (isVpsLiveCustomerAuth()) return (await vpsAppDatabase().prepare(`SELECT l.handle,l.display_name AS displayName,l.brokerage
    FROM trusted_lists l JOIN trusted_list_items i ON i.owner_id=l.owner_id JOIN users_profile u ON u.id=l.owner_id
    JOIN organizations o ON o.id=i.organization_id
    WHERE i.organization_id=? AND l.published=1 AND u.status='active'
    AND u.primary_role IN ('real_estate_agent','property_manager') AND ${customerAppAuthority}
    AND ${approvedTrustedTrade} AND ${visibleTrustedTrade} LIMIT 20`)
    .bind(organizationId).all<Recommender>()).results;
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createReadClient()
    .from("trusted_list_items")
    .select("trusted_lists!inner(handle,display_name,brokerage,published)")
    .eq("organization_id", organizationId)
    .eq("trusted_lists.published", true)
    .limit(20);
  if (error || !data) return [];
  return (data as unknown as { trusted_lists: { handle: string; display_name: string; brokerage: string | null } }[]).map(
    (r) => ({ handle: r.trusted_lists.handle, displayName: r.trusted_lists.display_name, brokerage: r.trusted_lists.brokerage }),
  );
}
