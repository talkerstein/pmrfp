import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { D1ApiError, UUID, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";

export const companyMediaMember = `EXISTS (SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
  WHERE m.organization_id=o.id AND u.id=? AND u.status='active' AND u.primary_role IN ('trade','supplier'))`;
const buyerLogoMember = `EXISTS (SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
  JOIN buyer_pages p ON p.organization_id=m.organization_id WHERE m.organization_id=o.id AND u.id=?
  AND u.status='active' AND u.primary_role='public_buyer' AND o.organization_type='public_buyer')`;
export const companyMediaRoute = (id: string) => `/api/company-media/${id}`;
const origin = "https://pmrfp-private-project-files.pmrfp.workers.dev";
const available = "o.status='active' AND o.is_demo=0";
const pendingLifetime = 15 * 60_000;
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; sandbox" };
export const companyMediaMaxBytes = 5 * 1024 * 1024;
type Identity = { userId: string; organization: { id: string } | null };

async function storage(id: string, method: "PUT" | "GET" | "HEAD" | "DELETE", fetcher: typeof fetch, data?: Buffer) {
  const key = process.env.PMRFP_PRIVATE_R2_GATEWAY_KEY;
  if (!key || !/^[a-f0-9]{64}$/.test(key)) throw new D1ApiError(503, "storage_configuration_unavailable");
  return fetcher(`${origin}/v1/company-media/${id}`, { method,
    headers: { "x-pmrfp-gateway-key": key, ...(data ? { "content-type": "image/webp" } : {}) },
    body: data ? new Uint8Array(data) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
}

export async function normalizeCompanyMedia(file: File, kind: "logo" | "portfolio") {
  const max = kind === "logo" ? 2 * 1024 * 1024 : companyMediaMaxBytes;
  if (!file.size || file.size > max) throw new D1ApiError(413, "file_too_large");
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const raster = source.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
      source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (source.toString("ascii", 0, 4) === "RIFF" && source.toString("ascii", 8, 12) === "WEBP") ||
      source.toString("ascii", 4, 8) === "ftyp";
    if (!raster) {
      const svg = new TextDecoder("utf-8", { fatal: true }).decode(source).trim();
      if (kind !== "logo" || file.type !== "image/svg+xml" || !/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg) ||
        /<!DOCTYPE|<!ENTITY|<script|@import|(?:href|src)\s*=\s*["'](?!#)|url\(\s*(?!#)/i.test(svg)) {
        throw new Error("Unsupported image");
      }
    }
    const side = kind === "logo" ? 250 : 1920;
    return await sharp(source, { limitInputPixels: 24_000_000, failOn: "error" })
      .rotate().resize(side, side, { fit: kind === "logo" ? "contain" : "inside", withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88 }).toBuffer();
  } catch {
    throw new D1ApiError(422, "invalid_image");
  }
}

export async function uploadCompanyMedia(session: Identity, kind: "logo" | "portfolio", data: Buffer,
  db: D1Binding = vpsAppDatabase(), fetcher = fetch) {
  const org = session.organization?.id;
  if (!org || data.length < 12 || data.length > companyMediaMaxBytes) throw new D1ApiError(400, "invalid_company_media");
  const id = randomUUID();
  const digest = createHash("sha256").update(data).digest("hex");
  const now = Date.now();
  const reserved = await db.prepare(`INSERT INTO _company_media(id,organization_id,kind,sha256,bytes,created_at)
    SELECT ?,o.id,?,?,?,? FROM organizations o WHERE ${customerAppAuthority} AND o.id=? AND ${available}
    AND (${companyMediaMember} OR (?='logo' AND ${buyerLogoMember}))
    AND (?='logo' OR ((SELECT count(*) FROM _company_media p WHERE p.organization_id=o.id AND p.kind='portfolio'
      AND (p.ready=1 OR p.created_at>?))+(SELECT count(*) FROM _company_legacy_portfolio h WHERE h.organization_id=o.id AND h.deleted_at IS NULL))
      < CASE WHEN EXISTS(SELECT 1 FROM subscriptions s
        WHERE s.organization_id=o.id AND s.status IN ('active','comped')) THEN 12 ELSE 1 END)`)
    .bind(id, kind, digest, data.length, now, org, session.userId, kind, session.userId, kind, now - pendingLifetime).run();
  if (!reserved.success || reserved.meta.changes !== 1) throw new D1ApiError(409, "company_media_unavailable");
  const uploaded = await storage(id, "PUT", fetcher, data);
  if (uploaded.status !== 204) throw new D1ApiError(503, "storage_unavailable");
  const ready = await db.prepare(`UPDATE _company_media SET ready=1 WHERE id=? AND ready=0 AND ${customerAppAuthority}
    AND EXISTS(SELECT 1 FROM organizations o WHERE o.id=_company_media.organization_id AND ${available}
      AND (${companyMediaMember} OR (_company_media.kind='logo' AND ${buyerLogoMember})))`)
    .bind(id, session.userId, session.userId).run();
  if (!ready.success || ready.meta.changes !== 1) throw new D1ApiError(403, "company_media_unavailable");
  return { url: companyMediaRoute(id), path: id };
}

export async function listCompanyPortfolio(organizationId: string, userId: string | null, db: D1Binding = vpsAppDatabase()) {
  const rows = await db.prepare(`SELECT f.id FROM (
    SELECT id,organization_id,created_at FROM _company_media WHERE kind='portfolio' AND ready=1
    UNION ALL SELECT id,organization_id,created_at FROM _company_legacy_portfolio WHERE deleted_at IS NULL
  ) f JOIN organizations o ON o.id=f.organization_id WHERE ${customerAppAuthority} AND o.id=? AND ${available}
    AND (o.profile_status='approved' OR ${companyMediaMember}) ORDER BY f.created_at,f.id`)
    .bind(organizationId, userId).all<{ id: string }>();
  if (!rows.success) throw new D1ApiError(503, "company_media_unavailable");
  return rows.results.map(({ id }) => ({ url: companyMediaRoute(id), path: id }));
}

export async function removeCompanyPortfolioPhoto(session: Identity, id: string, db: D1Binding = vpsAppDatabase(), fetcher = fetch) {
  if (!session.organization || !UUID.test(id)) throw new D1ApiError(400, "invalid_company_media");
  const removed = await db.batch([
    db.prepare(`DELETE FROM _company_media WHERE id=? AND kind='portfolio' AND organization_id=?
    AND ${customerAppAuthority} AND EXISTS(SELECT 1 FROM organizations o WHERE o.id=_company_media.organization_id
      AND ${available} AND ${companyMediaMember})`).bind(id, session.organization.id, session.userId),
    db.prepare(`UPDATE _company_legacy_portfolio SET deleted_at=? WHERE id=? AND organization_id=? AND deleted_at IS NULL
      AND ${customerAppAuthority} AND EXISTS(SELECT 1 FROM organizations o WHERE o.id=_company_legacy_portfolio.organization_id
        AND ${available} AND ${companyMediaMember})`).bind(Date.now(), id, session.organization.id, session.userId),
  ]);
  if (removed.some(row => !row.success) || removed.reduce((total, row) => total + (row.meta.changes ?? 0), 0) !== 1) {
    throw new D1ApiError(404, "company_media_not_found");
  }
  if (removed[0].meta.changes === 1) {
    try {
      if ((await storage(id, "DELETE", fetcher)).status !== 204) throw new Error("R2 returned an error");
    } catch {
      console.warn("[company-media] Removed photo could not be purged from R2");
    }
  }
}

export async function serveCompanyMedia(id: string, head: boolean, userId: string | null,
  db: D1Binding = vpsAppDatabase(), fetcher = fetch) {
  const missing = () => new Response(null, { status: 404, headers });
  if (!UUID.test(id)) return missing();
  const record = await db.prepare(`SELECT f.bytes,f.asset_id FROM (
    SELECT id,organization_id,kind,bytes,NULL AS asset_id FROM _company_media WHERE ready=1
    UNION ALL SELECT id,organization_id,'portfolio',NULL,asset_id FROM _company_legacy_portfolio WHERE deleted_at IS NULL
  ) f JOIN organizations o ON o.id=f.organization_id WHERE ${customerAppAuthority} AND f.id=? AND ${available} AND (
      (o.profile_status='approved' AND (f.kind='portfolio' OR o.logo_url=?)) OR ${companyMediaMember}
      OR (f.kind='logo' AND o.organization_type='public_buyer' AND
        (${buyerLogoMember} OR EXISTS(SELECT 1 FROM buyer_pages p WHERE p.organization_id=o.id AND p.logo_url=?))))`)
    .bind(id, companyMediaRoute(id), userId, userId, companyMediaRoute(id)).first<{ bytes: number | null; asset_id: string | null }>();
  if (!record) return missing();
  if (record.asset_id) {
    const secret = process.env.PMRFP_PUBLIC_ASSET_GATEWAY_SECRET;
    if (!secret || secret.length < 32 || !/^[a-f0-9]{64}$/.test(record.asset_id)) {
      throw new D1ApiError(503, "storage_configuration_unavailable");
    }
    const object = await fetcher(`https://pmrfp-verified-public-assets-preview.pmrfp.workers.dev/v1/assets/${record.asset_id}`, {
      method: head ? "HEAD" : "GET", headers: { "x-pmrfp-asset-preview-key": secret }, cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(10000) });
    const contentType = object.headers.get("content-type") ?? "";
    if (!object.ok || !["image/jpeg","image/png","image/webp"].includes(contentType) || (!head && !object.body)) {
      await object.body?.cancel();
      throw new D1ApiError(503, "storage_unavailable");
    }
    return new Response(head ? null : object.body, { headers: { ...headers, "content-type": contentType } });
  }
  const upstream = await storage(id, head ? "HEAD" : "GET", fetcher);
  if (!upstream.ok || Number(upstream.headers.get("content-length")) !== record.bytes ||
      upstream.headers.get("content-type") !== "image/webp" || (!head && !upstream.body)) {
    await upstream.body?.cancel();
    throw new D1ApiError(503, "storage_unavailable");
  }
  return new Response(head ? null : upstream.body, { headers: { ...headers,
    "content-type": "image/webp", "content-length": String(record.bytes) } });
}

export async function isLegacyPortfolioAsset(id: string, db: D1Binding = vpsAppDatabase()) {
  if (!/^[a-f0-9]{64}$/.test(id)) return false;
  return Boolean(await db.prepare("SELECT 1 AS found FROM _company_legacy_portfolio WHERE asset_id=?").bind(id).first());
}
