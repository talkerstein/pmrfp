import { betterAuth } from 'better-auth';
import { rehearsalOptions } from './rehearsal.mjs';

async function gatewayMatches(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || expected.length < 32 || actual.length > 512) return false;
  const bytes = new TextEncoder();
  const [a,b] = await Promise.all([crypto.subtle.digest('SHA-256',bytes.encode(actual)),crypto.subtle.digest('SHA-256',bytes.encode(expected))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);let difference=0;
  for(let i=0;i<x.length;i++)difference|=x[i]^y[i];
  return difference===0;
}

/** Only synthetic fixtures, behind a private gateway; no source Auth connection. */
const worker = {
  async fetch(request, env) {
    const headers = {'cache-control':'no-store','content-type':'application/json','x-content-type-options':'nosniff'};
    if (!await gatewayMatches(request.headers.get('x-pmrfp-auth-preview-key'),env.GATEWAY_SECRET)) return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers});
    const url=new URL(request.url);
    if (env.MODE!=='synthetic-only' || url.origin!==env.AUTH_BASE_URL || !env.AUTH_DB || typeof env.AUTH_SECRET!=='string' || env.AUTH_SECRET.length<32) return new Response(JSON.stringify({error:'invalid_preview_configuration'}),{status:503,headers});
    try {
      const marker=await env.AUTH_DB.prepare('SELECT mode FROM _auth_preview_manifest WHERE id=1').first();
      if(marker?.mode!=='synthetic-only-v1')throw Error('Unknown sandbox');
      const rows=await env.AUTH_DB.prepare("SELECT count(*) AS total,sum(CASE WHEN email NOT LIKE '%@example.invalid' OR id NOT LIKE '00000000-0000-4000-8000-0000000000%' THEN 1 ELSE 0 END) AS unsafe FROM user").first();
      if(!rows || !Number.isSafeInteger(rows.total) || rows.total<0 || rows.total>20 || !(rows.unsafe===0 || (rows.total===0 && rows.unsafe===null)))throw Error('Non-synthetic records');
    } catch {
      return new Response(JSON.stringify({error:'synthetic_dataset_required'}),{status:503,headers});
    }
    if (url.pathname==='/__migration/health' && request.method==='GET') return new Response(JSON.stringify({mode:'synthetic-only',realAccountsImported:false}),{headers});
    if (!url.pathname.startsWith('/api/auth/')) return new Response(JSON.stringify({error:'not_found'}),{status:404,headers});
    const options=rehearsalOptions(env.AUTH_DB,env.AUTH_SECRET);
    const auth=betterAuth({...options,baseURL:env.AUTH_BASE_URL,trustedOrigins:[env.AUTH_BASE_URL]});
    const response=await auth.handler(request);
    const secured=new Response(response.body,response);
    secured.headers.set('cache-control','no-store');secured.headers.set('x-content-type-options','nosniff');
    return secured;
  }
};

export default worker;
