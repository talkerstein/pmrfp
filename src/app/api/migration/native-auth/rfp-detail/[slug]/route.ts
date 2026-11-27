import {handleNativeDetailPreview} from '@/lib/d1/native-detail-preview';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{slug:string}>}){return handleNativeDetailPreview(request,(await context.params).slug,process.env);}
