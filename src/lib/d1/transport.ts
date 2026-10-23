import { D1ApiError } from "./contracts";
export interface D1ClientConfig { url: string; secret: string; allowLocal?: boolean }
/** Gateway secrets stay on a fixed configured origin; URLs cannot carry credentials. */
export function gatewayEndpoint(config: D1ClientConfig, path: string): URL {
  let url: URL;
  try { url = new URL(config.url); } catch { throw new D1ApiError(503, "gateway_unavailable"); }
  const local = config.allowLocal && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash || config.secret.length < 32) throw new D1ApiError(503, "gateway_unavailable");
  return new URL(path, url);
}
