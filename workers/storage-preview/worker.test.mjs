import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetReader} from './worker.mjs';
const key='private-test-gateway-0000000000000000';
const asset={id:'a'.repeat(64),sha256:'b'.repeat(64),md5:'c'.repeat(32),type:'image/png',bytes:3};
const reader=assetReader([asset]);const root='https://preview.invalid/v1/assets/';
const request=(path=asset.id,method='GET',headers={})=>new Request(root+path,{method,headers:{'x-pmrfp-asset-preview-key':key,...headers}});
const object=()=>({size:3,etag:asset.md5,httpMetadata:{contentType:'image/png'},body:new Response('png').body});
test('blocks unauthenticated, private paths, selectors and write methods before R2',async()=>{
 const never=()=>assert.fail('unexpected storage operation');const env={MODE:'verified-public-preview',GATEWAY_SECRET:key,PUBLIC_ASSETS:{get:never,head:never}};
 for(const [req,status] of [[request(asset.id,'GET',{'x-pmrfp-asset-preview-key':'wrong'}),401],[request('d'.repeat(64)),404],[request('project-photos-private/file'),400],[request(asset.id+'?key=private'),400],[request(asset.id,'GET',{range:'bytes=0-1'}),400],[request(asset.id,'PUT'),405]])assert.equal((await reader.fetch(req,env)).status,status);
});
test('GET streams and HEAD reads metadata from the immutable allowlisted key only',async()=>{
 const calls=[];const env={MODE:'verified-public-preview',GATEWAY_SECRET:key,PUBLIC_ASSETS:{get:async k=>{calls.push(['get',k]);return object();},head:async k=>{calls.push(['head',k]);return object();}}};
 const get=await reader.fetch(request(),env);assert.equal(await get.text(),'png');assert.equal(get.headers.get('cache-control'),'private, no-store');assert.equal(get.headers.get('content-type'),'image/png');
 const head=await reader.fetch(request(asset.id,'HEAD'),env);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),'3');
 const expected=`verified-public/${asset.id}/${asset.sha256}`;assert.deepEqual(calls,[['get',expected],['head',expected]]);
});
test('changed identity, type or bytes fail closed; manifests reject unsafe media and duplicates',async()=>{
 for(const value of [{...object(),etag:'wrong'},{...object(),size:5},{...object(),httpMetadata:{contentType:'text/html'}}])assert.equal((await reader.fetch(request(),{MODE:'verified-public-preview',GATEWAY_SECRET:key,PUBLIC_ASSETS:{get:async()=>value}})).status,503);
 assert.throws(()=>assetReader([asset,asset]));assert.throws(()=>assetReader([{...asset,type:'image/svg+xml'}]));
});
test('a short-lived link streams without a gateway header, but not when tampered, expired, or used for writes',async()=>{
 const now=Date.now;let instant=1794200000000;Date.now=()=>instant;
 try{
  const origin='https://pmrfp-verified-public-assets-preview.pmrfp.workers.dev';
  const env={MODE:'verified-public-preview',SIGNED_LINKS:'enabled',GATEWAY_SECRET:key,LINK_SECRET:'separate-link-signing-key-000000000000000',PUBLIC_ASSETS:{get:async()=>object(),head:async()=>object()}};
  const issue=()=>new Request(origin+'/v1/assets/'+asset.id+'/link',{method:'POST',headers:{'x-pmrfp-asset-preview-key':key}});
  assert.equal((await reader.fetch(issue(),{...env,SIGNED_LINKS:'disabled'})).status,503);
  assert.equal((await reader.fetch(new Request(issue().url,{method:'POST'}),env)).status,401);
  const result=await reader.fetch(issue(),env);assert.equal(result.status,200);const {url}=await result.json();
  assert.equal(await (await reader.fetch(new Request(url),env)).text(),'png');
  for(const req of [new Request(url+'&extra=1'),new Request(url+'&exp=1794200050'),new Request(url.replace(asset.id,'d'.repeat(64))),new Request(url,{method:'PUT'})])assert.equal((await reader.fetch(req,env)).status,401);
  const mutated=new URL(url);mutated.searchParams.set('sig','0'.repeat(64));assert.equal((await reader.fetch(new Request(mutated),env)).status,401);
  instant+=91000;assert.equal((await reader.fetch(new Request(url),env)).status,401);
 }finally{Date.now=now;}
});
