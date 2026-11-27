import { randomUUID } from "node:crypto";
import type { SessionContext } from "@/lib/access/access";
import { inList, readD1, readD1ByIds } from "@/lib/lifecycle/d1";
import { COMPARISON_COLS, BID_COLS, type ComparisonSummary } from "@/lib/bid-compare/server";
import { readScopeItems } from "@/lib/bid-compare/rules";
import { sortBids, type BidRow, type ComparisonRow } from "@/lib/bid-compare/view";
import { currentTerm, isoDay as contractDay, nextTerm } from "@/lib/contracts/rules";
import { CONTRACT_COLUMNS, type ContractRow, type LinkedRfp } from "@/lib/contracts/server";
import { CERT_COLUMNS, type CertRow, type LinkedVendorOrg } from "@/lib/vendor-certs/server";
import { certStatus, isoDay, type CertType } from "@/lib/vendor-certs/rules";
import type { D1Binding, D1Statement } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { discardUnlinkedAttachment } from "./private-attachments";

type Actor = { userId: string; orgId: string };
type ToolTable = "service_contracts" | "vendor_certificates" | "bid_comparisons";
const activeMember = `EXISTS(SELECT 1 FROM organization_members m
  JOIN users_profile p ON p.id=m.user_id JOIN organizations o ON o.id=m.organization_id
  WHERE m.user_id=? AND m.organization_id=? AND p.status='active' AND o.status<>'suspended'
    AND p.primary_role IN ('property_manager','real_estate_agent'))`;

function actor(session: SessionContext): Actor {
  if (!session.organization) throw Error("Organization required");
  return { userId: session.userId, orgId: session.organization.id };
}

export async function readToolRfps(who: Actor, comparison = false) {
  const statuses = comparison ? "'published','closed','expired','awarded','pending_review'" : "'published','closed','awarded','archived'";
  return readD1<LinkedRfp>(vpsAppDatabase(), `SELECT id,title,status FROM rfp_posts
    WHERE (posted_by_user_id=? OR posted_by_organization_id=?) AND status IN (${statuses})
      AND ${activeMember} ORDER BY created_at DESC,id LIMIT 100`, who.userId, who.orgId, who.userId, who.orgId);
}

export async function listD1Contracts(session: SessionContext) {
  const { userId, orgId } = actor(session);
  const db = vpsAppDatabase();
  const rows = (await readD1<Omit<ContractRow,"auto_renews"> & { auto_renews:number }>(db,
    `SELECT ${CONTRACT_COLUMNS} FROM service_contracts WHERE organization_id=? AND ${activeMember}
      ORDER BY end_date IS NULL,end_date,id LIMIT 1000`, orgId, userId, orgId))
    .map(row => ({ ...row, auto_renews:Boolean(row.auto_renews) }));
  const [vendorRows, rfpRows] = await Promise.all([
    readD1ByIds<{ id:string; name:string; slug:string; profile_status:string }>(db, rows.flatMap(row => row.vendor_organization_id ? [row.vendor_organization_id] : []),
      `SELECT id,name,slug,profile_status FROM organizations WHERE id ${inList}`),
    readD1ByIds<LinkedRfp>(db, rows.flatMap(row => [row.source_rfp_id,row.retender_rfp_id].filter((id): id is string => Boolean(id))),
      `SELECT id,title,status FROM rfp_posts WHERE id ${inList}`),
  ]);
  return { ready:true, rows, vendors:new Map(vendorRows.map(row => [row.id,{...row, slug:row.profile_status === "approved" ? row.slug : null}])),
    rfps:new Map(rfpRows.map(row => [row.id,row])) };
}

async function listedVendors(ids: string[]) {
  const rows = await readD1ByIds<Omit<LinkedVendorOrg,"approved"> & {profile_status:string}>(vpsAppDatabase(), ids,
    `SELECT id,name,slug,insurance_status,wsib_status,profile_status FROM organizations WHERE id ${inList} AND status='active'`);
  return new Map(rows.map(row => [row.id, { ...row, approved:row.profile_status === "approved" }]));
}

export async function listD1Certificates(session: SessionContext) {
  const { userId, orgId } = actor(session);
  const rows = (await readD1<Omit<CertRow,"remind_vendor"> & {remind_vendor:number}>(vpsAppDatabase(),
    `SELECT ${CERT_COLUMNS} FROM vendor_certificates WHERE organization_id=? AND ${activeMember}
      ORDER BY expires_on,id LIMIT 1000`, orgId,userId,orgId))
    .map(row => ({ ...row, remind_vendor:Boolean(row.remind_vendor) }));
  return { ready:true, rows, linked:await listedVendors(rows.flatMap(row => row.vendor_organization_id ? [row.vendor_organization_id] : [])) };
}

export async function listD1Comparisons(session: SessionContext) {
  const { userId, orgId } = actor(session);
  return { ready:true, rows:await readD1<ComparisonSummary>(vpsAppDatabase(),
    `SELECT id,title,building_name,trade,rfp_id,awarded_at,awarded_company,updated_at,
      (SELECT count(*) FROM bid_comparison_bids b WHERE b.comparison_id=c.id AND b.organization_id=c.organization_id) AS bids
      FROM bid_comparisons c WHERE c.organization_id=? AND ${activeMember} ORDER BY updated_at DESC,id LIMIT 200`,
    orgId,userId,orgId) };
}

export async function readD1Comparison(session: SessionContext, id: string) {
  const { userId, orgId } = actor(session);
  const db = vpsAppDatabase();
  const comparison = await db.prepare(`SELECT ${COMPARISON_COLS} FROM bid_comparisons
    WHERE id=? AND organization_id=? AND ${activeMember}`).bind(id,orgId,userId,orgId).first<ComparisonRow>();
  if (!comparison) return { ready:true, comparison:null, bids:[] };
  const bids = await readD1<BidRow>(db,`SELECT ${BID_COLS} FROM bid_comparison_bids
    WHERE comparison_id=? AND organization_id=? AND ${activeMember} ORDER BY position,id LIMIT 8`,id,orgId,userId,orgId);
  return { ready:true, comparison:{ ...comparison, scope_items:readScopeItems(typeof comparison.scope_items === "string" ? JSON.parse(comparison.scope_items) : comparison.scope_items) },
    bids:sortBids(bids.map(bid => ({ ...bid, line_prices:typeof bid.line_prices === "string" ? JSON.parse(bid.line_prices) : bid.line_prices }))) };
}

export async function readD1ComparisonReferences(session: SessionContext, bids: BidRow[]) {
  const who = actor(session);
  const db = vpsAppDatabase();
  const [rows, orgs, rfps] = await Promise.all([
    readD1<{vendor_name:string;contact_email:string|null;vendor_organization_id:string|null;cert_type:CertType;expires_on:string|null}>(db,
      `SELECT vendor_name,contact_email,vendor_organization_id,cert_type,expires_on
      FROM vendor_certificates WHERE organization_id=? AND ${activeMember} LIMIT 1000`,who.orgId,who.userId,who.orgId),
    listedVendors(bids.flatMap(bid => bid.bidder_organization_id ? [bid.bidder_organization_id] : [])),
    readToolRfps(who,true),
  ]);
  return [rows.map(row => ({ ...row,status:certStatus(row.expires_on, isoDay(new Date())) })),orgs,rfps] as const;
}

type SqlParam = string | number | null;
type Fields = Record<string, SqlParam | boolean>;

function sqlParams(fields: Fields) {
  return Object.values(fields).map(value => typeof value === "boolean" ? Number(value) : value);
}

export async function saveD1Tool(table: ToolTable, session: SessionContext, id: string | null, fields: Fields) {
  const { userId, orgId } = actor(session);
  // All field names come from the existing form sanitizers or server-owned
  // fields. SQL parameters hold the request values.
  const keys = Object.keys(fields);
  const db = vpsAppDatabase();
  const recordId = id ?? randomUUID();
  const result = id
    ? await db.prepare(`UPDATE ${table} SET ${keys.map(key => key + "=?").join(",")},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND organization_id=? AND ${activeMember}`).bind(...sqlParams(fields),id,orgId,userId,orgId).run()
    : await db.prepare(`INSERT INTO ${table}(id,organization_id,created_by,${keys.join(",")})
      SELECT ?,?,?,${keys.map(() => "?").join(",")} WHERE ${activeMember}`)
      .bind(recordId,orgId,userId,...sqlParams(fields),userId,orgId).run();
  return result.meta.changes === 1 ? recordId : null;
}

export async function renewD1Contract(session: SessionContext, id: string, now = new Date(), db: D1Binding = vpsAppDatabase()) {
  const { userId, orgId } = actor(session);
  const old = await db.prepare(`SELECT start_date,end_date,auto_renews,retender_rfp_id,updated_at FROM service_contracts
    WHERE id=? AND organization_id=? AND ${activeMember}`).bind(id,orgId,userId,orgId).first<{
      start_date:string|null;end_date:string|null;auto_renews:number;retender_rfp_id:string|null;updated_at:string;
    }>();
  if (!old) return "notFound";
  const term = currentTerm({...old,auto_renews:Boolean(old.auto_renews)},contractDay(now));
  const next = nextTerm({ start_date:term.start, end_date:term.end });
  if (!next) return "noEnd";
  const result = await db.prepare(`UPDATE service_contracts SET start_date=?,end_date=?,
    source_rfp_id=coalesce(retender_rfp_id,source_rfp_id),retender_rfp_id=NULL,retendered_at=NULL,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=? AND organization_id=? AND ${activeMember}
      AND start_date IS ? AND end_date IS ? AND retender_rfp_id IS ? AND updated_at=?`)
    .bind(next.start,next.end,id,orgId,userId,orgId,old.start_date,old.end_date,old.retender_rfp_id,old.updated_at).run();
  return result.meta.changes === 1 ? "renewed" : "notFound";
}

export async function insertD1Tools(table: "service_contracts" | "vendor_certificates", session: SessionContext, rows: Fields[], db: D1Binding = vpsAppDatabase()) {
  const { userId, orgId } = actor(session);
  const keys = Object.keys(rows[0] ?? {});
  if (!keys.length) return 0;
  const entries = rows.map(row => ({ ...row,id:randomUUID() }));
  const includeStarter = keys.includes("starter_key");
  const vendorEmail = keys.includes(table === "service_contracts" ? "vendor_email" : "contact_email")
    ? (table === "service_contracts" ? "vendor_email" : "contact_email") : null;
  const matchedVendor = vendorEmail ? `, (SELECT CASE WHEN count(*)=1 THEN min(id) END FROM organizations
    WHERE lower(trim(email))=lower(trim(json_extract(section.value,'$.${vendorEmail}')))
      AND organization_type IN ('trade_company','supplier') AND status='active' AND is_demo=0)` : "";
  const statement = `INSERT INTO ${table}(id,organization_id,created_by,${keys.join(",")}${vendorEmail ? ",vendor_organization_id" : ""})
    SELECT json_extract(section.value,'$.id'),?,?,${keys.map(key => "json_extract(section.value,'$." + key + "')").join(",")}${matchedVendor}
    FROM json_each(?) section WHERE ${activeMember}
    ${includeStarter ? "AND NOT EXISTS (SELECT 1 FROM service_contracts s WHERE s.organization_id=? AND s.starter_key=json_extract(section.value,'$.starter_key'))" : ""}`;
  const queries: D1Statement[] = [];
  let current: typeof entries = [];
  let size = 0;
  let total = 0;
  const flush = () => {
    queries.push(db.prepare(statement).bind(orgId,userId,JSON.stringify(current),userId,orgId,...(includeStarter ? [orgId] : [])));
    current = [];
    size = 0;
  };
  for (const entry of entries) {
    const bytes = Buffer.byteLength(JSON.stringify(entry)) + 1;
    if (bytes > 28_000) throw Error("An import row exceeds the size limit");
    if (size + bytes > 28_000) flush();
    size += bytes;
    total += bytes;
    current.push(entry);
  }
  if (current.length) flush();
  if (total > 390_000) throw Error("The import exceeds the batch limit");
  const result = await db.batch(queries);
  return result.reduce((added,row) => added + (row.meta.changes ?? 0),0);
}

export async function deleteD1Tool(table: ToolTable | "bid_comparison_bids", session: SessionContext, id: string, comparisonId?: string) {
  const { userId, orgId } = actor(session);
  const db = vpsAppDatabase();
  const parent = comparisonId ? "AND comparison_id=?" : "";
  const files = table === "bid_comparisons" ? (await readD1<{ file_path:string|null }>(db,
    `SELECT file_path FROM bid_comparison_bids WHERE comparison_id=? AND organization_id=? AND ${activeMember}`,
    id,orgId,userId,orgId)).map(row => row.file_path) : [];
  const result = await db.prepare(`DELETE FROM ${table} WHERE id=? AND organization_id=? AND ${activeMember} ${parent}
    RETURNING id,${table === "bid_comparisons" ? "NULL AS file_path" : "file_path"}`)
    .bind(id,orgId,userId,orgId,...(comparisonId ? [comparisonId] : [])).first<{id:string;file_path:string|null}>();
  if (result) await Promise.all([result.file_path,...files].map(path => discardUnlinkedAttachment(path)));
  return result;
}

export async function ownToolRfp(session: SessionContext, id: string | null) {
  if (!id) return null;
  const { userId, orgId } = actor(session);
  const row = await vpsAppDatabase().prepare(`SELECT id FROM rfp_posts WHERE id=?
    AND (posted_by_user_id=? OR posted_by_organization_id=?) AND ${activeMember}`).bind(id,userId,orgId,userId,orgId).first<{id:string}>();
  return row?.id ?? null;
}

export async function saveD1ToolBid(session: SessionContext, comparisonId: string, id: string | null, fields: Fields) {
  const { userId, orgId } = actor(session);
  const keys = Object.keys(fields);
  const db = vpsAppDatabase();
  if (id) {
    const result = await db.prepare(`UPDATE bid_comparison_bids SET ${keys.map(key => key + "=?").join(",")},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND comparison_id=? AND organization_id=? AND ${activeMember}`)
      .bind(...sqlParams(fields),id,comparisonId,orgId,userId,orgId).run();
    return result.meta.changes === 1;
  }
  const result = await db.prepare(`INSERT INTO bid_comparison_bids(id,comparison_id,organization_id,created_by,position,${keys.join(",")})
    SELECT ?,c.id,c.organization_id,?, min(99,COALESCE((SELECT max(position)+1 FROM bid_comparison_bids WHERE comparison_id=c.id),0)),
       ${keys.map(() => "?").join(",")} FROM bid_comparisons c
       WHERE c.id=? AND c.organization_id=? AND ${activeMember}
         AND (SELECT count(*) FROM bid_comparison_bids WHERE comparison_id=c.id)<6`)
    .bind(randomUUID(),userId,...sqlParams(fields),comparisonId,orgId,userId,orgId).run();
  return result.meta.changes === 1;
}
