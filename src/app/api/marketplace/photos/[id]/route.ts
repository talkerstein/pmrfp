import { getSessionUserId } from "@/lib/access/access";
import { serveVpsListingPhoto } from "@/lib/marketplace/native-media";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";

type Context = { params: Promise<{ id: string }> };

async function serve(context: Context, head: boolean) {
  if (!isVpsLiveCustomerAuth()) return new Response(null, { status: 404 });
  try {
    const [{ id }, userId] = await Promise.all([context.params, getSessionUserId()]);
    return await serveVpsListingPhoto(id, userId, head);
  } catch {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export const GET = (_request: Request, context: Context) => serve(context, false);
export const HEAD = (_request: Request, context: Context) => serve(context, true);
