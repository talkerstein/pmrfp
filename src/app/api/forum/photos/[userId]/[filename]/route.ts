import { getSession } from "@/lib/access/access";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { serveVpsForumImage } from "@/lib/forum/vps-media";

type Context = { params: Promise<{ userId: string; filename: string }> };

async function serve(context: Context, head: boolean) {
  if (!isVpsLiveCustomerAuth()) return new Response(null, { status: 404 });
  const { userId, filename } = await context.params;
  const session = await getSession();
  return serveVpsForumImage(`${userId}/${filename}`, session?.profile.status === "active" ? session.userId : null, head)
    .catch(() => new Response(null, { status: 503, headers: { "cache-control": "private, no-store" } }));
}

export function GET(_request: Request, context: Context) { return serve(context, false); }
export function HEAD(_request: Request, context: Context) { return serve(context, true); }
