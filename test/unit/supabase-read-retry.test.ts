import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicReadFetch } from "@/lib/supabase/public-cache";

const base = "https://fixture.supabase.co";
const headers = { apikey: "anon", authorization: "Bearer anon" };
const url = `${base}/rest/v1/regions?select=id,name`;
const failure = (code: string) => new TypeError("fetch failed", { cause: Object.assign(new Error("connection"), { code }) });

afterEach(() => vi.restoreAllMocks());

describe("transient public table read recovery", () => {
  it.each(["ETIMEDOUT", "UND_ERR_SOCKET", "ECONNRESET", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"])("recovers once from %s with the same cache dependencies", async (code) => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const transport = vi.fn<typeof fetch>().mockRejectedValueOnce(failure(code)).mockResolvedValueOnce(new Response('[{"id":"a"}]'));
    const read = createPublicReadFetch(base, "anon", transport);
    expect(await (await read(url, { headers })).json()).toEqual([{ id: "a" }]);
    expect(transport).toHaveBeenCalledTimes(2);
    const [first, second] = transport.mock.calls;
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toMatchObject({ cache: "force-cache", next: { revalidate: 3600, tags: ["supabase-public-taxonomy"] } });
    expect(first[1]?.signal).toBeUndefined();
    expect(second[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(console.info).toHaveBeenCalledWith("supabase_read_retry", { path: "/rest/v1/regions", outcome: "recovered", status: 200 });
  });

  it.each([502, 503, 504])("releases a %s response before retrying", async (status) => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status });
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(response).mockResolvedValueOnce(new Response("[]"));
    expect((await createPublicReadFetch(base, "anon", transport)(url, { headers })).status).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("propagates the second failure without an unbounded retry or empty-data fallback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = failure("ETIMEDOUT");
    const transport = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(createPublicReadFetch(base, "anon", transport)(url, { headers })).rejects.toBe(error);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 429, 500])("does not retry HTTP %s", async (status) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("[]", { status }));
    expect((await createPublicReadFetch(base, "anon", transport)(url, { headers })).status).toBe(status);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    [url, "POST", headers],
    [`${base}/rest/v1/rpc/has_active_trade_access`, "GET", headers],
    [`${base}/auth/v1/user`, "GET", headers],
    [`${base}/storage/v1/object/a`, "GET", headers],
    [url, "GET", { ...headers, authorization: "Bearer user" }],
    [url, "GET", { ...headers, cookie: "session=private" }],
    ["https://other.example/rest/v1/regions", "GET", headers],
  ])("does not replay excluded request %s %s", async (target, method, requestHeaders) => {
    const error = failure("ETIMEDOUT");
    const transport = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(createPublicReadFetch(base, "anon", transport)(target, { method, headers: requestHeaders })).rejects.toBe(error);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not nest extra retries inside the SDK retry loop", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const transport = vi.fn<typeof fetch>().mockRejectedValue(failure("ETIMEDOUT"));
    const client = createClient(base, "anon", { auth: { persistSession: false }, global: { fetch: createPublicReadFetch(base, "anon", transport) } });
    const result = await client.from("regions").select("id");
    expect(result.error).not.toBeNull();
    // Initial attempt + one quick recovery + the SDK's existing three retries.
    expect(transport).toHaveBeenCalledTimes(5);
    for (const call of transport.mock.calls.slice(2)) expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("respects caller cancellation instead of retrying", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn<typeof fetch>().mockRejectedValue(failure("ETIMEDOUT"));
    await expect(createPublicReadFetch(base, "anon", transport)(url, { headers, signal: controller.signal })).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not retry programming or unknown errors", async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("invalid input"));
    await expect(createPublicReadFetch(base, "anon", transport)(url, { headers })).rejects.toThrow("invalid input");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
