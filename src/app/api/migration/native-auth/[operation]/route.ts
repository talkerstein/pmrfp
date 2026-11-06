import {handleNativeAuthPreview} from '@/lib/d1/native-auth-preview';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{operation:string}>};
async function handle(request:Request,context:Context){return handleNativeAuthPreview(request,(await context.params).operation,process.env);}
export const GET=handle;
export const POST=handle;
