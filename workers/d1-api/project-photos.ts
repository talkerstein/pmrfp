import { D1ApiError, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { sanitizePhotos } from "../../src/lib/projects/photos";
import { canViewProjectPhotos, type PhotoViewer } from "../../src/lib/projects/photo-access";

export interface SandboxObjectMetadata {
  size: number;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}
export interface SandboxObject extends SandboxObjectMetadata { body: ReadableStream<Uint8Array> }
export interface SandboxBucket {
  get(key: string): Promise<SandboxObject | null>;
  head(key: string): Promise<SandboxObjectMetadata | null>;
  put?(key: string, value: ArrayBuffer, options: {httpMetadata:{contentType:string};customMetadata:Record<string,string>}): Promise<unknown>;
  delete?(key: string): Promise<void>;
}
const LEGACY_ORIGIN = "https://tumexryzbzmtijvbloch.supabase.co";
/** Synthetic photo operations: Source references are parsed, never fetched. Real R2
 * migration files have no synthetic marker and cannot pass this rehearsal. */
export async function handleSyntheticProjectPhoto(db: D1Binding, bucket: SandboxBucket | undefined, request: Request, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const match = /^\/v1\/project-photos\/([^/]+)\/([^/]+)\.jpg$/.exec(url.pathname);
  if (!match || !UUID.test(match[1]) || !UUID.test(match[2]) || url.search) throw new D1ApiError(400, "invalid_photo_request");
  if (!["GET","HEAD","PUT","DELETE"].includes(request.method)) throw new D1ApiError(405, "method_not_allowed");
  if (request.headers.has("range")) throw new D1ApiError(400, "range_not_enabled");
  if (!bucket) throw new D1ApiError(503, "storage_unavailable");
  const profile = await db.prepare("SELECT status,primary_role FROM users_profile WHERE id=?").bind(userId).first<{status:string;primary_role:string}>();
  if (!profile || profile.status !== "active") throw new D1ApiError(403, "account_inactive");
  const project = await db.prepare(`SELECT c.id,c.organization_id,c.status,c.visibility,c.photos,o.status AS organization_status
    FROM case_studies c JOIN organizations o ON o.id=c.organization_id WHERE c.id=?`).bind(match[1].toLowerCase()).first<{id:string;organization_id:string;status:string;visibility:string|null;photos:string;organization_status:string}>();
  if (!project || project.organization_status === "suspended" || !UUID.test(project.organization_id)) throw new D1ApiError(404, "not_found");
  let viewer: PhotoViewer = {kind:"anonymous"};
  if (["admin","super_admin"].includes(profile.primary_role)) viewer = {kind:"admin"};
  else {
    const member = await db.prepare("SELECT 1 AS member FROM organization_members WHERE user_id=? AND organization_id=? LIMIT 1").bind(userId,project.organization_id).first();
    if (member) viewer = {kind:"member",organizationId:project.organization_id};
  }
  if (!canViewProjectPhotos({id:project.id,organizationId:project.organization_id,status:project.status,visibility:project.visibility},viewer)) throw new D1ApiError(404,"not_found");
  let photos: unknown;
  try { photos = JSON.parse(project.photos); } catch { throw new D1ApiError(503,"photo_metadata_invalid"); }
  const path = project.organization_id.toLowerCase()+"/"+match[2].toLowerCase()+".jpg";
  const photo = sanitizePhotos(photos,LEGACY_ORIGIN,project.organization_id,{includePrivate:true}).find(item=>item.path.toLowerCase()===path);
  if (!photo) throw new D1ApiError(404,"not_found");
  // Read the private namespace even for a public/unlisted project's legacy reference.
  const key = "project-photos-private/"+path;
  if (request.method === "PUT" || request.method === "DELETE") {
    if (viewer.kind !== "member" && viewer.kind !== "admin") throw new D1ApiError(404,"not_found");
    const previous=await bucket.head(key);
    if(previous && previous.customMetadata?.migrationSandbox!=="synthetic-only-v1")throw new D1ApiError(503,"storage_object_invalid");
    if(request.method==="DELETE") {
      if(!bucket.delete)throw new D1ApiError(503,"storage_writes_unavailable");
      await bucket.delete(key);
      return new Response(null,{status:204,headers:{"cache-control":"private, no-store"}});
    }
    if(!bucket.put)throw new D1ApiError(503,"storage_writes_unavailable");
    if(request.headers.get("content-type")!=="image/jpeg" || !request.body)throw new D1ApiError(400,"invalid_photo_upload");
    const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
    while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>10*1024*1024){await reader.cancel();throw new D1ApiError(413,"photo_too_large");}chunks.push(next.value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    // Rehearsal only. The production app's Sharp processing must remain ahead of uploads.
    if(length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[length-2]!==255||bytes[length-1]!==217)throw new D1ApiError(400,"invalid_photo_upload");
    await bucket.put(key,bytes.buffer,{httpMetadata:{contentType:"image/jpeg"},customMetadata:{migrationSandbox:"synthetic-only-v1"}});
    return Response.json({ok:true},{headers:{"cache-control":"private, no-store"}});
  }
  const object = request.method === "HEAD" ? await bucket.head(key) : await bucket.get(key);
  if (!object) throw new D1ApiError(404,"not_found");
  if (object.customMetadata?.migrationSandbox !== "synthetic-only-v1" || object.httpMetadata?.contentType !== "image/jpeg" || !Number.isSafeInteger(object.size) || object.size <= 0 || object.size > 10*1024*1024) throw new D1ApiError(503,"storage_object_invalid");
  return new Response(request.method === "HEAD" ? null : (object as SandboxObject).body, {headers:{
    "content-type":"image/jpeg","content-length":String(object.size),"cache-control":"private, no-store",
    "x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; sandbox","referrer-policy":"no-referrer",
  }});
}
