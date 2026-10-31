import { D1ApiError } from "./contracts";
import { gatewayEndpoint, type D1ClientConfig } from "./transport";
import { BOARD_PAGE_SIZE, shardRange, publicBoardRow, type BoardRow } from "./board-contracts";
export interface D1BoardConfig extends D1ClientConfig { dataset: string }
export class D1BoardClient {
  private readonly endpoint: URL;
  constructor(private readonly config: D1BoardConfig, private readonly fetcher: typeof fetch = fetch) {
    this.endpoint = gatewayEndpoint(config, "/v1/board");
    if (!/^[a-f0-9]{64}$/.test(config.dataset)) throw new D1ApiError(503, "invalid_backend_configuration");
  }
  async shard(shard: number): Promise<BoardRow[]> {
    const { lo, hi } = shardRange(shard); const rows: BoardRow[] = []; let after: string | null = null;
    for (let page = 0; page < 200; page++) {
      const url = new URL(this.endpoint); url.searchParams.set("shard", String(shard)); if (after) url.searchParams.set("after", after);
      let result: unknown;
      try {
        const response = await this.fetcher(url, { headers: { "x-pmrfp-gateway-key": this.config.secret }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error("Board read failed"); result = await response.json();
      } catch (error) { this.config.onFetchError?.(error); throw new D1ApiError(503, "gateway_unavailable"); }
      if (!result || typeof result !== "object" || !("dataset" in result) || result.dataset !== this.config.dataset || !("items" in result) || !Array.isArray(result.items) || result.items.length > BOARD_PAGE_SIZE || !("next" in result)) throw new D1ApiError(503, "gateway_unavailable");
      let last: string = after ?? "";
      for (const raw of result.items) {
        const row = publicBoardRow(raw);
        if (row.id <= last || (lo && row.id < lo) || (hi && row.id >= hi)) throw new D1ApiError(503, "gateway_unavailable");
        rows.push(row); last = row.id;
      }
      if (result.next === null) return rows;
      if (result.items.length !== BOARD_PAGE_SIZE || result.next !== last || after === last) throw new D1ApiError(503, "gateway_unavailable");
      after = last;
    }
    throw new D1ApiError(503, "gateway_unavailable");
  }
}
