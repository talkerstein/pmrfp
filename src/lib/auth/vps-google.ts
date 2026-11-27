import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import type { TokenPayload } from "google-auth-library";
import { DEFAULT_LOCALE, isEnabledLocale } from "@/i18n/config";
import { safeNextPath } from "./next";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsDatabase } from "@/lib/d1/http-binding";
import { isVpsNativeAccountSignup } from "@/lib/d1/staging-config";
import { provisionVpsGoogleProfile } from "./vps-google-provision";
import { nativeAuthAuthority } from "../../../workers/d1-api/customer-password-reset";
import { isServiceConfigured } from "@/lib/supabase/config";

export const googleOrigin = "https://pmrfp.com";
export const googleCallback = googleOrigin + "/api/auth/callback/google";
export const googleStateCookie = "__Host-pmrfp-google-state";
export const googleStateOptions = { path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge: 600 } as const;
const randomVerifier = () => randomBytes(32).toString("base64url");
const verifierPattern = /^[A-Za-z0-9_-]{43}$/;

export function googleDashboardBridgeEnabled() {
  return !isVpsLiveCustomerAuth() && process.env.PMRFP_VPS_GOOGLE_DASHBOARD_BRIDGE === "enabled" && isServiceConfigured();
}

export function nativeGoogleConfigured() {
  return (isVpsLiveCustomerAuth() || googleDashboardBridgeEnabled()) &&
    /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(process.env.PMRFP_GOOGLE_OAUTH_CLIENT_ID ?? "") &&
    /^GOCSPX-[A-Za-z0-9_-]{15,128}$/.test(process.env.PMRFP_GOOGLE_OAUTH_CLIENT_SECRET ?? "");
}

function client() {
  if (!nativeGoogleConfigured()) throw new Error("Google sign-in unavailable");
  return new OAuth2Client(process.env.PMRFP_GOOGLE_OAUTH_CLIENT_ID, process.env.PMRFP_GOOGLE_OAUTH_CLIENT_SECRET, googleCallback);
}

export function beginGoogleSignIn(next: string | null, locale: string | null, signup = false) {
  const state = {
    id: randomVerifier(),
    nonce: randomVerifier(),
    verifier: randomVerifier(),
    next: safeNextPath(next),
    signup: signup && isVpsNativeAccountSignup(),
    lang: isEnabledLocale(locale) ? locale : DEFAULT_LOCALE,
    expires: Date.now() + googleStateOptions.maxAge * 1000,
  };
  const challenge = createHash("sha256").update(state.verifier).digest("base64url");
  const url = client().generateAuthUrl({
    scope: ["openid", "email"],
    access_type: "online",
    code_challenge: challenge,
    code_challenge_method: CodeChallengeMethod.S256,
    state: state.id,
  });
  const authorization = new URL(url);
  authorization.searchParams.set("nonce", state.nonce);
  return { authorization, cookie: Buffer.from(JSON.stringify(state)).toString("base64url") };
}

export function readGoogleState(value: string | undefined, returned: string | null) {
  if (!value || value.length > 2048 || !returned || !verifierPattern.test(returned)) return null;
  try {
    const saved = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!saved || !verifierPattern.test(saved.id) || !verifierPattern.test(saved.verifier) ||
        !verifierPattern.test(saved.nonce) || !Number.isSafeInteger(saved.expires) || saved.expires <= Date.now() ||
        saved.expires > Date.now() + googleStateOptions.maxAge * 1000 ||
        !timingSafeEqual(Buffer.from(saved.id), Buffer.from(returned))) return null;
    return {
      verifier: saved.verifier as string,
      nonce: saved.nonce as string,
      next: safeNextPath(typeof saved.next === "string" ? saved.next : null),
      signup: saved.signup === true && isVpsNativeAccountSignup(),
      lang: isEnabledLocale(saved.lang) ? saved.lang : DEFAULT_LOCALE,
    };
  } catch {
    return null;
  }
}

export function verifiedGoogleEmail(payload: (TokenPayload & { nonce?: string }) | undefined, nonce: string) {
  if (!payload || payload.nonce !== nonce || payload.email_verified !== true || !payload.email ||
      !/^[0-9]{1,64}$/.test(payload.sub) || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(payload.email) ||
      payload.email.length > 320) return null;
  const email = payload.email.toLowerCase();
  const domain = email.split("@")[1];
  // Third-party addresses can outlive their association with a Google account.
  // Only Gmail or the current Google Workspace domain proves mailbox control.
  return domain === "gmail.com" || payload.hd?.toLowerCase() === domain ? email : null;
}

async function verifyGoogleSignIn(code: string, state: NonNullable<ReturnType<typeof readGoogleState>>) {
  const google = client();
  const { tokens } = await google.getToken({ code, codeVerifier: state.verifier, redirect_uri: googleCallback });
  if (!tokens.id_token) return null;
  const ticket = await google.verifyIdToken({ idToken: tokens.id_token, audience: process.env.PMRFP_GOOGLE_OAUTH_CLIENT_ID });
  const payload = ticket.getPayload();
  const email = verifiedGoogleEmail(payload, state.nonce);
  const rehearsalEmail = process.env.PMRFP_GOOGLE_OAUTH_REHEARSAL_EMAIL;
  return !payload || !email || (rehearsalEmail && email !== rehearsalEmail) ? null : { email, subject: payload.sub };
}

export async function finishGoogleSignIn(code: string, state: NonNullable<ReturnType<typeof readGoogleState>>) {
  const identity = await verifyGoogleSignIn(code, state);
  if (!identity) return null;
  const { email, subject } = identity;
  if (googleDashboardBridgeEnabled()) {
    return { dashboardEmail: email } as const;
  }
  const rehearsalEmail = process.env.PMRFP_GOOGLE_OAUTH_REHEARSAL_EMAIL;
  const existing = await findOrLinkGoogleAccount(email, subject);
  if (rehearsalEmail) return existing ? { nativeEmail: existing } as const : null;
  if (existing || state.signup) {
    const provisioned = await provisionVpsGoogleProfile(vpsDatabase("auth"), vpsDatabase("app"), {
      email, subject, lang: state.lang, allowCreate: Boolean(state.signup && !existing),
    });
    const nativeEmail = existing ?? provisioned;
    return nativeEmail ? { nativeEmail } as const : null;
  }
  return null;
}

async function findOrLinkGoogleAccount(email: string, sub: string) {
  const db = vpsDatabase("auth");
  const account = "google:" + sub;
  const eligible = `u.email=? AND u.emailVerified=1 AND
    (u.banned=0 OR (u.banned=1 AND julianday(u.banExpires)<=julianday('now')))`;
  const stamp = new Date().toISOString();
  const [write, read] = await db.batch<{ email: string }>([
    db.prepare(`INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt)
      SELECT ?,?,'google',u.id,?,? FROM user u WHERE ${eligible} AND ${nativeAuthAuthority}
       AND NOT EXISTS (SELECT 1 FROM account a WHERE a.providerId='google' AND a.userId=u.id)
      ON CONFLICT(id) DO NOTHING`).bind(account, sub, stamp, stamp, email),
    db.prepare(`SELECT u.email FROM account a JOIN user u ON u.id=a.userId
      WHERE a.id=? AND a.accountId=? AND a.providerId='google' AND ${eligible} AND ${nativeAuthAuthority}`)
      .bind(account, sub, email),
  ]);
  return write?.success && read?.success && read.results.length === 1 ? read.results[0].email : null;
}
