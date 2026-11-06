import {createHash,timingSafeEqual} from 'node:crypto';
import {verifyHostingerSmtp} from './hostinger-mail.mjs';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
/** Explicit preview-only transport boundary. No Source Auth and no sending operation. */
export async function handleMailRelay(request:Request,env:Record<string,string|undefined>,verify=verifyHostingerSmtp):Promise<Response> {
 if(env.PMRFP_MIGRATION_MAIL_MODE!=='synthetic-only'||!(env.VERCEL_ENV==='preview'||(!env.VERCEL_ENV&&env.NODE_ENV==='development')))return Response.json({error:'mail_preview_not_enabled'},{status:503,headers});
 const key=env.PMRFP_MIGRATION_MAIL_GATEWAY_SECRET,provided=request.headers.get('x-pmrfp-mail-gateway-key');
 if(!key||key.length<32)return Response.json({error:'mail_configuration_unavailable'},{status:503,headers});
 if(!provided||provided.length>512||!timingSafeEqual(createHash('sha256').update(key).digest(),createHash('sha256').update(provided).digest()))return Response.json({error:'unauthorized'},{status:401,headers});
 if(request.method!=='GET'||new URL(request.url).search)return Response.json({error:'operation_not_enabled'},{status:405,headers});
 try {return Response.json(await verify({username:'info@pmrfp.com',password:env.PMRFP_MIGRATION_SMTP_PASSWORD}),{headers});}
 catch {return Response.json({error:'smtp_verification_failed'},{status:503,headers});}
}
