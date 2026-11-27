const authOrigin='https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev';
/** Fixed templates for isolated fixtures. Never accept a recipient or text override. */
export function buildSyntheticAuthMessage(input) {
 if(!input||Object.keys(input).some(k=>!['kind','userId','to','url','expiresIn'].includes(k))||!['reset','verification'].includes(input.kind)||!/^00000000-0000-4000-8000-0000000000[0-9]{2}$/.test(input.userId)||!/^[-a-z0-9]+@example\.invalid$/.test(input.to)||input.expiresIn!==900||typeof input.url!=='string'||input.url.length>4096)throw Error('Invalid synthetic message');
 const link=new URL(input.url);
 if(link.origin!==authOrigin||link.hash||link.username||link.password)throw Error('Invalid synthetic link');
 const token=input.kind==='reset'?link.pathname.slice('/api/auth/reset-password/'.length):link.searchParams.get('token');
 if(input.kind==='reset'?!link.pathname.startsWith('/api/auth/reset-password/')||!/^[A-Za-z0-9_-]{16,128}$/.test(token):link.pathname!=='/api/auth/verify-email'||!token||!/^[A-Za-z0-9_.-]{16,2048}$/.test(token))throw Error('Invalid synthetic token');
 if(new Set(link.searchParams.keys()).size!==[...link.searchParams.keys()].length)throw Error('Duplicate link parameters');
 if([...link.searchParams.keys()].some(k=>!['callbackURL',...(input.kind==='verification'?['token']:[])].includes(k)))throw Error('Invalid link parameters');
 const callback=link.searchParams.get('callbackURL');if(callback&&new URL(callback,authOrigin).origin!==authOrigin)throw Error('Invalid callback');
 return {subject:input.kind==='reset'?'PMRFP preview: reset your password':'PMRFP preview: verify your email',text:`This is an isolated PMRFP migration test.\n\n${input.kind==='reset'?'Reset your test password':'Verify your test email'}: ${link.href}\n\nThis link expires in 15 minutes. If you did not request it, ignore this message.`};
}
