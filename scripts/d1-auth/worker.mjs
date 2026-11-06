import {gatewayMatches} from './private-gateway.mjs';
import { betterAuth } from 'better-auth';
import { rehearsalOptions } from './rehearsal.mjs';
import { resetSyntheticPassword } from './atomic-reset.mjs';
import { syntheticMailOptions, recordSyntheticMail } from './synthetic-mail.mjs';
import { relaySyntheticMail } from './mail-relay.mjs';

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
    if(url.pathname==='/__migration/mail-relay-health'&&request.method==='GET'){
      try{if(env.MAIL_RELAY_MODE!=='synthetic-capture')throw Error('disabled');await relaySyntheticMail({kind:'reset',userId:'00000000-0000-4000-8000-000000000011',to:'fixture@example.invalid',url:env.AUTH_BASE_URL+'/api/auth/reset-password/synthetic_probe_token_0001',expiresIn:900},env);return Response.json({validated:true,emailsSent:0},{headers});}
      catch(error){return Response.json({error:'synthetic_relay_unavailable',stage:['network','http','response'].includes(error?.relayStage)?error.relayStage:'configuration',upstreamStatus:Number.isInteger(error?.relayStatus)?error.relayStatus:null},{status:503,headers});}
    }
    if (!url.pathname.startsWith('/api/auth/')) return new Response(JSON.stringify({error:'not_found'}),{status:404,headers});
    let options=rehearsalOptions(env.AUTH_DB,env.AUTH_SECRET);
    if (url.pathname==='/api/auth/reset-password') {
      if (env.SYNTHETIC_RESET!=='enabled' || request.method!=='POST') return new Response(JSON.stringify({error:'not_found'}),{status:404,headers});
      if (request.headers.get('origin')!==env.AUTH_BASE_URL || url.search || !request.headers.get('content-type')?.startsWith('application/json')) return new Response(JSON.stringify({error:'invalid_reset_request'}),{status:400,headers});
      try {
        const body=await request.text();
        if(new TextEncoder().encode(body).length>1024)throw Error('Bound exceeded');
        const input=JSON.parse(body);
        if(!input || Object.keys(input).some(key=>!['token','newPassword'].includes(key)))throw Error('Unknown field');
        await resetSyntheticPassword(env.AUTH_DB,input.token,input.newPassword);
        return new Response(JSON.stringify({status:true}),{headers});
      } catch {
        return new Response(JSON.stringify({error:'reset_failed'}),{status:400,headers});
      }
    }
    if(env.SYNTHETIC_RESET==='enabled')options=syntheticMailOptions(options,{origin:env.AUTH_BASE_URL,deliver:async message=>{await recordSyntheticMail(env.AUTH_DB,message);await relaySyntheticMail(message,env);}});
    const auth=betterAuth({...options,baseURL:env.AUTH_BASE_URL,trustedOrigins:[env.AUTH_BASE_URL]});
    const response=await auth.handler(request);
    const secured=new Response(response.body,response);
    secured.headers.set('cache-control','no-store');secured.headers.set('x-content-type-options','nosniff');
    return secured;
  }
};

export default worker;
