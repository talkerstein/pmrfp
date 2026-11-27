import { handleCustomerAuth } from "../../../workers/d1-api/customer-auth";
import { vpsDatabase } from "./http-binding";
import { createPrivateR2Binding } from "./private-r2-binding";

/** Called from the VPS app server. This handler is not exposed as a public route. */
export function callVpsCustomer(request: Request, env: Record<string, string | undefined> = process.env, fetcher = fetch) {
  const {
    PMRFP_D1_AUTH_DATABASE_ID: authId = "",
    PMRFP_D1_APP_DATABASE_ID: appId = "",
    PMRFP_VPS_D1_TRANSPORT_KEY: transportKey,
    PMRFP_CUSTOMER_AUTH_ORIGIN: origin = "",
    PMRFP_CUSTOMER_AUTH_GATEWAY_SECRET: gateway = "",
    PMRFP_CUSTOMER_AUTH_SESSION_SECRET: secret = "",
  } = env;
  if (env.PMRFP_VPS_CUSTOMER_ENGINE !== "d1" || gateway.length < 32 || secret.length < 32 ||
      (transportKey === undefined && authId.toLowerCase() === appId.toLowerCase()) || new URL(origin).origin !== origin ||
      !origin.startsWith("https://") || env.NEXT_PUBLIC_SUPABASE_URL ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("VPS customer engine is unavailable");
  }
  return handleCustomerAuth(request, {
    MODE: "customer-native",
    AUTH_ORIGIN: origin,
    GATEWAY_SECRET: gateway,
    AUTH_SECRET: secret,
    AUTH_DB: vpsDatabase("auth", env, fetcher),
    APP_DB: vpsDatabase("app", env, fetcher),
    PRIVATE_PROJECT_PHOTOS: env.PMRFP_PRIVATE_R2_GATEWAY_KEY
      ? createPrivateR2Binding(env.PMRFP_PRIVATE_R2_GATEWAY_KEY, fetcher) : undefined,
    STRIPE_BILLING_GATEWAY_SECRET: env.PMRFP_STRIPE_BILLING_GATEWAY_SECRET,
    STRIPE_PRICE_TRADE_PRO_MONTHLY: env.STRIPE_PRICE_TRADE_PRO_MONTHLY,
    STRIPE_PRICE_TRADE_PRO_ANNUAL: env.STRIPE_PRICE_TRADE_PRO_ANNUAL,
    STRIPE_PRICE_FEATURED_ANNUAL: env.STRIPE_PRICE_FEATURED_ANNUAL,
    STRIPE_PRICE_REALTOR_ANNUAL: env.STRIPE_PRICE_REALTOR_ANNUAL,
    STRIPE_PRICE_SEO_MONTHLY: env.STRIPE_PRICE_SEO_MONTHLY,
    STRIPE_PRICE_SEO_ANNUAL: env.STRIPE_PRICE_SEO_ANNUAL,
  });
}
