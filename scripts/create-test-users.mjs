/**
 * Create pre-confirmed test users for end-to-end smoke testing.
 *
 * Usage:
 *   node scripts/create-test-users.mjs
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Creates 2 users with email_confirmed_at set (so they can sign in immediately
 * without clicking a magic link). Idempotent — if a user already exists, it
 * just resets the password to the known test value.
 *
 * Test credentials (printed at the end):
 *   PM:    pm-smoketest@pmrfp.local       / Smoketest2026!
 *   Trade: trade-smoketest@pmrfp.local    / Smoketest2026!
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Load .env.local (tiny parser, no dotenv dependency) ----
function loadEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {
    /* ignore */
  }
}
loadEnv(join(__dirname, "..", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[FAIL] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const PASSWORD = "Smoketest2026!";

const USERS = [
  {
    label: "PM",
    email: "pm-smoketest@pmrfp.local",
    user_metadata: { full_name: "Demo PM (Smoketest)", primary_role: "property_manager" },
  },
  {
    label: "Trade",
    email: "trade-smoketest@pmrfp.local",
    user_metadata: { full_name: "Demo Trade (Smoketest)", primary_role: "trade" },
  },
];

async function api(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function findUserByEmail(email) {
  // GET /auth/v1/admin/users?email=... isn't a documented filter; we list a page and filter.
  const page = await api("GET", `/auth/v1/admin/users?per_page=200`);
  const list = page?.users ?? [];
  return list.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
}

async function upsertUser({ label, email, user_metadata }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`[${label}] exists (${existing.id}) — resetting password + confirming`);
    await api("PUT", `/auth/v1/admin/users/${existing.id}`, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata,
    });
    return existing.id;
  }
  console.log(`[${label}] creating ${email}`);
  const created = await api("POST", `/auth/v1/admin/users`, {
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata,
  });
  console.log(`[${label}] created ${created.id}`);
  return created.id;
}

async function main() {
  for (const u of USERS) {
    try {
      await upsertUser(u);
    } catch (e) {
      console.error(`[${u.label}] FAILED: ${e.message}`);
      process.exit(2);
    }
  }
  console.log("\n=== TEST CREDENTIALS ===");
  for (const u of USERS) {
    console.log(`${u.label.padEnd(6)} ${u.email}  /  ${PASSWORD}`);
  }
  console.log("========================\n");
}

await main();
