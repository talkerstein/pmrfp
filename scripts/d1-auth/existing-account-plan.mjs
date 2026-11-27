/** A single existing migration test account; never copy customer credentials. */
export function existingTestAccountStatements(plan,accountId,schema,now=Date.now()){
 const email='d1-preview-20261022@example.invalid';
 if(!Number.isSafeInteger(now)||now<0||!plan||!/^[a-f0-9]{64}$/.test(plan.sourceSha256)||!Array.isArray(plan.accounts)||typeof accountId!=='string'||!schema.includes('_auth_preview_manifest'))throw Error('Invalid test-account plan');
 const accounts=plan.accounts.filter(row=>row.user.email===email&&row.user.id===accountId);
 if(accounts.length!==1||plan.accounts.filter(row=>row.user.email===email).length!==1)throw Error('Unique existing test account required');
 const row=accounts[0],u=row.user,a=row.account;
 if(u.role!=='user'||u.emailVerified!==1||u.banned!==0||a.providerId!=='credential'||a.userId!==u.id||a.accountId!==u.id||a.id!=='credential:'+u.id||!/^\$2[aby]\$(0[4-9]|1[0-6])\$[./A-Za-z0-9]{53}$/.test(a.password))throw Error('Test account is not eligible');
 const statements=schema.split('-- Explicit sandbox marker;')[0].split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n').split(';').map(sql=>sql.trim()).filter(Boolean).map(sql=>({sql,params:[]}));
 statements.push({sql:"CREATE TABLE _auth_test_preview_manifest(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL CHECK(mode='existing-test-account-only'),user_id TEXT NOT NULL,source_sha256 TEXT NOT NULL,expires_at TEXT NOT NULL)",params:[]},
 {sql:'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned,banExpires) VALUES(?,?,?,?,?,?,?,?,?)',params:[u.id,u.name,u.email,u.emailVerified,u.createdAt,u.updatedAt,u.role,u.banned,u.banExpires]},
 {sql:'INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',params:[a.id,a.accountId,a.providerId,a.userId,a.password,u.createdAt,u.updatedAt]},
 {sql:"INSERT INTO _auth_test_preview_manifest VALUES(1,'existing-test-account-only',?,?,?)",params:[u.id,plan.sourceSha256,new Date(now+900000).toISOString()]});
 if(statements.length>30||JSON.stringify(statements).length>20000)throw Error('Test import bound exceeded');
 return statements;
}
