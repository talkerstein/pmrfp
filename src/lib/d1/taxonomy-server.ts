import "server-only";
import { unstable_rethrow } from "next/navigation";
import { D1TaxonomyClient } from "./taxonomy-client";
import type { TaxonomyTable, TaxonomyRow } from "./taxonomy-contracts";
export function d1TaxonomyRows(table: TaxonomyTable): Promise<TaxonomyRow[]> {
  return new D1TaxonomyClient({ url: process.env.PMRFP_D1_API_URL || "", secret: process.env.PMRFP_D1_GATEWAY_SECRET || "", onFetchError: unstable_rethrow, allowLocal: process.env.NODE_ENV !== "production" }).list(table);
}
