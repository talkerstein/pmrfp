import {publicAssetPreviewRedirect} from '@/lib/d1/public-asset-preview';
import {isVpsLiveCustomerAuth} from '@/lib/d1/staging-config';
import {isLegacyPortfolioAsset} from '@/lib/d1/vps-company-media';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (isVpsLiveCustomerAuth()) {
    try {
      if (await isLegacyPortfolioAsset(id)) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    } catch {
      return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  return publicAssetPreviewRedirect(request, id, process.env);
}
