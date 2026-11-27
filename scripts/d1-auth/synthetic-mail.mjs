const fixtureId=/^00000000-0000-4000-8000-0000000000[0-9]{2}$/;
/** Auth callback contract. No SMTP, customer recipients, arbitrary URLs or logging. */
export function syntheticMailOptions(options,{origin,deliver}) {
  if(!['http://localhost:8788','https://pmrfp-auth-synthetic-preview.pmrfp.workers.dev'].includes(origin)||typeof deliver!=='function')throw Error('Invalid synthetic mail configuration');
  const callback=kind=>async({user,url,token})=>{
    if(!fixtureId.test(user?.id)||!/^[-a-z0-9]+@example\.invalid$/.test(user?.email)||typeof token!=='string'||token.length<16||token.length>2048)throw Error('Synthetic mail fixture required');
    const link=new URL(url);
    if(link.origin!==origin||link.username||link.password||link.hash)throw Error('Untrusted auth link');
    if(kind==='verification'?(link.pathname!=='/api/auth/verify-email'||link.searchParams.get('token')!==token):(link.pathname!==`/api/auth/reset-password/${token}`))throw Error('Unexpected auth link');
    const redirect=link.searchParams.get('callbackURL');
    if(redirect&&new URL(redirect,origin).origin!==origin)throw Error('Untrusted callback');
    await deliver({kind,userId:user.id,to:user.email,url:link.href,expiresIn:900});
  };
  return {...options,
    emailAndPassword:{...options.emailAndPassword,revokeSessionsOnPasswordReset:true,resetPasswordTokenExpiresIn:900,sendResetPassword:callback('reset')},
    emailVerification:{expiresIn:900,sendOnSignIn:false,autoSignInAfterVerification:false,sendVerificationEmail:callback('verification')},
  };
}
/** Bounded private sink: last generated message per synthetic account and kind. */
export async function recordSyntheticMail(db,message,now=Date.now()) {
  if(!Number.isSafeInteger(now)||now<0||!fixtureId.test(message?.userId)||!['reset','verification'].includes(message?.kind))throw Error('Invalid outbox input');
  const id=`synthetic-mail:${message.kind}:${message.userId}`;
  const timestamp=new Date(now).toISOString();
  await db.batch([
    db.prepare("INSERT INTO _auth_preview_manifest(id,mode) SELECT 1,'invalid' WHERE NOT EXISTS(SELECT 1 FROM _auth_preview_manifest WHERE id=1 AND mode='synthetic-only-v1')").bind(),
    db.prepare("UPDATE _auth_preview_manifest SET mode=CASE WHEN mode='synthetic-only-v1' AND EXISTS(SELECT 1 FROM user WHERE id=? AND email=? AND email LIKE '%@example.invalid') THEN mode ELSE 'invalid' END WHERE id=1").bind(message.userId,message.to),
    db.prepare('DELETE FROM verification WHERE identifier=?').bind(id),
    db.prepare("INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM _auth_preview_manifest WHERE id=1 AND mode='synthetic-only-v1')").bind(id,id,JSON.stringify(message),new Date(now+900000).toISOString(),timestamp,timestamp),
    db.prepare("UPDATE _auth_preview_manifest SET mode=CASE WHEN changes()=1 THEN mode ELSE 'invalid' END WHERE id=1").bind(),
  ]);
}
