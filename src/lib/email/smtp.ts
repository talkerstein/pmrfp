import nodemailer from 'nodemailer';

export interface SmtpMessage {
  to: string; subject: string; html: string; headers?: Record<string,string>;
  replyTo?: string; cc?: string[]; attachments?: {filename:string;content:Buffer}[];
  text?: string; senderName?: string;
}
export function hostingerMailConfigured(env: Record<string,string|undefined> = process.env) {
  return env.PMRFP_SMTP_ENABLED === 'enabled' && env.PMRFP_SMTP_USER === 'info@pmrfp.com' && Boolean(env.PMRFP_SMTP_PASSWORD);
}

export class HostingerDeliveryError extends Error {
  constructor(readonly invalidRecipient: boolean) {
    super('SMTP delivery failed');
  }
}

function invalidMailbox(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { command?: string; response?: string; responseCode?: number };
  // Only address-specific RCPT failures count. Policy, quota and content errors must never suppress an address.
  return e.command === 'RCPT TO' && e.responseCode === 550 && /^550[ -]5\.1\.(?:1|3)(?:\s|$)/.test(e.response ?? '');
}

/** Fixed Hostinger TLS transport; callers cannot choose a destination SMTP host. */
export async function sendHostingerMail(message:SmtpMessage, env:Record<string,string|undefined>=process.env, factory=nodemailer.createTransport) {
  if(!hostingerMailConfigured(env)) throw Error('SMTP unavailable');
  const recipients=[message.to,...(message.cc ?? [])];
  if(recipients.some(r=>!/^([^@\s<>]+)@([^@\s<>]+)$/.test(r)) || /[\r\n]/.test(message.subject) ||
    /[\r\n]/.test(message.senderName ?? '')) throw Error('Invalid mail fields');
  // Preview delivery is explicitly bounded to the approved development inbox.
  if(env.PMRFP_SMTP_ALLOWED_RECIPIENT && recipients.some(r=>r!==env.PMRFP_SMTP_ALLOWED_RECIPIENT)) throw Error('SMTP recipient unavailable on preview');
  const transport=factory({host:'smtp.hostinger.com',port:465,secure:true,
    auth:{user:env.PMRFP_SMTP_USER,pass:env.PMRFP_SMTP_PASSWORD},
    tls:{servername:'smtp.hostinger.com',rejectUnauthorized:true},
    pool:false,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
    connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000,dnsTimeout:5000});
  try {
    const {senderName,...mail}=message;
    const result=await transport.sendMail({
      from:senderName ? {name:senderName,address:'info@pmrfp.com'} : 'PMRFP <info@pmrfp.com>',...mail
    });
    if(result.rejected?.length || !result.accepted?.length) throw Error('Delivery failed');
    return {accepted:true};
  } catch (error) { throw new HostingerDeliveryError(recipients.length === 1 && invalidMailbox(error)); }
  finally { transport.close(); }
}
