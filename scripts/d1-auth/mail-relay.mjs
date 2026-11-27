const relayURL='https://pmrfp-git-codex-d1-staged-migration-talkersteins-projects.vercel.app/api/migration/auth-mail';
/** Temporary synthetic-only dry-run bridge. Does not send SMTP messages. */
export async function relaySyntheticMail(message,env,fetcher=fetch){
 if(!['synthetic-capture','synthetic-delivery-test'].includes(env.MAIL_RELAY_MODE))return;
 if(typeof env.MAIL_RELAY_SECRET!=='string'||env.MAIL_RELAY_SECRET.length<32||typeof env.MAIL_RELAY_OIDC!=='string'||env.MAIL_RELAY_OIDC.length<32)throw Error('Synthetic relay unavailable');
 let stage='network';
 try{
  const response=await fetcher.call(globalThis,relayURL,{method:'POST',headers:{'content-type':'application/json','x-pmrfp-mail-gateway-key':env.MAIL_RELAY_SECRET,'x-vercel-trusted-oidc-idp-token':env.MAIL_RELAY_OIDC},redirect:'manual',signal:AbortSignal.timeout(15000),body:JSON.stringify(message)});
  stage='http';
  if(!response.ok){const error=Error('Synthetic mail relay failed');error.relayStatus=response.status;throw error;}
  stage='response';
  const text=await response.text();if(text.length>1024)throw Error('Invalid relay response');
  const result=JSON.parse(text);if(env.MAIL_RELAY_MODE==='synthetic-capture'?(result.validated!==true||result.emailsSent!==0||result.mode!=='synthetic-capture'):(result.accepted!==true||result.emailsSent!==1||result.mode!=='synthetic-delivery-test'))throw Error('Invalid relay mode');
 }catch(error){const failure=Error('Synthetic mail relay failed');failure.relayStage=stage;if(Number.isInteger(error?.relayStatus))failure.relayStatus=error.relayStatus;throw failure;}
}
