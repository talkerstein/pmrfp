import { revalidateTag } from "next/cache";
import { FORUM_DATA_TAG, PUBLIC_DATA_TAG, RFPS_TAG, RFP_TABLES, TAXONOMY_DATA_TAG, TAXONOMY_TABLES, isForumTable } from "./public-cache";

// Invalidate shared public reads after relevant server writes, including admin
// moderation and tender imports. User/private queries themselves stay uncached.
const PUBLIC_TABLES = new Set([
  "rfp_posts", "rfp_categories", "rfp_documents", "organizations",
  "organization_categories", "organization_regions", "organization_property_types",
  "regions", "property_types", "trade_categories", "resources", "case_studies",
  "vendor_reviews", "trusted_lists", "trusted_list_items", "job_posts", "talent_profiles",
]);

const WRITE_METHODS = ["POST", "PATCH", "DELETE", "PUT"];

export function createWriteFetch(baseUrl: string, transport: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const origin = new URL(baseUrl).origin;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const response = await transport(input, { ...init, cache: "no-store" });
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1] ?? null;
    const wrote = response.ok && url.origin === origin && WRITE_METHODS.includes(method);
    if (!wrote || !table) return response;
    if (RFP_TABLES.has(table)) {
      // Board writes come in bursts (tender imports upsert in batches). Mark
      // the board stale instead of expiring it: visitors keep getting the
      // previous board instantly while one background refresh reloads it.
      // expire:0 here made every concurrent visitor rebuild the whole board
      // from the database at the same moment (incident 2026-10-09).
      revalidateTag(RFPS_TAG, "max");
      revalidateTag(PUBLIC_DATA_TAG, "max");
    } else if (PUBLIC_TABLES.has(table)) {
      revalidateTag(PUBLIC_DATA_TAG, { expire: 0 });
      if (TAXONOMY_TABLES.has(table)) revalidateTag(TAXONOMY_DATA_TAG, { expire: 0 });
    }
    // Forum writes (posts, ratings, moderation) only purge forum reads.
    if (isForumTable(table)) {
      revalidateTag(FORUM_DATA_TAG, { expire: 0 });
    }
    return response;
  };
}
