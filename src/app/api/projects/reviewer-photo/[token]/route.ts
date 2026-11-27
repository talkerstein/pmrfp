import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { D1ApiError } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { resolveVpsReviewPhoto } from "@/lib/d1/vps-project-reviews";
import { createPrivateR2Binding } from "@/lib/d1/private-r2-binding";
import { vpsProjectUploadsEnabled } from "@/lib/d1/vps-project-uploads";
import { handleNativeProjectPhoto } from "../../../../../../workers/d1-api/project-photos";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const empty = (status: number) => new Response(null, { status,
    headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
  if (!vpsProjectUploadsEnabled() || new URL(request.url).search || request.headers.has("range")) return empty(404);
  const limited = await checkRateLimit(request, "public-read");
  if (limited) return rateLimitResponse(limited);
  try {
    const db = vpsAppDatabase();
    const { token } = await params;
    const hero = await resolveVpsReviewPhoto(token, db);
    if (!hero) return empty(404);
    const media = new Request(`https://pmrfp.com/v1/project-photos/${hero.projectId}/${hero.file}`, { method: request.method });
    return await handleNativeProjectPhoto(db, createPrivateR2Binding(process.env.PMRFP_PRIVATE_R2_GATEWAY_KEY ?? ""),
      media, null, undefined, hero.hash);
  } catch (error) {
    return empty(error instanceof D1ApiError && error.status < 500 ? 404 : 503);
  }
}

export { GET as HEAD };
