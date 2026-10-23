import { D1ApiError } from "./contracts";
export function d1TaxonomyEnabled(): boolean {
  const mode = process.env.PMRFP_TAXONOMY_BACKEND || "supabase";
  if (mode !== "supabase" && mode !== "d1") throw new D1ApiError(503, "invalid_backend_configuration");
  if (mode === "d1" && process.env.VERCEL_ENV === "production") throw new D1ApiError(503, "production_cutover_not_enabled");
  return mode === "d1";
}
