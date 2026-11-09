import { expect, it, vi } from "vitest";
import { handleNativeMobilePreview } from "../../src/lib/d1/native-mobile-preview";

const token = "signed.fixture.mobile-session-token";
const user = {
  id: "00000000-0000-4000-8000-000000000019",
  email: "profile-signup-19@example.invalid",
  emailVerified: true,
  banned: false,
};
const env = {
  VERCEL_ENV: "preview",
  PMRFP_NATIVE_AUTH_PREVIEW: "synthetic-only",
  PMRFP_NATIVE_MOBILE_PREVIEW: "enabled",
  PMRFP_NATIVE_AUTH_GATEWAY_SECRET: "synthetic-auth-gateway-at-least-32",
};
const base = "https://preview.invalid/api/migration/native-auth/";

it("returns only the dedicated signed token to mobile and converts a bearer to a private upstream cookie", async () => {
  const signIn = new Request(base + "mobile-sign-in", {
    method: "POST", headers: { "content-type": "application/json", cookie: "irrelevant=private" },
    body: JSON.stringify({ email: user.email, password: "synthetic-only" }),
  });
  const signedIn = await handleNativeMobilePreview(signIn, "mobile-sign-in", env, async (url, init) => {
    expect(String(url)).toMatch(/\/sign-in\/email$/);
    expect(new Headers(init?.headers).get("cookie")).toBeNull();
    return Response.json({ user, token: "private-upstream-token" }, {
      headers: { "set-cookie": "__Secure-better-auth.session_token=" + token },
    });
  });
  expect(signedIn.headers.get("set-cookie")).toBeNull();
  expect(await signedIn.json()).toEqual({ accessToken: token, user: { id: user.id, email: user.email } });

  const session = await handleNativeMobilePreview(new Request(base + "mobile-session", {
    headers: { authorization: "Bearer " + token, cookie: "ignored=private" },
  }), "mobile-session", env, async (url, init) => {
    expect(String(url)).toMatch(/\/get-session$/);
    const headers = new Headers(init?.headers);
    expect(headers.get("cookie")).toBe("__Secure-better-auth.session_token=" + token);
    expect(headers.get("authorization")).toBeNull();
    return Response.json({ user, session: { userId: user.id, expiresAt: "2099-01-01T00:00:00Z" } });
  });
  expect(await session.json()).toEqual({ user: { id: user.id, email: user.email } });
});

it("rejects production, browser-origin requests, cookies alone, and invalid bearer tokens before transport", async () => {
  const transport = vi.fn<typeof fetch>();
  const call = (headers: HeadersInit, config: Record<string, string> = env) =>
    handleNativeMobilePreview(new Request(base + "mobile-session", { headers }), "mobile-session", config, transport);
  expect((await call({ authorization: "Bearer " + token }, { ...env, VERCEL_ENV: "production" })).status).toBe(404);
  expect((await call({ authorization: "Bearer " + token, origin: "https://preview.invalid" })).status).toBe(400);
  expect((await call({ cookie: "pmrfp-native-preview=" + token })).status).toBe(401);
  expect((await call({ authorization: "Bearer invalid;injected" })).status).toBe(401);
  expect(transport).not.toHaveBeenCalled();
});
