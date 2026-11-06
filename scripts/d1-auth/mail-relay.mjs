const relayURL='https://pmrfp-git-codex-d1-staged-migration-talkersteins-projects.vercel.app/api/migration/auth-mail';
/** Temporary synthetic-only dry-run bridge. Does not send SMTP messages. */
export async function relaySyntheticMail(message,env,fetcher=fetch){
 if(env.MAIL_RELAY_MODE!=='synthetic-capture')return;
 if(typeof env.MAIL_RELAY_SECRET!=='string'||env.MAIL_RELAY_SECRET.length<32||typeof env.MAIL_RELAY_OIDC!=='string'||env.MAIL_RELAY_OIDC.length<32)throw Error('Synthetic relay unavailable');
 try{
  const response=await fetcher(relayURL,{method:'POST',headers:{'content-type':'application/json','x-pmrfp-mail-gateway-key':env.MAIL_RELAY_SECRET,'x-vercel-trusted-oidc-idp-token':env.MAIL_RELAY_OIDC},redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify(message)});
  if(!response.ok)throw Error('Relay denied');
  const text=await response.text();if(text.length>1024)throw Error('Invalid relay response');
  const result=JSON.parse(text);if(result.validated!==true||result.emailsSent!==0||result.mode!=='synthetic-capture')throw Error('Invalid relay mode');
 }catch{throw Error('Synthetic mail relay failed');}
}
