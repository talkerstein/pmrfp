import { applyIntelSubscription } from "./stripe-intel";
import { applyFoundingCheckout } from "./stripe-founding";
import { applyPaidMarketplaceCheckout, applyPaidTradeCheckout, applyRecurringSubscriptionState, recordExpiredCheckout, recordSpotlightCheckout } from "./stripe-subscription";
import type { D1BillingPrices } from "../../src/lib/stripe/d1-prices";
import { customerPasswordAuth } from "../../scripts/d1-auth/customer-auth.mjs";
import { D1ApiError, parseSaveInput, readD1Json, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { verifyGateway } from "./auth";
import { finishCustomerPasswordReset, nativeAuthAuthority, requestCustomerPasswordReset } from "./customer-password-reset";
import { finishCustomerLoginLink, requestCustomerLoginLink } from "./customer-login-link";
import { finishCustomerSignup, readCustomerSignupPreferences, requestCustomerSignup, resendCustomerSignup } from "./customer-signup";
import { chooseCustomerRole, completeCustomerOnboarding, customerRolePick } from "./customer-onboarding";
import { readCustomerSession } from "./customer-session";
import { handleNativeProjectPhoto, type SandboxBucket } from "./project-photos";
import { changeStagingSavedRfp, listStagingSavedRfps } from "./saved-rfps";

interface Env extends D1BillingPrices {
  MODE: string;
  AUTH_ORIGIN: string;
  GATEWAY_SECRET: string;
  AUTH_SECRET: string;
  AUTH_DB: D1Binding;
  STRIPE_BILLING_GATEWAY_SECRET?: string;
  APP_DB: D1Binding;
  PRIVATE_PROJECT_PHOTOS?: SandboxBucket;
}

const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const billingWrites = {
  "/v1/billing/intel-subscription": applyIntelSubscription,
  "/v1/billing/founding-checkout": applyFoundingCheckout,
  "/v1/billing/expired-checkout": recordExpiredCheckout,
  "/v1/billing/spotlight-checkout": recordSpotlightCheckout,
  "/v1/billing/paid-trade-checkout": applyPaidTradeCheckout,
  "/v1/billing/subscription-state": applyRecurringSubscriptionState,
  "/v1/billing/marketplace-feature": applyPaidMarketplaceCheckout,
};
const recoveryWrites = {
  "/v1/account/reset-request": requestCustomerPasswordReset,
  "/v1/account/reset": finishCustomerPasswordReset,
  "/v1/account/signup-request": requestCustomerSignup,
  "/v1/account/signup-resend": resendCustomerSignup,
  "/v1/account/signup-confirm": finishCustomerSignup,
};
const operations = {
  "/api/auth/sign-in/email": "POST",
  "/api/auth/get-session": "GET",
  "/api/auth/sign-out": "POST",
  "/v1/saved-rfps": "GET",
  "/v1/account/signup-preferences": "GET",
} as const;

export async function handleCustomerAuth(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (Object.hasOwn(billingWrites, url.pathname)) {
      const billingWrite = billingWrites[url.pathname as keyof typeof billingWrites];
      if (env.MODE !== "customer-native" || url.protocol !== "https:" ||
          url.origin !== env.AUTH_ORIGIN || url.search) {
        throw new D1ApiError(404, "not_found");
      }
      return Response.json(await billingWrite(request, env), { headers });
    }
    await verifyGateway(request.headers.get("x-pmrfp-auth-gateway"), env.GATEWAY_SECRET);
    const native = env.MODE === "customer-native";
    if ((!native && env.MODE !== "customer-staging") || env.AUTH_ORIGIN !== url.origin ||
      url.protocol !== "https:" || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
      throw new D1ApiError(503, "customer_auth_unavailable");
    }
    if (url.pathname === "/v1/account/login-link-request" || url.pathname === "/v1/account/login-link") {
      if (!native || url.search) throw new D1ApiError(404, "not_found");
      if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
      if (request.headers.get("origin") !== url.origin) throw new D1ApiError(403, "invalid_origin");
      if (url.pathname.endsWith("-request")) {
        return Response.json(await requestCustomerLoginLink(request, env.AUTH_DB, env.AUTH_SECRET, url.origin), { headers });
      }
      const response = await finishCustomerLoginLink(request, env.AUTH_DB, env.AUTH_SECRET, url.origin);
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      return response;
    }
    if (Object.hasOwn(recoveryWrites, url.pathname)) {
      if (!native || url.search) throw new D1ApiError(404, "not_found");
      if (request.method !== "POST") throw new D1ApiError(405, "method_not_allowed");
      if (request.headers.get("origin") !== url.origin) throw new D1ApiError(403, "invalid_origin");
      const recover = recoveryWrites[url.pathname as keyof typeof recoveryWrites];
      return Response.json(await recover(request, env.AUTH_DB, env.APP_DB), { headers });
    }
    const savedRfps = url.pathname === "/v1/saved-rfps";
    const onboarding = url.pathname === "/v1/account/onboarding";
    const rolePick = url.pathname === "/v1/account/choose-role";
    const signupPreferences = url.pathname === "/v1/account/signup-preferences";
    const projectPhoto = url.pathname.startsWith("/v1/project-photos/");
    if ((onboarding || signupPreferences || rolePick || projectPhoto) && !native) throw new D1ApiError(404, "not_found");
    if (projectPhoto && request.method !== "GET" && request.method !== "HEAD") throw new D1ApiError(405, "method_not_allowed");
    const method = projectPhoto ? request.method : onboarding || rolePick || (savedRfps && request.method === "POST")
      ? "POST" : operations[url.pathname as keyof typeof operations];
    if (!method || url.search) throw new D1ApiError(404, "not_found");
    if (request.method !== method) throw new D1ApiError(405, "method_not_allowed");
    let input: unknown;
    if (method === "POST") {
      if (request.headers.get("origin") !== url.origin) throw new D1ApiError(403, "invalid_origin");
      input = await readD1Json(request, onboarding ? 12000 : 2048);
      if (typeof input !== "object" || !input || Array.isArray(input)) throw new D1ApiError(400, "invalid_request");
    }
    if (url.pathname === "/api/auth/sign-in/email") {
      const { email, password } = input as Record<string, unknown>;
      if (typeof email !== "string" || email.length > 320 || email !== email.toLowerCase() ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.endsWith("@example.invalid") ||
        typeof password !== "string" || password.length < 1 || new TextEncoder().encode(password).length > 72 ||
        Object.keys(input as object).length !== 2) throw new D1ApiError(400, "invalid_credentials");
    } else if (method === "POST" && !savedRfps && !onboarding && !rolePick && Object.keys(input as object).length !== 0) {
      throw new D1ApiError(400, "invalid_request");
    }

    // An independently synchronized serving database is required. The sealed
    // mirror and synthetic rehearsal databases deliberately lack this marker.
    const now = Date.now();
    if (native) {
      const marker = await env.AUTH_DB.prepare(`SELECT 1 AS id WHERE ${nativeAuthAuthority}`)
        .first<{ id: number }>();
      if (marker?.id !== 1) throw new D1ApiError(503, "customer_auth_not_current");
    } else {
      const marker = await env.AUTH_DB.prepare(
        "SELECT verified_at FROM _auth_customer_staging WHERE id=1 AND mode='customer-staging-v1'",
      ).first<{ verified_at: string }>();
      const verified = Date.parse(marker?.verified_at ?? "");
      if (!Number.isFinite(verified) || verified > now + 5000 || now - verified > 90_000) {
        throw new D1ApiError(503, "customer_auth_not_current");
      }
    }

    const auth = customerPasswordAuth(env.AUTH_DB, env.AUTH_SECRET, env.AUTH_ORIGIN);
    if (method === "GET" || savedRfps || onboarding || rolePick || projectPhoto) {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user.emailVerified || !UUID.test(session.user.id) || session.user.email.endsWith("@example.invalid")) {
        throw new D1ApiError(401, "sign_in_required");
      }
      const user = await env.AUTH_DB.prepare('SELECT emailVerified, banned, banExpires FROM user WHERE id=?')
        .bind(session.user.id).first<{ emailVerified: number; banned: number; banExpires: string | null }>();
      const banExpires = Date.parse(user?.banExpires ?? "");
      if (user?.emailVerified !== 1 || (user.banned !== 0 && !(user.banned === 1 && banExpires <= now))) {
        throw new D1ApiError(401, "sign_in_required");
      }
      if (projectPhoto) return await handleNativeProjectPhoto(env.APP_DB, env.PRIVATE_PROJECT_PHOTOS, request, session.user.id);
      if (onboarding) return Response.json(await completeCustomerOnboarding(env.APP_DB, session.user.id, input), { headers });
      if (signupPreferences || rolePick) {
        const metadata = await readCustomerSignupPreferences(env.AUTH_DB, session.user.id);
        if (rolePick) return Response.json(await chooseCustomerRole(env.APP_DB, session.user.id, metadata.primary_role, input), { headers });
        const picked = await customerRolePick(env.APP_DB, session.user.id);
        return Response.json({ ...metadata, ...picked }, { headers });
      }
      if (savedRfps) {
        const timestamp = new Date(now).toISOString();
        if (method === "POST") {
          await changeStagingSavedRfp(env.APP_DB, env.AUTH_DB, session.user.id, parseSaveInput(input), timestamp);
          return Response.json({ ok: true }, { headers });
        }
        return Response.json({ items: await listStagingSavedRfps(env.APP_DB, env.AUTH_DB, session.user.id, timestamp) }, { headers });
      }
      return Response.json(await readCustomerSession(env.APP_DB, session.user.id, new Date(now)), { headers });
    }

    const passwordLogin = native && url.pathname === "/api/auth/sign-in/email";
    const credentialVersion = passwordLogin ? env.AUTH_DB.prepare(`SELECT a.updatedAt FROM account a
      JOIN user u ON u.id=a.userId WHERE u.email=? AND a.providerId='credential' AND a.accountId=u.id`)
      .bind((input as { email: string }).email) : null;
    const versionBefore = await credentialVersion?.first<{ updatedAt: string }>();
    const forwarded = new Request(request, { body: JSON.stringify(input) });
    const response = await auth.handler(forwarded);
    if (response.ok && credentialVersion &&
        versionBefore?.updatedAt !== (await credentialVersion.first<{ updatedAt: string }>())?.updatedAt) {
      // A reset that raced this sign-in invalidates the password used to create the cookie.
      throw new D1ApiError(401, "sign_in_required");
    }
    const securedHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) securedHeaders.set(key, value);
    return new Response(response.body, { status: response.status, headers: securedHeaders });
  } catch (error) {
    const status = error instanceof D1ApiError ? error.status : 503;
    const code = error instanceof D1ApiError ? error.code : "customer_auth_unavailable";
    return Response.json({ error: code }, { status, headers });
  }
}

export default { fetch: handleCustomerAuth };
