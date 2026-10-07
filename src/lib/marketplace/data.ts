import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import {
  isLive,
  sanitizeListingPhotos,
  sortListings,
  type Category,
  type Condition,
  type Country,
  type Currency,
  type ListingPhoto,
  type ListingStatus,
} from "./rules";

/**
 * Marketplace reads. Every read tolerates the table not existing yet (the
 * owner applies migrations by hand): `ready: false` → pages show "coming soon".
 */

export interface Listing {
  id: string;
  userId: string;
  organizationId: string | null;
  title: string;
  slug: string;
  category: Category;
  condition: Condition;
  priceCents: number | null;
  currency: Currency;
  priceOnRequest: boolean;
  description: string;
  city: string | null;
  regionSlug: string | null;
  country: Country;
  photos: ListingPhoto[];
  status: ListingStatus;
  featuredUntil: string | null;
  views: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  seller: { name: string; slug: string; listed: boolean } | null;
}

const COLS =
  "id,user_id,organization_id,title,slug,category,condition,price_cents,currency,price_on_request,description,city,region_slug,country," +
  "photos,status,featured_until,views,created_at,updated_at,expires_at,organizations(name,slug,organization_type,profile_status)";

interface Row {
  id: string;
  user_id: string;
  organization_id: string | null;
  title: string;
  slug: string;
  category: Category;
  condition: Condition;
  price_cents: number | null;
  currency: Currency;
  price_on_request: boolean;
  description: string;
  city: string | null;
  region_slug: string | null;
  country: Country;
  photos: unknown;
  status: ListingStatus;
  featured_until: string | null;
  views: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
  organizations: { name: string; slug: string; organization_type: string; profile_status: string | null } | null;
}

const SUPABASE_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function toListing(r: Row): Listing {
  const o = r.organizations;
  return {
    id: r.id,
    userId: r.user_id,
    organizationId: r.organization_id,
    title: r.title,
    slug: r.slug,
    category: r.category,
    condition: r.condition,
    priceCents: r.price_on_request ? null : r.price_cents,
    currency: r.currency,
    priceOnRequest: r.price_on_request,
    description: r.description,
    city: r.city,
    regionSlug: r.region_slug,
    country: r.country,
    photos: sanitizeListingPhotos(r.photos, SUPABASE_URL(), r.user_id),
    status: r.status,
    featuredUntil: r.featured_until,
    views: r.views,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    expiresAt: r.expires_at,
    seller: o
      ? {
          name: o.name,
          slug: o.slug,
          // Only listed, approved companies have a public directory page.
          listed: (o.organization_type === "trade_company" || o.organization_type === "supplier") && o.profile_status === "approved",
        }
      : null,
  };
}

/** Active, unexpired listings: featured first, then newest. */
export async function listActiveListings(limit = 500): Promise<{ ready: boolean; listings: Listing[] }> {
  if (!isSupabaseConfigured()) return { ready: false, listings: [] };
  try {
    const { data, error } = await createReadClient()
      .from("marketplace_listings")
      .select(COLS)
      .eq("status", "active")
      // Rounded to the hour so the cached public read keeps one URL per hour;
      // isLive() below drops anything that expired since.
      .gt("expires_at", new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { ready: false, listings: [] };
    return { ready: true, listings: sortListings(((data as unknown as Row[]) ?? []).map(toListing).filter((l) => isLive(l))) };
  } catch {
    return { ready: false, listings: [] };
  }
}

/** Newest few for the homepage teaser. Empty when not ready. */
export async function latestListings(n = 4): Promise<Listing[]> {
  const { listings } = await listActiveListings(60);
  return listings.slice(0, n);
}

/**
 * One listing by slug. The signed-in client sees active listings plus its
 * own (RLS), so owners can preview drafts and sold items; admins see all.
 */
export async function getListing(slug: string): Promise<Listing | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("marketplace_listings").select(COLS).eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return toListing(data as unknown as Row);
  } catch {
    return null;
  }
}

/** The signed-in user's listings, any status. */
export async function listMyListings(userId: string): Promise<{ ready: boolean; listings: Listing[] }> {
  if (!isSupabaseConfigured()) return { ready: false, listings: [] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select(COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return { ready: false, listings: [] };
    return { ready: true, listings: ((data as unknown as Row[]) ?? []).map(toListing) };
  } catch {
    return { ready: false, listings: [] };
  }
}

/** Admin: everything, newest first. */
export async function listAllListingsForAdmin(): Promise<{ ready: boolean; listings: Listing[] }> {
  if (!isSupabaseConfigured()) return { ready: false, listings: [] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("marketplace_listings").select(COLS).order("created_at", { ascending: false }).limit(500);
    if (error) return { ready: false, listings: [] };
    return { ready: true, listings: ((data as unknown as Row[]) ?? []).map(toListing) };
  } catch {
    return { ready: false, listings: [] };
  }
}

/** Count of this user's listings that use a free slot right now (active and unexpired). */
export async function countActiveListings(userId: string, excludeId?: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  let q = supabase
    .from("marketplace_listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());
  if (excludeId) q = q.neq("id", excludeId);
  const { count } = await q;
  return count ?? 0;
}

/** Seller's email for the contact relay. Server-side only; never rendered. */
export async function sellerEmail(userId: string): Promise<string | null> {
  if (!isServiceConfigured()) return null;
  const { data } = await createServiceClient().from("users_profile").select("email").eq("id", userId).maybeSingle<{ email: string | null }>();
  return data?.email || null;
}

/** Best-effort view counter (no-op before the migration). */
export async function bumpViews(slug: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await createReadClient().rpc("marketplace_increment_views", { p_slug: slug });
  } catch {
    /* ignore */
  }
}
