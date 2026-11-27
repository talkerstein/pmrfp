import { readFileSync, lstatSync } from 'node:fs';
import { EventEmitter, on } from 'node:events';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { customerAuthBootstrap } from './import-plan.mjs';
import { applyBatch, readDestination, readSource, reader, reconcile } from './reconcile-accounts.mjs';

const channel = 'pmrfp_auth_sync_v1';
const destination = 'https://api.cloudflare.com/client/v4/accounts/f4e9b098134981b108024243b2a72ed4/d1/database/';
const shadowId = '1fd27164-a6d3-451f-bc6b-efce7a8a8ce0';
const customerName = 'pmrfp-customer-staging-auth';

function createDestination(token, databaseId) {
  return async (path, payload) => {
    const response = await fetch(destination + databaseId + path, {
      method: payload ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!response.ok) throw Error(`D1 returned HTTP ${response.status}`);
    const value = await response.json();
    if (value.success !== true) throw Error('D1 query failed');
    return value.result;
  };
}

async function main() {
  const mode = process.argv[2];
  const customer = mode?.startsWith('--customer-');
  const { PMRFP_AUTH_SYNC_READER_FILE: credentialsPath, PMRFP_AUTH_SYNC_CA_FILE: caPath,
    PMRFP_AUTH_SYNC_D1_TOKEN: token, PMRFP_CUSTOMER_AUTH_DATABASE_ID: customerId } = process.env;
  if (process.argv.length !== 3 || !['--once', '--follow', '--customer-bootstrap', '--customer-once', '--customer-follow'].includes(mode)
    || !credentialsPath || !caPath || !token || (customer && (!/^[a-f0-9-]{36}$/.test(customerId ?? '') || customerId === shadowId))) {
    throw Error('Mode and scoped source/destination credentials are required');
  }
  const info = lstatSync(credentialsPath);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw Error('Owner-only reader file required');
  const source = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  if (!/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(source.host) ||
      source.pooler_user !== reader + '.tumexryzbzmtijvbloch' ||
      source.database !== 'postgres' || typeof source.password !== 'string' || !source.password) {
    throw Error('Reviewed Supabase source configuration required');
  }
  const client = new pg.Client({
    host: source.host, port: 5432, user: source.pooler_user, database: source.database, password: source.password,
    ssl: { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true },
    keepAlive: true, connectionTimeoutMillis: 10_000, statement_timeout: 10_000, query_timeout: 12_000,
  });
  const request = createDestination(token, customer ? customerId : shadowId);
  const wakeups = new EventEmitter();
  const controller = new AbortController();
  let dirty = false;
  function wake() {
    if (dirty) return;
    dirty = true;
    wakeups.emit('wake');
  }
  client.on('error', () => controller.abort());
  client.on('end', () => controller.abort());
  let timer;
  try {
    await client.connect();
    if ((await request('')).name !== (customer ? customerName : 'pmrfp-auth-shadow-20261106')) throw Error('Unexpected D1 destination');
    if (mode === '--customer-bootstrap') {
      const [inventory] = await applyBatch(request, [{
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'", params: [],
      }]);
      if (inventory.results.length !== 0) throw Error('Customer bootstrap requires an empty database');
      const { plan } = await readSource(client);
      const schema = readFileSync(new URL('../../workers/auth-preview/schema.sql', import.meta.url), 'utf8').split('-- Explicit sandbox marker')[0];
      await applyBatch(request, customerAuthBootstrap(plan, schema));
      if (!isDeepStrictEqual(await readDestination(request, true), plan)) throw Error('Customer bootstrap verification failed');
      console.log(JSON.stringify({ verifiedAccounts: plan.records, bootstrap: true }));
      return;
    }
    if (mode.endsWith('-once')) {
      console.log(JSON.stringify(await reconcile(client, request, customer)));
      return;
    }
    client.on('notification', ({ channel: received, payload }) => {
      if (received === channel && payload === '') wake();
    });
    const events = on(wakeups, 'wake', { signal: controller.signal });
    await client.query('LISTEN ' + channel);
    timer = setInterval(wake, 45_000);
    wake();
    for await (const _ of events) {
      dirty = false;
      console.log(JSON.stringify(await reconcile(client, request, customer)));
    }
  } finally {
    clearInterval(timer);
    await client.end();
  }
}

main().catch(() => {
  // Driver errors can contain connection details and query values.
  console.error('Auth mirror sync failed. Check the protected source connection, destination access and checkpoint.');
  process.exitCode = 1;
});
