import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { TokenPayload } from "google-auth-library";
import { beginGoogleSignIn, googleCallback, readGoogleState, verifiedGoogleEmail } from "@/lib/auth/vps-google";

afterEach(() => vi.unstubAllEnvs());

it("binds the returned state and nonce to a private PKCE verifier and safe destination", () => {
  vi.stubEnv("PMRFP_VPS_LIVE_AUTH", "enabled");
  vi.stubEnv("PMRFP_GOOGLE_OAUTH_CLIENT_ID", "123-test.apps.googleusercontent.com");
  vi.stubEnv("PMRFP_GOOGLE_OAUTH_CLIENT_SECRET", "GOCSPX-test-not-a-real-secret");
  const { authorization, cookie } = beginGoogleSignIn("//untrusted.example", "en");
  expect(authorization.origin).toBe("https://accounts.google.com");
  expect(authorization.searchParams.get("redirect_uri")).toBe(googleCallback);
  expect(authorization.searchParams.get("access_type")).toBe("online");
  expect(authorization.searchParams.get("scope")).toBe("openid email");
  const state = readGoogleState(cookie, authorization.searchParams.get("state"));
  expect(state?.next).toBeNull();
  expect(state?.nonce).toBe(authorization.searchParams.get("nonce"));
  expect(authorization.searchParams.get("code_challenge")).toBe(createHash("sha256").update(state!.verifier).digest("base64url"));
  expect(readGoogleState(cookie, "z".repeat(43))).toBeNull();
});

it("rejects a mismatched nonce and addresses whose mailbox Google cannot verify", () => {
  const payload = { sub: "1234", email: "member@company.example", email_verified: true, nonce: "bound" } as TokenPayload & { nonce: string };
  expect(verifiedGoogleEmail(payload, "bound")).toBeNull();
  expect(verifiedGoogleEmail({ ...payload, hd: "other.example" }, "bound")).toBeNull();
  expect(verifiedGoogleEmail({ ...payload, hd: "company.example" }, "different")).toBeNull();
  expect(verifiedGoogleEmail({ ...payload, hd: "company.example" }, "bound")).toBe("member@company.example");
  expect(verifiedGoogleEmail({ ...payload, email: "member@gmail.com", email_verified: false }, "bound")).toBeNull();
  expect(verifiedGoogleEmail({ ...payload, email: "member@gmail.com" }, "bound")).toBe("member@gmail.com");
});

it("uses the production rate limiter for VPS Google during the dashboard transition", async () => {
  const { checkStagingRateLimit, stagingClientIp } = await import("@/lib/d1/staging-rate-limit");
  vi.stubEnv("PMRFP_VPS_LIVE_AUTH", undefined);
  vi.stubEnv("PMRFP_AUTH_LIMITER_SECRET", "a".repeat(64));
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const ip = stagingClientIp(new Headers({
      "x-forwarded-for": "192.0.2.4, 192.0.2.5",
      "x-vercel-forwarded-for": "192.0.2.7",
    }), true);
    expect(ip).toBe("192.0.2.5");
    await expect(checkStagingRateLimit("auth-ip", ip, true)).resolves.toEqual({ status: 204 });
    expect(fetcher).toHaveBeenCalledWith("https://pmrfp-production-rate-limit.pmrfp.workers.dev/v1/consume",
      expect.objectContaining({ method: "POST", cache: "no-store" }));
  } finally {
    vi.unstubAllGlobals();
  }
});
