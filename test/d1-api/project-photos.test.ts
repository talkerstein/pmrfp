import {DatabaseSync} from 'node:sqlite';
import {createHash} from "node:crypto";
import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {handleNativeProjectPhoto,handleSyntheticProjectPhoto,type SandboxObjectMetadata} from '../../workers/d1-api/project-photos';
import type {D1Binding,D1Statement} from '../../src/lib/d1/contracts';
import {createPrivateR2Binding} from "../../src/lib/d1/private-r2-binding";
import {archiveVpsProjectDraft, serveVpsProjectDraft, uploadVpsProjectPhoto} from "../../src/lib/d1/vps-project-uploads";
import {publishVpsProject} from "../../src/lib/d1/vps-project-publication";
import {normalizeVpsProjectEdit, vpsEditorPhotoUrl, writeVpsProjectEdit} from "../../src/lib/d1/vps-project-edit";
import {createVpsShareLink, resolveVpsShareLink, revokeVpsShareLink} from "../../src/lib/d1/vps-project-share";
import {nativeStoredProjectPhotos} from "../../src/lib/projects/photos";
import {processPhoto} from "../../src/lib/projects/image";
import type {ProjectSession} from "../../src/lib/projects/server";
import storageGateway from "../../workers/storage-preview/private-project-files";
import sharp from "sharp";
const user='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000004',org='20000000-0000-4000-8000-000000000001',project='30000000-0000-4000-8000-000000000001',file='40000000-0000-4000-8000-000000000001';
let db:DatabaseSync;
function statement(sql:string,values:(string|number|null)[]=[]):D1Statement{return{bind:(...v)=>statement(sql,v),first:async<T>()=>(db.prepare(sql).get(...values)??null) as T|null,all:async<T>()=>({success:true,results:db.prepare(sql).all(...values) as T[],meta:{}}),run:async()=>({success:true,results:[],meta:{changes:Number(db.prepare(sql).run(...values).changes)}})};}
const binding=(): D1Binding=>({prepare:statement, async batch<T>(statements: D1Statement[]) {
  db.exec("BEGIN");
  try {
    const results = [];
    for (const item of statements) {
      const value = await item.all<T>();
      value.meta.changes = Number(db.prepare("SELECT changes() n").get()?.n);
      results.push(value);
    }
    db.exec("COMMIT");
    return results;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}});
let meta:SandboxObjectMetadata;
const get=vi.fn(async()=>({...meta,body:new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array([1,2,3]));controller.close();}})}));
const head=vi.fn(async()=>meta);
const request=(method='GET',path=`/v1/project-photos/${project}/${file}.jpg`,headers={})=>new Request('https://sandbox.invalid'+path,{method,headers});
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(readFileSync('d1/0001-staging-copy.sql','utf8'));
 for(const id of [user,other]){db.prepare('INSERT INTO _auth_users VALUES(?)').run(id);db.prepare("INSERT INTO users_profile(id,email,primary_role,status) VALUES(?,?,'trade','active')").run(id,id+'@example.invalid');}
 db.prepare("INSERT INTO organizations(id,name,slug) VALUES(?,'Synthetic','synthetic')").run(org);
 db.prepare('INSERT INTO organization_members(id,organization_id,user_id) VALUES(?,?,?)').run('50000000-0000-4000-8000-000000000001',org,user);
 const path=org+'/'+file+'.jpg';const photos=JSON.stringify([{url:'https://tumexryzbzmtijvbloch.supabase.co/storage/v1/object/authenticated/project-photos-private/'+path,path,kind:'after',width:1,height:1}]);
 db.prepare("INSERT INTO case_studies(id,organization_id,title,slug,challenge,approach,outcome,status,visibility,photos) VALUES(?,?,'Synthetic','synthetic','Test','Test','Test','published','private',?)").run(project,org,photos);
 meta={size:3,httpMetadata:{contentType:'image/jpeg'},customMetadata:{migrationSandbox:'synthetic-only-v1'}};get.mockClear();head.mockClear();
});
afterEach(()=>db.close());
it('requires application authority and current access before streaming private native files', async () => {
  db.exec(readFileSync('deploy/vps/customer-app-authority.sql', 'utf8'));
  db.exec(readFileSync('deploy/vps/private-project-files.sql', 'utf8'));
  const bucket = { get, head };
  await expect(handleNativeProjectPhoto(binding(), bucket, request(), user)).rejects.toMatchObject({status: 503});
  expect(get).not.toHaveBeenCalled();

  db.exec("INSERT INTO _customer_app_authority VALUES (1, 'native-v1')");
  await expect(handleNativeProjectPhoto(binding(), bucket, request(), other)).rejects.toMatchObject({status: 404});
  expect(get).not.toHaveBeenCalled();
  await expect(handleNativeProjectPhoto(binding(), bucket, request(), user)).rejects.toMatchObject({status: 404});
  const checksum = 'f'.repeat(64);
  const etag = 'a'.repeat(32);
  db.prepare('INSERT INTO _private_project_files VALUES (?, ?, ?, ?)').run(`${org}/${file}.jpg`, checksum, etag, 3);
  await expect(handleNativeProjectPhoto(binding(), bucket, request(), user)).rejects.toMatchObject({status: 503});

  meta.etag = etag;
  const allowed = await handleNativeProjectPhoto(binding(), bucket, request(), user);
  expect(allowed.headers.get('cache-control')).toBe('private, no-store');
  expect(get).toHaveBeenLastCalledWith(`private-project-photo/${checksum}`);
  expect([...new Uint8Array(await allowed.arrayBuffer())]).toEqual([1, 2, 3]);
  await expect(handleNativeProjectPhoto(binding(), bucket, request('DELETE'), user)).rejects.toMatchObject({status: 405});
});

it("streams private R2 photos to the VPS only after a current organization access check", async () => {
  db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
  db.exec(readFileSync("deploy/vps/private-project-files.sql", "utf8"));
  const checksum = "f".repeat(64);
  meta.etag = "a".repeat(32);
  db.prepare("INSERT INTO _private_project_files VALUES (?, ?, ?, ?)").run(`${org}/${file}.jpg`, checksum, meta.etag, 3);
  const secret = "a".repeat(64);
  const ip = "192.0.2.10";
  const gateway = { APP_DB: binding(), PRIVATE_FILES: { get, head }, GATEWAY_SECRET: secret, VPS_IP: ip,
    MODE: "readiness" as "readiness" | "serving" };
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const req = new Request(input, init);
    expect(req.headers.get("cookie")).toBeNull();
    expect(req.headers.get("authorization")).toBeNull();
    req.headers.set("cf-connecting-ip", ip);
    return storageGateway.fetch(req, gateway);
  });
  const vpsBucket = createPrivateR2Binding(secret, fetcher);
  const key = `private-project-photo/${checksum}`;
  const health = "https://pmrfp-private-project-files.pmrfp.workers.dev/v1/private-project-files/health";
  expect(await (await fetcher(health, { headers: { "x-pmrfp-gateway-key": secret } })).json())
    .toEqual({ reachable: true, verifiedFiles: 1 });
  expect((await storageGateway.fetch(new Request(health, { headers: { "x-pmrfp-gateway-key": secret } }), gateway)).status).toBe(404);
  await expect(vpsBucket.get(key)).rejects.toMatchObject({ status: 503 });
  gateway.MODE = "serving";
  await expect(vpsBucket.get(key)).rejects.toMatchObject({ status: 503 });
  db.exec("INSERT INTO _customer_app_authority VALUES (1, 'native-v1')");
  await expect(createPrivateR2Binding("b".repeat(64), fetcher).get(key)).rejects.toMatchObject({ status: 503 });
  fetcher.mockClear();
  await expect(handleNativeProjectPhoto(binding(), vpsBucket, request(), other)).rejects.toMatchObject({ status: 404 });
  expect(fetcher).not.toHaveBeenCalled();
  const response = await handleNativeProjectPhoto(binding(), vpsBucket, request("GET", undefined, { cookie: "customer" }), user);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  const metadata = await handleNativeProjectPhoto(binding(), vpsBucket, request("HEAD"), user);
  expect(metadata.headers.get("content-length")).toBe("3");
  expect(await metadata.text()).toBe("");
  db.exec("DELETE FROM organization_members");
  await expect(handleNativeProjectPhoto(binding(), vpsBucket, request(), user)).rejects.toMatchObject({ status: 404 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("stores re-encoded draft JPEGs privately and rejects altered bytes and revoked access", async () => {
  db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
  db.exec(readFileSync("deploy/vps/project-photo-uploads.sql", "utf8"));
  db.exec(readFileSync("deploy/vps/private-project-files.sql", "utf8"));
  db.exec(readFileSync("deploy/vps/project-publication.sql", "utf8"));
  db.prepare("UPDATE organizations SET organization_type='trade_company',profile_status='approved' WHERE id=?").run(org);
  const secret = "c".repeat(64);
  const ip = "192.0.2.10";
  const objects = new Map<string, { data: ArrayBuffer; sha256: string }>();
  const metadata = (key: string) => {
    const object = objects.get(key);
    if (!object) return null;
    return { size: object.data.byteLength, etag: createHash("md5").update(new Uint8Array(object.data)).digest("hex"),
      httpMetadata: { contentType: "image/jpeg" }, customMetadata: { sha256: object.sha256 } };
  };
  const bucket = {
    async put(key: string, data: ArrayBuffer, options: { customMetadata: Record<string, string> }) {
      objects.set(key, { data, sha256: options.customMetadata.sha256 });
    },
    async head(key: string) { return metadata(key); },
    async get(key: string) {
      const meta = metadata(key);
      return meta ? { ...meta, body: new Response(objects.get(key)!.data).body! } : null;
    },
  };
  const gateway = { APP_DB: binding(), PRIVATE_FILES: bucket, GATEWAY_SECRET: secret, VPS_IP: ip, MODE: "serving" as const };
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const req = new Request(input, init);
    req.headers.set("cf-connecting-ip", ip);
    expect(req.headers.get("cookie")).toBeNull();
    return storageGateway.fetch(req, gateway);
  });
  const session = { userId: user, organization: { id: org }, hasTradeAccess: true } as ProjectSession;
  const image = await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).png().toBuffer();
  const processed = await processPhoto(image);
  await expect(uploadVpsProjectPhoto(session, processed, binding(), fetcher, secret)).rejects.toMatchObject({ status: 403 });
  expect(fetcher).not.toHaveBeenCalled();

  db.exec("INSERT INTO _customer_app_authority VALUES (1, 'native-v1')");
  const unavailable = vi.fn<typeof fetch>().mockRejectedValue(new Error("fixture storage timeout"));
  await expect(uploadVpsProjectPhoto(session, processed, binding(), unavailable, secret)).rejects.toMatchObject({ status: 503 });
  expect(db.prepare("SELECT count(*) AS n FROM _project_photo_uploads").get()?.n).toBe(0);
  const uploaded = await uploadVpsProjectPhoto(session, processed, binding(), fetcher, secret);
  const id = uploaded.url.split("/").at(-1)!;
  expect(uploaded).toMatchObject({ path: `${org}/${id}.jpg`, width: 8, height: 6 });
  expect(objects.size).toBe(1);
  const path = `https://storage.test/v1/private-project-drafts/${id}`;
  const altered = new Uint8Array(processed.data);
  altered[2] ^= 1;
  expect((await fetcher(path, {
    method: "PUT", body: altered, headers: { "x-pmrfp-gateway-key": secret, "content-type": "image/jpeg" },
  })).status).toBe(400);
  const preview = await serveVpsProjectDraft(session, id, false, binding(), fetcher, secret);
  expect(preview.headers.get("cache-control")).toBe("private, no-store");
  expect(Buffer.from(await preview.arrayBuffer())).toEqual(processed.data);
  expect(await (await serveVpsProjectDraft(session, id, true, binding(), fetcher, secret)).text()).toBe("");
  fetcher.mockClear();
  expect((await serveVpsProjectDraft({ ...session, userId: other }, id, false, binding(), fetcher, secret)).status).toBe(404);
  const archive = (draft: string) => archiveVpsProjectDraft(draft, fetcher, secret);
  const input = {
    title: "Fixture project published from the VPS", summary: "", challenge: "Fixture", approach: "Fixture", outcome: "Fixture",
    categorySlug: "", propertyTypeSlug: "", regionSlug: "", city: "", clientApproved: false,
    photos: [{ ...uploaded, kind: "after" as const }],
  };
  db.exec(`CREATE TRIGGER reject_new_photo BEFORE INSERT ON _private_project_files
    BEGIN SELECT RAISE(ABORT,'local photo registration failure'); END;`);
  await expect(publishVpsProject(session, input, true, binding(), archive)).rejects.toThrow();
  expect(db.prepare("SELECT id FROM case_studies WHERE id=?").get(id)).toBeUndefined();
  expect(db.prepare("SELECT id FROM _project_photo_uploads WHERE id=?").get(id)).toMatchObject({ id });
  db.exec("DROP TRIGGER reject_new_photo");
  const published = await publishVpsProject(session, input, true, binding(), archive);
  expect(published).toMatchObject({ id, live: true });
  expect(await publishVpsProject(session, input, true, binding(), archive)).toEqual(published);
  expect(db.prepare("SELECT id FROM _project_photo_uploads WHERE id=?").get(id)).toBeUndefined();
  const permanent = createPrivateR2Binding(secret, fetcher);
  const permanentRequest = request("GET", `/v1/project-photos/${id}/${id}.jpg`);
  expect(Buffer.from(await (await handleNativeProjectPhoto(binding(), permanent, permanentRequest, null)).arrayBuffer()))
    .toEqual(processed.data);
  const before = db.prepare("SELECT photos,updated_at FROM case_studies WHERE id=?").get(id) as
    { photos: string; updated_at: string };
  const current = nativeStoredProjectPhotos(JSON.parse(before.photos), id, org);
  const editor = current.map(photo => ({ ...photo, url: vpsEditorPhotoUrl(id, photo.path) }));
  const second = await uploadVpsProjectPhoto(session, processed, binding(), fetcher, secret);
  const edit = normalizeVpsProjectEdit([...editor, { ...second, kind: "before" }], current, id, org);
  expect(edit?.drafts).toHaveLength(1);
  expect(normalizeVpsProjectEdit([{ ...editor[0], url: "https://evil.invalid/image.jpg" }], current, id, org)).toBeNull();
  expect(normalizeVpsProjectEdit([editor[0], editor[0]], current, id, org)).toBeNull();
  await writeVpsProjectEdit(binding(), session, id, before.updated_at, { visibility: "private", photos: edit!.photos },
    edit!.drafts, archive);
  await expect(writeVpsProjectEdit(binding(), session, id, before.updated_at, { visibility: "public" }, [], archive)).rejects.toThrow();
  expect(db.prepare("SELECT id FROM _project_photo_uploads WHERE id=?").get(edit!.drafts[0])).toBeUndefined();
  expect(db.prepare("SELECT source_path FROM _private_project_files WHERE source_path=?").get(second.path))
    .toMatchObject({ source_path: second.path });
  await expect(handleNativeProjectPhoto(binding(), permanent, permanentRequest, null)).rejects.toMatchObject({ status: 404 });
  expect((await handleNativeProjectPhoto(binding(), permanent, permanentRequest, user)).status).toBe(200);

  expect(await createVpsShareLink({ ...session, hasTradeAccess: false }, id, "", binding())).toBeNull();
  const link = await createVpsShareLink(session, id, "Fixture bid link", binding());
  expect(link?.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  const resolved = await resolveVpsShareLink(binding(), link!.token);
  expect(resolved).toMatchObject({ case_study_id: id, organization_id: org });
  expect((await handleNativeProjectPhoto(binding(), permanent, permanentRequest, null, link!.token)).status).toBe(200);
  await expect(handleNativeProjectPhoto(binding(), permanent, request(), null, link!.token)).rejects.toMatchObject({ status: 404 });
  expect(await revokeVpsShareLink(session, resolved!.id, binding())).toMatchObject({ id: resolved!.id });
  expect(await resolveVpsShareLink(binding(), link!.token)).toBeNull();
  await expect(handleNativeProjectPhoto(binding(), permanent, permanentRequest, null, link!.token)).rejects.toMatchObject({ status: 404 });
  fetcher.mockClear();
  db.exec("DELETE FROM organization_members");
  expect((await serveVpsProjectDraft(session, id, false, binding(), fetcher, secret)).status).toBe(404);
  await expect(handleNativeProjectPhoto(binding(), permanent, permanentRequest, user)).rejects.toMatchObject({ status: 404 });
  expect(fetcher).not.toHaveBeenCalled();
});
it('authorizes the current organization member, streams without shared caching and supports authenticated HEAD',async()=>{
 const response=await handleSyntheticProjectPhoto(binding(),{get,head},request(),user);expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1,2,3]);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(get).toHaveBeenCalledWith('project-photos-private/'+org+'/'+file+'.jpg');
 const metadata=await handleSyntheticProjectPhoto(binding(),{get,head},request('HEAD'),user);expect(await metadata.text()).toBe('');expect(head).toHaveBeenCalledTimes(1);
});
it('denies unrelated users, suspended profiles, revoked membership and private project probing before reading R2',async()=>{
 await expect(handleSyntheticProjectPhoto(binding(),{get,head},request(),other)).rejects.toMatchObject({status:404});
 db.exec("UPDATE users_profile SET status='suspended'");await expect(handleSyntheticProjectPhoto(binding(),{get,head},request(),user)).rejects.toMatchObject({status:403});
 db.exec("UPDATE users_profile SET status='active';DELETE FROM organization_members");await expect(handleSyntheticProjectPhoto(binding(),{get,head},request(),user)).rejects.toMatchObject({status:404});expect(get).not.toHaveBeenCalled();
});
it('checks current project visibility and registration; never accepts arbitrary paths or remote photo URLs',async()=>{
 db.exec("UPDATE case_studies SET visibility='unlisted'");expect((await handleSyntheticProjectPhoto(binding(),{get,head},request(),other)).status).toBe(200);
 db.exec("UPDATE case_studies SET visibility='private'");await expect(handleSyntheticProjectPhoto(binding(),{get,head},request(),other)).rejects.toMatchObject({status:404});
 db.prepare('UPDATE case_studies SET photos=?').run(JSON.stringify([{url:'https://evil.invalid/file.jpg',path:org+'/'+file+'.jpg',kind:'after',width:1,height:1}]));await expect(handleSyntheticProjectPhoto(binding(),{get,head},request(),user)).rejects.toMatchObject({status:404});
});
it('rejects non-synthetic objects, unsupported methods, selectors and ranges',async()=>{
 for(const alteration of [{customMetadata:{}},{httpMetadata:{contentType:'text/html'}},{size:11*1024*1024}]){meta={size:3,httpMetadata:{contentType:'image/jpeg'},customMetadata:{migrationSandbox:'synthetic-only-v1'},...alteration};await expect(handleSyntheticProjectPhoto(binding(),{get,head},request(),user)).rejects.toMatchObject({status:503});}
 for(const [req,status] of [[request('POST'),405],[request('GET',`/v1/project-photos/${project}/${file}.jpg?organization=other`),400],[request('GET',undefined,{range:'bytes=0-1'}),400]] as const)await expect(handleSyntheticProjectPhoto(binding(),{get,head},req,user)).rejects.toMatchObject({status});
});
it('restricts bounded synthetic JPEG replacement and idempotent deletion to current owners',async()=>{
 const put=vi.fn(async()=>({})),remove=vi.fn(async()=>{}),bucket={get,head,put,delete:remove};
 const upload=()=>new Request(`https://sandbox.invalid/v1/project-photos/${project}/${file}.jpg`,{method:'PUT',headers:{'content-type':'image/jpeg'},body:new Uint8Array([255,216,255,0,255,217])});
 expect((await handleSyntheticProjectPhoto(binding(),bucket,upload(),user)).status).toBe(200);expect(put).toHaveBeenCalledTimes(1);
 db.exec("UPDATE case_studies SET visibility='unlisted'");await expect(handleSyntheticProjectPhoto(binding(),bucket,upload(),other)).rejects.toMatchObject({status:404});
 expect((await handleSyntheticProjectPhoto(binding(),bucket,request('DELETE'),user)).status).toBe(204);expect(remove).toHaveBeenCalledTimes(1);
 meta={...meta,customMetadata:{}};await expect(handleSyntheticProjectPhoto(binding(),bucket,upload(),user)).rejects.toMatchObject({status:503});expect(put).toHaveBeenCalledTimes(1);
});
it('returns a protected 404 response for an asynchronous private-photo denial through the Worker',async()=>{
 const {handleRequest}=await import('../../workers/d1-api');db.exec("CREATE TABLE _d1_sandbox(key TEXT PRIMARY KEY,value TEXT);INSERT INTO _d1_sandbox VALUES('dataset','synthetic-only')");
 const secret='synthetic-api-gateway-at-least-32-characters';
 const env={DB:binding(),GATEWAY_SECRET:secret,AUTH_PROVIDER:'native-synthetic' as const,SAVED_RFPS_MODE:'sandbox-write' as const,NATIVE_AUTH_URL:'https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev',NATIVE_AUTH_GATEWAY_SECRET:secret,SUPABASE_URL:'',SUPABASE_ANON_KEY:'',STORAGE_SANDBOX:{get,head}};
 const response=await handleRequest(new Request(request().url,{headers:{'x-pmrfp-gateway-key':secret,'x-pmrfp-native-session':'__Secure-better-auth.session_token=synthetic.signed.cookie'}}),env,async()=>Response.json({user:{id:other,email:'other@example.invalid',emailVerified:true,banned:false},session:{userId:other,expiresAt:'2099-01-01T00:00:00Z'}}));
 expect(response.status).toBe(404);expect(await response.json()).toEqual({error:'not_found'});expect(get).not.toHaveBeenCalled();
});
