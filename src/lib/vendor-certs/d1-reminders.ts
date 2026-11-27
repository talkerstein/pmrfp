import "server-only";
import { localizePath } from "@/i18n/config";
import { UUID } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { sendTownJobEmail } from "@/lib/email/send";
import { hostingerMailConfigured } from "@/lib/email/smtp";
import { certUnsubscribeUrl } from "@/lib/email/unsubscribe";
import { readD1 } from "@/lib/lifecycle/d1";
import { emailLang } from "@/lib/pm-jobs/email-copy";
import { generateReviewToken, hashReviewToken } from "@/lib/projects/tokens";
import { certDigestEmail, certReminderEmail, type DigestItem } from "./email-copy";
import { REQUEST_TTL_DAYS, certStatus, cleanEmail, daysUntil, isoDay, needsReminder, vendorReminderStage, type CertType } from "./rules";
import { orgCertCountry } from "./server";

const DAY = 86_400_000;
type Org = { id: string; name: string; province: string | null; country: string | null };
type Candidate = {
  id: string; organization_id: string; vendor_name: string; contact_email: string | null;
  cert_type: CertType; expires_on: string; remind_vendor: 0 | 1; reminder_stage: string | null;
  reminder_for: string | null; vendor_reminded_stage: string | null;
  vendor_organization_id: string | null; request_lang: string | null;
};

export async function runD1CertReminders(dry: boolean, now = new Date()) {
  if (!dry && (!hostingerMailConfigured() || !process.env.UNSUBSCRIBE_SECRET)) throw Error("Certificate email is unavailable");
  const db = vpsAppDatabase();
  const today = isoDay(now);
  const rows = await readD1<Candidate>(db, `SELECT id,organization_id,vendor_name,contact_email,cert_type,expires_on,
    remind_vendor,reminder_stage,reminder_for,vendor_reminded_stage,vendor_organization_id,request_lang
    FROM vendor_certificates WHERE expires_on BETWEEN ? AND ? ORDER BY organization_id,id LIMIT 5000`,
    isoDay(new Date(now.getTime() - 30 * DAY)), isoDay(new Date(now.getTime() + 30 * DAY)));
  const byOrg = new Map<string, { items: DigestItem[]; vendor: { row: Candidate; token: string }[] }>();
  const report = { ready: true, dry, orgs: 0, digests: 0, vendorReminders: 0, failed: 0 };
  const base = "https://pmrfp.com";
  for (const row of rows) {
    const stage = needsReminder(row, today);
    const vendorStage = vendorReminderStage({ ...row, remind_vendor: row.remind_vendor === 1 }, today);
    if (!stage && !vendorStage) continue;
    const email = cleanEmail(row.contact_email);
    const suppressed = !email || await db.prepare("SELECT 1 FROM email_suppressions WHERE email_key=?").bind(email).first();
    const token = vendorStage && !suppressed ? generateReviewToken() : null;
    if (!dry) {
      const keepStamp = row.reminder_for === row.expires_on ? row.vendor_reminded_stage : null;
      const claim = await db.prepare(`UPDATE vendor_certificates SET reminder_stage=?,reminder_for=?,vendor_reminded_stage=?,
        request_token_hash=COALESCE(?,request_token_hash),request_expires_at=COALESCE(?,request_expires_at),updated_at=?
        WHERE id=? AND expires_on=? AND reminder_stage IS ? AND reminder_for IS ? AND vendor_reminded_stage IS ?
          AND contact_email IS ? AND remind_vendor=? AND EXISTS
            (SELECT 1 FROM organizations WHERE id=vendor_certificates.organization_id AND status<>'suspended')`)
        .bind(stage ?? row.reminder_stage, row.expires_on, vendorStage ?? keepStamp,
          token ? hashReviewToken(token) : null, token ? new Date(now.getTime() + REQUEST_TTL_DAYS * DAY).toISOString() : null,
          now.toISOString(), row.id, row.expires_on, row.reminder_stage, row.reminder_for, row.vendor_reminded_stage,
          row.contact_email, row.remind_vendor).run();
      if (claim.meta.changes !== 1) continue;
    }
    const group = byOrg.get(row.organization_id) ?? { items: [], vendor: [] };
    if (stage) group.items.push({
      vendor: row.vendor_name, type: row.cert_type, expiresOn: row.expires_on,
      status: certStatus(row.expires_on, today), days: daysUntil(row.expires_on, today),
    });
    if (token) group.vendor.push({ row, token });
    byOrg.set(row.organization_id, group);
  }

  for (const [id, group] of byOrg) {
    const org = await db.prepare("SELECT id,name,province,country FROM organizations WHERE id=? AND status<>'suspended'").bind(id).first<Org>();
    if (!org) continue;
    report.orgs++;
    const country = orgCertCountry(org);
    if (group.items.length) {
      const recipients = await readD1<{ id: string; email: string; lang: string | null }>(db, `SELECT u.id,u.email,a.lang
        FROM organization_members m JOIN users_profile u ON u.id=m.user_id
        LEFT JOIN notification_preferences p ON p.user_id=u.id LEFT JOIN signup_attribution a ON a.user_id=u.id
        WHERE m.organization_id=? AND u.status='active' AND COALESCE(p.cert_reminders,1)=1
          AND COALESCE(p.channel_email,1)=1 AND NOT EXISTS
            (SELECT 1 FROM email_suppressions WHERE email_key=lower(trim(u.email))) ORDER BY u.id`, id);
      const items = group.items.sort((a, b) => a.days - b.days);
      for (const recipient of recipients.filter(r => cleanEmail(r.email)).slice(0, 10)) {
        if (dry) { report.digests++; continue; }
        const lang = emailLang(recipient.lang);
        const unsub = certUnsubscribeUrl(base, "digest", recipient.id);
        try {
          await sendTownJobEmail(recipient.email, certDigestEmail(lang, {
            base, company: org.name, country, items, unsubscribeUrl: unsub,
          }), lang, "vendor-cert-digest", unsub, { smtpOnly: true });
          report.digests++;
        } catch { report.failed++; }
      }
    }
    for (const { row, token } of group.vendor) {
      if (dry) { report.vendorReminders++; continue; }
      const email = cleanEmail(row.contact_email);
      const unsub = certUnsubscribeUrl(base, "vendor", row.id);
      if (!email || !unsub) continue;
      const current = await db.prepare(`SELECT 1 FROM vendor_certificates c WHERE c.id=? AND c.contact_email IS ?
        AND c.request_token_hash=? AND c.remind_vendor=1 AND NOT EXISTS
          (SELECT 1 FROM email_suppressions WHERE email_key=?)`).bind(row.id, row.contact_email, hashReviewToken(token), email).first();
      if (!current) continue;
      const lang = emailLang(row.request_lang);
      try {
        await sendTownJobEmail(email, certReminderEmail(lang, {
          base, company: org.name, vendor: row.vendor_name, type: row.cert_type, country,
          uploadUrl: base + localizePath(`/vendor-certificate/${token}`, lang), unsubscribeUrl: unsub,
          mailingAddress: process.env.BUSINESS_MAILING_ADDRESS?.trim() || null,
          onPmrfp: Boolean(row.vendor_organization_id), expiresOn: row.expires_on,
          past: daysUntil(row.expires_on, today) < 0,
        }), lang, "vendor-cert-renewal", unsub, { smtpOnly: true });
        report.vendorReminders++;
      } catch { report.failed++; }
    }
  }
  return report;
}

export async function unsubscribeD1Certificate(kind: "vendor" | "digest", id: string) {
  if (!UUID.test(id)) return false;
  const db = vpsAppDatabase();
  if (kind === "digest") {
    const result = await db.prepare(`INSERT INTO notification_preferences(user_id,cert_reminders)
      SELECT id,0 FROM users_profile WHERE id=?
      ON CONFLICT(user_id) DO UPDATE SET cert_reminders=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(id).run();
    return result.meta.changes === 1;
  }
  const recipient = await db.prepare("SELECT contact_email FROM vendor_certificates WHERE id=?").bind(id).first<{contact_email:string|null}>();
  const email = cleanEmail(recipient?.contact_email);
  if (!email) return false;
  await db.prepare(`INSERT INTO email_suppressions(email_key,reason,detail)
    VALUES(?,'unsubscribe','vendor certificate request') ON CONFLICT(email_key) DO NOTHING`).bind(email).run();
  return true;
}
