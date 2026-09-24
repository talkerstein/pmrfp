import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { hashReviewToken, isWellFormedToken } from "@/lib/projects/tokens";
import { isOwnPhotoUrl } from "@/lib/projects/photos";

/**
 * Resolve a /review/[token] link for display. Service role: the reviewer
 * has no account, and the token (hashed) is the only credential. Any
 * failure, including the table not existing yet, reads as "not valid".
 */
export type InviteLookup =
  | { state: "invalid" }
  | { state: "used" }
  | {
      state: "open";
      clientName: string;
      tradeName: string;
      tradeSlug: string | null;
      projectTitle: string;
      heroUrl: string | null;
    };

export async function lookupInvite(token: string): Promise<InviteLookup> {
  if (!isWellFormedToken(token) || !isServiceConfigured()) return { state: "invalid" };
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("review_invites")
      .select("client_name,used_at,case_studies(title,hero_url),organizations(name,slug,profile_status)")
      .eq("token_hash", hashReviewToken(token))
      .maybeSingle();
    if (error || !data) return { state: "invalid" };
    const r = data as unknown as {
      client_name: string;
      used_at: string | null;
      case_studies: { title: string; hero_url: string | null } | null;
      organizations: { name: string; slug: string; profile_status: string } | null;
    };
    if (r.used_at) return { state: "used" };
    if (!r.case_studies || !r.organizations) return { state: "invalid" };
    const hero = r.case_studies.hero_url;
    return {
      state: "open",
      clientName: r.client_name,
      tradeName: r.organizations.name,
      // Only link the profile when it's actually public.
      tradeSlug: r.organizations.profile_status === "approved" ? r.organizations.slug : null,
      projectTitle: r.case_studies.title,
      heroUrl: hero && isOwnPhotoUrl(hero, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") ? hero : null,
    };
  } catch {
    return { state: "invalid" };
  }
}
