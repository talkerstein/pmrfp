import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_SUPPLIERS, DEMO_VENDORS } from "@/lib/demo-data";
import { isLevel, levelSlug, type LevelNumber } from "@/lib/karma/rules";

/**
 * Member credibility badge — tier derived from profile status.
 * Levels (best applicable wins):
 *   - Listed Vendor   → approved + listed
 *   - Verified Vendor → admin-verified (organizations.verified)
 *   - + Insured       → insurance details on file
 *
 * Reads go through the cookieless, cached anon client (lib/supabase/read):
 * badge images are loaded by other people's websites, so a load must never
 * cost a database round trip of its own.
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
  /** Organization id (live listings only), for the reputation level. */
  orgId?: string | null;
}

const NOT_FOUND = (slug: string): BadgeInfo => ({ found: false, slug, name: "PMRFP", tier: badgeTier({ verified: false, insured: false }), orgId: null });

export async function getBadgeInfo(slug: string): Promise<BadgeInfo> {
  if (!slug || slug.length > 120) return NOT_FOUND(slug);
  if (!isSupabaseConfigured()) {
    const v = [...DEMO_VENDORS, ...DEMO_SUPPLIERS].find((x) => x.slug === slug);
    if (!v) return NOT_FOUND(slug);
    return {
      found: true,
      slug,
      name: v.name,
      tier: badgeTier({ verified: v.verified, insured: Boolean(v.insuranceStatus) }),
      orgId: null,
    };
  }
  const { data } = await createReadClient()
    .from("organizations")
    .select("id,name,verified,insurance_status")
    .eq("slug", slug)
    .eq("profile_status", "approved")
    .eq("status", "active")
    .eq("is_demo", false)
    .maybeSingle<{ id: string; name: string; verified: boolean; insurance_status: string | null }>();
  if (!data) return NOT_FOUND(slug);
  return {
    found: true,
    slug,
    name: data.name,
    tier: badgeTier({ verified: data.verified, insured: Boolean(data.insurance_status) }),
    orgId: data.id,
  };
}

export interface KarmaBadgeInfo {
  found: boolean;
  slug: string;
  name: string;
  level: LevelNumber | null;
  levelSlug: string | null;
}

/** A listed company's public reputation level (org_karma_public: level only, never the score). */
export async function getKarmaBadgeInfo(slug: string): Promise<KarmaBadgeInfo> {
  const org = await getBadgeInfo(slug);
  if (!org.found || !org.orgId) return { found: org.found, slug, name: org.name, level: null, levelSlug: null };
  const { data } = await createReadClient()
    .from("org_karma_public")
    .select("level")
    .eq("org_id", org.orgId)
    .maybeSingle<{ level: number }>();
  const level = isLevel(data?.level) ? data!.level as LevelNumber : null;
  return { found: true, slug, name: org.name, level, levelSlug: level ? levelSlug(level) : null };
}
