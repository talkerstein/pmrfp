import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import type { SessionContext } from "../access/access";
import { UUID } from "./contracts";
import { nativePreviewTokenPattern } from "./native-auth-preview";
import { isVpsLiveCustomerAuth, isHostingerCloudflareStaging, usesD1CustomerAuth } from "./staging-config";
import { publicRfpPhotoSource } from "./public-asset-preview";

function hostedPublicImage(url: string | null): string | null {
  if (!url) return null;
  const mapped = publicRfpPhotoSource(url);
  if (mapped.unoptimized) return mapped.src;
  try {
    return new URL(url).hostname.endsWith(".supabase.co") ? null : url;
  } catch {
    return url.startsWith("/") && !url.startsWith("//") ? url : null;
  }
}

const cookieName = () => isVpsLiveCustomerAuth() ? "__Host-pmrfp-customer" : "__Host-pmrfp-customer-staging";
const upstreamCookie = "__Secure-better-auth.session_token";
const options = { path: "/", httpOnly: true, secure: true, sameSite: "lax" as const };
const loginLinkCookie = "__Host-pmrfp-login-link";
const loginLinkProof = (nonce: string) => createHash("sha256").update(nonce).digest("hex");

async function call(path: string, { token, body, head }: { token?: string; body?: object; head?: boolean }) {
  if (!usesD1CustomerAuth()) return Response.json({ error: "customer_auth_unavailable" }, { status: 503 });
  try {
    const origin = new URL(process.env.PMRFP_CUSTOMER_AUTH_ORIGIN ?? "");
    const secret = process.env.PMRFP_CUSTOMER_AUTH_GATEWAY_SECRET;
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" ||
      origin.search || origin.hash || !secret || secret.length < 32) throw new Error("Invalid customer auth configuration");
    if (isVpsLiveCustomerAuth() && (origin.origin !== "https://pmrfp.com" ||
        process.env.PMRFP_VPS_CUSTOMER_ENGINE !== "d1" || !process.env.PMRFP_VPS_D1_TRANSPORT_KEY)) {
      throw new Error("Invalid production customer auth configuration");
    }
    const request = new Request(new URL(path, origin), {
      method: body ? "POST" : head ? "HEAD" : "GET",
      headers: {
        "x-pmrfp-auth-gateway": secret,
        ...(body ? { "content-type": "application/json", origin: origin.origin } : {}),
        ...(token ? { cookie: upstreamCookie + "=" + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1") {
      const { callVpsCustomer } = await import("./vps-customer");
      return await callVpsCustomer(request);
    }
    return await fetch(request);
  } catch {
    return Response.json({ error: "customer_auth_unavailable" }, { status: 503 });
  }
}

export async function resolveVpsCustomerSession(token: string): Promise<SessionContext | null> {
  const response = await call("/api/auth/get-session", { token });
  if (!response.ok) return null;
  try {
    const result = await response.json() as SessionContext;
    if (!UUID.test(result.userId) || result.profile?.id !== result.userId || result.profile.status !== "active") return null;
    if (isHostingerCloudflareStaging() || isVpsLiveCustomerAuth()) {
      result.profile.avatar_url = hostedPublicImage(result.profile.avatar_url);
      if (result.organization) result.organization.logo_url = hostedPublicImage(result.organization.logo_url);
    }
    return result;
  } catch {
    return null;
  }
}

export async function readCustomerWebSessionToken() {
  const token = (await cookies()).get(cookieName())?.value;
  return token && nativePreviewTokenPattern.test(token) ? token : undefined;
}

export const getCustomerStagingSession = cache(async () => {
  const token = await readCustomerWebSessionToken();
  return token ? resolveVpsCustomerSession(token) : null;
});

export async function requestCustomerStagingReset(email: string) {
  return requestAccountLink("/v1/account/reset-request", { email });
}

export async function requestVpsCustomerLoginLink(email: string, proof: string) {
  return requestAccountLink("/v1/account/login-link-request", { email, proof });
}

export async function bindVpsCustomerLoginLink() {
  const nonce = randomBytes(32).toString("hex");
  (await cookies()).set(loginLinkCookie, nonce, { ...options, maxAge: 300 });
  return loginLinkProof(nonce);
}

export async function finishVpsCustomerLoginLink(token: string) {
  const store = await cookies();
  const nonce = store.get(loginLinkCookie)?.value;
  if (!nonce || !/^[0-9a-f]{64}$/.test(nonce)) return null;
  const response = await call("/v1/account/login-link", { body: { token, proof: loginLinkProof(nonce) } });
  const session = await establishCustomerSession(response);
  if (session) store.set(loginLinkCookie, "", { ...options, maxAge: 0 });
  return session;
}

/** Called only after the VPS has verified the Google code and matched its account binding. */
export async function establishVpsGoogleSession(email: string) {
  const proof = loginLinkProof(randomBytes(32).toString("hex"));
  const token = await requestVpsCustomerLoginLink(email, proof);
  if (!token) return null;
  return establishCustomerSession(await call("/v1/account/login-link", { body: { token, proof } }));
}

export async function requestCustomerStagingSignup(input: { email: string; fullName?: string; role: string; lang: string; preferences: object }) {
  return requestAccountLink("/v1/account/signup-request", input);
}

export async function resendCustomerStagingSignup(email: string) {
  return requestAccountLink("/v1/account/signup-resend", { email });
}

export const customerStagingSignupPreferences = cache(async (): Promise<Record<string, unknown>> => {
  const token = await readCustomerWebSessionToken();
  if (!token) return {};
  const response = await call("/v1/account/signup-preferences", { token });
  return response.ok ? await response.json() : {};
});

async function requestAccountLink(path: string, body: object) {
  const response = await call(path, { body });
  if (!response.ok) throw new Error("Account recovery unavailable");
  const { token } = await response.json();
  if (token === null) return null;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid recovery response");
  return token;
}

export async function finishCustomerStagingReset(token: string, password: string) {
  return completeAccountLink("/v1/account/reset", token, password);
}

export async function finishCustomerStagingSignup(token: string, password: string) {
  return completeAccountLink("/v1/account/signup-confirm", token, password);
}

async function completeAccountLink(path: string, token: string, password: string) {
  const response = await call(path, { body: { token, password } });
  if (!response.ok || (await response.json()).ok !== true) return false;
  (await cookies()).delete(cookieName());
  return true;
}

export async function signInCustomerStaging(email: string, password: string) {
  return establishCustomerSession(await call("/api/auth/sign-in/email", { body: { email, password } }));
}

async function establishCustomerSession(response: Response) {
  if (!response.ok) return null;
  const tokens = response.headers.getSetCookie().filter(value => value.startsWith(upstreamCookie + "="));
  const token = tokens.length === 1 ? tokens[0].split(";", 1)[0].slice(upstreamCookie.length + 1) : "";
  if (!nativePreviewTokenPattern.test(token)) return null;
  const session = await resolveVpsCustomerSession(token);
  if (!session) {
    await call("/api/auth/sign-out", { token, body: {} });
    return null;
  }
  (await cookies()).set(cookieName(), token, { ...options, maxAge: 3600 });
  return session;
}

export async function signOutCustomerStaging() {
  const token = await readCustomerWebSessionToken();
  if (token) await call("/api/auth/sign-out", { token, body: {} });
  (await cookies()).set(cookieName(), "", { ...options, maxAge: 0 });
}

export async function customerStagingSavedRfps(body?: object) {
  const token = await readCustomerWebSessionToken();
  return token ? call("/v1/saved-rfps", { token, body }) : Response.json({ error: "sign_in_required" }, { status: 401 });
}

export async function customerVpsProjectPhoto(projectId: string, fileId: string, head = false, mobileToken?: string) {
  const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE !== "d1" ||
      !UUID.test(projectId) || !UUID.test(fileId)) return new Response(null, { status: 404, headers });
  const token = mobileToken ?? await readCustomerWebSessionToken();
  if (!token) return new Response(null, { status: 404, headers });
  const response = await call(`/v1/project-photos/${projectId}/${fileId}.jpg`, { token, head });
  if (!response.ok) {
    await response.body?.cancel();
    return new Response(null, { status: response.status >= 500 ? 503 : 404, headers });
  }
  return response;
}

export async function completeCustomerStagingOnboarding(body: object) {
  const token = await readCustomerWebSessionToken();
  return token ? call("/v1/account/onboarding", { token, body }) : Response.json({ error: "sign_in_required" }, { status: 401 });
}

export async function chooseCustomerStagingRole(body: { role: string; award: string | null }) {
  const token = await readCustomerWebSessionToken();
  return token ? call("/v1/account/choose-role", { token, body }) : Response.json({ error: "sign_in_required" }, { status: 401 });
}
