import { D1ApiError, UUID } from "./contracts";
import type { D1BoardConfig } from "./board-client";
import { gatewayEndpoint } from "./transport";

interface Photo { id: string; rfpId: string; url: string; createdAt: string }
function timestampKey(value: string): string {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) throw new D1ApiError(503, "gateway_unavailable");
  return `${match[1]}.${(match[2] ?? "").padEnd(6, "0")}Z`;
}
export class D1PhotosClient {
  private readonly endpoint: URL;
  constructor(private readonly config: D1BoardConfig, private readonly fetcher: typeof fetch = fetch) {
    this.endpoint = gatewayEndpoint(config, "/v1/rfp-photos");
    if (!/^[a-f0-9]{64}$/.test(config.dataset)) throw new D1ApiError(503, "invalid_backend_configuration");
  }
  async list(ids: string[]): Promise<Map<string, string[]>> {
    if (ids.some(id => !UUID.test(id))) throw new D1ApiError(400, "invalid_request");
    const requested = [...new Set(ids.map(id => id.toLowerCase()))].sort();
    const photos: Photo[] = [];
    for (let offset = 0; offset < requested.length; offset += 40) {
      const group = requested.slice(offset, offset + 40); let after: string | null = null;
      for (let page = 0; page < 200; page++) {
        const url = new URL(this.endpoint); group.forEach(id => url.searchParams.append("id", id)); if (after) url.searchParams.set("after", after);
        let result: unknown;
        try {
          const response = await this.fetcher(url, { headers: { "x-pmrfp-gateway-key": this.config.secret }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) });
          if (!response.ok) throw new Error("Photo read failed"); result = await response.json();
        } catch (error) { this.config.onFetchError?.(error); throw new D1ApiError(503, "gateway_unavailable"); }
        if (!result || typeof result !== "object" || !("dataset" in result) || result.dataset !== this.config.dataset || !("items" in result) || !Array.isArray(result.items) || result.items.length > 250 || !("next" in result)) throw new D1ApiError(503, "gateway_unavailable");
        let last: string = after ?? "";
        for (const raw of result.items) {
          if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !UUID.test(raw.id) || raw.id <= last || !group.includes(raw.rfpId) || typeof raw.url !== "string" || typeof raw.createdAt !== "string" || !Number.isFinite(Date.parse(raw.createdAt))) throw new D1ApiError(503, "gateway_unavailable");
          let image: URL; try { image = new URL(raw.url); } catch (error) { this.config.onFetchError?.(error); throw new D1ApiError(503, "gateway_unavailable"); }
          if (!["https:", "http:"].includes(image.protocol) || image.username || image.password) throw new D1ApiError(503, "gateway_unavailable");
          photos.push({ id: raw.id, rfpId: raw.rfpId, url: raw.url, createdAt: timestampKey(raw.createdAt) }); last = raw.id;
        }
        if (result.next === null) break;
        if (page === 199 || result.items.length !== 250 || result.next !== last || last === after) throw new D1ApiError(503, "gateway_unavailable");
        after = last;
      }
    }
    photos.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const output = new Map<string, string[]>();
    for (const photo of photos) { const urls = output.get(photo.rfpId) ?? []; urls.push(photo.url); output.set(photo.rfpId, urls); }
    return output;
  }
}
