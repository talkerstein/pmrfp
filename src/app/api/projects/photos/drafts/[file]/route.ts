import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getProjectSession } from "@/lib/projects/server";
import { serveVpsProjectDraft, vpsProjectUploadsEnabled } from "@/lib/d1/vps-project-uploads";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const empty = (status: number) => new Response(null, {
    status, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" },
  });
  if (!vpsProjectUploadsEnabled() || new URL(request.url).search || request.headers.has("range")) return empty(404);
  const limited = await checkRateLimit(request, "public-read");
  if (limited) return rateLimitResponse(limited);
  try {
    const session = await getProjectSession(request);
    if (!session) return empty(404);
    return await serveVpsProjectDraft(session, (await params).file, request.method === "HEAD");
  } catch {
    return empty(503);
  }
}

export { GET as HEAD };
