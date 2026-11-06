import {D1ApiError,RFP_SLUG,type D1Binding} from '../../src/lib/d1/contracts';
import {DETAIL_TEXT,DETAIL_IDS,detailRow,SYNTHETIC_DETAIL_DATASET,type DetailRow} from '../../src/lib/d1/detail-contracts';
// Protocol identifier for mutable fictional fixtures, not a copied Source checksum.
const dataset=SYNTHETIC_DETAIL_DATASET;
const fixtureUser=/^00000000-0000-4000-8000-0000000000[0-9]{2}$/;
/** This fixture authority must never authorize the copied customer dataset. */
export async function requireSyntheticDetailDatabase(db:D1Binding){
 const marker=await db.prepare("SELECT value FROM _d1_sandbox WHERE key='dataset'").first<{value:string}>();
 if(marker?.value!=='synthetic-only')throw new D1ApiError(503,'native_sandbox_required');
 const inventory=await db.prepare("SELECT count(*) total,sum(CASE WHEN id NOT LIKE '10000000-0000-4000-8000-0000000000%' THEN 1 ELSE 0 END) unsafe FROM rfp_posts").first<{total:number;unsafe:number|null}>();
 if(!inventory||inventory.total>20||!(inventory.unsafe===0||(inventory.total===0&&inventory.unsafe===null)))throw new D1ApiError(503,'synthetic_rfps_required');
}
/** Rehearses the audited paid/owner/org-member/admin policy using live fixture D1.
 * Production copied snapshots retain their independent live Source RLS/revision check. */
export async function readSyntheticRfpDetail(db:D1Binding,request:Request,userId:string,now=Date.now()):Promise<{item:DetailRow|null;dataset:string}>{
 await requireSyntheticDetailDatabase(db);
 if(!fixtureUser.test(userId)||!Number.isSafeInteger(now)||now<0)throw new D1ApiError(401,'sign_in_required');
 const url=new URL(request.url),slug=url.searchParams.get('slug');
 if(!slug||!RFP_SLUG.test(slug)||[...url.searchParams.keys()].some(k=>k!=='slug')||url.searchParams.getAll('slug').length!==1)throw new D1ApiError(400,'invalid_request');
 const profile=await db.prepare('SELECT primary_role,status FROM users_profile WHERE id=?').bind(userId).first<{primary_role:string;status:string}>();
 if(!profile)throw new D1ApiError(409,'profile_not_synced');if(profile.status!=='active')throw new D1ApiError(403,'account_inactive');
 const row=await db.prepare(`SELECT id,slug,title,status,contact_visibility,is_demo,budget_public,budget_min,budget_max,posted_by_user_id,posted_by_organization_id,${[...DETAIL_TEXT,...DETAIL_IDS].join(',')} FROM rfp_posts WHERE slug=?`).bind(slug).first<Record<string,unknown>>();
 if(!row)return {item:null,dataset:dataset};
 let allowed=row.posted_by_user_id===userId||['admin','super_admin'].includes(profile.primary_role);
 if(!allowed&&typeof row.posted_by_organization_id==='string')allowed=!!await db.prepare('SELECT 1 allowed FROM organization_members WHERE user_id=? AND organization_id=? LIMIT 1').bind(userId,row.posted_by_organization_id).first();
 if(!allowed&&row.status==='published'){
  const subscription=await db.prepare(`SELECT 1 allowed FROM organization_members m JOIN organizations o ON o.id=m.organization_id JOIN subscriptions s ON s.organization_id=o.id WHERE m.user_id=? AND o.organization_type IN ('trade_company','supplier') AND o.status<>'suspended' AND s.status IN ('active','comped') AND s.tier IN ('pro','featured') LIMIT 1`).bind(userId).first();
  allowed=!!subscription;
  if(!allowed){
   const trials=await db.prepare(`SELECT t.ends_at FROM organization_members m JOIN organizations o ON o.id=m.organization_id JOIN trade_trials t ON t.organization_id=o.id WHERE m.user_id=? AND o.organization_type='trade_company' AND o.status<>'suspended' LIMIT 1001`).bind(userId).all<{ends_at:string}>();
   if(trials.results.length>1000)throw new D1ApiError(503,'authorization_unavailable');
   // Date.parse truncates sub-millisecond expiry precision, denying early rather than late.
   allowed=trials.results.some(t=>typeof t.ends_at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(t.ends_at)&&Number.isFinite(Date.parse(t.ends_at))&&Date.parse(t.ends_at)>now);
  }
 }
 if(!allowed)return {item:null,dataset:dataset};
 return {item:detailRow({...row,is_demo:row.is_demo===1,budget_public:row.budget_public===1,budget_min:row.budget_min===null?null:Number(row.budget_min),budget_max:row.budget_max===null?null:Number(row.budget_max)}),dataset:dataset};
}
