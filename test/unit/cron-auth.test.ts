import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { GET as lifecycle } from "@/app/api/cron/lifecycle/route";
import { runBadgeRewards } from "@/lib/badge/server";
import { runLifecycle } from "@/lib/lifecycle/server";

vi.mock("@/lib/badge/server", () => ({
  runBadgeRewards: vi.fn().mockResolvedValue({
    enabled: false, skipped: "fixture", considered: 0, refused: 0, granted: [],
  }),
}));
vi.mock("@/lib/lifecycle/server", () => ({
  runLifecycle: vi.fn().mockResolvedValue({ enabled: false, skipped: "fixture" }),
}));

it("blocks the cron route at ingress when its secret is absent or the bearer is wrong", async () => {
  const request = (authorization?: string) =>
    new NextRequest("https://pmrfp.com/api/cron/lifecycle", {
      headers: authorization ? { authorization } : undefined,
    });

  try {
    vi.stubEnv("PMRFP_ISOLATED_D1_STAGING", "");
    vi.stubEnv("CRON_SECRET", "");
    expect((await proxy(request())).status).toBe(503);
    expect((await proxy(request("Bearer arbitrary"))).status).toBe(503);

    vi.stubEnv("CRON_SECRET", "local-cron-fixture");
    expect((await proxy(request())).status).toBe(401);
    expect((await proxy(request("Bearer wrong"))).status).toBe(401);

    const permitted = new NextRequest("https://pmrfp.com/api/cron/lifecycle?dry=1", {
      headers: { authorization: "Bearer local-cron-fixture" },
    });
    expect((await proxy(permitted)).headers.get("x-middleware-next")).toBe("1");
    const response = await lifecycle(permitted);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dry: true, skipped: "fixture" });
    expect(runBadgeRewards).toHaveBeenCalledExactlyOnceWith({ dry: true });
    expect(runLifecycle).toHaveBeenCalledExactlyOnceWith({ dry: true });

    vi.stubEnv("PMRFP_HOSTINGER_CLOUDFLARE_STAGING", "enabled");
    vi.stubEnv("PMRFP_ISOLATED_D1_STAGING", "enabled");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect((await proxy(permitted)).status).toBe(404);
  } finally {
    vi.unstubAllEnvs();
  }
});
