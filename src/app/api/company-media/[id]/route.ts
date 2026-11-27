import { getSession } from "@/lib/access/access";
import { D1ApiError } from "@/lib/d1/contracts";
import { isVpsLiveCustomerAuth, matchesCustomerOrigin } from "@/lib/d1/staging-config";
import { removeCompanyPortfolioPhoto, serveCompanyMedia } from "@/lib/d1/vps-company-media";

type Params = { params: Promise<{ id: string }> };
const headers = { "cache-control": "private, no-store" };

export async function GET(request: Request, { params }: Params) {
  if (!isVpsLiveCustomerAuth() || new URL(request.url).search || request.headers.has("range")) {
    return new Response(null, { status: 404, headers });
  }
  const { id } = await params;
  try {
    const first = await serveCompanyMedia(id, request.method === "HEAD", null);
    if (first.status !== 404) return first;
    const session = await getSession();
    return session ? await serveCompanyMedia(id, request.method === "HEAD", session.userId) : first;
  } catch (error) {
    return new Response(null, { status: error instanceof D1ApiError ? error.status : 503, headers });
  }
}

export const HEAD = GET;

export async function DELETE(request: Request, { params }: Params) {
  if (!isVpsLiveCustomerAuth()) return new Response(null, { status: 404, headers });
  if (!matchesCustomerOrigin(request)) return new Response(null, { status: 403, headers });
  const session = await getSession();
  if (!session) return new Response(null, { status: 401, headers });
  try {
    await removeCompanyPortfolioPhoto(session, (await params).id);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return new Response(null, { status: error instanceof D1ApiError ? error.status : 503, headers });
  }
}
