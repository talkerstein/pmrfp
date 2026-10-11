import { describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ signal: null as AbortSignal | null, retry: vi.fn(), count: 7, error: null as { message: string } | null }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }));
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: () => ({ select: () => ({ like: () => ({ abortSignal: (signal: AbortSignal) => {
  fixture.signal = signal;
  return { retry: (enabled: boolean) => { fixture.retry(enabled); return Promise.resolve({ count: fixture.count, error: fixture.error }); } };
} }) }) }) }) }));
import { countLifetimeOrgs } from "@/lib/founding/server";

describe("founding count does not pile up retries", () => {
  it("uses a real cancellation signal and disables SDK retries", async () => {
    expect(await countLifetimeOrgs()).toBe(7);
    expect(fixture.signal).toBeInstanceOf(AbortSignal);
    expect(fixture.retry).toHaveBeenCalledWith(false);
  });
  it("fails closed when counting fails, rather than selling against an invented count", async () => {
    fixture.error = { message: "database timeout" };
    await expect(countLifetimeOrgs()).rejects.toThrow("database timeout");
    fixture.error = null;
  });
});
