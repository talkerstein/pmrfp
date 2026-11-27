import { afterEach, expect, it, vi } from "vitest";
import { forgotPasswordAction, signInLinkAction } from "../../src/lib/auth/actions";

const checks = vi.hoisted(() => ({
  reset: vi.fn(async (_email: string) => "a".repeat(64)),
  mail: vi.fn(async (_message: { to: string; html: string }) => ({ accepted: true })),
  turnstile: vi.fn(async () => true),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitByIp: async () => null }));
vi.mock("@/lib/d1/staging-rate-limit", () => ({
  checkStagingRateLimit: async () => ({ status: 204 }),
  stagingClientIp: () => "192.0.2.1",
}));
vi.mock("@/lib/d1/customer-staging-session", () => ({ requestCustomerStagingReset: checks.reset }));
vi.mock("@/lib/d1/staging-turnstile-server", () => ({ verifyStagingTurnstile: checks.turnstile }));
vi.mock("@/lib/email/smtp", () => ({ sendHostingerMail: checks.mail }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("uses the recovery worker and formats a VPS reset link only from the forgot-password action", async () => {
  vi.stubEnv("PMRFP_HOSTINGER_CLOUDFLARE_STAGING", "enabled");
  vi.stubEnv("PMRFP_ISOLATED_D1_STAGING", "enabled");
  vi.stubEnv("PMRFP_STAGING_ACCOUNT_MODE", "customers");
  vi.stubEnv("PMRFP_VPS_NATIVE_ACCOUNT_RECOVERY", "enabled");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pmrfp-vps.talkerstein.ca");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const form = new FormData();
  form.set("email", "Customer@example.test");
  form.set("lang", "fr");
  form.set("cf-turnstile-response", "test-only-token");
  await signInLinkAction({}, form);
  expect(checks.reset).not.toHaveBeenCalled();
  expect(await forgotPasswordAction({}, form)).toHaveProperty("success");
  expect(checks.turnstile).toHaveBeenCalledWith("test-only-token", "192.0.2.1", "account_recovery");
  expect(checks.reset).toHaveBeenCalledWith("customer@example.test");
  expect(checks.mail).toHaveBeenCalledWith(expect.objectContaining({
    to: "customer@example.test",
    html: expect.stringContaining("https://pmrfp-vps.talkerstein.ca/fr/reset-password#" + "a".repeat(64)),
  }));
});
