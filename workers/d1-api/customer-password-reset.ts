import { hashCustomerPassword } from "../../scripts/d1-auth/rehearsal.mjs";
import { D1ApiError, UUID, readD1Json, type D1Binding } from "../../src/lib/d1/contracts";

export const nativeAuthAuthority = `EXISTS (SELECT 1 FROM _auth_native_authority WHERE id=1 AND mode='native-v1')
  AND NOT EXISTS (SELECT 1 FROM _auth_customer_staging WHERE id=1)`;
export const accountTokenPattern = /^[a-f0-9]{64}$/;
const emailPattern = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
export const hashAccountToken = async (value: string) =>
  hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
export const newAccountToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const eligible = `(u.banned=0 OR (u.banned=1 AND julianday(u.banExpires)<=julianday('now')))
  AND u.email NOT LIKE '%@example.invalid'
  AND (u.emailVerified=1 OR EXISTS (SELECT 1 FROM _auth_source_metadata WHERE user_id=u.id))`;

export async function requestCustomerPasswordReset(request: Request, db: D1Binding) {
  const input = await readD1Json(request, 768);
  const email = (input as { email?: unknown } | null)?.email;
  if (typeof email !== "string" || email.length > 320 || email !== email.toLowerCase() || !emailPattern.test(email)) {
    throw new D1ApiError(400, "invalid_reset_request");
  }
  const token = newAccountToken();
  const expiresAt = Date.now() + 15 * 60_000;
  const [gate, receipt] = await db.batch<{ user_id: string }>([
    db.prepare(`SELECT CASE WHEN ${nativeAuthAuthority} THEN 1 ELSE json('native_auth_authority_unavailable') END`),
    db.prepare(`INSERT INTO _auth_password_resets(token_hash,user_id,email,expires_at)
      SELECT ?,u.id,u.email,? FROM user u WHERE u.email=? AND ${eligible}
      ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,email=excluded.email,
        expires_at=excluded.expires_at
      RETURNING user_id`).bind(await hashAccountToken(token), expiresAt, email),
  ]);
  if (!gate?.success || !receipt?.success) throw new D1ApiError(503, "account_recovery_unavailable");
  const userId = receipt.results[0]?.user_id;
  // The private VPS caller receives the link. The browser receives a generic response.
  return userId && UUID.test(userId) ? { token } : { token: null };
}

export async function finishCustomerPasswordReset(request: Request, db: D1Binding) {
  const input = await readD1Json(request, 1024) as { token?: unknown; password?: unknown } | null;
  const token = input?.token;
  const password = input?.password;
  if (typeof token !== "string" || !accountTokenPattern.test(token) ||
      typeof password !== "string" || password.length < 8 || new TextEncoder().encode(password).length > 72) {
    throw new D1ApiError(400, "invalid_reset_request");
  }
  const tokenHash = await hashAccountToken(token);
  const current = `SELECT u.id FROM _auth_password_resets r JOIN user u ON u.id=r.user_id AND u.email=r.email
    WHERE r.token_hash=? AND r.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND ${eligible}`;
  const candidate = await db.prepare(`${current} AND ${nativeAuthAuthority}`).bind(tokenHash).first<{ id: string }>();
  if (!candidate || !UUID.test(candidate.id)) throw new D1ApiError(400, "invalid_or_expired_reset");
  const encoded = await hashCustomerPassword(password);
  const timestamp = new Date().toISOString();
  const result = await db.batch([
    db.prepare(`SELECT CASE WHEN ${nativeAuthAuthority} THEN 1 ELSE json('native_auth_authority_unavailable') END`),
    db.prepare(`SELECT CASE WHEN EXISTS (${current}) THEN 1 ELSE json('reset_token_unavailable') END`).bind(tokenHash),
    db.prepare(`UPDATE account SET password=?,updatedAt=? WHERE providerId='credential' AND accountId=userId
      AND userId=(${current})`).bind(encoded, timestamp, tokenHash),
    db.prepare(`INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt)
      SELECT 'credential:'||u.id,u.id,'credential',u.id,?,?,? FROM user u WHERE u.id=(${current})
      AND NOT EXISTS (SELECT 1 FROM account WHERE providerId='credential' AND userId=u.id)`)
      .bind(encoded, timestamp, timestamp, tokenHash),
    db.prepare(`SELECT CASE WHEN (SELECT count(*)=1 AND min(accountId=userId AND password=?)=1
      FROM account WHERE providerId='credential' AND userId=(${current}))
      THEN 1 ELSE json('reset_credential_unavailable') END`).bind(encoded, tokenHash),
    // A migrated, unconfirmed account proves mailbox ownership by redeeming
    // the emailed token. Replace its old credential before confirming it.
    db.prepare(`UPDATE user SET emailVerified=1,updatedAt=?
      WHERE id=(${current}) AND emailVerified=0`).bind(timestamp, tokenHash),
    db.prepare(`DELETE FROM session WHERE userId=(${current})`).bind(tokenHash),
    db.prepare("DELETE FROM _auth_password_resets WHERE token_hash=?").bind(tokenHash),
  ]);
  if (result.length !== 8 || result.some(row => !row.success)) throw new D1ApiError(503, "account_recovery_unavailable");
  return { ok: true };
}
