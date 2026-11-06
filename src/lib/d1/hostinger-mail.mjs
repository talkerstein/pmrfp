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
