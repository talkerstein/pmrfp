import { readVpsMobileWebToken } from "@/lib/d1/vps-mobile-session";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { customerVpsProjectPhoto } from "@/lib/d1/customer-staging-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE !== "d1" ||
      new URL(request.url).search || request.headers.has("range")) {
    return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  }
  const limited = await checkRateLimit(request, "public-read");
  if (limited) return rateLimitResponse(limited);
  const { id, file } = await params;
  const mobile = request.headers.has("authorization") ? await readVpsMobileWebToken(request).catch(()=>null) : undefined;
  if (mobile===null) return new Response(null,{status:404,headers:{"cache-control":"private, no-store"}});
  return customerVpsProjectPhoto(id, file, request.method === "HEAD",mobile);
}

export { GET as HEAD };
