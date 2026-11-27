import pg from 'pg';
import { DurableObject } from 'cloudflare:workers';
import { expiry, reconcile } from './reconcile-accounts.mjs';
import { gatewayMatches } from './private-gateway.mjs';

async function sync(env) {
  let client;
  let phase = 'configuration';
  try {
   if (!env.AUTH_SOURCE?.connectionString) throw Error('Verified Hyperdrive binding required');
   client = new pg.Client({
    connectionString: env.AUTH_SOURCE.connectionString,
    connectionTimeoutMillis: 15_000, query_timeout: 20_000,
   });
   client.on('error', () => {});
   phase = 'connect';
   await client.connect();
   phase = 'reconcile';
   const request = (_path, { batch }) => env.AUTH_DB.batch(
    batch.map(({ sql, params }) => params?.length ? env.AUTH_DB.prepare(sql).bind(...params) : env.AUTH_DB.prepare(sql)),
   );
   return await reconcile(client, request, true, env.AUTH_SOURCE_ROLE);
  } catch (error) {
   const detail = String(error?.message ?? '');
   const category = /certificate|TLS|SSL/i.test(detail) ? 'tls'
    : /not implemented|not supported/i.test(detail) ? 'runtime'
    : /timeout|timed out/i.test(detail) ? 'timeout'
    : /Source access or account inventory changed/.test(detail) ? 'source-guard'
    : /checkpoint changed/.test(detail) ? 'checkpoint-race'
    : /reviewed sealed mirror/.test(detail) ? 'destination-guard'
    : /connection.*closed|terminating connection/i.test(detail) ? 'connection-closed'
    : /^28/.test(String(error?.code)) ? 'credentials'
    : /^[A-Z0-9]{5}$/.test(String(error?.code)) ? 'sqlstate-' + error.code
    : 'other';
   throw Error('Customer account sync failed: ' + phase + ' (' + category + ')');
  } finally {
   if (client) await client.end();
  }
}

export class CustomerSync extends DurableObject {
 inFlight;

 async run() {
  if (!this.inFlight) {
   this.inFlight = sync(this.env).finally(() => { this.inFlight = undefined; });
  }
  return this.inFlight;
 }

 async start() {
  if (this.env.AUTH_SYNC_PAUSED === 'true') throw Error('Customer sync is paused');
  if (Date.now() >= Date.parse(expiry)) throw Error('Source reader authorization expired');
  if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 30_000);
  return this.run();
 }

 async alarm() {
  if (this.env.AUTH_SYNC_PAUSED === 'true' || Date.now() >= Date.parse(expiry)) return;
  await this.ctx.storage.setAlarm(Date.now() + 30_000);
  try {
   console.log(JSON.stringify(await this.run()));
  } catch (error) {
   console.error(error.message);
  }
 }
}

export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  const headers = { 'cache-control': 'no-store' };
  if (request.method !== 'POST' || url.pathname !== '/v1/reconcile' || url.search) {
   return new Response(null, { status: 404, headers });
  }
  if (!await gatewayMatches(request.headers.get('x-pmrfp-sync-key'), env.PMRFP_AUTH_SYNC_WAKE_KEY)) {
   return new Response(null, { status: 401, headers });
  }
  try {
   return Response.json(await env.CUSTOMER_SYNC.getByName('staging-accounts').start(), { headers });
  } catch (error) {
   return Response.json({ error: error.message }, { status: 503, headers });
  }
 },
};
