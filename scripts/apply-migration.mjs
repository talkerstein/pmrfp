/**
 * Apply a single SQL migration file to the live Supabase project via the
 * service-role PostgREST RPC `exec_sql`. If that RPC isn't defined (it
 * isn't by default), falls back to printing the SQL so the user can paste
 * it into the Supabase SQL editor.
 *
 * Usage:
 *   node scripts/apply-migration.mjs supabase/migrations/<file>.sql
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(p) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {}
}
loadEnv(join(__dirname, "..", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv[2];

if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <path-to-sql-file>");
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const projectRef = new URL(SUPABASE_URL).host.split(".")[0];

// Try direct PostgREST RPC first (won't work unless exec_sql is defined).
async function tryRpc() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

const rpc = await tryRpc();
if (rpc.ok) {
  console.log(`✓ Migration applied via exec_sql RPC.`);
  process.exit(0);
}

// Fallback — print pasteable SQL + dashboard link.
console.log("\n──────────────────────────────────────────────");
console.log("Could not apply via RPC (this is normal — no exec_sql function).");
console.log("Paste the SQL below into the Supabase SQL Editor:");
console.log(`\n  https://supabase.com/dashboard/project/${projectRef}/sql/new`);
console.log("──────────────────────────────────────────────\n");
console.log(sql);
console.log("\n──────────────────────────────────────────────\n");
console.log("Press Enter, then [Run] in the editor. Then this script's job is done.\n");
