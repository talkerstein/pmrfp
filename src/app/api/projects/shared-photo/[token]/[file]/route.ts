import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { D1ApiError, UUID } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { createPrivateR2Binding } from "@/lib/d1/private-r2-binding";
import { resolveVpsShareLink } from "@/lib/d1/vps-project-share";
import { vpsProjectUploadsEnabled } from "@/lib/d1/vps-project-uploads";
import { handleNativeProjectPhoto } from "../../../../../../../workers/d1-api/project-photos";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string; file: string }> }) {
  const empty = (status: number) => new Response(null, {
    status, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" },
  });
  if (!vpsProjectUploadsEnabled() || new URL(request.url).search || request.headers.has("range")) return empty(404);
  const limited = await checkRateLimit(request, "public-read");
  if (limited) return rateLimitResponse(limited);
  const { token, file } = await params;
  if (!UUID.test(file)) return empty(404);
  try {
    const db = vpsAppDatabase();
    const link = await resolveVpsShareLink(db, token);
    if (!link || !UUID.test(link.case_study_id)) return empty(404);
    const media = new Request(`https://pmrfp.com/v1/project-photos/${link.case_study_id}/${file}.jpg`, { method: request.method });
    return await handleNativeProjectPhoto(db, createPrivateR2Binding(process.env.PMRFP_PRIVATE_R2_GATEWAY_KEY ?? ""), media, null, token);
  } catch (error) {
    return empty(error instanceof D1ApiError && error.status < 500 ? 404 : 503);
  }
}

export { GET as HEAD };
