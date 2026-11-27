import { customerLoginLinkAuth } from "../../scripts/d1-auth/customer-login-link.mjs";
import { D1ApiError, UUID, readD1Json, type D1Binding } from "../../src/lib/d1/contracts";
import { accountTokenPattern, hashAccountToken, nativeAuthAuthority } from "./customer-password-reset";

const eligible = `u.emailVerified=1 AND (u.banned=0 OR (u.banned=1 AND julianday(u.banExpires)<=julianday('now')))
  AND u.email NOT LIKE '%@example.invalid'`;
const prefix = "pmrfp-login-link:";
const fiveMinutes = 300_000;

export async function requestCustomerLoginLink(request: Request, db: D1Binding, secret: string, origin: string) {
  const input = await readD1Json(request, 768) as { email?: unknown; proof?: unknown } | null;
  const email = input?.email;
  const proof = input?.proof;
  if (typeof email !== "string" || email.length > 320 || email !== email.toLowerCase() ||
      typeof proof !== "string" || !accountTokenPattern.test(proof) ||
      !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(email)) throw new D1ApiError(400, "invalid_login_link_request");
  const user = await db.prepare(`SELECT u.id FROM user u WHERE email=? AND ${eligible} AND ${nativeAuthAuthority}`)
    .bind(email).first<{ id: string }>();
  if (!user || !UUID.test(user.id)) return { token: null };
  let issued: string | null = null;
  const auth = customerLoginLinkAuth(db, secret, origin, { expectedUser: undefined, capture: async (recipient: string, token: string) => {
    if (recipient !== email || !accountTokenPattern.test(token)) throw new Error("Unexpected email sign-in response");
    const now = new Date();
    const receipt = await db.prepare(`INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt)
      SELECT ?,?,?,?,?,? WHERE ${nativeAuthAuthority}
      ON CONFLICT(id) DO UPDATE SET identifier=excluded.identifier,value=excluded.value,
        expiresAt=excluded.expiresAt,updatedAt=excluded.updatedAt RETURNING id`)
      .bind(prefix + user.id, prefix + await hashAccountToken(token), JSON.stringify({ email, proof }), new Date(now.getTime() + fiveMinutes).toISOString(),
        now.toISOString(), now.toISOString()).first<{ id: string }>();
    if (receipt) issued = token;
  } });
  const response = await auth.handler(new Request(new URL("/api/auth/sign-in/magic-link", origin), {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email }),
  }));
  if (!response.ok) throw new D1ApiError(503, "customer_auth_unavailable");
  return { token: issued };
}

export async function finishCustomerLoginLink(request: Request, db: D1Binding, secret: string, origin: string) {
  const input = await readD1Json(request, 192) as { token?: unknown; proof?: unknown } | null;
  const token = input?.token;
  const proof = input?.proof;
  if (typeof token !== "string" || !accountTokenPattern.test(token) || typeof proof !== "string" ||
      !accountTokenPattern.test(proof)) throw new D1ApiError(400, "invalid_login_link");
  const claimed = await db.prepare(`DELETE FROM verification WHERE identifier=? AND julianday(expiresAt)>julianday('now')
    AND ${nativeAuthAuthority} AND json_extract(value,'$.proof')=? AND EXISTS (SELECT 1 FROM user u
      WHERE verification.id=?||u.id AND json_extract(verification.value,'$.email')=u.email AND ${eligible})
    RETURNING id,json_extract(value,'$.email') AS email`)
    .bind(prefix + await hashAccountToken(token), proof, prefix).first<{ id: string; email: string }>();
  const id = claimed?.id.slice(prefix.length);
  if (!claimed || !id || !UUID.test(id)) throw new D1ApiError(401, "invalid_login_link");
  const auth = customerLoginLinkAuth(db, secret, origin, { capture: undefined, expectedUser: { id, email: claimed.email } });
  const verify = new URL("/api/auth/magic-link/verify", origin);
  verify.searchParams.set("token", token);
  const response = await auth.handler(new Request(verify, { headers: { origin } }));
  if (!response.ok) throw new D1ApiError(401, "invalid_login_link");
  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return new Response(null, { status: 204, headers });
}
