import { createReadClient } from "@/lib/supabase/read";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Contract-winner claims. The public sees an approved claim's organization
 * profile only (winner_claims_public, cached anon read). A claimant reads
 * their own claims through their session (RLS). Every reader degrades to
 * "no claim" until the migration has run.
 */

export interface PublicWinnerClaim {
  winnerSlug: string;
  name: string;
  orgSlug: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  province: string | null;
  verified: boolean;
  claimedAt: string | null;
}

interface PublicRow {
  winner_slug: string; name: string; org_slug: string; logo_url: string | null; short_description: string | null;
  website: string | null; phone: string | null; email: string | null; city: string | null; province: string | null;
  verified: boolean; claimed_at: string | null;
}

export async function getWinnerClaim(slug: string): Promise<PublicWinnerClaim | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await createReadClient()
      .from("winner_claims_public")
      .select("winner_slug,name,org_slug,logo_url,short_description,website,phone,email,city,province,verified,claimed_at")
      .eq("winner_slug", slug)
      .maybeSingle<PublicRow>();
    if (error || !data) return null;
    return {
      winnerSlug: data.winner_slug,
      name: data.name,
      orgSlug: data.org_slug,
      logoUrl: data.logo_url,
      description: data.short_description,
      website: data.website,
      phone: data.phone,
      email: data.email,
      city: data.city,
      province: data.province,
      verified: data.verified,
      claimedAt: data.claimed_at,
    };
  } catch {
    return null;
  }
}

export type ClaimStatus = "pending" | "approved" | "rejected" | "revoked";

export interface OwnClaim {
  id: string;
  status: ClaimStatus;
  organizationId: string;
  website: string | null;
  note: string | null;
  createdAt: string;
}

/** The signed-in person's latest claim on this page (RLS: own rows only). */
export async function getOwnClaim(slug: string): Promise<OwnClaim | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("winner_claims")
    .select("id,status,organization_id,website,note,created_at")
    .eq("winner_slug", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; status: ClaimStatus; organization_id: string; website: string | null; note: string | null; created_at: string }>();
  if (error || !data) return null;
  return { id: data.id, status: data.status, organizationId: data.organization_id, website: data.website, note: data.note, createdAt: data.created_at };
}

/** Safe external link for a company website ("acme.ca" → "https://acme.ca"); null if it isn't http(s). */
export function websiteHref(website: string | null | undefined): string | null {
  const w = (website ?? "").trim();
  if (!w) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
