import { D1ApiError, UUID } from "./contracts";
import { gatewayEndpoint, type D1ClientConfig } from "./transport";
import { isTaxonomyTable, TAXONOMY_PAGE_SIZE, TAXONOMY_SELECTS, type TaxonomyRow, type TaxonomyTable } from "./taxonomy-contracts";

export class D1TaxonomyClient {
  private readonly endpoint: URL;
  constructor(private readonly config: D1ClientConfig, private readonly fetcher: typeof fetch = fetch) {
    this.endpoint = gatewayEndpoint(config, "/v1/taxonomy");
  }
  async list(table: TaxonomyTable): Promise<TaxonomyRow[]> {
    if (!isTaxonomyTable(table)) throw new D1ApiError(400, "invalid_request");
    const rows: TaxonomyRow[] = [];
    let after: string | null = null;
    for (let page = 0; page < 200; page++) {
      const url = new URL(this.endpoint); url.searchParams.set("table", table);
      if (after) url.searchParams.set("after", after);
      let result: unknown;
      try {
        const response = await this.fetcher(url, { headers: { "x-pmrfp-gateway-key": this.config.secret }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error("Upstream unavailable");
        result = await response.json();
      } catch (error) { this.config.onFetchError?.(error); throw new D1ApiError(503, "gateway_unavailable"); }
      if (!result || typeof result !== "object" || !("items" in result) || !Array.isArray(result.items) || result.items.length > TAXONOMY_PAGE_SIZE || !("next" in result)) throw new D1ApiError(503, "gateway_unavailable");
      let last: string = after ?? "";
      const fields = TAXONOMY_SELECTS[table].split(",");
      for (const row of result.items) {
        if (!row || typeof row !== "object" || typeof row.id !== "string" || !UUID.test(row.id) || row.id <= last || typeof row.slug !== "string" || typeof row.name !== "string" || row.active !== true ||
          (table !== "property_types" && !Number.isSafeInteger(row.sort_order)) ||
          (table === "trade_categories" && row.icon !== null && typeof row.icon !== "string") ||
          (table === "regions" && (typeof row.country !== "string" || (row.province !== null && typeof row.province !== "string") || (row.parent_id !== null && (typeof row.parent_id !== "string" || !UUID.test(row.parent_id)))))) throw new D1ApiError(503, "gateway_unavailable");
        // Discard any unrequested upstream fields.
        rows.push(Object.fromEntries(fields.map(k => [k, row[k]])) as unknown as TaxonomyRow);
        last = row.id;
      }
      if (result.next === null) return rows;
      if (result.items.length !== TAXONOMY_PAGE_SIZE || result.next !== last || last === after) throw new D1ApiError(503, "gateway_unavailable");
      after = last;
    }
    throw new D1ApiError(503, "gateway_unavailable");
  }
}
