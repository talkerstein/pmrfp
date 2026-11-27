import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { UUID } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { readVpsMobileSession } from "@/lib/d1/vps-mobile-session";
import { readVpsRfpDetail } from "@/lib/d1/vps-rfp-detail";
import { customerAppAuthority } from "../../../../../workers/d1-api/customer-signup";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const columns="id,title,slug,summary,city,province,deadline,published_at";
const headers={"cache-control":"private, no-store"};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
type Teaser={id:string;title:string;slug:string;summary:string|null};
export async function GET(request:Request) {
  if (!isVpsLiveCustomerAuth()) return json({error:"unavailable"},404);
  const limited=await checkRateLimit(request,"default");
  if (limited) return rateLimitResponse(limited);
  const q=new URL(request.url).searchParams;
  const id=q.get("id");
  if (id && !UUID.test(id)) return json({error:"Invalid listing."},400);
  const db=vpsAppDatabase();
  if (!id) {
    const limit=Math.max(1,Math.min(100,Math.trunc(Number(q.get("limit")))||50));
    const result=await db.prepare(`SELECT ${columns} FROM rfp_posts WHERE status='published' AND is_demo=0
      AND (deadline IS NULL OR date(deadline)>=date('now')) AND ${customerAppAuthority}
      ORDER BY deadline IS NULL,deadline,id LIMIT ?`).bind(limit).all<Teaser>();
    return json(result.results);
  }
  const row=await db.prepare(`SELECT ${columns} FROM rfp_posts WHERE id=? AND status='published' AND is_demo=0
    AND ${customerAppAuthority}`).bind(id).first<Teaser>();
  if (!row) return json(null);
  const session=await readVpsMobileSession(request).catch(()=>null);
  const full=session ? (await readVpsRfpDetail(row.slug,session.userId))?.item : null;
  if (!full) return json({rfp:row,locked:true});
  const contactVisible=full.contact_visibility==="public_contact";
  return json({rfp:{...row,scope:full.scope,requirements:full.requirements,budget_min:full.budget_public?full.budget_min:null,
    budget_max:full.budget_public?full.budget_max:null,budget_public:full.budget_public,
    contact_name:contactVisible?full.contact_name:null,contact_email:contactVisible?full.contact_email:null,
    contact_phone:contactVisible?full.contact_phone:null,submission_instructions:full.submission_instructions},locked:false});
}
