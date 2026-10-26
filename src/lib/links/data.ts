import { unstable_cache, revalidateTag } from "next/cache";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { normalizeWebsiteUrl, type LinkOrg } from "./policy";

/**
 * Reads of the "earn the link" columns (migration 20261024000100) for public
 * pages, through the cookieless anon client. Every read degrades to "not
 * earned" (nofollow): a database without the columns, a failed query or a
 * missing company all give the safe answer.
 */

export const LINK_COLUMNS = "slug,website,profile_status,status,approved_at,link_trusted,link_paid,link_badge,risk_flagged";

export interface LinkRow {
  slug: string | null;
  website: string | null;
  profile_status: string | null;
  status: string | null;
  approved_at: string | null;
  link_trusted: boolean | null;
  link_paid: boolean | null;
  link_badge: boolean | null;
  risk_flagged: boolean | null;
}

/** A row from organizations (LINK_COLUMNS) as the policy's input. */
export function linkOrgFromRow(r: Partial<LinkRow> | null | undefined): LinkOrg {
  return {
    slug: r?.slug ?? null,
    website: r?.website ?? null,
    profileStatus: r?.profile_status ?? null,
    status: r?.status ?? null,
    approvedAt: r?.approved_at ?? null,
    linkTrusted: Boolean(r?.link_trusted),
    paid: Boolean(r?.link_paid),
    badgeInstalled: Boolean(r?.link_badge),
    riskFlagged: Boolean(r?.risk_flagged),
  };
}

/**
 * The link signals of one company by its profile slug (the contract-winner
 * page knows the company only by slug). Null on any failure.
 */
export async function getOrgLinkOrg(slug: string | null | undefined): Promise<LinkOrg | null> {
  if (!slug || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await createReadClient()
      .from("organizations")
      .select(LINK_COLUMNS)
      .eq("slug", slug)
      .eq("profile_status", "approved")
      .maybeSingle<LinkRow>();
    if (error || !data) return null;
    return linkOrgFromRow(data);
  } catch {
    return null;
  }
}

/**
 * Slugs of approved profiles below the quality bar (organizations.profile_indexable
 * = false, kept by lib/links/sync): the sitemap leaves them out. Empty when the
 * column isn't there yet or the read fails (everything stays listed, as before).
 */
export async function getNoindexSlugs(): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  try {
    const { data, error } = await createReadClient().from("organizations").select("slug").eq("profile_indexable", false).limit(5000);
    if (error || !data) return new Set();
    return new Set((data as { slug: string }[]).map((r) => r.slug));
  } catch {
    return new Set();
  }
}

/* ------------------------------------------------------------------ click-out targets */

export const OUT_TAG = "org-links";
const OUT_TTL_SECONDS = 3600;

/**
 * slug -> the company's stored website, for /out/<slug>. One indexed lookup,
 * cached for an hour per slug; a profile edit purges every entry (purgeOutCache).
 * Only approved, active, non-demo companies resolve: a held, rejected or
 * suspended listing sends nobody anywhere.
 */
async function lookupTarget(slug: string): Promise<string | null> {
  const { data, error } = await createReadClient()
    .from("organizations")
    .select("website,profile_status,status,is_demo")
    .eq("slug", slug)
    .maybeSingle<{ website: string | null; profile_status: string; status: string; is_demo: boolean }>();
  if (error || !data) return null;
  if (data.profile_status !== "approved" || data.status !== "active" || data.is_demo) return null;
  return normalizeWebsiteUrl(data.website);
}

// Built on first use, not at import: importing this file (every directory page
// does) must not need the Next cache to be there.
let cachedTarget: ((slug: string) => Promise<string | null>) | null = null;

/** The stored website for a slug, or null (unknown, not live, or no website). Never throws. */
export async function getOutTarget(slug: string): Promise<string | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,159}$/i.test(slug) || !isSupabaseConfigured()) return null;
  try {
    cachedTarget ??= unstable_cache(lookupTarget, ["org-out-target"], { revalidate: OUT_TTL_SECONDS, tags: [OUT_TAG] });
    return await cachedTarget(slug.toLowerCase());
  } catch {
    return null;
  }
}

/** After a profile edit or an admin decision: the next click looks the company up again. */
export function purgeOutCache(): void {
  try {
    revalidateTag(OUT_TAG, { expire: 0 });
  } catch {
    // Outside a Next request (tests, scripts): nothing to purge.
  }
}
