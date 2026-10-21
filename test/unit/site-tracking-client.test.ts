// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _queuedForTests, _resetForTests, flushTracking, track, trackListingView, trackPageView, trackingAllowed } from "@/lib/tracking/client";
import { CONSENT_KEY, consentPending } from "@/components/analytics-consent";
import { CONSENT_ATTR } from "@/lib/tracking/ga";

/** The browser side respects Do-Not-Track / Global Privacy Control and never sends oversized beacons. */

function setSignals(s: { gpc?: boolean; dnt?: string | null }) {
  Object.defineProperty(navigator, "globalPrivacyControl", { value: s.gpc, configurable: true });
  Object.defineProperty(navigator, "doNotTrack", { value: s.dnt ?? null, configurable: true });
}

const sent: string[] = [];

beforeEach(() => {
  _resetForTests();
  setSignals({});
  sent.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(String(init.body));
    return new Response(null, { status: 204 });
  }));
  window.localStorage.clear();
  document.body.removeAttribute(CONSENT_ATTR);
});
afterEach(() => vi.unstubAllGlobals());

describe("lib/tracking/client", () => {
  it("queues page views, listing views and events, then sends them in one small POST", () => {
    trackPageView("/rfps", "https://www.google.com/search?q=roof");
    trackListingView("roof-ab12");
    track("pricing_viewed");
    expect(_queuedForTests()).toHaveLength(3);
    flushTracking();
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0]);
    expect(body.v).toBe(1);
    // Only the referring host leaves the browser, never the full address.
    expect(body.items[0]).toEqual({ t: "pv", p: "/rfps", r: "www.google.com" });
  });

  it("sends nothing when Global Privacy Control or Do-Not-Track is on", () => {
    for (const s of [{ gpc: true }, { dnt: "1" }]) {
      setSignals(s);
      expect(trackingAllowed()).toBe(false);
      trackPageView("/rfps");
      track("upgrade_clicked", { plan: "pro" });
    }
    expect(_queuedForTests()).toHaveLength(0);
    flushTracking();
    expect(sent).toHaveLength(0);
  });

  it("splits a long queue so no POST goes over the server's 4 KB cap", () => {
    for (let i = 0; i < 40; i++) trackPageView(`/${"p".repeat(150)}-${i}`);
    flushTracking();
    expect(sent.length).toBeGreaterThan(1);
    for (const b of sent) expect(new TextEncoder().encode(b).length).toBeLessThanOrEqual(4096);
  });
});

describe("cookie banner (GA4 / Clarity) and the privacy signals", () => {
  it("is pending only when a consent-gated tool is configured and nothing was chosen", () => {
    expect(consentPending()).toBe(false); // nothing configured
    document.body.setAttribute(CONSENT_ATTR, "");
    expect(consentPending()).toBe(true);
    window.localStorage.setItem(CONSENT_KEY, "denied");
    expect(consentPending()).toBe(false);
  });

  it("GPC / DNT count as declining: no banner is pending", () => {
    document.body.setAttribute(CONSENT_ATTR, "");
    setSignals({ gpc: true });
    expect(consentPending()).toBe(false);
    setSignals({ dnt: "1" });
    expect(consentPending()).toBe(false);
  });
});
