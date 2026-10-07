import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createAuthReadFetch } from "@/lib/supabase/read-retry";
import { updateSession } from "@/lib/supabase/middleware";

const fixture = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn(() => ({ auth: { getUser: fixture.getUser } })) }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const base = "https://fixture.supabase.co";

it("recovers auth user verification without caching credentials", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  const transport = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "ETIMEDOUT" } })).mockResolvedValueOnce(new Response('{}'));
  await createAuthReadFetch(base, transport)(`${base}/auth/v1/user`, { headers: { authorization: "Bearer private" } });
  expect(transport).toHaveBeenCalledTimes(2);
  for (const call of transport.mock.calls) expect(call[1]?.cache).toBe("no-store");
});
it.each(["/auth/v1/token", "/auth/v1/logout", "/rest/v1/rpc/example"])("never retries auth mutations or RPCs: %s", async (path) => {
  const transport = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ETIMEDOUT" } }));
  await expect(createAuthReadFetch(base, transport)(`${base}${path}`, { method: "POST" })).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(1);
});
describe("protected routes during auth downtime", () => {
  it.each(["/dashboard", "/pm-dashboard", "/admin"])("returns uncached 503 instead of a misleading sign-in redirect: %s", async (path) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", base); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    fixture.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 0 } });
    const response = await updateSession(new NextRequest(`https://pmrfp.com${path}`, { headers: { cookie: "sb-fixture-auth-token=session" } }));
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("still redirects genuinely invalid sessions to sign-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", base); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    fixture.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 401 } });
    const response = await updateSession(new NextRequest("https://pmrfp.com/dashboard"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in?");
  });
});
