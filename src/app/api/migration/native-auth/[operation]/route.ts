import {handleNativeAuthPreview} from '@/lib/d1/native-auth-preview';
import {handleNativeMobilePreview,isNativeMobileOperation} from '@/lib/d1/native-mobile-preview';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{operation:string}>};
async function handle(request:Request,context:Context){
 const {operation}=await context.params;
 return isNativeMobileOperation(operation)
  ? handleNativeMobilePreview(request,operation,process.env)
  : handleNativeAuthPreview(request,operation,process.env);
}
export const GET=handle;
export const POST=handle;
