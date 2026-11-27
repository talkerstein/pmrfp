import { randomUUID } from "node:crypto";
import { companyMediaRoute } from "@/lib/d1/vps-company-media";
import type { SessionContext } from "@/lib/access/access";
import type { BuyerDashboard, OwnPageRow } from "@/lib/towns/dashboard-data";
import { changedFields, pageUpdateRow, type ManagedPageInput } from "@/lib/towns/managed";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, UUID, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { publicImageSource } from "./public-asset-preview";

const managingMember = `EXISTS (SELECT 1 FROM organizations o JOIN organization_members m ON m.organization_id=o.id
  JOIN users_profile u ON m.user_id=u.id WHERE o.id=p.organization_id AND m.user_id=? AND u.status='active'
  AND u.primary_role='public_buyer' AND o.organization_type='public_buyer' AND o.status='active' AND o.is_demo=0)`;
const ownColumns = "buyer_key,buyer_name,verified_at,logo_url,contact_email,contact_phone,show_contact,bids_url,platform_url,vendor_registration_url,intro,upcoming";
type NativeOwnPage = Omit<OwnPageRow, "show_contact" | "upcoming"> & { upcoming: string; show_contact: number };

export async function readVpsBuyerDashboard(session: SessionContext, db: D1Binding = vpsAppDatabase()) {
  const [page, record] = await db.batch([
    db.prepare(`SELECT ${ownColumns} FROM buyer_pages p WHERE ${customerAppAuthority} AND p.organization_id=? AND ${managingMember}`)
      .bind(session.organization?.id ?? null, session.userId),
    db.prepare(`SELECT buyer_key,buyer_name,status,reason,created_at FROM buyer_claims WHERE ${customerAppAuthority} AND user_id=?
      AND EXISTS(SELECT 1 FROM users_profile WHERE id=? AND status='active') ORDER BY created_at DESC,id DESC LIMIT 1`)
      .bind(session.userId, session.userId),
  ]);
  const row = page.results[0] as NativeOwnPage | undefined;
  return {
    own: row ? { ...row, show_contact: row.show_contact === 1, upcoming: JSON.parse(row.upcoming) as OwnPageRow["upcoming"] } : null,
    claim: (record.results[0] as BuyerDashboard["claim"] | undefined) ?? null,
  };
}

export async function updateVpsBuyerPage(
  session: SessionContext, input: ManagedPageInput, logoInput: string | null, now: string, db: D1Binding = vpsAppDatabase(),
) {
  const organizationId = session.organization?.id;
  if (!organizationId) return null;
  const saved = await db.prepare(`SELECT ${ownColumns} FROM buyer_pages p WHERE ${customerAppAuthority}
    AND p.organization_id=? AND ${managingMember}`).bind(organizationId, session.userId).first<NativeOwnPage>();
  if (!saved) return null;
  const unchangedLogo = logoInput === null || logoInput === saved.logo_url || (saved.logo_url !== null && logoInput === publicImageSource(saved.logo_url).src);
  const logo = unchangedLogo ? saved.logo_url : logoInput || null;
  const uploadId = !unchangedLogo && logo ? logo.split("/").at(-1) ?? "" : null;
  if (uploadId !== null && (!UUID.test(uploadId) || logo !== companyMediaRoute(uploadId))) {
    throw new D1ApiError(400, "invalid_buyer_page_logo");
  }
  const patch = pageUpdateRow(input, logo, session.userId, now);
  const before = { ...saved, show_contact: saved.show_contact === 1, upcoming: JSON.parse(saved.upcoming) };
  const [updated, audit] = await db.batch([
    db.prepare(`UPDATE buyer_pages AS p SET logo_url=?,contact_email=?,contact_phone=?,show_contact=?,bids_url=?,platform_url=?,
      vendor_registration_url=?,intro=?,upcoming=?,updated_by=?,updated_at=? WHERE p.organization_id=? AND p.buyer_key=?
      AND ${customerAppAuthority} AND ${managingMember} AND (? IS NULL OR
        EXISTS(SELECT 1 FROM _company_media f WHERE f.id=? AND f.organization_id=p.organization_id AND f.kind='logo' AND f.ready=1))`)
      .bind(patch.logo_url, patch.contact_email, patch.contact_phone, Number(patch.show_contact), patch.bids_url, patch.platform_url,
        patch.vendor_registration_url, patch.intro, JSON.stringify(patch.upcoming), patch.updated_by, patch.updated_at,
        organizationId, saved.buyer_key, session.userId, uploadId, uploadId),
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      SELECT ?,?,'buyer_page.updated','buyer_pages',?,? WHERE changes()=1`)
      .bind(randomUUID(), session.userId, organizationId, JSON.stringify({ buyerKey: saved.buyer_key, fields: changedFields(before, patch) })),
  ]);
  if (!updated.success || !audit.success || updated.meta.changes !== 1) throw new D1ApiError(503, "buyer_page_unavailable");
  return saved.buyer_key;
}
