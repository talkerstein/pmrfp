import "server-only";
import type { SessionContext } from "@/lib/access/access";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { localizePath } from "@/i18n/config";
import { sendTownJobEmail } from "@/lib/email/send";
import { hostingerMailConfigured } from "@/lib/email/smtp";
import { certUnsubscribeUrl } from "@/lib/email/unsubscribe";
import type { EmailLang } from "@/lib/pm-jobs/email-copy";
import { generateReviewToken, hashReviewToken } from "@/lib/projects/tokens";
import { certRequestEmail } from "./email-copy";
import { canRequestAgain, cleanEmail, DAILY_REQUEST_LIMIT, REQUEST_TTL_DAYS, type CertCountry, type CertType } from "./rules";
import type { RequestResult } from "./server";

const member = `EXISTS (SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
  JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=c.organization_id AND u.id=?
  AND u.status='active' AND o.status<>'suspended' AND u.primary_role IN ('property_manager','real_estate_agent'))`;

export async function requestD1Certificate(id: string, session: SessionContext, country: CertCountry, lang: EmailLang): Promise<RequestResult> {
  if (!session.organization || !hostingerMailConfigured()) return "unavailable";
  const org = session.organization;
  const db = vpsAppDatabase();
  const now = new Date();
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const row = await db.prepare(`SELECT vendor_name,contact_email,cert_type,request_sent_at,vendor_organization_id
    FROM vendor_certificates c WHERE id=? AND organization_id=? AND ${member}`).bind(id,org.id,session.userId)
    .first<{vendor_name:string;contact_email:string|null;cert_type:CertType;request_sent_at:string|null;vendor_organization_id:string|null}>();
  if (!row) return "not_found";
  const email = cleanEmail(row.contact_email);
  if (!email) return "no_email";
  if (!canRequestAgain(row.request_sent_at, now)) return "cooldown";
  if (await db.prepare("SELECT 1 FROM email_suppressions WHERE email_key=?").bind(email).first()) return "unsubscribed";
  const base = "https://pmrfp.com";
  const unsub = certUnsubscribeUrl(base, "vendor", id);
  if (!unsub) return "unavailable";
  const token = generateReviewToken();
  const claim = await db.prepare(`UPDATE vendor_certificates AS c SET request_token_hash=?,request_expires_at=?,request_sent_at=?,
    request_count=COALESCE(request_count,0)+1,request_lang=?,updated_at=?
    WHERE id=? AND organization_id=? AND request_sent_at IS ? AND contact_email IS ? AND ${member}
      AND NOT EXISTS (SELECT 1 FROM email_suppressions WHERE email_key=?)
      AND (SELECT count(*) FROM vendor_certificates WHERE organization_id=? AND request_sent_at>=?)<?`)
    .bind(hashReviewToken(token),new Date(now.getTime()+REQUEST_TTL_DAYS*86_400_000).toISOString(),now.toISOString(),lang,now.toISOString(),
      id,org.id,row.request_sent_at,row.contact_email,session.userId,email,org.id,since,DAILY_REQUEST_LIMIT).run();
  if (claim.meta.changes !== 1) return "limit";
  try {
    await sendTownJobEmail(email, certRequestEmail(lang, {
      base, company:org.name, vendor:row.vendor_name, type:row.cert_type, country,
      uploadUrl:base + localizePath(`/vendor-certificate/${token}`,lang), unsubscribeUrl:unsub,
      mailingAddress:process.env.BUSINESS_MAILING_ADDRESS?.trim() || null, onPmrfp:Boolean(row.vendor_organization_id),
      ttlDays:REQUEST_TTL_DAYS,
    }),lang,"vendor-cert-request",unsub,{smtpOnly:true});
    return "sent";
  } catch { return "unavailable"; }
}
