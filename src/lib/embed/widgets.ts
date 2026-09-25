/**
 * Website widgets: live PMRFP content that anyone can paste into their own
 * site. Each widget is a small read-only page under /embed/* that other sites
 * frame; public/embed.js turns a <div data-pmrfp="…"> into an auto-sizing
 * iframe. Pure rules here (paths, snippets, options); pages in src/app/embed,
 * the builder at /widgets.
 *
 * Display options (theme, how many items) ride in the URL hash, which never
 * reaches the server, so every widget URL stays one cacheable ISR page.
 */

export const WIDGET_KINDS = ["feed", "bids", "jobs", "company", "trusted"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

export const WIDGET_THEMES = ["light", "dark"] as const;
export type WidgetTheme = (typeof WIDGET_THEMES)[number];

/** Most items a list widget renders; the hash `limit` shows fewer. */
export const MAX_ITEMS = 10;
export const DEFAULT_LIMIT = 5;

export type WidgetConfig =
  | { kind: "feed"; trade: string | null; region: string | null }
  | { kind: "jobs" | "company"; slug: string }
  /** `key` proves the org itself made this widget (see ./keys): its bids aren't public by slug. */
  | { kind: "bids"; slug: string; key: string }
  | { kind: "trusted"; handle: string };

export interface WidgetOptions {
  theme: WidgetTheme;
  /** List widgets only; ignored by the company card. */
  limit: number;
}

const SEGMENT = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

/** Slugs and handles only: lowercase letters, digits, inner hyphens. */
export function isSafeSegment(s: string | null | undefined): s is string {
  return typeof s === "string" && SEGMENT.test(s);
}

/** "all" is the feed's wildcard segment; anything else must be a clean slug. */
export function feedSegment(s: string | null | undefined): string {
  return isSafeSegment(s) && s !== "all" ? s : "all";
}

/** The widget's path under /embed, e.g. "feed/snow-removal/toronto". */
export function widgetPath(w: WidgetConfig): string {
  switch (w.kind) {
    case "feed":
      return `feed/${feedSegment(w.trade)}/${feedSegment(w.region)}`;
    case "trusted":
      return `trusted/${w.handle}`;
    case "bids":
      return `bids/${w.slug}/${w.key}`;
    default:
      return `${w.kind}/${w.slug}`;
  }
}

/** Same check the loader script runs before it frames anything. */
export const WIDGET_PATH_RE = /^(feed\/[a-z0-9-]+\/[a-z0-9-]+|bids\/[a-z0-9-]+\/[a-z0-9]+|(jobs|company|trusted)\/[a-z0-9-]+)$/;

export function clampLimit(n: unknown, fallback = DEFAULT_LIMIT): number {
  const v = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(MAX_ITEMS, Math.max(1, Math.round(v)));
}

function hashFor(w: WidgetConfig, o: WidgetOptions): string {
  const parts = [`theme=${o.theme}`];
  if (w.kind !== "company") parts.push(`limit=${clampLimit(o.limit)}`);
  return parts.join("&");
}

/** Direct iframe URL (for site builders that strip <script>). */
export function iframeSrc(base: string, w: WidgetConfig, o: WidgetOptions): string {
  return `${base}/embed/${widgetPath(w)}#${hashFor(w, o)}`;
}

/** Rough starting height so an iframe-only embed isn't cropped before it's resized. */
export function initialHeight(w: WidgetConfig, o: WidgetOptions): number {
  if (w.kind === "company") return 250;
  return 130 + clampLimit(o.limit) * 76;
}

/** Plain-language title for the iframe and the fallback link. */
export function widgetLabel(kind: WidgetKind): string {
  return {
    feed: "Open tenders on PMRFP",
    bids: "Our open bids on PMRFP",
    jobs: "Our open jobs on PMRFP",
    company: "Find us on PMRFP",
    trusted: "My trusted trades on PMRFP",
  }[kind];
}

/** Where the fallback link points when scripts don't run. */
export function fallbackHref(base: string, w: WidgetConfig): string {
  switch (w.kind) {
    case "feed": {
      const q = new URLSearchParams();
      if (w.trade && w.trade !== "all") q.set("category", w.trade);
      if (w.region && w.region !== "all") q.set("region", w.region);
      const s = q.toString();
      return `${base}/rfps${s ? `?${s}` : ""}`;
    }
    case "bids":
      return `${base}/rfps`;
    case "jobs":
      return `${base}/jobs`;
    case "company":
      return `${base}/directory/${w.slug}`;
    case "trusted":
      return `${base}/trusted/${w.handle}`;
  }
}

/** The recommended paste-in code: a div the loader script upgrades in place. */
export function scriptSnippet(base: string, w: WidgetConfig, o: WidgetOptions): string {
  const attrs = [`data-pmrfp="${widgetPath(w)}"`, `data-theme="${o.theme}"`];
  if (w.kind !== "company") attrs.push(`data-limit="${clampLimit(o.limit)}"`);
  return [
    `<div ${attrs.join(" ")}>`,
    `  <a href="${fallbackHref(base, w)}" target="_blank" rel="noopener">${widgetLabel(w.kind)}</a>`,
    `</div>`,
    `<script async src="${base}/embed.js"></script>`,
  ].join("\n");
}

/** Fallback for builders that only accept an iframe. Fixed height; no auto-resize. */
export function iframeSnippet(base: string, w: WidgetConfig, o: WidgetOptions): string {
  return `<iframe src="${iframeSrc(base, w, o)}" title="${widgetLabel(w.kind)}" width="100%" height="${initialHeight(w, o)}" style="border:0;max-width:640px" loading="lazy"></iframe>`;
}

/**
 * Links out of a widget carry UTM tags so sign-ups can be traced to the
 * widget type; the widget page adds the host site as utm_content in the
 * browser (it can't know it at render time).
 */
export function outLink(base: string, path: string, kind: WidgetKind): string {
  const url = new URL(path, base);
  url.searchParams.set("utm_source", "widget");
  url.searchParams.set("utm_medium", "embed");
  url.searchParams.set("utm_campaign", kind);
  return url.toString();
}
