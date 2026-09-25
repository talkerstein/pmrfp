import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WIDGET_PATH_RE,
  clampLimit,
  feedSegment,
  iframeSnippet,
  outLink,
  scriptSnippet,
  widgetPath,
} from "@/lib/embed/widgets";
import { bidsWidgetKey, isValidBidsKey } from "@/lib/embed/keys";

const BASE = "https://pmrfp.com";

describe("website widgets", () => {
  it("builds one cacheable path per widget, with 'all' as the feed wildcard", () => {
    expect(widgetPath({ kind: "feed", trade: "snow-removal", region: "toronto" })).toBe("feed/snow-removal/toronto");
    expect(widgetPath({ kind: "feed", trade: null, region: "toronto" })).toBe("feed/all/toronto");
    expect(widgetPath({ kind: "company", slug: "orbit-landscaping" })).toBe("company/orbit-landscaping");
    expect(widgetPath({ kind: "bids", slug: "acme-pm", key: "abc123" })).toBe("bids/acme-pm/abc123");
    expect(widgetPath({ kind: "trusted", handle: "jane-doe" })).toBe("trusted/jane-doe");
  });

  it("never lets odd input into a feed path", () => {
    expect(feedSegment("../admin")).toBe("all");
    expect(feedSegment("Snow Removal")).toBe("all");
    expect(feedSegment("")).toBe("all");
  });

  it("the loader only frames widget paths", () => {
    for (const ok of ["feed/all/all", "company/orbit-landscaping", "bids/acme/0f3a", "jobs/acme", "trusted/jane"]) {
      expect(WIDGET_PATH_RE.test(ok)).toBe(true);
    }
    for (const bad of ["../dashboard", "company/../admin", "feed/all", "bids/acme", "company/x/y", "javascript:alert(1)", "dashboard"]) {
      expect(WIDGET_PATH_RE.test(bad)).toBe(false);
    }
  });

  it("keeps the loader script's path check identical to the app's", () => {
    const loader = readFileSync(join(process.cwd(), "public", "embed.js"), "utf8");
    expect(loader).toContain(`var PATH = ${WIDGET_PATH_RE.source.replace(/^/, "/").replace(/$/, "/")};`);
  });

  it("clamps how many items a widget shows", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(99)).toBe(10);
    expect(clampLimit("3")).toBe(3);
    expect(clampLimit("x")).toBe(5);
  });

  it("writes paste-in code with a working fallback link and display options in the hash", () => {
    const code = scriptSnippet(BASE, { kind: "feed", trade: "roofing", region: null }, { theme: "dark", limit: 4 });
    expect(code).toContain('data-pmrfp="feed/roofing/all"');
    expect(code).toContain('data-theme="dark"');
    expect(code).toContain('data-limit="4"');
    expect(code).toContain(`href="${BASE}/rfps?category=roofing"`);
    expect(code).toContain(`<script async src="${BASE}/embed.js"></script>`);
    const frame = iframeSnippet(BASE, { kind: "company", slug: "acme" }, { theme: "light", limit: 5 });
    expect(frame).toContain(`src="${BASE}/embed/company/acme#theme=light"`);
    expect(frame).not.toContain("limit=");
  });

  it("tags links out of a widget so sign-ups trace back to it", () => {
    const u = new URL(outLink(BASE, "/rfps/abc?x=1", "feed"));
    expect(u.pathname).toBe("/rfps/abc");
    expect(u.searchParams.get("x")).toBe("1");
    expect(u.searchParams.get("utm_source")).toBe("widget");
    expect(u.searchParams.get("utm_campaign")).toBe("feed");
  });
});

describe("bids widget keys", () => {
  const secret = "test-secret";

  it("are stable per org and different across orgs", () => {
    const a = bidsWidgetKey("org-a", secret)!;
    expect(a).toMatch(/^[0-9a-f]{20}$/);
    expect(bidsWidgetKey("org-a", secret)).toBe(a);
    expect(bidsWidgetKey("org-b", secret)).not.toBe(a);
  });

  it("only accept the org's own key", () => {
    const a = bidsWidgetKey("org-a", secret)!;
    expect(isValidBidsKey("org-a", a, secret)).toBe(true);
    expect(isValidBidsKey("org-b", a, secret)).toBe(false);
    expect(isValidBidsKey("org-a", a.slice(0, 19), secret)).toBe(false);
    expect(isValidBidsKey("org-a", a, "other-secret")).toBe(false);
    expect(isValidBidsKey("org-a", a, null)).toBe(false);
  });
});
