const projections = {
  trade_categories: "id,slug,name,icon,active,sort_order",
  regions: "id,slug,name,province,country,parent_id,active,sort_order",
  property_types: "id,slug,name,active",
};
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

async function matchesGateway(provided, expected) {
  if (!provided || typeof expected !== "string" || expected.length < 32 || provided.length > 512) return false;
  const encoder = new TextEncoder();
  const hashes = await Promise.all([provided, expected].map(value => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  const [left, right] = hashes.map(hash => new Uint8Array(hash));
  return left.reduce((different, value, index) => different | (value ^ right[index]), 0) === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/v1/taxonomy" || request.method !== "GET") {
      return Response.json({ error: "not_found" }, { status: 404, headers });
    }
    if (!await matchesGateway(request.headers.get("x-pmrfp-gateway-key"), env.PUBLIC_TAXONOMY_GATEWAY)) {
      return Response.json({ error: "unauthorized" }, { status: 401, headers });
    }
    const table = url.searchParams.get("table");
    if (!table || !Object.hasOwn(projections, table) || [...url.searchParams.keys()].length !== 1) {
      return Response.json({ error: "invalid_request" }, { status: 400, headers });
    }
    try {
      const result = await env.DB.prepare(`SELECT ${projections[table]} FROM ${table} WHERE active=1 AND EXISTS (SELECT 1 FROM _migration_manifest WHERE id=1 AND state='validated') ORDER BY id LIMIT 251`).all();
      if (!result.success || result.results.length > 250) {
        return Response.json({ error: "projection_unavailable" }, { status: 503, headers });
      }
      return Response.json({ items: result.results.map(row => ({ ...row, active: row.active === 1 })), next: null }, { headers });
    } catch {
      return Response.json({ error: "projection_unavailable" }, { status: 503, headers });
    }
  },
};
