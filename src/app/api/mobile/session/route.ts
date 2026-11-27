import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { readVpsMobileSession, redeemVpsMobileCode, revokeVpsMobileSession } from "@/lib/d1/vps-mobile-session";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const headers={"cache-control":"private, no-store"};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
export async function GET(request:Request) {
  if (!isVpsLiveCustomerAuth()) return json({error:"unavailable"},404);
  const session=await readVpsMobileSession(request).catch(()=>null);
  return session ? json({user:{id:session.userId,email:session.profile.email},hasAccess:session.hasTradeAccess}) : json({error:"Sign in first."},401);
}
export async function POST(request:Request) {
  if (!isVpsLiveCustomerAuth()) return json({error:"unavailable"},404);
  const limited=await checkRateLimit(request,"default");
  if (limited) return rateLimitResponse(limited);
  const body=await request.json().catch(()=>null);
  if (typeof body?.code!=="string" || typeof body?.verifier!=="string") return json({error:"Invalid mobile sign-in request."},400);
  const token=await redeemVpsMobileCode(body.code,body.verifier).catch(()=>null);
  return token ? json({token}) : json({error:"Sign-in expired. Please try again."},401);
}
export async function DELETE(request:Request) {
  if (!isVpsLiveCustomerAuth()) return json({error:"unavailable"},404);
  await revokeVpsMobileSession(request);
  return new Response(null,{status:204,headers});
}
