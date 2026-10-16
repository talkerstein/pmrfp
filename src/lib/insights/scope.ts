import { canonicalProvince, provinceCountry } from "@/lib/data/price-benchmarks";
import type { LeadProfile } from "@/lib/leads/match";
import type { InsightScope } from "./detectors";

/**
 * A member's insight scope from its lead profile: its country, its
 * provinces/states in that country (its own first, never the other
 * country's), and its trades. Pure.
 */
export function scopeFromProfile(profile: Pick<LeadProfile, "country" | "provinces" | "tradeSlugs" | "nameBySlug">, orgProvince: string | null): InsightScope {
  const own = canonicalProvince(orgProvince);
  const provinces = [own, ...[...profile.provinces].map((p) => canonicalProvince(p))].filter((p): p is string => Boolean(p) && provinceCountry(p!) === profile.country);
  return {
    country: profile.country,
    provinces: [...new Set(provinces)],
    trades: [...profile.tradeSlugs].map((slug) => ({ slug, name: profile.nameBySlug.get(slug) ?? slug })),
  };
}
