import {createHash,timingSafeEqual} from 'node:crypto';
import {verifyHostingerSmtp} from './hostinger-mail.mjs';
import {buildSyntheticAuthMessage} from './auth-mail-message.mjs';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
/** Explicit preview-only transport boundary. No Source Auth; SMTP sending remains disabled. */
export async function handleMailRelay(request:Request,env:Record<string,string|undefined>,verify=verifyHostingerSmtp):Promise<Response> {
 if(env.PMRFP_MIGRATION_MAIL_MODE!=='synthetic-only'||!(env.VERCEL_ENV==='preview'||(!env.VERCEL_ENV&&env.NODE_ENV==='development')))return Response.json({error:'mail_preview_not_enabled'},{status:503,headers});
 const key=env.PMRFP_MIGRATION_MAIL_GATEWAY_SECRET,provided=request.headers.get('x-pmrfp-mail-gateway-key');
 if(!key||key.length<32)return Response.json({error:'mail_configuration_unavailable'},{status:503,headers});
 if(!provided||provided.length>512||!timingSafeEqual(createHash('sha256').update(key).digest(),createHash('sha256').update(provided).digest()))return Response.json({error:'unauthorized'},{status:401,headers});
 if(request.method==='POST'&&env.PMRFP_MIGRATION_MAIL_CAPTURE==='enabled'&&!new URL(request.url).search){
  try {
   if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('JSON required');
   const reader=request.body?.getReader();if(!reader)throw Error('Body required');
   const chunks:Uint8Array[]=[];let size=0;
   try {for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192)throw Error('Body bound');chunks.push(part.value);}}finally{await reader.cancel();}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   buildSyntheticAuthMessage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
   return Response.json({validated:true,emailsSent:0,mode:'synthetic-capture'},{headers});
  }catch{return Response.json({error:'invalid_synthetic_message'},{status:400,headers});}
 }
 if(request.method!=='GET'||new URL(request.url).search)return Response.json({error:'operation_not_enabled'},{status:405,headers});
 try {return Response.json(await verify({username:'info@pmrfp.com',password:env.PMRFP_MIGRATION_SMTP_PASSWORD}),{headers});}
 catch {return Response.json({error:'smtp_verification_failed'},{status:503,headers});}
}
