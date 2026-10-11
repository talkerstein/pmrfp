import type { CountryCode } from "@/lib/visitor-geo";

export type BoardCountry = "ca" | "us" | "all";

/** The explicit filter wins; region URLs keep their existing all-market scope. */
export function resolveBoardCountry(params: { country?: string; region?: string }, visitor: CountryCode): BoardCountry {
  if (params.country === "ca" || params.country === "us" || params.country === "all") return params.country;
  if (params.region) return "all";
  return visitor === "US" ? "us" : "ca";
}
