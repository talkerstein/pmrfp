import { D1ApiError, UUID, type D1Binding, type D1Result, type D1Statement } from "./contracts";

type Value = string | number | null;
type Query = { sql: string; params: Value[] };

export function vpsDatabase(kind: "app" | "auth", env: Record<string, string | undefined> = process.env, fetcher = fetch) {
  const key = env.PMRFP_VPS_D1_TRANSPORT_KEY;
  if (key !== undefined) {
    if (!/^[0-9a-f]{64}$/.test(key)) throw new D1ApiError(503, "database_configuration_unavailable");
    return createHttpBinding(`https://pmrfp-vps-d1-transport.pmrfp.workers.dev/v1/${kind}/query`, key, fetcher);
  }
  return createD1HttpBinding(
    env.PMRFP_CLOUDFLARE_ACCOUNT_ID ?? "",
    (kind === "app" ? env.PMRFP_D1_APP_DATABASE_ID : env.PMRFP_D1_AUTH_DATABASE_ID) ?? "",
    env.PMRFP_D1_RUNTIME_TOKEN ?? "",
    fetcher,
  );
}

export const vpsAppDatabase = () => vpsDatabase("app");

/** Execute the same prepared queries on the VPS through Cloudflare's D1 API. */
export function createD1HttpBinding(accountId: string, databaseId: string, token: string, fetcher = fetch): D1Binding & {
  exec(sql: string): Promise<D1Result[]>;
} {
  if (!/^[0-9a-f]{32}$/i.test(accountId) || !UUID.test(databaseId) || !/^[A-Za-z0-9_-]{30,128}$/.test(token)) {
    throw new D1ApiError(503, "database_configuration_unavailable");
  }
  return createHttpBinding(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, token, fetcher);
}

function createHttpBinding(endpoint: string, token: string, fetcher: typeof fetch): D1Binding & {
  exec(sql: string): Promise<D1Result[]>;
} {
  const prepared = new WeakMap<D1Statement, Query>();

  async function execute<T>(queries: Query[]): Promise<D1Result<T>[]> {
    try {
      // Never retry: after a timeout Cloudflare may already have committed the write.
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(queries.length === 1 ? queries[0] : { batch: queries }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("HTTP error");
      const { success, result } = await response.json() as { success?: boolean; result?: D1Result<T>[] };
      if (success !== true || !Array.isArray(result) || result.length !== queries.length ||
          result.some(item => item?.success !== true || !Array.isArray(item.results) ||
            !item.meta || typeof item.meta !== "object" || Array.isArray(item.meta))) {
        throw new Error("Invalid result");
      }
      return result;
    } catch {
      throw new D1ApiError(503, "database_query_unavailable");
    }
  }

  function prepare(sql: string, params: Value[] = []): D1Statement {
    const query = { sql, params };
    const all = async <T>() => (await execute<T>([query]))[0];
    const statement: D1Statement = {
      bind: (...values) => prepare(sql, values),
      first: async <T>() => (await all<T>()).results[0] ?? null,
      all,
      run: () => all<Record<string, unknown>>(),
    };
    prepared.set(statement, query);
    return statement;
  }

  return {
    prepare,
    // Better Auth detects the D1 dialect through prepare, batch, and exec.
    exec: sql => execute([{ sql, params: [] }]),
    async batch<T>(statements: D1Statement[]) {
      if (!statements.length) return [];
      return execute<T>(statements.map(statement => {
        const query = prepared.get(statement);
        if (!query) throw new D1ApiError(503, "database_statement_mismatch");
        return query;
      }));
    },
  };
}
