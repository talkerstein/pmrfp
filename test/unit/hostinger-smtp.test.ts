import {expect,it,vi} from 'vitest';
import * as smtp from '../../src/lib/email/smtp';
import {sendSubscriptionActivatedEmail} from '../../src/lib/email/send';
const {sendHostingerMail}=smtp;
const env={PMRFP_SMTP_ENABLED:'enabled',PMRFP_SMTP_USER:'info@pmrfp.com',PMRFP_SMTP_PASSWORD:'fixture-only',PMRFP_SMTP_ALLOWED_RECIPIENT:'dev@talkerstein.ca'};
it('uses verified TLS and disables filesystem/URL attachment access',async()=>{
 const close=vi.fn(),sendMail=vi.fn(async()=>({accepted:['dev@talkerstein.ca'],rejected:[]}));
 const factory=vi.fn(()=>({sendMail,close}));
 await sendHostingerMail({to:'dev@talkerstein.ca',subject:'Test',html:'<p>Test</p>'},env,factory as never);
 expect(factory).toHaveBeenCalledWith(expect.objectContaining({host:'smtp.hostinger.com',secure:true,disableFileAccess:true,disableUrlAccess:true,tls:{servername:'smtp.hostinger.com',rejectUnauthorized:true}}));
 expect(close).toHaveBeenCalledOnce();
});
it('rejects unapproved preview recipients before opening a connection and hides provider diagnostics',async()=>{
 const factory=vi.fn();
 await expect(sendHostingerMail({to:'customer@example.invalid',subject:'Test',html:'Test'},env,factory as never)).rejects.toThrow('recipient unavailable');expect(factory).not.toHaveBeenCalled();
 const close=vi.fn();
 await expect(sendHostingerMail({to:'dev@talkerstein.ca',subject:'Test',html:'Test'},env,(()=>({sendMail:async()=>{throw Error('PRIVATE SMTP DETAILS')},close})) as never)).rejects.toThrow('SMTP delivery failed');expect(close).toHaveBeenCalledOnce();
});

it.each([
  ['RCPT TO', 550, '550 5.1.1 Mailbox unavailable', true],
  ['RCPT TO', 550, '550 5.7.1 Blocked by policy', false],
  ['RCPT TO', 450, '450 4.2.0 Mailbox temporarily unavailable', false],
  ['DATA', 550, '550 5.1.1 Delivery rejected', false],
])('only suppresses address-specific permanent SMTP failures (%s %s %s)', async (command, responseCode, response, invalidRecipient) => {
  const factory = () => ({
    close: vi.fn(),
    sendMail: vi.fn().mockRejectedValue({ command, responseCode, response }),
  });
  await expect(sendHostingerMail({ to: 'dev@talkerstein.ca', subject: 'Test', html: 'Test' }, env, factory as never))
    .rejects.toMatchObject({ message: 'SMTP delivery failed', invalidRecipient });
});

it('does not turn a billing notification failure into a payment webhook retry', async () => {
  vi.stubEnv('PMRFP_SMTP_ENABLED', 'enabled');
  const failure = new Error('SMTP delivery failed');
  const send = vi.spyOn(smtp, 'sendHostingerMail').mockRejectedValue(failure);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(sendSubscriptionActivatedEmail('dev@talkerstein.ca')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('[email] send failed', failure);
  } finally {
    send.mockRestore();
    log.mockRestore();
    vi.unstubAllEnvs();
  }
});
