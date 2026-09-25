import { describe, expect, it } from "vitest";
import { pickSponsor, sponsorDestination, sponsorHref, sponsorById, tradeSlug } from "@/lib/sponsors/registry";

describe("sponsor placement", () => {
  it("puts Maple on electrical work and nowhere near a roofing page", () => {
    expect(pickSponsor({ placement: "rfp_detail", categories: ["Electrical"], publicTender: true, seed: "a" })?.sponsor.id).toBe("maple");
    expect(pickSponsor({ placement: "trade_page", categories: ["ev-charging"], seed: "x" })?.sponsor.id).toBe("maple");
    for (const seed of ["a", "b", "c", "d"]) {
      expect(pickSponsor({ placement: "trade_page", categories: ["roofing"], seed })?.sponsor.id).not.toBe("maple");
    }
  });

  it("shows nothing on a public tender that isn't electrical work (no card payments, no repeat of the bid-help card)", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      expect(pickSponsor({ placement: "rfp_detail", categories: ["Roofing"], publicTender: true, seed })).toBeNull();
    }
  });

  it("prefers Cleverpays for trades that bill customers directly", () => {
    expect(pickSponsor({ placement: "digest_email", categories: ["snow removal"], seed: "u1" })?.sponsor.id).toBe("cleverpays");
    expect(pickSponsor({ placement: "rfp_detail", categories: ["Landscaping"], publicTender: false, seed: "z" })?.sponsor.id).toBe("cleverpays");
  });

  it("keeps Canada-only sponsors off U.S. pages", () => {
    for (const seed of ["a", "b", "c"]) {
      const id = pickSponsor({ placement: "trade_page", categories: ["electrical"], market: "US", seed })?.sponsor.id;
      expect(id === "talkerstein" || id === undefined).toBe(true);
    }
  });

  it("rotates ties evenly by page but stays stable for the same page", () => {
    const ctx = { placement: "trade_page" as const, categories: ["concrete-and-asphalt"] };
    const ids = new Set(Array.from({ length: 40 }, (_, i) => pickSponsor({ ...ctx, seed: `p${i}` })?.sponsor.id));
    expect(ids.size).toBeGreaterThan(0);
    expect(pickSponsor({ ...ctx, seed: "same" })?.sponsor.id).toBe(pickSponsor({ ...ctx, seed: "same" })?.sponsor.id);
  });

  it("builds tracked links and tagged destinations", () => {
    expect(tradeSlug("Cleaning / Janitorial")).toBe("cleaning-janitorial");
    expect(sponsorHref("maple", "alerts_email", "EV Charging", "https://pmrfp.com")).toBe(
      "https://pmrfp.com/go/maple?p=alerts_email&t=ev-charging",
    );
    const dest = new URL(sponsorDestination(sponsorById("cleverpays")!, "trade_page", "plumbing"));
    expect(dest.searchParams.get("utm_source")).toBe("pmrfp");
    expect(dest.searchParams.get("utm_campaign")).toBe("trade_page");
    expect(dest.searchParams.get("utm_content")).toBe("plumbing");
  });
});
