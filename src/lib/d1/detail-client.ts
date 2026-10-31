import { D1ApiError, RFP_SLUG } from "./contracts";
import { detailRow, type DetailRow } from "./detail-contracts";
import { gatewayEndpoint } from "./transport";
import type { D1BoardConfig } from "./board-client";
export class D1DetailClient {
  private readonly endpoint: URL;
  constructor(private readonly config: D1BoardConfig, private readonly fetcher: typeof fetch = fetch) {
    this.endpoint = gatewayEndpoint(config, "/v1/rfp-detail");
    if (!/^[a-f0-9]{64}$/.test(config.dataset)) throw new D1ApiError(503, "invalid_backend_configuration");
  }
  async get(token: string, slug: string): Promise<DetailRow | null> {
    if (!token || token.length > 4096) throw new D1ApiError(401, "sign_in_required");
    if (!RFP_SLUG.test(slug)) throw new D1ApiError(400, "invalid_request");
    const url = new URL(this.endpoint); url.searchParams.set("slug", slug);
    let response: Response; let result: unknown;
    try {
      response = await this.fetcher(url, { headers: { authorization: `Bearer ${token}`, "x-pmrfp-gateway-key": this.config.secret }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) });
      result = await response.json();
    } catch (error) { this.config.onFetchError?.(error); throw new D1ApiError(503, "gateway_unavailable"); }
    if (!response.ok) {
      const code = response.status === 401 ? "sign_in_required" : response.status === 409 ? "record_not_synced" : "gateway_unavailable";
      throw new D1ApiError([401,409].includes(response.status) ? response.status : 503, code);
    }
    if (!result || typeof result !== "object" || !("dataset" in result) || result.dataset !== this.config.dataset || !("item" in result)) throw new D1ApiError(503, "gateway_unavailable");
    if (result.item === null) return null;
    const row = detailRow(result.item);
    if (row.slug !== slug) throw new D1ApiError(503, "gateway_unavailable");
    return row;
  }
}
