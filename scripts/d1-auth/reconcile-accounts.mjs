import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { mapMigrationAccount, refreshCustomerAuthStatements, refreshShadowStatements } from './import-plan.mjs';

export const reader = 'd1_migration_reader_20261022';
export const expiry = '2026-12-03T10:00:00Z';
const tableNames = ['_auth_shadow_manifest', '_auth_source_metadata', 'account', 'session', 'user', 'verification'];

export async function readSource(client, expectedReader = reader, { allowPasswordless = false } = {}) {
  // A single PostgreSQL statement shares one MVCC snapshot for the count and
  // rows and works through both the session and transaction poolers.
  const { rows: [source] } = await client.query(`
      SELECT current_user AS reader, transaction_timestamp() AS captured,
        (SELECT rolvaliduntil FROM pg_roles WHERE rolname = current_user) AS expiry,
        obj_description('d1_migration.auth_export_v1'::regclass, 'pg_class') AS view_marker,
        (SELECT count(*)::int FROM public.d1_migration_auth_ids_20261022) AS records,
        (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id)
          FROM (SELECT * FROM d1_migration.auth_export_v1 LIMIT 1001) u) AS accounts
  `);
  if (source.reader !== expectedReader || source.expiry?.getTime() !== Date.parse(expiry) ||
      source.captured.getTime() >= Date.parse(expiry) ||
      source.view_marker !== `pmrfp-sensitive-auth-export-v1; approved complete Supabase exit; expires ${expiry}` ||
      source.records < 1 || source.records > 1000) throw Error('Source access or account inventory changed');
  if (!Array.isArray(source.accounts) || source.accounts.length !== source.records) throw Error('Incomplete Auth snapshot');
  const accounts = source.accounts.map(account => mapMigrationAccount(account, source.captured.getTime(), { allowPasswordless }));
  if (new Set(accounts.map(({ user }) => user.id)).size !== accounts.length ||
      new Set(accounts.map(({ user }) => user.email)).size !== accounts.length) throw Error('Ambiguous Auth snapshot');
  const capturedAt = source.captured.toISOString();
  const checkpoint = JSON.stringify({ capturedAt, accounts });
  return { capturedAt, plan: { accounts, records: accounts.length,
    sourceSha256: createHash('sha256').update(checkpoint).digest('hex') } };
}

export async function readDestination(request, customer = false) {
  const expectedTables = customer
    ? ['_auth_customer_staging', '_auth_source_metadata', '_staging_saved_rfps', 'account', 'session', 'user', 'verification']
    : tableNames;
  const results = await request('/query', { batch: [
    { sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name" },
    { sql: customer ? 'SELECT id, mode AS state, source_sha256, records FROM _auth_customer_staging'
      : 'SELECT id, state, source_sha256, records FROM _auth_shadow_manifest' },
    { sql: 'SELECT id, email, name, emailVerified, createdAt, updatedAt, role, banned, banExpires FROM user ORDER BY id' },
    { sql: 'SELECT id, accountId, providerId, userId, password FROM account ORDER BY userId' },
    { sql: 'SELECT user_id, metadata FROM _auth_source_metadata ORDER BY user_id' },
    { sql: customer ? 'SELECT EXISTS (SELECT 1 FROM verification) AS serving'
      : 'SELECT EXISTS (SELECT 1 FROM session) OR EXISTS (SELECT 1 FROM verification) AS serving' },
  ] });
  if (results.length !== 6 || results.some(result => result.success !== true)) throw Error('Incomplete D1 readback');
  const [tables, markers, users, accounts, metadata, status] = results.map(result => result.results);
  const [marker] = markers;
  if (!isDeepStrictEqual(tables.map(row => row.name), expectedTables) ||
      markers.length !== 1 || marker.id !== 1 || marker.state !== (customer ? 'customer-staging-v1' : 'sealed') ||
      !/^[a-f0-9]{64}$/.test(marker.source_sha256) || status[0]?.serving !== 0 ||
      ![users.length, accounts.length, metadata.length].every(count => count === marker.records) ||
      accounts.some((row, i) => row.userId !== users[i].id || row.providerId !== 'credential' ||
        row.id !== 'credential:' + row.userId || row.accountId !== row.userId ||
        metadata[i].user_id !== row.userId || users[i].role !== 'user')) throw Error('Destination is not the reviewed sealed mirror');
  return {
    records: marker.records,
    sourceSha256: marker.source_sha256,
    accounts: users.map((user, i) => ({ user, account: accounts[i], metadata: metadata[i].metadata })),
  };
}

export async function applyBatch(request, batch) {
  const results = await request('/query', { batch });
  if (results.length !== batch.length || results.some(result => result.success !== true)) throw Error('Incomplete D1 refresh');
  return results;
}

export async function reconcile(client, request, customer, expectedReader = reader) {
  const previous = await readDestination(request, customer);
  const { plan: next, capturedAt } = await readSource(client, expectedReader, { allowPasswordless: customer });
  const updated = !isDeepStrictEqual(previous.accounts, next.accounts);
  if (updated) {
    await applyBatch(request, customer ? refreshCustomerAuthStatements(previous, next) : refreshShadowStatements(previous, next));
    if (!isDeepStrictEqual(await readDestination(request, customer), next)) throw Error('D1 refresh verification failed');
  }
  if (customer) {
    const [result] = await applyBatch(request, [{
      sql: 'UPDATE _auth_customer_staging SET verified_at=? WHERE id=1 AND source_sha256=? AND (verified_at IS NULL OR verified_at < ?)',
      params: [capturedAt, updated ? next.sourceSha256 : previous.sourceSha256, capturedAt],
    }]);
    if (result.meta?.changes !== 1) throw Error('Customer freshness checkpoint changed');
  }
  return { verifiedAccounts: next.records, updated };
}
