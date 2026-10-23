import { D1ApiError, type SaveRfpInput, type SavedRfpItem, UUID } from "./contracts";

import { gatewayEndpoint, type D1ClientConfig } from "./transport";
export type { D1ClientConfig } from "./transport";
/** Server-side transport. Callers supply only a verified-through-Auth user token, never a user id or SQL. */
export class D1SavedRfpsClient {
  private readonly endpoint: URL;
  constructor(private readonly config: D1ClientConfig, private readonly fetcher: typeof fetch = fetch) {
    this.endpoint = gatewayEndpoint(config, "/v1/saved-rfps");
  }
  private async request(token: string, body?: SaveRfpInput): Promise<unknown> {
    if (!token || token.length > 4096) throw new D1ApiError(401, "sign_in_required");
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: body ? "POST" : "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
        headers: { authorization: `Bearer ${token}`, "x-pmrfp-gateway-key": this.config.secret, ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new D1ApiError(503, "gateway_unavailable"); }
    let json: unknown;
    try { json = await response.json(); } catch { throw new D1ApiError(503, "gateway_unavailable"); }
    if (!response.ok) {
      // Keep only allowlisted error identifiers; upstream response bodies may contain sensitive details.
      const codes = ["sign_in_required", "account_inactive", "trade_or_supplier_required", "profile_not_synced", "not_found", "invalid_request", "missing_rfp", "writes_not_enabled"];
      const code = json && typeof json === "object" && "error" in json && codes.includes(String(json.error)) ? String(json.error) : "gateway_unavailable";
      throw new D1ApiError([400,401,403,404,409,413,415].includes(response.status) ? response.status : 503, code);
    }
    return json;
  }
  async list(token: string): Promise<SavedRfpItem[]> {
    const result = await this.request(token);
    if (!result || typeof result !== "object" || !("items" in result) || !Array.isArray(result.items) || result.items.length > 500) throw new D1ApiError(503, "gateway_unavailable");
    return result.items.map(row => {
      if (!row || typeof row !== "object" || typeof row.rfpId !== "string" || !UUID.test(row.rfpId) || typeof row.title !== "string" || typeof row.slug !== "string" || typeof row.savedAt !== "string") throw new D1ApiError(503, "gateway_unavailable");
      return { rfpId: row.rfpId, title: row.title, slug: row.slug, savedAt: row.savedAt };
    });
  }
  async change(token: string, input: SaveRfpInput): Promise<void> {
    const result = await this.request(token, input);
    if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) throw new D1ApiError(503, "gateway_unavailable");
  }
}
