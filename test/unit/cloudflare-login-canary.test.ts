import { describe, expect, it, vi } from "vitest";
import {
  cloudflareCanaryConfig, cloudflareCanarySession, cloudflareCanarySignIn, cloudflareCanarySignOut,
} from "@/lib/auth/cloudflare-canary";

const until = Date.now() + 60_000;
const env = {
  VERCEL_ENV: "production",
  PMRFP_CLOUDFLARE_LOGIN_CANARY_KEY: "a".repeat(64),
  PMRFP_CLOUDFLARE_LOGIN_CANARY_UNTIL: new Date(until).toISOString(),
};
const config = cloudflareCanaryConfig(env)!;
const token = "synthetic.token%2Fencoded";
const user = { id: "00000000-0000-4000-8000-000000000011", email: "migration-11@example.invalid", emailVerified: true, banned: false };
const password = "synthetic-password";

describe("production Cloudflare login canary", () => {
  it("requires production, a valid key, and a bounded lease", () => {
    expect(config).toBeTruthy();
    expect(cloudflareCanaryConfig({ ...env, VERCEL_ENV: "preview" })).toBeNull();
    expect(cloudflareCanaryConfig({ ...env, PMRFP_CLOUDFLARE_LOGIN_CANARY_KEY: "wrong" })).toBeNull();
    expect(cloudflareCanaryConfig(env, until)).toBeNull();
    expect(cloudflareCanaryConfig(env, until - 3 * 60 * 60 * 1000)).toBeNull();
  });

  it("never relays other accounts and rejects a mismatched or banned upstream identity", async () => {
    const upstream = vi.fn<typeof fetch>();
    expect(await cloudflareCanarySignIn(config, { email: "different@example.invalid", password }, upstream)).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
    for (const mismatch of [{ id: "another" }, { emailVerified: false }, { banned: true }]) {
      upstream.mockResolvedValueOnce(Response.json({ user: { ...user, ...mismatch } }));
      expect(await cloudflareCanarySignIn(config, { email: user.email, password }, upstream)).toBeNull();
    }
  });

  it("accepts exactly the synthetic session and revokes through the Worker", async () => {
    const upstream = vi.fn<typeof fetch>();
    upstream.mockResolvedValueOnce(Response.json({ user }, {
      headers: { "set-cookie": "__Secure-better-auth.session_token=" + token + "; Path=/; Secure; HttpOnly" },
    }));
    expect(await cloudflareCanarySignIn(config, { email: user.email, password }, upstream)).toBe(token);
    expect(upstream.mock.calls[0][0]).toMatch(/^https:\/\/pmrfp-auth-synthetic-preview\.pmrfp\.workers\.dev\//);
    upstream.mockResolvedValueOnce(Response.json({ user, session: { userId: user.id, expiresAt: new Date(until).toISOString() } }));
    expect(await cloudflareCanarySession(config, token, upstream)).toBe(true);
    upstream.mockResolvedValueOnce(Response.json({ success: true }));
    expect(await cloudflareCanarySignOut(config, token, upstream)).toBe(true);
    expect(upstream.mock.calls[2][1]).toMatchObject({ method: "POST", redirect: "error" });
    upstream.mockResolvedValueOnce(Response.json(null));
    expect(await cloudflareCanarySession(config, token, upstream)).toBe(false);
  });
});
