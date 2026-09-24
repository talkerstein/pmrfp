import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { listVendorsByIds } from "@/lib/data/directory";
import type { VendorListItem } from "@/lib/data/types";
import { visibleTrades } from "./rules";

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
    published: r.published,
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
