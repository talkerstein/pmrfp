import { D1ApiError, readD1Json, type D1Binding } from "../../src/lib/d1/contracts";
import { verifyGateway } from "./auth";

interface Env {
  AUTH_DB: D1Binding;
  APP_DB: D1Binding;
  VPS_IP: string;
  MODE: "readiness" | "serving";
  VPS_D1_KEY?: string;
}

type Parameter = string | number | null;
type Query = { sql: string; params: Parameter[] };
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const route = /^\/v1\/(app|auth)\/(health|query)$/;
const authorities = {
  app: "_customer_app_authority",
  auth: "_auth_native_authority",
} as const;

// The auth adapter uses these read-only PRAGMAs to inspect its SQLite schema.
const authSchemaQuery = /^\s*PRAGMA\s+(?:table_info|index_list|index_info)\s*\(\s*(?:"[a-z0-9_]+"|'[a-z0-9_]+'|[a-z0-9_]+)\s*\)\s*$/i;

function isQuery(input: unknown, kind: keyof typeof authorities): input is Query {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const { sql, params } = input as Partial<Query>;
  return typeof sql === "string" && sql.length <= 48_000 && !sql.includes(";") &&
    (/^\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql) ||
      (kind === "auth" && authSchemaQuery.test(sql))) &&
    Array.isArray(params) && params.length <= 100 &&
    params.every(value => value === null || typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value)));
}

export async function handleVpsD1Transport(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const match = route.exec(url.pathname);
    if (!match || url.search || !env.VPS_IP || request.headers.get("cf-connecting-ip") !== env.VPS_IP) {
      throw new D1ApiError(404, "not_found");
    }
    const bearer = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") ?? "");
    await verifyGateway(bearer?.[1] ?? null, env.VPS_D1_KEY);
    const kind = match[1] as keyof typeof authorities;
    const database = kind === "auth" ? env.AUTH_DB : env.APP_DB;
    const authority = `EXISTS (SELECT 1 FROM ${authorities[kind]} WHERE id=1 AND mode='native-v1')`;

    if (match[2] === "health") {
      if (request.method !== "GET") throw new D1ApiError(405, "method_not_allowed");
      const result = await database.prepare(`SELECT ${authority} AS ready`).first<{ ready: number }>();
      return Response.json({ database: kind, reachable: true, ready: result?.ready === 1 }, { headers });
    }
    if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
    if (env.MODE !== "serving") throw new D1ApiError(503, "database_serving_disabled");

    const body = await readD1Json(request, 512 * 1024);
    const queries = body && typeof body === "object" && "batch" in body ? body.batch : [body];
    if (!Array.isArray(queries) || !queries.length || queries.length > 98 ||
      !queries.every(query => isQuery(query, kind))) {
      throw new D1ApiError(400, "invalid_query_batch");
    }
    // D1 executes the gate and the requests in a single transaction. No customer
    // read or write leaves the candidate before its authority marker is enabled.
    const [, ...result] = await database.batch([
      database.prepare(`SELECT CASE WHEN ${authority} THEN 1 ELSE json('authority_disabled') END`),
      ...queries.map(({ sql, params }) => database.prepare(sql).bind(...params)),
    ]);
    return Response.json({ success: true, result }, { headers });
  } catch (error) {
    const status = error instanceof D1ApiError ? error.status : 503;
    const code = error instanceof D1ApiError ? error.code : "database_query_unavailable";
    return Response.json({ success: false, error: code }, { status, headers });
  }
}

export default { fetch: handleVpsD1Transport };
