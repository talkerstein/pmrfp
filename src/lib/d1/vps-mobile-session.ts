import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { resolveVpsCustomerSession } from "./customer-staging-session";
import { vpsDatabase } from "./http-binding";
import { isVpsLiveCustomerAuth } from "./staging-config";

export const mobileSecretShape = /^[a-f0-9]{64}$/;
const hash = (value:string) => createHash("sha256").update(value).digest("hex");
const randomSecret = () => randomBytes(32).toString("hex");
const accessTtl = 7 * 86_400_000;

function encryptionKey() {
  const secret=process.env.PMRFP_CUSTOMER_AUTH_SESSION_SECRET;
  if (!secret || secret.length<32) throw Error("Mobile sign-in unavailable");
  return createHmac("sha256",secret).update("pmrfp/mobile/session/v1").digest();
}

function encrypt(token:string,digest:string) {
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  cipher.setAAD(Buffer.from(digest));
  const bytes=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString("base64url");
}

function decrypt(box:string,digest:string) {
  const bytes=Buffer.from(box,"base64url");
  const cipher=createDecipheriv("aes-256-gcm",encryptionKey(),bytes.subarray(0,12));
  cipher.setAAD(Buffer.from(digest));
  cipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString("utf8");
}

export async function issueVpsMobileCode(webToken:string,proof:string) {
  const code=randomSecret();
  const digest=hash(code);
  const db=vpsDatabase("auth");
  await db.batch([
    db.prepare("DELETE FROM _mobile_access WHERE expires_at<=?").bind(Date.now()),
    db.prepare("INSERT INTO _mobile_access(digest,kind,proof,encrypted_session,expires_at) VALUES(?,'code',?,?,?)")
      .bind(digest,proof,encrypt(webToken,digest),Date.now()+300_000),
  ]);
  return code;
}

export async function redeemVpsMobileCode(code:string,verifier:string) {
  if (!mobileSecretShape.test(code) || !mobileSecretShape.test(verifier)) return null;
  const db=vpsDatabase("auth");
  const digest=hash(code);
  const stored=await db.prepare(`DELETE FROM _mobile_access WHERE digest=? AND kind='code' AND proof=? AND expires_at>?
    RETURNING encrypted_session`).bind(digest,hash(verifier),Date.now()).first<{encrypted_session:string}>();
  if (!stored) return null;
  const webToken=decrypt(stored.encrypted_session,digest);
  const session=await resolveVpsCustomerSession(webToken);
  if (!session) return null;
  const token=randomSecret();
  const key=hash(token);
  await db.prepare("INSERT INTO _mobile_access(digest,kind,encrypted_session,expires_at) VALUES(?,'session',?,?)")
    .bind(key,encrypt(webToken,key),Date.now()+accessTtl).run();
  return token;
}

const extract = (request:Request) => /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
export async function readVpsMobileWebToken(request:Request) {
  const token=extract(request);
  if (!token || !isVpsLiveCustomerAuth()) return null;
  const digest=hash(token);
  const stored=await vpsDatabase("auth").prepare(`SELECT encrypted_session FROM _mobile_access
    WHERE digest=? AND kind='session' AND expires_at>?`).bind(digest,Date.now()).first<{encrypted_session:string}>();
  return stored ? decrypt(stored.encrypted_session,digest) : null;
}

export async function readVpsMobileSession(request:Request) {
  const token=await readVpsMobileWebToken(request);
  return token ? resolveVpsCustomerSession(token) : null;
}

export async function revokeVpsMobileSession(request:Request) {
  const token=extract(request);
  if (token) await vpsDatabase("auth").prepare("DELETE FROM _mobile_access WHERE digest=? AND kind='session'").bind(hash(token)).run();
}
