import {publicAssetPreviewRedirect} from '@/lib/d1/public-asset-preview';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return publicAssetPreviewRedirect(request,(await context.params).id,process.env);}
