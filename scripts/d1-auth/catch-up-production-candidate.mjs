import { lstatSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { readSource } from './reconcile-accounts.mjs';

const accountId = 'f4e9b098134981b108024243b2a72ed4';
const authId = '7411e6cb-8c44-482c-936e-9cab052db3b5';
const appId = '03467304-6007-40f8-b5ff-e11e29553195';
const stateDir = homedir() + '/.codex/pmrfp-d1-refresh/';
const apply = process.argv[2] === '--apply';
if (process.argv.length > (apply ? 3 : 2)) throw Error('Unexpected arguments');
const credentialFile = stateDir + 'reader-credentials.json';
const stat = lstatSync(credentialFile);
if (!stat.isFile() || (stat.mode & 0o077)) throw Error('Protected reader file required');
const source = JSON.parse(readFileSync(credentialFile, 'utf8'));
if (!/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(source.host) ||
    source.pooler_user !== 'd1_migration_reader_20261022.tumexryzbzmtijvbloch' ||
    source.database !== 'postgres' || typeof source.password !== 'string' || !source.password) {
  throw Error('Source configuration mismatch');
}
const cf = /^oauth_token\s*=\s*"([^"]+)"/m.exec(
  readFileSync(homedir() + '/Library/Preferences/.wrangler/config/default.toml', 'utf8'))?.[1];
if (!cf) throw Error('Cloudflare authorization required');

async function query(id, statements) {
  const batch = statements.map(statement => typeof statement === 'string' ? { sql: statement } : statement);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${id}/query`, {
    method: 'POST', headers: { authorization: 'Bearer ' + cf, 'content-type': 'application/json' },
    body: JSON.stringify({ batch }), signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!response.ok) throw Error(`Cloudflare HTTP ${response.status}`);
  const data = await response.json();
  if (!data.success || data.result.length !== batch.length || data.result.some(item => !item.success)) {
    throw Error('Cloudflare candidate verification failed');
  }
  return data.result.map(item => item.results);
}

async function destination() {
  const [users, accounts, metadata, [state]] = await query(authId, [
    'SELECT id,email,name,emailVerified,createdAt,updatedAt,role,banned,banExpires FROM user',
    'SELECT id,accountId,providerId,userId,password FROM account',
    'SELECT user_id,metadata FROM _auth_source_metadata',
    `SELECT (SELECT count(*) FROM _auth_native_authority) AS authority,
      (SELECT count(*) FROM session) AS sessions, (SELECT count(*) FROM verification) AS verifications`,
  ]);
  if (state.authority || state.sessions || state.verifications ||
    users.length !== accounts.length || users.length !== metadata.length) throw Error('Candidate is serving or incomplete');
  const credentials = new Map(accounts.map(row => [row.userId, row]));
  const meta = new Map(metadata.map(row => [row.user_id, row.metadata]));
  return new Map(users.map(user => [user.id, { user, account: credentials.get(user.id), metadata: meta.get(user.id) }]));
}

const client = new pg.Client({
  host: source.host, port: 5432, user: source.pooler_user, database: source.database, password: source.password,
  ssl: { ca: readFileSync(stateDir + 'supabase-ca.crt', 'utf8'), rejectUnauthorized: true },
  connectionTimeoutMillis: 9000, statement_timeout: 10000, query_timeout: 12000,
});
try {
  await client.connect();
  const [{ plan, capturedAt }, before, [profiles, [app]]] = await Promise.all([
    readSource(client, undefined, { allowPasswordless: true }), destination(),
    query(appId, ['SELECT id FROM users_profile', 'SELECT count(*) AS authority FROM _customer_app_authority']),
  ]);
  const sourceRows = new Map(plan.accounts.map(row => [row.user.id, row]));
  const profileIds = new Set(profiles.map(profile => profile.id));
  const added = plan.accounts.filter(row => !before.has(row.user.id));
  const changed = plan.accounts.filter(row => before.has(row.user.id) && !isDeepStrictEqual(row, before.get(row.user.id)));
  const removed = [...before.keys()].filter(id => !sourceRows.has(id)).length;
  const missingProfiles = plan.accounts.filter(row => !profileIds.has(row.user.id)).length;
  if (app.authority || removed || missingProfiles || added.length + changed.length > 24) {
    console.log({ sourceAccounts: plan.records, candidateAccounts: before.size, changed: changed.length, removed, missingProfiles, missingAccounts: added.length });
    throw Error('Candidate requires reconciliation beyond verified account changes');
  }
  if (apply && (added.length || changed.length)) {
    const statements = [{
      sql: `SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM _auth_native_authority)
        AND NOT EXISTS(SELECT 1 FROM session) AND NOT EXISTS(SELECT 1 FROM verification)
        AND (SELECT count(*) FROM user)=? AND (SELECT count(*) FROM account)=?
        AND (SELECT count(*) FROM _auth_source_metadata)=?
        THEN 1 ELSE json('auth_candidate_changed') END`,
      params: [before.size, before.size, before.size],
    }];
    for (const { user: u, account: a, metadata } of added) {
      statements.push(
        { sql: 'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned,banExpires) VALUES(?,?,?,?,?,?,?,?,?)',
          params: [u.id,u.name,u.email,u.emailVerified,u.createdAt,u.updatedAt,u.role,u.banned,u.banExpires] },
        { sql: 'INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',
          params: [a.id,a.accountId,a.providerId,a.userId,a.password,u.createdAt,u.updatedAt] },
        { sql: 'INSERT INTO _auth_source_metadata(user_id,metadata) VALUES(?,?)', params: [u.id,metadata] },
      );
    }
    for (const { user: u, account: a, metadata } of changed) {
      const previous = before.get(u.id);
      if (previous.account.id !== a.id || previous.account.userId !== a.userId ||
          previous.account.providerId !== a.providerId || previous.account.accountId !== a.accountId) {
        throw Error('Candidate credential identity changed');
      }
      statements.push(
        { sql: 'UPDATE user SET name=?,email=?,emailVerified=?,createdAt=?,updatedAt=?,role=?,banned=?,banExpires=? WHERE id=?',
          params: [u.name,u.email,u.emailVerified,u.createdAt,u.updatedAt,u.role,u.banned,u.banExpires,u.id] },
        { sql: 'UPDATE account SET password=?,createdAt=?,updatedAt=? WHERE id=? AND userId=?',
          params: [a.password,u.createdAt,u.updatedAt,a.id,u.id] },
        { sql: 'UPDATE _auth_source_metadata SET metadata=? WHERE user_id=?', params: [metadata,u.id] },
      );
    }
    await query(authId, statements);
    if (!isDeepStrictEqual(await destination(), sourceRows)) throw Error('Candidate account readback mismatch');
  }
  console.log(JSON.stringify({ capturedAt, sourceAccounts: plan.records, candidateAccounts: before.size,
    missingAccounts: added.length, copiedAccounts: apply ? added.length : 0, missingProfiles,
    changedAccounts: changed.length, updatedAccounts: apply ? changed.length : 0,
    verified: apply || (added.length === 0 && changed.length === 0) }));
} catch (error) {
  // Driver errors can contain sensitive SQL parameters or authentication material.
  console.error(/^Cloudflare HTTP \d+$/.test(error.message) ? error.message : 'Production candidate catch-up stopped');
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
