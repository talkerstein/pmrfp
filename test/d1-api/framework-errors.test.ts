import { expect,it } from 'vitest';
import { redirect,unstable_rethrow } from 'next/navigation';
import { D1BoardClient } from '../../src/lib/d1/board-client';
import { D1TaxonomyClient } from '../../src/lib/d1/taxonomy-client';
import { D1PhotosClient } from '../../src/lib/d1/photos-client';
import { D1DetailClient } from '../../src/lib/d1/detail-client';
import { D1SavedRfpsClient } from '../../src/lib/d1/client';
const config={url:'https://worker.test',secret:'synthetic-gateway-secret-at-least-32-characters',dataset:'a'.repeat(64),onFetchError:unstable_rethrow};
const calls=(fetcher:typeof fetch)=>[
 ()=>new D1BoardClient(config,fetcher).shard(0),
 ()=>new D1TaxonomyClient(config,fetcher).list('regions'),
 ()=>new D1PhotosClient(config,fetcher).list(['00000000-0000-4000-8000-000000000001']),
 ()=>new D1DetailClient(config,fetcher).get('synthetic-token','public-rfp'),
 ()=>new D1SavedRfpsClient(config,fetcher).list('synthetic-token'),
];
it('preserves real Next control-flow exceptions instead of turning them into gateway failures',async()=>{
 let control:unknown;try{redirect('/synthetic-sign-in');}catch(error){control=error;}
 expect(control).toBeTruthy();
 for(const call of calls(async()=>{throw control;}))await expect(call()).rejects.toBe(control);
});
it('still sanitizes genuine transport failures and never exposes their messages',async()=>{
 for(const call of calls(async()=>{throw Error('sensitive upstream detail');}))await expect(call()).rejects.toMatchObject({status:503,code:'gateway_unavailable',message:'gateway_unavailable'});
});
