import { getCustomerStagingSession, readCustomerWebSessionToken } from "@/lib/d1/customer-staging-session";
import { isVpsLiveCustomerAuth, matchesCustomerOrigin } from "@/lib/d1/staging-config";
import { issueVpsMobileCode, mobileSecretShape } from "@/lib/d1/vps-mobile-session";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const headers={"cache-control":"private, no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff",
  "content-security-policy":"default-src 'none'; form-action 'self' pmrfp:; frame-ancestors 'none'"};
function settings(request:Request) {
  const q=new URL(request.url).searchParams;
  const challenge=q.get("challenge") ?? "";
  const state=q.get("state") ?? "";
  return mobileSecretShape.test(challenge)&&mobileSecretShape.test(state) ? {challenge,state} : null;
}
export async function GET(request:Request) {
  if (!isVpsLiveCustomerAuth()) return new Response(null,{status:404,headers});
  const p=settings(request);
  if (!p) return new Response("Invalid mobile sign-in request.",{status:400,headers});
  const path="/api/mobile/connect?"+new URLSearchParams(p);
  if (!await getCustomerStagingSession()) {
    return new Response(null,{status:303,headers:{...headers,location:"/sign-in?"+new URLSearchParams({next:path})}});
  }
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sign in to PMRFP mobile</title><main><h1>Sign in to PMRFP mobile</h1>
  <p>Continue only if you opened this page from the PMRFP app on this device.</p>
  <form method="post"><button>Continue to PMRFP</button></form></main></html>`,{headers:{...headers,"content-type":"text/html; charset=utf-8"}});
}
export async function POST(request:Request) {
  if (!isVpsLiveCustomerAuth()) return new Response(null,{status:404,headers});
  if (!matchesCustomerOrigin(request)) return new Response(null,{status:403,headers});
  const limited=await checkRateLimit(request,"default");
  if (limited) return rateLimitResponse(limited);
  const p=settings(request);
  if (!p) return new Response(null,{status:400,headers});
  const webToken=await readCustomerWebSessionToken();
  if (!webToken || !await getCustomerStagingSession()) return new Response(null,{status:401,headers});
  const code=await issueVpsMobileCode(webToken,p.challenge);
  return new Response(null,{status:303,headers:{...headers,location:"pmrfp://auth/callback?"+new URLSearchParams({code,state:p.state})}});
}
