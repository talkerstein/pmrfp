import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {handleSyntheticProjectPhoto,type SandboxObjectMetadata} from '../../workers/d1-api/project-photos';
import type {D1Binding,D1Statement} from '../../src/lib/d1/contracts';
const user='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000004',org='20000000-0000-4000-8000-000000000001',project='30000000-0000-4000-8000-000000000001',file='40000000-0000-4000-8000-000000000001';
let db:DatabaseSync;
function statement(sql:string,values:(string|number|null)[]=[]):D1Statement{return{bind:(...v)=>statement(sql,v),first:async<T>()=>(db.prepare(sql).get(...values)??null) as T|null,all:async<T>()=>({success:true,results:db.prepare(sql).all(...values) as T[],meta:{}}),run:async()=>({success:true,results:[],meta:{changes:Number(db.prepare(sql).run(...values).changes)}})};}
const binding=()=>({prepare:statement} as D1Binding);
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
