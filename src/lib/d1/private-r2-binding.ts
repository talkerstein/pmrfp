import { D1ApiError } from "./contracts";
import type { SandboxBucket, SandboxObject, SandboxObjectMetadata } from "../../../workers/d1-api/project-photos";

const origin = "https://pmrfp-private-project-files.pmrfp.workers.dev";

export function createPrivateR2Binding(secret: string, fetcher = fetch): SandboxBucket {
  if (!/^[0-9a-f]{64}$/.test(secret)) throw new D1ApiError(503, "storage_configuration_unavailable");

  async function load(key: string, method: "GET" | "HEAD") {
    const match = /^private-project-photo\/([0-9a-f]{64})$/.exec(key);
    if (!match) return null;
    const response = await fetcher(`${origin}/v1/private-project-files/${match[1]}`, {
      method, headers: { "x-pmrfp-gateway-key": secret },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) return null;
    const size = Number(response.headers.get("content-length"));
    const etag = response.headers.get("etag")?.match(/^"([a-f0-9]{32})"$/)?.[1];
    if (!response.ok || !etag || !Number.isSafeInteger(size) || size < 1 || size > 10 * 1024 * 1024 ||
        response.headers.get("content-type") !== "image/jpeg") {
      await response.body?.cancel();
      throw new D1ApiError(503, "storage_unavailable");
    }
    const metadata: SandboxObjectMetadata = { etag, size, httpMetadata: { contentType: "image/jpeg" } };
    return { metadata, body: response.body };
  }

  return {
    async head(key) { return (await load(key, "HEAD"))?.metadata ?? null; },
    async get(key): Promise<SandboxObject | null> {
      const result = await load(key, "GET");
      if (!result) return null;
      if (!result.body) throw new D1ApiError(503, "storage_unavailable");
      return { ...result.metadata, body: result.body };
    },
  };
}
