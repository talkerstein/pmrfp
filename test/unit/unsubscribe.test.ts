import { beforeAll, describe, expect, it } from "vitest";
import { unsubscribeUrl, verifyUnsubscribe } from "@/lib/email/unsubscribe";

describe("unsubscribe links", () => {
  beforeAll(() => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
  });

  it("round-trips for the right user", () => {
    const url = new URL(unsubscribeUrl("https://pmrfp.com", "user-1")!);
    expect(verifyUnsubscribe(url.searchParams.get("u"), url.searchParams.get("t"))).toBe(true);
  });

  it("rejects a token reused for another user, or a tampered/missing token", () => {
    const t = new URL(unsubscribeUrl("https://pmrfp.com", "user-1")!).searchParams.get("t");
    expect(verifyUnsubscribe("user-2", t)).toBe(false);
    expect(verifyUnsubscribe("user-1", `${t}x`)).toBe(false);
    expect(verifyUnsubscribe("user-1", null)).toBe(false);
  });
});
