/**
 * A tiny in-memory PostgREST for query-shape and query-count tests. Supports
 * the filters the board code uses (eq, neq, gt, gte, lt, in, is.null, like
 * with a trailing %), order on one column, limit/offset, select of plain
 * columns, embedded trade_categories(name) on rfp_categories, and exact
 * counts (HEAD / limit=0). Every request is recorded in `requests`.
 */
export type Row = Record<string, unknown>;

export interface FakePostgrest {
  tables: Record<string, Row[]>;
  requests: URL[];
  fetch: typeof fetch;
  count(table: string): number;
}

function matches(row: Row, column: string, raw: string): boolean {
  const value = row[column];
  const [op, ...rest] = raw.split(".");
  const arg = rest.join(".");
  const s = value == null ? null : String(value);
  switch (op) {
    case "eq": return s === arg;
    case "neq": return s !== arg;
    case "gt": return s !== null && s > arg;
    case "gte": return s !== null && s >= arg;
    case "lt": return s !== null && s < arg;
    case "lte": return s !== null && s <= arg;
    case "is": return arg === "null" ? value == null : String(value) === arg;
    case "in": {
      const list = arg.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
      return s !== null && list.includes(s);
    }
    case "like": return s !== null && s.startsWith(arg.replace(/[%*]$/, ""));
    case "not": {
      // not.in.(…) / not.is.null
      return !matches(row, column, arg);
    }
    default: throw new Error(`fake-postgrest: unsupported filter ${column}=${raw}`);
  }
}

function orMatches(row: Row, expr: string): boolean {
  // or=(deadline.is.null,deadline.gte.2026-10-06)
  const parts = expr.replace(/^\(|\)$/g, "").split(/,(?![^(]*\))/);
  return parts.some((p) => {
    const [col, ...rest] = p.split(".");
    return matches(row, col, rest.join("."));
  });
}

const RESERVED = new Set(["select", "order", "limit", "offset", "or"]);

export function createFakePostgrest(tables: Record<string, Row[]>, opts: { maxRows?: number } = {}): FakePostgrest {
  const requests: URL[] = [];
  const maxRows = opts.maxRows ?? 1000;
  const fake: FakePostgrest = {
    tables,
    requests,
    count: (table) => requests.filter((u) => u.pathname.endsWith(`/rest/v1/${table}`)).length,
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      const table = url.pathname.split("/").pop() ?? "";
      const method = (init?.method ?? "GET").toUpperCase();
      let rows = [...(tables[table] ?? [])];
      for (const [key, raw] of url.searchParams.entries()) {
        if (RESERVED.has(key)) continue;
        rows = rows.filter((r) => matches(r, key, raw));
      }
      const or = url.searchParams.get("or");
      if (or) rows = rows.filter((r) => orMatches(r, or));
      const order = url.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(".");
        rows.sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
      }
      const total = rows.length;
      const headers = new Headers({ "Content-Type": "application/json" });
      const prefer = new Headers(init?.headers).get("Prefer") ?? "";
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : maxRows;
      if (method === "HEAD" || limit === 0) {
        headers.set("Content-Range", `*/${total}`);
        return new Response(method === "HEAD" ? null : "[]", { status: 206, headers });
      }
      rows = rows.slice(offset, offset + Math.min(limit, maxRows));
      if (prefer.includes("count=exact")) headers.set("Content-Range", `${offset}-${offset + rows.length - 1}/${total}`);
      const select = url.searchParams.get("select");
      if (select && select !== "*") {
        const cols = select.split(/,(?![^(]*\))/).map((c) => c.trim());
        rows = rows.map((r) => {
          const out: Row = {};
          for (const c of cols) {
            const embed = c.match(/^(\w+)\((.+)\)$/);
            if (embed) out[embed[1]] = r[embed[1]] ?? null;
            else out[c] = r[c] ?? null;
          }
          return out;
        });
      }
      return new Response(JSON.stringify(rows), { status: 200, headers });
    },
  };
  return fake;
}

/** A deterministic UUID whose first hex digit spreads rows over all 16 shards. */
export function uuidFor(n: number): string {
  const hex = (n * 2654435761 >>> 0).toString(16).padStart(8, "0");
  const lead = (n % 16).toString(16);
  return `${lead}${hex.slice(1)}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}
