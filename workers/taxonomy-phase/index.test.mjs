import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.mjs";

test("only the fixed taxonomy projection can reach D1 with the phase key", async () => {
  const key = "synthetic-taxonomy-phase-key-at-least-32";
  const reads = [];
  const env = {
    PUBLIC_TAXONOMY_GATEWAY: key,
    DB: { prepare(sql) {
      reads.push(sql);
      return { all: async () => ({ success: true, results: [{ id: "fixture", active: 1 }] }) };
    } },
  };
  const call = (path, method = "GET", secret = key) => worker.fetch(new Request("https://fixture.invalid" + path, {
    method, headers: { "x-pmrfp-gateway-key": secret },
  }), env);
  assert.equal((await call("/v1/taxonomy?table=users_profile")).status, 400);
  assert.equal((await call("/v1/taxonomy?table=regions&after=fixture")).status, 400);
  assert.equal((await call("/v1/taxonomy?table=regions", "POST")).status, 404);
  assert.equal((await call("/v1/taxonomy?table=regions", "GET", "bad")).status, 401);
  assert.equal(reads.length, 0);
  assert.deepEqual(await (await call("/v1/taxonomy?table=regions")).json(), { items: [{ id: "fixture", active: true }], next: null });
  assert.deepEqual(reads, ["SELECT id,slug,name,province,country,parent_id,active,sort_order FROM regions WHERE active=1 AND EXISTS (SELECT 1 FROM _migration_manifest WHERE id=1 AND state='validated') ORDER BY id LIMIT 251"]);
});
