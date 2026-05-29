import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_SUPPLIERS, DEMO_VENDORS } from "@/lib/demo-data";

/**
 * Member credibility badge — tier derived from profile status.
 * Levels (best applicable wins):
 *   - Listed Vendor   → approved + listed
 *   - Verified Vendor → admin-verified (organizations.verified)
 *   - + Insured       → insurance details on file
 */
export interface BadgeTier {
  label: string; // primary line, e.g. "Verified Vendor"
  insured: boolean;
  verified: boolean;
}

export function badgeTier(o: { verified: boolean; insured: boolean }): BadgeTier {
  if (o.verified) return { label: "Verified Vendor", verified: true, insured: o.insured };
  return { label: "Listed Vendor", verified: false, insured: o.insured };
}

export interface BadgeInfo {
  found: boolean;
  slug: string;
  name: string;
  tier: BadgeTier;
}

export async function getBadgeInfo(slug: string): Promise<BadgeInfo> {
  if (!isSupabaseConfigured()) {
    const v = [...DEMO_VENDORS, ...DEMO_SUPPLIERS].find((x) => x.slug === slug);
    if (!v) return { found: false, slug, name: "PMRFP", tier: badgeTier({ verified: false, insured: false }) };
    return {
      found: true,
      slug,
      name: v.name,
      tier: badgeTier({ verified: v.verified, insured: Boolean(v.insuranceStatus) }),
    };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("name,verified,insurance_status,profile_status,status")
    .eq("slug", slug)
    .eq("profile_status", "approved")
    .eq("status", "active")
    .maybeSingle<{ name: string; verified: boolean; insurance_status: string | null }>();
  if (!data) return { found: false, slug, name: "PMRFP", tier: badgeTier({ verified: false, insured: false }) };
  return {
    found: true,
    slug,
    name: data.name,
    tier: badgeTier({ verified: data.verified, insured: Boolean(data.insurance_status) }),
  };
}
