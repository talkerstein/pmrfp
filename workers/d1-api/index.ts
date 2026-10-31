import { D1ApiError, readSaveInput, type D1Binding } from "../../src/lib/d1/contracts";
import { verifyGateway, verifyUser, type AuthConfig } from "./auth";
import { changeSavedRfp, listSavedRfps } from "./saved-rfps";

import { readRfpDetail } from "./detail";
import { listPublicBoard } from "./board";
import { listPublicTaxonomy } from "./taxonomy";
import { listPublicPhotos } from "./photos";

export interface Env extends AuthConfig {
  DB: D1Binding;
  GATEWAY_SECRET: string;
  /** Writes are enabled only on an explicitly synthetic staging dataset. */
  SAVED_RFPS_MODE?: "read-only" | "sandbox-write";
}
const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { "cache-control": "no-store, private", "x-content-type-options": "nosniff" },
});
/** Fixed gateway-protected operations; private reads additionally require live user authorization. */
export async function handleRequest(request: Request, env: Env, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Response> {
  try {
    await verifyGateway(request.headers.get("x-pmrfp-gateway-key"), env.GATEWAY_SECRET);
    const url = new URL(request.url);
    if (url.pathname === "/v1/rfp-photos") {
      if (request.method !== "GET") throw new D1ApiError(405, "method_not_allowed");
      return json(await listPublicPhotos(env.DB, url));
    }
    if (url.pathname === "/v1/board") {
      if (request.method !== "GET") throw new D1ApiError(405, "method_not_allowed");
      return json(await listPublicBoard(env.DB, url));
    }
    if (url.pathname === "/v1/taxonomy") {
      if (request.method !== "GET") throw new D1ApiError(405, "method_not_allowed");
      return json(await listPublicTaxonomy(env.DB, url));
    }
    if (url.pathname === "/v1/rfp-detail") {
      if (request.method !== "GET") throw new D1ApiError(405, "method_not_allowed");
      await verifyUser(request, env, fetcher);
      return json(await readRfpDetail(env.DB, request, env, fetcher));
    }
    if (url.pathname !== "/v1/saved-rfps" || url.search) throw new D1ApiError(404, "not_found");
    if (request.method !== "GET" && request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
    const userId = await verifyUser(request, env, fetcher);
    const now = new Date().toISOString();
    if (request.method === "GET") return json({ items: await listSavedRfps(env.DB, userId, now) });
    if (env.SAVED_RFPS_MODE !== "sandbox-write") throw new D1ApiError(503, "writes_not_enabled");
    // The marker is deliberately absent from imported production snapshots.
    const marker = await env.DB.prepare("SELECT value FROM _d1_sandbox WHERE key='dataset'").first<{ value: string }>();
    if (marker?.value !== "synthetic-only") throw new D1ApiError(503, "writes_not_enabled");
    await changeSavedRfp(env.DB, userId, await readSaveInput(request), now);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof D1ApiError) return json({ error: error.code }, error.status);
    // Auth tokens, database rows, SQL errors and gateway secrets are never echoed or logged.
    return json({ error: "database_unavailable" }, 503);
  }
}
const worker = { fetch(request: Request, env: Env): Promise<Response> { return handleRequest(request, env); } };
export default worker;
