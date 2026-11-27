import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { finishNativeSignInLink, signInAction, signInLinkAction, signOutAction } from "@/lib/auth/actions";
import { getCustomerStagingSession } from "@/lib/d1/customer-staging-session";
import { matchesCustomerOrigin } from "@/lib/d1/staging-config";

const checks = vi.hoisted(() => ({
  cookie: { get: vi.fn(), set: vi.fn() },
  call: vi.fn<(request: Request) => Promise<Response>>(),
  limit: vi.fn<(kind: string, key: string) => Promise<{ status: number }>>(),
  turnstile: vi.fn(),
  mail: vi.fn(),
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  redirect: vi.fn((path: string) => { throw new Error(path); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => checks.cookie, headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: checks.redirect }));
vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: checks.after,
}));
vi.mock("@/lib/d1/vps-customer", () => ({ callVpsCustomer: checks.call }));
vi.mock("@/lib/d1/staging-turnstile-server", () => ({ verifyStagingTurnstile: checks.turnstile }));
vi.mock("@/lib/email/smtp", () => ({ sendHostingerMail: checks.mail }));
vi.mock("@/lib/d1/staging-rate-limit", () => ({
  checkStagingRateLimit: checks.limit,
  stagingClientIp: () => "192.0.2.7",
}));

const token = "test-session-token.signed";
const id = "f3eb0244-2247-4fff-b1f3-008388cc3cd7";
const session = {
  userId: id,
  profile: { id, status: "active", onboarding_completed: true, avatar_url: null },
  organization: null,
};

function form() {
  const fields = new FormData();
  fields.set("lang", "fr");
  fields.set("email", "CUSTOMER@example.test");
  fields.set("password", "fixture-password");
  fields.set("next", "/dashboard");
  fields.set("cf-turnstile-response", "test-turnstile");
  return fields;
}

beforeEach(() => {
  vi.stubEnv("PMRFP_VPS_LIVE_AUTH", "enabled");
  vi.stubEnv("PMRFP_VPS_CUSTOMER_ENGINE", "d1");
  vi.stubEnv("PMRFP_CUSTOMER_AUTH_ORIGIN", "https://pmrfp.com");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pmrfp.com");
  vi.stubEnv("PMRFP_CUSTOMER_AUTH_GATEWAY_SECRET", "fixture".repeat(5));
  vi.stubEnv("PMRFP_VPS_D1_TRANSPORT_KEY", "fixture");
  checks.limit.mockResolvedValue({ status: 204 });
  checks.turnstile.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it("sets the production session cookie and redirects to the localized customer destination", async () => {
  checks.call.mockResolvedValueOnce(new Response(null, {
    headers: { "set-cookie": "__Secure-better-auth.session_token=" + token + "; Secure; HttpOnly" },
  })).mockResolvedValueOnce(Response.json(session));

  await expect(signInAction({}, form())).rejects.toThrow("/fr/dashboard");
  expect(checks.limit.mock.calls).toEqual([["auth-ip", "192.0.2.7"], ["auth-account", "customer@example.test"]]);
  expect(checks.turnstile).toHaveBeenCalledWith("test-turnstile", "192.0.2.7", "customer_sign_in");
  expect(checks.call.mock.calls[0][0].url).toBe("https://pmrfp.com/api/auth/sign-in/email");
  expect(checks.call.mock.calls[1][0].headers.get("cookie")).toBe("__Secure-better-auth.session_token=" + token);
  expect(checks.cookie.set).toHaveBeenCalledWith("__Host-pmrfp-customer", token, {
    path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 3600,
  });
});

it("blocks over-limit and unverified requests before invoking the password verifier", async () => {
  checks.limit.mockResolvedValueOnce({ status: 429 });
  expect(await signInAction({}, form())).toHaveProperty("error");
  checks.turnstile.mockResolvedValueOnce(false);
  expect(await signInAction({}, form())).toHaveProperty("error");
  checks.limit.mockResolvedValueOnce({ status: 204 }).mockResolvedValueOnce({ status: 429 });
  expect(await signInAction({}, form())).toHaveProperty("error");
  expect(checks.call).not.toHaveBeenCalled();
  expect(checks.cookie.set).not.toHaveBeenCalled();
});

it("checks the public origin when Next serves the request through the private proxy", () => {
  const behindProxy = "https://0.0.0.0:4323/api/save-rfp";
  expect(matchesCustomerOrigin(new Request(behindProxy, { headers: { origin: "https://pmrfp.com" } }))).toBe(true);
  expect(matchesCustomerOrigin(new Request(behindProxy, { headers: { origin: "https://0.0.0.0:4323" } }))).toBe(false);
});

it("reads the same production cookie on protected requests and revokes it at sign-out", async () => {
  checks.cookie.get.mockReturnValue({ value: token });
  checks.call.mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json({ success: true }));
  expect(await getCustomerStagingSession()).toEqual(session);
  expect(checks.cookie.get).toHaveBeenCalledWith("__Host-pmrfp-customer");
  await expect(signOutAction()).rejects.toThrow();
  expect(checks.call.mock.calls[1][0].url).toBe("https://pmrfp.com/api/auth/sign-out");
  expect(checks.cookie.set).toHaveBeenCalledWith("__Host-pmrfp-customer", "", expect.objectContaining({ maxAge: 0 }));
});

it("emails a fragment link and requires the original browser before asking D1 to redeem it", async () => {
  const linkToken = "a".repeat(64);
  checks.call.mockResolvedValueOnce(Response.json({ token: linkToken }));
  expect(await signInLinkAction({}, form())).toHaveProperty("success");
  expect(checks.call).not.toHaveBeenCalled();
  expect(checks.mail).not.toHaveBeenCalled();
  await checks.after.mock.calls[0][0]();
  expect(checks.mail).toHaveBeenCalledWith(expect.objectContaining({
    to: "customer@example.test",
    html: expect.stringContaining("https://pmrfp.com/fr/sign-in?link=complete&amp;next=%2Fdashboard#" + linkToken),
  }));
  expect(checks.turnstile).toHaveBeenCalledWith("test-turnstile", "192.0.2.7", "customer_sign_in_link");
  expect(checks.cookie.set).toHaveBeenCalledWith("__Host-pmrfp-login-link", expect.stringMatching(/^[a-f0-9]{64}$/), expect.objectContaining({
    httpOnly: true, secure: true, maxAge: 300,
  }));
  const proof = checks.cookie.set.mock.calls[0][1];
  expect(proof).not.toBe(linkToken);
  const redeem = form();
  redeem.set("token", linkToken);
  expect(await finishNativeSignInLink({}, redeem)).toHaveProperty("error");
  expect(checks.call).toHaveBeenCalledTimes(1);
  checks.cookie.get.mockReturnValue({ value: proof });
  checks.call.mockResolvedValueOnce(new Response(null, {
    status: 204, headers: { "set-cookie": "__Secure-better-auth.session_token=" + token + "; Secure; HttpOnly" },
  })).mockResolvedValueOnce(Response.json(session));
  await expect(finishNativeSignInLink({}, redeem)).rejects.toThrow("/fr/dashboard");
  expect(checks.call.mock.calls[1][0].url).toBe("https://pmrfp.com/v1/account/login-link");
  const issued = await checks.call.mock.calls[0][0].json();
  const redeemed = await checks.call.mock.calls[1][0].json();
  expect(redeemed).toEqual({ token: linkToken, proof: issued.proof });
  expect(redeemed.proof).not.toBe(proof);
  expect(checks.cookie.set).toHaveBeenCalledWith("__Host-pmrfp-login-link", "", expect.objectContaining({ maxAge: 0 }));
});
