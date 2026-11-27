import "server-only";
import type { SessionContext } from "@/lib/access/access";
import { bidAwardEmail, bidInviteEmail } from "@/lib/bid-compare/email-copy";
import { DAILY_INVITE_LIMIT, MAX_BIDS, planInvites, type BidCountry, type InvitePlan } from "@/lib/bid-compare/rules";
import { BID_COLS, COMPARISON_COLS, type AwardResult, type InviteResult, type OrgHit, type SharedLookup } from "@/lib/bid-compare/server";
import { hashShareToken, isShareToken, newShareToken } from "@/lib/bid-compare/share";
import { bidUnsubscribeUrl } from "@/lib/bid-compare/unsubscribe";
import { sortBids, type BidRow, type BidderOrg, type ComparisonRow } from "@/lib/bid-compare/view";
import { sendTownJobEmail } from "@/lib/email/send";
import type { EmailLang } from "@/lib/pm-jobs/email-copy";
import { OPEN_RESPONSE_STATUSES, pmContactCard } from "@/lib/pm-jobs/rules";
import { orgCertCountry } from "@/lib/vendor-certs/server";
import { certStatus, cleanEmail, isoDay, type CertType } from "@/lib/vendor-certs/rules";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { canManageBidJob, decideVpsBid } from "./vps-bid-decisions";

const member = `EXISTS(SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
  JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=c.organization_id
  AND u.id=? AND u.status='active' AND o.status='active' AND o.is_demo=0
  AND u.primary_role IN ('property_manager','real_estate_agent'))`;
const shared = `SELECT c.id,c.organization_id FROM bid_comparisons c JOIN organizations o ON o.id=c.organization_id
  WHERE c.share_token_hash=? AND o.status='active' AND o.is_demo=0 AND ${customerAppAuthority}`;
const statuses = [...OPEN_RESPONSE_STATUSES, "picked"].map(status => "'" + status + "'").join(",");
const idSql = "lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))";

export async function setVpsBidShare(session: SessionContext, id: string, on: boolean, db: D1Binding = vpsAppDatabase()) {
  const token = on ? newShareToken() : null;
  const changed = await db.prepare(`UPDATE bid_comparisons AS c SET share_token_hash=?,share_created_at=?
    WHERE id=? AND organization_id=? AND ${member} AND ${customerAppAuthority} RETURNING id`)
    .bind(token ? hashShareToken(token) : null, token ? new Date().toISOString() : null, id, session.organization?.id ?? null, session.userId).first();
  return changed ? { ok: true as const, token } : { ok: false as const, error: "notFound" as const };
}

export async function readVpsBidShare(token: string, db: D1Binding = vpsAppDatabase()): Promise<SharedLookup> {
  if (!isShareToken(token)) return { state: "invalid" };
  const hash = hashShareToken(token);
  const [sheet, bids, company, certs, bidders] = await db.batch([
    db.prepare(`SELECT ${COMPARISON_COLS} FROM bid_comparisons WHERE id IN (SELECT id FROM (${shared}))`).bind(hash),
    db.prepare(`SELECT ${BID_COLS.replace("file_path,file_name,file_uploaded_at", "NULL AS file_path,NULL AS file_name,NULL AS file_uploaded_at")}
      FROM bid_comparison_bids WHERE comparison_id IN (SELECT id FROM (${shared})) ORDER BY position,created_at,id LIMIT ?`).bind(hash,MAX_BIDS+2),
    db.prepare(`SELECT name,province,country FROM organizations WHERE id IN (SELECT organization_id FROM (${shared}))`).bind(hash),
    db.prepare(`SELECT vendor_name,contact_email,vendor_organization_id,cert_type,expires_on FROM vendor_certificates
      WHERE organization_id IN (SELECT organization_id FROM (${shared})) LIMIT 1000`).bind(hash),
    db.prepare(`SELECT id,name,slug,insurance_status,wsib_status,profile_status='approved' AS approved FROM organizations WHERE id IN (
      SELECT bidder_organization_id FROM bid_comparison_bids WHERE comparison_id IN (SELECT id FROM (${shared})))`).bind(hash),
  ]);
  if (!sheet.results[0] || !company.results[0]) return { state: "invalid" };
  // buildSheet matches certificates on the server and strips contact fields from the shared view.
  const comparison = sheet.results[0] as unknown as ComparisonRow;
  const today = isoDay(new Date());
  const rows = sortBids(bids.results as unknown as BidRow[]);
  return {
    state: "open",
    comparison: { ...comparison, scope_items: typeof comparison.scope_items === "string" ? JSON.parse(comparison.scope_items) : comparison.scope_items },
    bids: rows.map(b => ({ ...b, line_prices: typeof b.line_prices === "string" ? JSON.parse(b.line_prices) : b.line_prices })),
    company: company.results[0] as {name:string;province:string|null;country:string|null},
    certs: (certs.results as {vendor_name:string;contact_email:string|null;vendor_organization_id:string|null;cert_type:CertType;expires_on:string|null}[])
      .map(c => ({ ...c, status: certStatus(c.expires_on,today) })),
    orgs: new Map((bidders.results as unknown as BidderOrg[]).map(row => [row.id,{...row,approved:Boolean(row.approved)}])),
  };
}

export async function importVpsBidResponses(session: SessionContext, id: string, db: D1Binding = vpsAppDatabase()) {
  const gate = `SELECT c.id,c.organization_id,c.rfp_id,
    (SELECT count(*) FROM bid_comparison_bids b WHERE b.comparison_id=c.id) AS used,
    (SELECT coalesce(max(b.position)+1,0) FROM bid_comparison_bids b WHERE b.comparison_id=c.id) AS next
    FROM bid_comparisons c WHERE c.id=? AND c.organization_id=? AND ${member} AND ${customerAppAuthority}`;
  const owned = `SELECT i.*,c.organization_id,c.used,c.next
    FROM (${gate}) c JOIN rfp_posts r ON r.id=c.rfp_id
    JOIN rfp_interests i ON i.rfp_id=r.id
    WHERE r.is_demo=0 AND r.sealed=0 AND ${canManageBidJob}
      AND i.status IN (${statuses}) AND NOT EXISTS(SELECT 1 FROM bid_comparison_bids b WHERE b.comparison_id=c.id AND b.rfp_interest_id=i.id)`;
  const args = [id,session.organization?.id ?? null,session.userId] as const;
  const [read, eligible, insert] = await db.batch([
    db.prepare(gate).bind(...args),
    db.prepare(`SELECT EXISTS(SELECT 1 FROM (${gate}) c JOIN rfp_posts r ON r.id=c.rfp_id
      WHERE r.is_demo=0 AND r.sealed=0 AND ${canManageBidJob}) AS allowed,(SELECT count(*) FROM (${owned})) AS total`)
      .bind(...args,session.userId,...args,session.userId),
    db.prepare(`INSERT INTO bid_comparison_bids
      (id,comparison_id,organization_id,created_by,position,company_name,total_price,start_date,notes,bidder_organization_id,rfp_interest_id)
      SELECT ${idSql},?,r.organization_id,?,min(99,r.next+row_number() OVER (ORDER BY r.created_at,r.id)-1),
        substr(coalesce(nullif(o.name,''),'—'),1,160),r.quote_amount,r.start_date,substr(r.quote_notes,1,2000),r.trade_organization_id,r.id
      FROM (${owned}) r LEFT JOIN organizations o ON o.id=r.trade_organization_id
      WHERE r.used<? ORDER BY r.created_at,r.id
      LIMIT max(0,?-(SELECT count(*) FROM bid_comparison_bids WHERE comparison_id=?))`)
      .bind(id,session.userId,...args,session.userId,MAX_BIDS,MAX_BIDS,id),
    db.prepare(`UPDATE bid_comparisons AS c SET updated_at=? WHERE id=? AND organization_id=? AND ${member}
      AND changes()>0`).bind(new Date().toISOString(),...args),
  ]);
  if (!read.results.length) return { ok:false as const,error:"notFound" as const };
  const {allowed,total} = eligible.results[0] as {allowed:number;total:number};
  if (!allowed) return { ok:false as const,error:"rfp" as const };
  const added = insert.meta.changes ?? 0;
  return { ok:true as const,added,full:total>added };
}

export async function awardVpsBidComparison(session: SessionContext, id: string, bidId: string, notify: boolean, lang: EmailLang, db: D1Binding = vpsAppDatabase()): Promise<AwardResult> {
  const args = [id,session.organization?.id ?? null,session.userId] as const;
  const row = await db.prepare(`SELECT c.title,c.rfp_id,c.awarded_at,b.rfp_interest_id,b.company_name,b.contact_email
    FROM bid_comparisons c JOIN bid_comparison_bids b ON b.comparison_id=c.id AND b.organization_id=c.organization_id
    WHERE c.id=? AND c.organization_id=? AND ${member} AND b.id=? AND ${customerAppAuthority}`)
    .bind(...args,bidId).first<{title:string;rfp_id:string|null;awarded_at:string|null;rfp_interest_id:string|null;company_name:string;contact_email:string|null}>();
  if (!row) return {ok:false,error:"notFound"};
  if (row.awarded_at) return {ok:false,error:"awarded"};
  const stamp = new Date().toISOString();
  const claim = (linked: boolean) => db.prepare(`UPDATE bid_comparisons AS c SET awarded_at=?,awarded_bid_id=?,
    awarded_company=(SELECT b.company_name FROM bid_comparison_bids b WHERE b.id=?),
    awarded_amount=(SELECT b.total_price FROM bid_comparison_bids b WHERE b.id=?),
    award_rfp_recorded=?,award_notified_at=?,updated_at=?
    WHERE id=? AND organization_id=? AND ${member} AND ${customerAppAuthority} AND awarded_at IS NULL AND rfp_id IS ?
      AND EXISTS(SELECT 1 FROM bid_comparison_bids b WHERE b.id=? AND b.comparison_id=c.id AND b.rfp_interest_id IS ?)
    RETURNING id`).bind(stamp,bidId,bidId,bidId,Number(linked),linked?stamp:null,stamp,...args,row.rfp_id,bidId,row.rfp_interest_id);
  if (row.rfp_id && row.rfp_interest_id) {
    const result = await decideVpsBid("pick",session.userId,row.rfp_id,row.rfp_interest_id,null,db,claim(true));
    if (result.ok) return {ok:true,rfpRecorded:true,rfpClosed:false,notified:true};
    if (result.error === "failed") return {ok:false,error:"unavailable"};
  }
  if (!await claim(false).first()) return {ok:false,error:"awarded"};
  let notified = false;
  if (notify && !(row.rfp_id && row.rfp_interest_id)) {
    const email = cleanEmail(row.contact_email);
    const base = "https://pmrfp.com";
    const unsub = bidUnsubscribeUrl(base,bidId);
    if (email && unsub && !await db.prepare("SELECT 1 FROM email_suppressions WHERE email_key=?").bind(email).first()) {
      const org = session.organization!;
      const contact = pmContactCard({rfp:{},poster:session.profile,posterOrg:org});
      try {
        await sendTownJobEmail(email,bidAwardEmail(lang,{base,company:org.name,vendor:row.company_name,title:row.title,
          contact,unsubscribeUrl:unsub,mailingAddress:process.env.BUSINESS_MAILING_ADDRESS?.trim() || null}),
        lang,"bid-comparison-award",unsub,{smtpOnly:true});
        notified = true;
        await db.prepare("UPDATE bid_comparisons SET award_notified_at=? WHERE id=? AND awarded_bid_id=? AND awarded_at=?").bind(stamp,id,bidId,stamp).run();
      } catch { console.error("[bid-compare] award delivery or receipt failed"); }
    }
  }
  return {ok:true,rfpRecorded:false,rfpClosed:Boolean(row.rfp_id && row.rfp_interest_id),notified};
}

const bidderTypes = "('trade_company','supplier','builder')";
export async function searchVpsBidders(term: string, country: BidCountry, db: D1Binding = vpsAppDatabase()): Promise<OrgHit[]> {
  const query = term.trim().replace(/\s+/g," ").slice(0,80);
  if (query.length<2) return [];
  const result = await db.prepare(`SELECT id,name,city,province,country,insurance_status,wsib_status
    FROM organizations WHERE organization_type IN ${bidderTypes} AND status='active' AND profile_status='approved'
    AND is_demo=0 AND instr(lower(name),lower(?))>0 AND ${customerAppAuthority} ORDER BY name,id LIMIT 30`)
    .bind(query).all<OrgHit & {country:string|null}>();
  return result.results.filter(row => orgCertCountry(row)===country).slice(0,8);
}

export async function validateVpsBidder(id: string, country: BidCountry, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`SELECT province,country FROM organizations WHERE id=? AND organization_type IN ${bidderTypes}
    AND status='active' AND profile_status='approved' AND is_demo=0 AND ${customerAppAuthority}`).bind(id)
    .first<{province:string|null;country:string|null}>();
  return Boolean(row && orgCertCountry(row)===country);
}

export async function inviteVpsBidders(session: SessionContext, id: string, lang: EmailLang, db: D1Binding = vpsAppDatabase()): Promise<InviteResult> {
  const org = session.organization;
  if (!org) return {ok:false,error:"notFound"};
  const address = process.env.BUSINESS_MAILING_ADDRESS?.trim();
  const base = "https://pmrfp.com";
  if (!address || !bidUnsubscribeUrl(base,"check")) return {ok:false,error:"invitesOff"};
  const args = [id,org.id,session.userId] as const;
  const accessible = `SELECT c.id,c.title FROM bid_comparisons c WHERE c.id=? AND c.organization_id=?
    AND ${member} AND ${customerAppAuthority}`;
  const cmp = await db.prepare(accessible).bind(...args).first<{id:string;title:string}>();
  if (!cmp) return {ok:false,error:"notFound"};
  const match = `SELECT m.organization_id FROM users_profile u JOIN organization_members m ON m.user_id=u.id
    JOIN organizations o ON o.id=m.organization_id WHERE lower(trim(u.email))=?
    AND u.status='active' AND o.status='active' AND o.is_demo=0 AND o.organization_type IN ${bidderTypes} ORDER BY o.id LIMIT 1`;
  type Row = {id:string;company_name:string;contact_email:string|null;bidder_organization_id:string|null;invited_at:string|null};
  const bids = (await db.prepare(`SELECT id,company_name,contact_email,bidder_organization_id,invited_at FROM bid_comparison_bids
    WHERE comparison_id IN (SELECT id FROM (${accessible})) ORDER BY position,id LIMIT ?`).bind(...args,MAX_BIDS+2).all<Row>()).results;
  const members=new Set<string>();
  const suppressed=new Set<string>();
  const now=new Date();
  const since=new Date(now.getTime()-86_400_000).toISOString();
  for (const bid of bids) {
    const email=cleanEmail(bid.contact_email);
    if (!email || bid.bidder_organization_id || bid.invited_at) continue;
    const existing = await db.prepare(match).bind(email).first<{organization_id:string}>();
    if (existing) {
      members.add(email);
      await db.prepare(`UPDATE bid_comparison_bids SET bidder_organization_id=? WHERE id=? AND bidder_organization_id IS NULL
        AND lower(trim(contact_email))=? AND comparison_id IN (SELECT id FROM (${accessible}))`)
        .bind(existing.organization_id,bid.id,email,...args).run();
    } else if (await db.prepare("SELECT 1 FROM email_suppressions WHERE email_key=?").bind(email).first()) suppressed.add(email);
  }
  const recent=await db.prepare("SELECT count(*) AS n FROM bid_comparison_bids WHERE organization_id=? AND julianday(invited_at)>=julianday(?)")
    .bind(org.id,since).first<{n:number}>();
  const plan=planInvites(bids,{members,suppressed,budget:DAILY_INVITE_LIMIT-(recent?.n ?? 0)});
  let sent=0;
  for (const bidId of plan.send) {
    const bid=bids.find(row => row.id===bidId)!;
    const email=cleanEmail(bid.contact_email)!;
    const unsub=bidUnsubscribeUrl(base,bidId)!;
    const stamp=await db.prepare(`UPDATE bid_comparison_bids SET invited_at=? WHERE id=? AND invited_at IS NULL
      AND bidder_organization_id IS NULL AND lower(trim(contact_email))=? AND comparison_id IN (SELECT id FROM (${accessible}))
      AND NOT EXISTS(SELECT 1 FROM email_suppressions WHERE email_key=?)
      AND NOT EXISTS(${match})
      AND (SELECT count(*) FROM bid_comparison_bids WHERE organization_id=? AND julianday(invited_at)>=julianday(?))<?
      AND NOT EXISTS(SELECT 1 FROM bid_comparison_bids prior WHERE prior.comparison_id=? AND prior.id<>?
        AND lower(trim(prior.contact_email))=? AND prior.invited_at IS NOT NULL) RETURNING id`)
      .bind(now.toISOString(),bidId,email,...args,email,email,org.id,since,DAILY_INVITE_LIMIT,id,bidId,email).first();
    if (!stamp) continue;
    try {
      await sendTownJobEmail(email,bidInviteEmail(lang,{base,company:org.name,vendor:bid.company_name,title:cmp.title,
        unsubscribeUrl:unsub,mailingAddress:address}),lang,"bid-comparison-invite",unsub,{smtpOnly:true});
      sent++;
    } catch { console.error("[bid-compare] invitation delivery failed"); }
  }
  const skipped = Object.fromEntries(Object.entries(plan.skipped).map(([key,values])=>[key,values.length])) as Record<keyof InvitePlan["skipped"],number>;
  return {ok:true,sent,skipped};
}
