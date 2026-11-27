import { getSession } from "@/lib/access/access";
import { D1ApiError } from "@/lib/d1/contracts";
import { isVpsLiveCustomerAuth, matchesCustomerOrigin } from "@/lib/d1/staging-config";
import { companyMediaMaxBytes, listCompanyPortfolio, normalizeCompanyMedia, uploadCompanyMedia } from "@/lib/d1/vps-company-media";

const headers = { "cache-control": "private, no-store" };

export async function GET() {
  if (!isVpsLiveCustomerAuth()) return new Response(null, { status: 404, headers });
  const session = await getSession();
  if (!session?.organization) return new Response(null, { status: 401, headers });
  return Response.json(await listCompanyPortfolio(session.organization.id, session.userId), { headers });
}

export async function POST(request: Request) {
  if (!isVpsLiveCustomerAuth()) return new Response(null, { status: 404, headers });
  if (!matchesCustomerOrigin(request)) return new Response(null, { status: 403, headers });
  const session = await getSession();
  if (!session?.organization) return new Response(null, { status: 401, headers });
  const size = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size <= 0 || size > companyMediaMaxBytes + 32 * 1024) {
    return new Response(null, { status: 413, headers });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File) || (kind !== "logo" && kind !== "portfolio")) {
      return new Response(null, { status: 400, headers });
    }
    return Response.json(await uploadCompanyMedia(session, kind, await normalizeCompanyMedia(file, kind)), { status: 201, headers });
  } catch (error) {
    const status = error instanceof D1ApiError ? error.status : 503;
    return Response.json({ error: error instanceof D1ApiError ? error.code : "company_media_unavailable" }, { status, headers });
  }
}
