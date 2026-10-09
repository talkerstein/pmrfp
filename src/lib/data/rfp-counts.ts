import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_RFPS, regionName } from "@/lib/demo-data";
import { getTaxonomyRows } from "./taxonomy";
import { unstable_cache } from "next/cache";
import { PUBLIC_DATA_TAG, PUBLIC_DATA_TTL } from "@/lib/supabase/public-cache";
import { US_STATE_NAMES } from "@/lib/geo";
import { countryOf, type CountryCode } from "@/lib/visitor-geo";

/** PostgREST list of U.S. state names, quoted (some have spaces). */
const US_LIST = `(${US_STATE_NAMES.map((n) => `"${n}"`).join(",")})`;

// Positive exact counts with limit=0 return HTTP 206. Next's fetch cache only
// persists HTTP 200, so cache the parsed number at an explicit data boundary.
// Every invocation registers tags/TTL with its own render, including cache hits.
const countOpen = unstable_cache(async (_projectUrl: string, today: string, regionIds: string[] | null, excludeSlug: string | null, country: CountryCode | null = null) => {
  let query = createReadClient().from("rfp_public").select("id", { count: "exact" })
    .or(`deadline.is.null,deadline.gte.${today}`).limit(0);
  // Country-first: a U.S. listing is one filed under a U.S. state; everything else is Canadian.
  if (country === "US") query = query.in("province", US_STATE_NAMES);
  if (country === "CA") query = query.or(`province.is.null,province.not.in.${US_LIST}`);
  if (regionIds) {
    query = query.in("region_id", regionIds);
    if (excludeSlug) query = query.neq("slug", excludeSlug);
  }
  const { count, error } = await query;
  if (error) throw error;
  if (count === null) throw new Error("Supabase did not return the open RFP count");
  return count;
}, ["rfp-open-count-v1"], { tags: [PUBLIC_DATA_TAG], revalidate: PUBLIC_DATA_TTL });

/**
 * Counts the teaser view without downloading RFP rows or their relations.
 * `country` scopes the total to one country (country-first: never pass null
 * for a number a visitor sees).
 */
export async function getOpenRfpCounts(region: string | null = null, excludeSlug?: string, country: CountryCode | null = null): Promise<{ totalOpen: number; regionMatchCount: number }> {
  const today = new Date().toISOString().slice(0, 10);
  if (!isSupabaseConfigured()) {
    const open = DEMO_RFPS.filter((r) => (!r.deadline || r.deadline >= today) && (!country || countryOf(r) === country));
    return { totalOpen: open.length, regionMatchCount: region ? open.filter((r) => regionName(r.region) === region && r.slug !== excludeSlug).length : 0 };
  }
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const total = countOpen(projectUrl, today, null, null, country);
  const regional = async () => {
    if (!region) return 0;
    // Match existing display-name semantics, including duplicate region names
    // and inactive historical names still permitted by anonymous RLS.
    const ids = (await getTaxonomyRows("regions")).filter((r) => r.name === region).map((r) => r.id);
    return ids.length ? countOpen(projectUrl, today, ids.sort(), excludeSlug ?? null) : 0;
  };
  const [totalOpen, regionMatchCount] = await Promise.all([total, regional()]);
  return { totalOpen, regionMatchCount };
}
