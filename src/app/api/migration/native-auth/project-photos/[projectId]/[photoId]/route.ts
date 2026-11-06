import {handleNativePhotoPreview} from '@/lib/d1/native-photo-preview';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string;photoId:string}>};
async function handle(request:Request,context:Context){const {projectId,photoId}=await context.params;return handleNativePhotoPreview(request,projectId,photoId,process.env);}
export const GET=handle;
export const HEAD=handle;
export const PUT=handle;
export const DELETE=handle;
