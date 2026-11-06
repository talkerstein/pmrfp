import {it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const {updateSession}=vi.hoisted(()=>({updateSession:vi.fn(()=>{throw Error('MUST_NOT_CALL_SOURCE_AUTH');})}));
vi.mock('../../src/lib/supabase/middleware',()=>({updateSession}));
it('routes the independently gated mail preview without calling Source Auth',async()=>{
 const {proxy}=await import('../../src/proxy');const response=await proxy(new NextRequest('https://preview.invalid/api/migration/auth-mail'));
 expect(response.headers.get('x-middleware-next')).toBe('1');expect(updateSession).not.toHaveBeenCalled();
});
