import { provinceSlug } from "@/lib/data/price-benchmarks";

/**
 * Link targets the insights point at. Same paths as lib/intel/load and
 * lib/data/price-benchmarks-load, kept here so the pure insight modules
 * don't import those loaders (they pull in the Supabase snapshot).
 */
export const INSIGHTS_PATH = "/insights";
export const insightsMarketPath = (tradeSlug: string, province: string) => `${INSIGHTS_PATH}/${tradeSlug}/${provinceSlug(province)}`;
export const benchmarkPath = (tradeSlug: string, province: string) => `/benchmarks/${tradeSlug}/${provinceSlug(province)}`;
export const INTEL_PATH = "/intel";
export const intelCompanyPath = (slug: string) => `${INTEL_PATH}/companies/${slug}`;
export const intelBuyerPath = (slug: string) => `${INTEL_PATH}/buyers/${slug}`;
export const intelMarketPath = (tradeSlug: string, provSlug: string) => `${INTEL_PATH}/markets/${tradeSlug}/${provSlug}`;
export const INTEL_RENEWALS_PATH = `${INTEL_PATH}/renewals`;
