import { hashCustomerPassword } from "../../scripts/d1-auth/rehearsal.mjs";
import { EMAIL_NOTICE_VERSION } from "../../src/lib/consent/email";
import { normalizeEmail } from "../../src/lib/dedupe/email";
import { customerAppAuthority, D1ApiError, UUID, readD1Json, type D1Binding } from "../../src/lib/d1/contracts";
import { forgotPasswordSchema, nativeSignUpSchema } from "../../src/lib/validations";
import { z } from "zod";
import { accountTokenPattern, hashAccountToken, nativeAuthAuthority, newAccountToken } from "./customer-password-reset";

export { customerAppAuthority };
export const mailboxKey = `CASE WHEN lower(substr(email,instr(email,'@')+1)) IN ('gmail.com','googlemail.com')
  THEN replace(substr(lower(email),1,instr(replace(lower(email),'@','+'),'+')-1),'.','')||'@gmail.com'
  ELSE lower(email) END`;
const existingMailbox = `EXISTS (SELECT 1 FROM user WHERE ${mailboxKey}=?)`;
const slugs = z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80)).max(40);
const preferencesSchema = z.object({
  primary_role: nativeSignUpSchema.shape.role.optional(),
  org_kind: z.enum(["builder", "landlord"]).nullable().optional(),
  gc_award: z.string().max(160).nullable().optional(),
  pref_company: z.string().max(120).nullable().optional(),
  pref_categories: slugs.optional(),
  pref_regions: slugs.optional(),
});

export async function readCustomerSignupPreferences(db: D1Binding, id: string) {
  const row = await db.prepare("SELECT metadata FROM _auth_source_metadata WHERE user_id=?")
    .bind(id).first<{ metadata: string }>();
  const source = row ? JSON.parse(row.metadata).raw_user_meta_data : {};
  const value = preferencesSchema.safeParse(source);
  return value.success ? value.data : {};
}

interface PendingSignup {
  mailbox: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  lang: string;
  signed_up_at: string;
}

export async function requestCustomerSignup(request: Request, db: D1Binding, app: D1Binding) {
  const input = await readD1Json(request, 12000);
  const fields = input as { lang?: unknown; preferences?: unknown } | null;
  const lang = fields?.lang;
  const parsed = nativeSignUpSchema.safeParse(input);
  const preferences = preferencesSchema.safeParse(fields?.preferences ?? {});
  if (!parsed.success || !preferences.success ||
      (lang !== "en" && lang !== "fr" && lang !== "es")) throw new D1ApiError(400, "invalid_signup_request");
  const { email, fullName, role, company_website } = parsed.data;
  if (company_website || email !== email.toLowerCase() || email.endsWith("@example.invalid")) return { token: null };
  const mailbox = normalizeEmail(email);
  const ready = await app.prepare(`SELECT 1 AS ready WHERE ${customerAppAuthority}`).first<{ ready: number }>();
  if (!ready) throw new D1ApiError(503, "customer_app_authority_unavailable");
  const token = newAccountToken();
  const now = Date.now();
  const [gate, write] = await db.batch<{ user_id: string }>([
    db.prepare(`SELECT CASE WHEN ${nativeAuthAuthority} THEN 1 ELSE json('native_auth_authority_unavailable') END`),
    db.prepare(`INSERT INTO _auth_pending_signup
        (mailbox,token_hash,user_id,email,name,role,lang,preferences,signed_up_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT ${existingMailbox}
      ON CONFLICT(mailbox) DO UPDATE SET token_hash=excluded.token_hash,email=excluded.email,
        name=excluded.name,role=excluded.role,lang=excluded.lang,preferences=excluded.preferences,
        signed_up_at=excluded.signed_up_at,expires_at=excluded.expires_at
      RETURNING user_id`).bind(mailbox, await hashAccountToken(token), crypto.randomUUID(), email,
        fullName ?? "", role, lang, JSON.stringify({ ...preferences.data, primary_role: role }), new Date(now).toISOString(),
        now + 15 * 60_000, mailbox),
  ]);
  if (!gate?.success || !write?.success) throw new D1ApiError(503, "signup_unavailable");
  return { token: write.results.length === 1 ? token : null };
}

export async function resendCustomerSignup(request: Request, db: D1Binding, app: D1Binding) {
  const parsed = forgotPasswordSchema.safeParse(await readD1Json(request, 1024));
  if (!parsed.success) throw new D1ApiError(400, "invalid_signup_request");
  const email = parsed.data.email.toLowerCase();
  const ready = await app.prepare(`SELECT 1 AS ready WHERE ${customerAppAuthority}`).first<{ ready: number }>();
  if (!ready) throw new D1ApiError(503, "customer_app_authority_unavailable");
  const mailbox = normalizeEmail(email);
  const token = newAccountToken();
  const now = Date.now();
  const [gate, write] = await db.batch<{ user_id: string }>([
    db.prepare(`SELECT CASE WHEN ${nativeAuthAuthority} THEN 1 ELSE json('native_auth_authority_unavailable') END`),
    db.prepare(`UPDATE _auth_pending_signup SET token_hash=?, expires_at=?
      WHERE mailbox=? AND email=? AND confirmed=0 AND expires_at<=? AND NOT ${existingMailbox}
      RETURNING user_id`).bind(await hashAccountToken(token), now + 15 * 60_000, mailbox, email, now + 14 * 60_000, mailbox),
  ]);
  if (!gate?.success || !write?.success) throw new D1ApiError(503, "signup_unavailable");
  return { token: write.results.length === 1 ? token : null };
}

export async function finishCustomerSignup(request: Request, db: D1Binding, app: D1Binding) {
  const input = await readD1Json(request, 1024) as { token?: unknown; password?: unknown } | null;
  const token = input?.token;
  const password = input?.password;
  if (typeof token !== "string" || !accountTokenPattern.test(token) ||
      typeof password !== "string" || password.length < 8 || new TextEncoder().encode(password).length > 72) {
    throw new D1ApiError(400, "invalid_signup_token");
  }
  const tokenHash = await hashAccountToken(token);
  const unexpired = "token_hash=? AND (confirmed=1 OR expires_at>CAST(strftime('%s','now') AS INTEGER)*1000)";
  const intent = await db.prepare(`SELECT mailbox,user_id,email,name,role,lang,signed_up_at
    FROM _auth_pending_signup WHERE ${unexpired} AND ${nativeAuthAuthority}`)
    .bind(tokenHash).first<PendingSignup>();
  if (!intent || !UUID.test(intent.user_id)) throw new D1ApiError(400, "invalid_signup_token");
  const { user_id: id, email, name, role, lang, signed_up_at: signedUpAt } = intent;
  const appReady = await app.prepare(`SELECT 1 AS ready WHERE ${customerAppAuthority}`).first<{ ready: number }>();
  if (!appReady) throw new D1ApiError(503, "customer_app_authority_unavailable");
  const passwordHash = await hashCustomerPassword(password);
  // Persist email confirmation and the credential together. If profile provisioning fails,
  // the verified intent can retry and get-session denies app access until a profile exists.
  const authResults = await db.batch([
    db.prepare(`SELECT CASE WHEN ${nativeAuthAuthority} AND NOT EXISTS (
      SELECT 1 FROM user WHERE ${mailboxKey}=? AND id<>?
      ) AND EXISTS (SELECT 1 FROM _auth_pending_signup WHERE ${unexpired} AND user_id=?)
      THEN 1 ELSE json('native_signup_unavailable') END`).bind(intent.mailbox, id, tokenHash, id),
    db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned)
      SELECT user_id,name,email,1,signed_up_at,signed_up_at,'user',0 FROM _auth_pending_signup
      WHERE token_hash=? AND confirmed=0 ON CONFLICT(id) DO NOTHING`).bind(tokenHash),
    db.prepare(`INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt)
      SELECT 'credential:'||user_id,user_id,'credential',user_id,?,signed_up_at,signed_up_at
      FROM _auth_pending_signup WHERE token_hash=? AND confirmed=0 ON CONFLICT(id) DO NOTHING`).bind(passwordHash, tokenHash),
    db.prepare(`INSERT INTO _auth_source_metadata(user_id,metadata)
      SELECT user_id,json_object('raw_user_meta_data',json(preferences),'raw_app_meta_data',json('{}'))
      FROM _auth_pending_signup WHERE token_hash=? AND confirmed=0 ON CONFLICT(user_id) DO NOTHING`).bind(tokenHash),
    db.prepare("UPDATE _auth_pending_signup SET confirmed=1 WHERE token_hash=?").bind(tokenHash),
  ]);
  if (authResults.length !== 5 || authResults.some(r => !r.success)) throw new D1ApiError(503, "signup_unavailable");
  const appResults = await app.batch([
    app.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND NOT EXISTS (
      SELECT 1 FROM users_profile WHERE (id=? AND email<>?) OR (lower(email)=? AND id<>?)
      ) THEN 1 ELSE json('customer_profile_conflict') END`).bind(id, email, email, id),
    app.prepare("INSERT INTO _auth_users(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(id),
    app.prepare(`INSERT INTO users_profile(id,email,full_name,primary_role)
      VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(id, email, name, role),
    app.prepare(`INSERT INTO email_consents(user_id,scope,source,wording_version,lang,created_at)
      VALUES(?,'service','signup_form',?,?,?) ON CONFLICT(user_id,scope,source) DO NOTHING`)
      .bind(id, EMAIL_NOTICE_VERSION, lang, signedUpAt),
  ]);
  if (appResults.length !== 4 || appResults.some(r => !r.success)) throw new D1ApiError(503, "signup_profile_unavailable");
  await db.prepare("DELETE FROM _auth_pending_signup WHERE token_hash=? AND confirmed=1").bind(tokenHash).run();
  return { ok: true };
}
