import { randomUUID } from "node:crypto";
import { websiteDomain } from "@/lib/badge/install";
import { emailDomain, isFreeEmailDomain } from "@/lib/dedupe/email";
import { isInternalEmail } from "@/lib/lifecycle/rescue";
import { scoreOrgRisk } from "@/lib/spam/org-risk";
import { D1ApiError, customerAppAuthority, type D1Binding } from "./contracts";
import { activeRequestAdmin } from "./customer-requests";
import { vpsAppDatabase } from "./http-binding";

interface Row {
  id: string; name: string; website: string | null; email: string | null; phone: string | null; city: string | null;
  province: string | null; country: string | null; short_description: string | null; full_description: string | null;
  profile_status: string; updated_at: string; link_trusted: number; account_email: string | null; signup_country: string | null;
}

function addDomain(lookup: Map<string, Set<string>>, domain: string | null, id: string) {
  if (!domain) return;
  const orgs = lookup.get(domain) ?? new Set<string>();
  orgs.add(id);
  lookup.set(domain, orgs);
}

function others(lookup: Map<string, Set<string>>, domain: string | null, id: string) {
  const orgs = domain ? lookup.get(domain) : null;
  return orgs ? orgs.size - Number(orgs.has(id)) : 0;
}

export async function rescreenVpsOrganizations(adminId: string, db: D1Binding = vpsAppDatabase()) {
  const guard = `${customerAppAuthority} AND ${activeRequestAdmin}`;
  const reads = await db.batch([
    db.prepare(`SELECT CASE WHEN ${guard} THEN 1 ELSE json('organization_screening_forbidden') END`).bind(adminId),
    db.prepare(`SELECT o.id,o.name,o.website,o.email,o.phone,o.city,o.province,o.country,o.short_description,o.full_description,
      o.profile_status,o.updated_at,o.link_trusted,u.email AS account_email,a.country AS signup_country
      FROM organizations o LEFT JOIN users_profile u ON u.id=(SELECT m.user_id FROM organization_members m WHERE m.organization_id=o.id
        ORDER BY (m.role='owner') DESC,m.created_at,m.id LIMIT 1) LEFT JOIN signup_attribution a ON a.user_id=u.id
      WHERE o.organization_type IN ('trade_company','supplier') AND o.profile_status IN ('approved','pending_review')
        AND o.status<>'deleted' AND o.is_demo=0 ORDER BY o.created_at,o.id LIMIT 400`),
    db.prepare("SELECT id,email,website FROM organizations WHERE status<>'deleted' ORDER BY id LIMIT 10001"),
    db.prepare(`SELECT m.organization_id,u.email FROM organization_members m JOIN users_profile u ON u.id=m.user_id
      JOIN organizations o ON o.id=m.organization_id AND o.status<>'deleted' ORDER BY m.id LIMIT 10001`),
    db.prepare("SELECT domain FROM blocked_domains LIMIT 5001"),
  ]);
  if (reads.length !== 5 || reads.some(row => !row.success) || reads[2].results.length > 10000 ||
    reads[3].results.length > 10000 || reads[4].results.length > 5000) throw new D1ApiError(503, "organization_screening_unavailable");
  const rows = reads[1].results as unknown as Row[];
  const emailDomains = new Map<string, Set<string>>();
  const websites = new Map<string, Set<string>>();
  const businessDomain = (email: string | null) => {
    const domain = emailDomain(email);
    return domain && !isFreeEmailDomain(domain) ? domain : null;
  };
  for (const org of reads[2].results as { id: string; email: string | null; website: string | null }[]) {
    addDomain(emailDomains, businessDomain(org.email), org.id);
    addDomain(websites, websiteDomain(org.website), org.id);
  }
  for (const member of reads[3].results as { organization_id: string; email: string | null }[]) {
    addDomain(emailDomains, businessDomain(member.email), member.organization_id);
  }
  const blockedDomains = (reads[4].results as { domain: string }[]).map(row => row.domain);
  const out = { checked: 0, flagged: 0, skipped: 0 };
  const screened = rows.flatMap((row) => {
    const emails = [row.email, row.account_email].filter((email): email is string => !!email);
    if (row.link_trusted || (emails.length > 0 && emails.every(email => isInternalEmail(email)))) {
      out.skipped++;
      return [];
    }
    return [{ row, risk: scoreOrgRisk({
      name: row.name, website: row.website, email: row.email, accountEmail: row.account_email, phone: row.phone,
      shortDescription: row.short_description, fullDescription: row.full_description,
      city: row.city, province: row.province, country: row.country, signupCountry: row.signup_country, blockedDomains,
      othersOnEmailDomain: Math.max(0, ...emails.map(email => others(emailDomains, businessDomain(email), row.id))),
      othersOnWebsiteDomain: others(websites, websiteDomain(row.website), row.id),
    }) }];
  });
  for (let offset = 0; offset < screened.length; offset += 25) {
    const group = screened.slice(offset, offset + 25);
    const writes = group.flatMap(({ row, risk }) => {
      const timestamp = new Date(Math.max(Date.now(), (Date.parse(row.updated_at) || 0) + 1)).toISOString();
      const write = db.prepare(`UPDATE organizations SET risk_flagged=?,updated_at=? WHERE id=? AND updated_at=?
        AND status<>'deleted' AND is_demo=0 AND link_trusted=0 AND ${guard}`)
        .bind(Number(risk.hold), timestamp, row.id, row.updated_at, adminId);
      const reasons = JSON.stringify(risk.reasons);
      const record = risk.hold
        ? db.prepare(`INSERT INTO organization_risk(organization_id,score,reasons,held,blocked,source,evaluated_at)
          SELECT ?,?,?,?,?,'backfill',? WHERE changes()=1 ON CONFLICT(organization_id) DO UPDATE SET
          score=excluded.score,reasons=excluded.reasons,held=excluded.held,blocked=excluded.blocked,source=excluded.source,
          evaluated_at=excluded.evaluated_at,decision=NULL,decided_by=NULL,decided_at=NULL`)
          .bind(row.id, risk.score, reasons, Number(row.profile_status !== "approved"), Number(risk.blocked), timestamp)
        : db.prepare(`UPDATE organization_risk SET score=?,reasons=?,held=0,blocked=0,source='backfill',evaluated_at=?
          WHERE organization_id=? AND decision IS NULL AND changes()=1`).bind(risk.score, reasons, timestamp, row.id);
      return [write, record];
    });
    const result = await db.batch(writes);
    if (result.length !== writes.length || result.some(row => !row.success)) throw new D1ApiError(503, "organization_screening_unavailable");
    group.forEach(({ risk }, index) => {
      if (result[index * 2].meta.changes !== 1) {
        out.skipped++;
        return;
      }
      out.checked++;
      if (risk.hold) out.flagged++;
    });
  }
  await db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,metadata)
    SELECT ?,?,'organization.spam_screen_existing',? WHERE ${guard}`)
    .bind(randomUUID(), adminId, JSON.stringify(out), adminId).run();
  return out;
}
