import nodemailer from 'nodemailer';
/** Node-side SMTP delivery; Workers cannot open TCP to Hostinger's Cloudflare IPs. */
export async function verifyHostingerSmtp(env, factory=nodemailer.createTransport) {
  if(env.username!=='info@pmrfp.com'||typeof env.password!=='string'||!env.password||env.password.length>1024)throw Error('SMTP configuration unavailable');
  const transport=factory({host:'smtp.hostinger.com',port:465,secure:true,
    auth:{user:env.username,pass:env.password},tls:{servername:'smtp.hostinger.com',rejectUnauthorized:true},
    pool:false,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
    connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000,dnsTimeout:5000});
  try {await transport.verify();return {authenticated:true,emailsSent:0};}
  catch {throw Error('SMTP verification failed');}
  finally {transport.close();}
}

/** Prepared opt-in rehearsal only: one pinned synthetic identity, fixed recipient. */
export async function sendSyntheticAuthTest(env,message,factory=nodemailer.createTransport,now=Date.now()){
  const expires=Date.parse(env.PMRFP_MIGRATION_MAIL_DELIVERY_EXPIRES||'');
  if(env.VERCEL_ENV!=='preview'||env.PMRFP_MIGRATION_MAIL_DELIVERY!=='approved-dev-test'||!Number.isFinite(expires)||expires<=now||expires>now+900000||message.userId!=='00000000-0000-4000-8000-000000000012')throw Error('Synthetic delivery not approved');
  const {buildSyntheticAuthMessage}=await import('./auth-mail-message.mjs');const content=buildSyntheticAuthMessage(message);
  const password=env.PMRFP_MIGRATION_SMTP_PASSWORD;if(typeof password!=='string'||!password||password.length>1024)throw Error('SMTP configuration unavailable');
  const transport=factory({host:'smtp.hostinger.com',port:465,secure:true,auth:{user:'info@pmrfp.com',pass:password},tls:{servername:'smtp.hostinger.com',rejectUnauthorized:true},pool:false,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000,dnsTimeout:5000});
  try{const result=await transport.sendMail({from:'info@pmrfp.com',to:'dev@talkerstein.ca',...content});if(result.accepted?.length!==1||result.rejected?.length!==0)throw Error('Delivery not accepted');return {accepted:true,emailsSent:1,mode:'synthetic-delivery-test'};}
  catch{throw Error('Synthetic delivery failed');}finally{transport.close();}
}
