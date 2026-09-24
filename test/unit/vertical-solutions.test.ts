import { afterEach, describe, expect, it, vi } from "vitest";
import { liveSolutionFor, solutionForTrade, VERTICAL_SOLUTIONS } from "@/lib/partners/vertical-solutions";

afterEach(() => vi.unstubAllGlobals());

describe("vertical solutions", () => {
  it("shows a trade's block only once its Talkerstein page is live", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await liveSolutionFor("snow-removal")).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    expect((await liveSolutionFor("snow-removal"))?.name).toBe("Storm Log");
  });

  it("hides the block when the check fails, and for trades without a solution", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await liveSolutionFor("snow-removal")).toBeNull();

    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await liveSolutionFor("painting")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("keeps one solution per trade, each linking to its own talkerstein.com page", () => {
    const trades = VERTICAL_SOLUTIONS.map((s) => s.tradeSlug);
    expect(new Set(trades).size).toBe(trades.length);
    const hrefs = VERTICAL_SOLUTIONS.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const s of VERTICAL_SOLUTIONS) expect(s.href).toMatch(/^https:\/\/talkerstein\.com\/solutions\//);
    expect(solutionForTrade("snow-removal")?.anchor).toMatch(/snow removal/i);
  });
});
