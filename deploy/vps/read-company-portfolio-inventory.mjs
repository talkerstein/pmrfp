import { createHash } from "node:crypto";

const site = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (site.origin !== "https://tumexryzbzmtijvbloch.supabase.co" || !secret) throw new Error("Source configuration unavailable");
const verified = new Set((process.env.PMRFP_PUBLIC_RFP_ASSET_IDS ?? "").split(","));
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

async function list(prefix) {
  const response = await fetch(new URL("/storage/v1/object/list/logos", site), { method: "POST", redirect: "error",
    headers: { authorization: "Bearer " + secret, apikey: secret, "content-type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
    signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Source storage returned ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length >= 1000) throw new Error("Storage inventory exceeds the verification bound");
  return rows;
}

const folders = (await list("")).filter(row => row.id === null && uuid.test(row.name));
const entries = [];
for (let offset = 0; offset < folders.length; offset += 6) {
  await Promise.all(folders.slice(offset, offset + 6).map(async folder => {
    for (const photo of await list(folder.name)) {
      if (!photo.id || !photo.name.startsWith("portfolio-")) continue;
      const asset = createHash("sha256").update(`logos/${folder.name}/${photo.name}`).digest("hex");
      const created = Date.parse(photo.created_at);
      if (!uuid.test(photo.id) || !Number.isSafeInteger(created) || !verified.has(asset)) {
        throw new Error("A portfolio photo lacks a verified R2 mapping");
      }
      entries.push({ id: photo.id, org: folder.name, asset, created });
    }
  }));
}
if (new Set(entries.map(row => row.id)).size !== entries.length) throw new Error("Duplicate storage object IDs");
entries.sort((a, b) => a.org.localeCompare(b.org) || a.created - b.created || a.id.localeCompare(b.id));

if (process.argv.includes("--emit-sql")) {
  console.log("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM _customer_app_authority WHERE id=1) THEN 1 ELSE json('application_is_live') END;");
  console.log("UPDATE _company_legacy_portfolio SET deleted_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE deleted_at IS NULL;");
  for (const { id, org, asset, created } of entries) {
    console.log(`INSERT INTO _company_legacy_portfolio(id,organization_id,asset_id,created_at)
      VALUES('${id}','${org}','${asset}',${created}) ON CONFLICT(asset_id) DO UPDATE SET
      created_at=excluded.created_at,deleted_at=NULL;`);
  }
} else {
  console.log(JSON.stringify({ folders: folders.length, verifiedPhotos: entries.length }));
}
