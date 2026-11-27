import "server-only";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { UUID } from "@/lib/d1/contracts";
import { sendTownJobEmail } from "@/lib/email/send";
import { hostingerMailConfigured } from "@/lib/email/smtp";
import { contractUnsubscribeUrl } from "@/lib/email/unsubscribe";
import { cleanEmail } from "@/lib/vendor-certs/rules";
import { inList, readD1, readD1ByIds } from "@/lib/lifecycle/d1";
import { isEnabledLocale } from "@/i18n/config";
import { tradeName } from "@/i18n/terms";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { renewalDigestEmail, type DigestContract } from "./email-copy";
import { isoDay, needsRenewalReminder } from "./rules";
import { orgContractCountry } from "./server";

const DAY = 86_400_000;
interface Contract {
  id: string;
  organization_id: string;
  building_name: string | null;
  trade_slug: string | null;
  service_detail: string | null;
  vendor_name: string | null;
  start_date: string | null;
  end_date: string;
  auto_renews: 0 | 1;
  notice_days: number;
  retender_rfp_id: null;
  reminder_stage: string | null;
  reminder_for: string | null;
}

export async function runD1ContractReminders({ dry, now = new Date() }: { dry: boolean; now?: Date }) {
  if (!dry && (!hostingerMailConfigured() || !process.env.UNSUBSCRIBE_SECRET)) {
    throw new Error("Contract reminder delivery is unavailable");
  }
  const db = vpsAppDatabase();
  const today = isoDay(now);
  const rows = await readD1<Contract>(db, `SELECT id,organization_id,building_name,trade_slug,service_detail,
    vendor_name,start_date,end_date,auto_renews,notice_days,retender_rfp_id,reminder_stage,reminder_for
    FROM service_contracts WHERE end_date<=? AND (auto_renews=1 OR end_date>=?) AND retender_rfp_id IS NULL
    ORDER BY organization_id,id LIMIT 5000`, isoDay(new Date(now.getTime() + 366 * DAY)), isoDay(new Date(now.getTime() - 7 * DAY)));
  const byOrg = new Map<string, { row: Contract; end: string; days: number; stage: DigestContract["stage"] }[]>();
  for (const row of rows) {
    const due = needsRenewalReminder({ ...row, auto_renews: row.auto_renews === 1 }, today);
    if (!due) continue;
    const entries = byOrg.get(row.organization_id) ?? [];
    entries.push({ row, ...due });
    byOrg.set(row.organization_id, entries);
  }
  const report = { ready: true, dry, orgs: 0, contracts: 0, digests: 0, failed: 0 };
  if (!byOrg.size) return report;

  const [orgRows, tradeRows] = await Promise.all([
    readD1ByIds<{ id: string; name: string; province: string | null; country: string | null }>(db, [...byOrg.keys()],
      `SELECT id,name,province,country FROM organizations WHERE id ${inList}`),
    readD1<{ slug: string; name: string }>(db, "SELECT slug,name FROM trade_categories"),
  ]);
  const trades = new Map(tradeRows.map(({ slug, name }) => [slug, name]));
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
  for (const org of orgRows) {
    const due = byOrg.get(org.id)!;
    const loadRecipients = () => readD1<{ id: string; email: string; lang: string | null }>(db, `SELECT u.id,u.email,a.lang
      FROM organization_members m JOIN users_profile u ON u.id=m.user_id
      LEFT JOIN notification_preferences p ON p.user_id=u.id LEFT JOIN signup_attribution a ON a.user_id=u.id
      WHERE m.organization_id=? AND u.status='active' AND u.email LIKE '%_@_%'
        AND coalesce(p.contract_reminders,1)=1 AND coalesce(p.channel_email,1)=1
        AND NOT EXISTS(SELECT 1 FROM email_suppressions WHERE email_key=lower(trim(u.email)))
      ORDER BY u.id`, org.id).then(rows => rows.filter(r => cleanEmail(r.email)).slice(0, 10));
    const recipients = await loadRecipients();
    const claimed: typeof due = [];
    for (const item of due) {
      const { row } = item;
      if (!dry) {
        const result = await db.prepare(`UPDATE service_contracts SET reminder_stage=?,reminder_for=? WHERE id=?
          AND organization_id=? AND end_date=? AND start_date IS ? AND auto_renews=? AND notice_days=?
          AND reminder_stage IS ? AND reminder_for IS ? AND retender_rfp_id IS NULL AND ${customerAppAuthority}`)
          .bind(item.stage, item.end, row.id, org.id, row.end_date, row.start_date, row.auto_renews, row.notice_days,
            row.reminder_stage, row.reminder_for).run();
        if (!result.success) throw new Error("Contract reminder claim unavailable");
        if (result.meta.changes !== 1) continue;
      }
      claimed.push(item);
    }
    if (!claimed.length) continue;
    report.orgs++;
    report.contracts += claimed.length;
    if (dry) {
      report.digests += recipients.length;
      continue;
    }

    const expected = new Map(recipients.map(r => [r.id, r.email]));
    const country = orgContractCountry(org);
    claimed.sort((a, b) => a.days - b.days);
    for (const recipient of await loadRecipients()) {
      if (expected.get(recipient.id) !== recipient.email) continue;
      const lang = isEnabledLocale(recipient.lang) ? recipient.lang : "en";
      const items = claimed.map(({ row, end, days, stage }): DigestContract => {
        const trade = row.trade_slug ? trades.get(row.trade_slug) : null;
        const service = trade ? [tradeName(trade, lang), row.service_detail && `(${row.service_detail})`].filter(Boolean).join(" ") : row.service_detail ?? "";
        return { id: row.id, service, building: row.building_name, vendor: row.vendor_name, end, days, stage, autoRenews: row.auto_renews === 1 };
      });
      const unsubscribeUrl = contractUnsubscribeUrl(base, recipient.id);
      try {
        await sendTownJobEmail(recipient.email, renewalDigestEmail(lang, { base, company: org.name, country, items, unsubscribeUrl }),
          lang, "contract-renewal-digest", unsubscribeUrl, { smtpOnly: true });
        report.digests++;
      } catch {
        report.failed++;
      }
    }
  }
  return report;
}

export async function unsubscribeD1Contract(userId: string, legacyDigest?: string) {
  if (!UUID.test(userId)) return false;
  const proof = legacyDigest
    ? "AND EXISTS (SELECT 1 FROM _legacy_contract_unsubscribe WHERE user_id=users_profile.id AND token_sha256=?)"
    : "";
  const result = await vpsAppDatabase().prepare(`INSERT INTO notification_preferences(user_id,contract_reminders)
    SELECT id,0 FROM users_profile WHERE id=? AND ${customerAppAuthority} ${proof}
    ON CONFLICT(user_id) DO UPDATE SET contract_reminders=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(...(legacyDigest ? [userId, legacyDigest] : [userId])).run();
  return result.success && result.meta.changes === 1;
}
