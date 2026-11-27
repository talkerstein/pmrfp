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

async function publicBoard(db, url) {
  const shard = url.searchParams.get("shard") ?? "";
  if (!/^(?:[0-9]|1[0-5])$/.test(shard) || [...url.searchParams.keys()].length !== 1) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers });
  }
  const index = Number(shard);
  const bound = digit => `${digit.toString(16)}0000000-0000-0000-0000-000000000000`;
  // All UUIDs in the final shard sort before g. Keep both index bounds.
  const upper = index === 15 ? "g" : bound(index + 1);
  const result = await db.prepare(`SELECT r.id,r.slug,r.title,r.summary,r.region_id AS regionId,
    r.property_type_id AS propertyTypeId,r.city,r.province,r.deadline,r.is_demo AS isDemo,
    r.source_type AS sourceType,r.gc_project_name AS gcProjectName,r.awarded_rfp_id AS awardedRfpId,
    r.published_at AS publishedAt,r.created_at AS createdAt,
    (SELECT json_group_array(category_id) FROM
      (SELECT category_id FROM rfp_categories WHERE rfp_id=r.id ORDER BY id)) AS categoryIds
    FROM rfp_posts r WHERE r.status='published' AND r.id>=? AND r.id<?
    AND EXISTS (SELECT 1 FROM _migration_manifest WHERE id=1 AND state='validated')
    ORDER BY r.id LIMIT 251`)
    .bind(bound(index), upper).all();
  if (!result.success || result.results.length > 250) {
    return Response.json({ error: "projection_unavailable" }, { status: 503, headers });
  }
  const items = result.results.map(row => ({ ...row, isDemo: row.isDemo === 1, categoryIds: JSON.parse(row.categoryIds) }));
  return Response.json({ items, next: null }, { headers });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!["/v1/taxonomy", "/v1/board"].includes(url.pathname) || request.method !== "GET") {
      return Response.json({ error: "not_found" }, { status: 404, headers });
    }
    if (!await matchesGateway(request.headers.get("x-pmrfp-gateway-key"), env.PUBLIC_TAXONOMY_GATEWAY)) {
      return Response.json({ error: "unauthorized" }, { status: 401, headers });
    }
    if (url.pathname === "/v1/board") {
      try {
        return await publicBoard(env.DB, url);
      } catch {
        return Response.json({ error: "projection_unavailable" }, { status: 503, headers });
      }
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

export default worker;
