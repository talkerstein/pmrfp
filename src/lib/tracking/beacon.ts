/**
 * The /api/t beacon's request rules and payload parser. Pure and
 * unit-tested; the route (app/api/t/route.ts) only wires them together.
 *
 * Payload (what lib/tracking/client sends, as text, at most 4 KB):
 *   { "v": 1, "items": [
 *       { "t": "pv", "p": "/rfps", "r": "google.com" },        page view (r = referring domain, first page only)
 *       { "t": "lv", "s": "roof-repair-ab12", "p": "/rfps/…" }, listing view (by slug)
 *       { "t": "ev", "e": "pricing_viewed", "p": "/pricing", "x": { … } }  a browser-side funnel event
 *   ] }
 * At most 20 items. Unknown or malformed items are dropped, never trusted.
 */

import { referrerHost, sanitizePath } from "@/lib/attribution/cookie";
import { isClientEvent, sanitizeProps, type ClientEvent, type Props } from "./events";
import { isBotUserAgent, optedOut, trackablePath } from "./privacy";

export const MAX_BEACON_BYTES = 4096;
export const MAX_BEACON_ITEMS = 20;

export type BeaconItem =
  | { t: "pv"; path: string; ref: string }
  | { t: "lv"; slug: string; path: string }
  | { t: "ev"; event: ClientEvent; path: string; props: Props };

interface HeaderBag {
  get(name: string): string | null;
}

export type BeaconCheck =
  | { ok: true }
  | { ok: false; status: 204 | 400 | 403 | 405 | 413; reason: "method" | "size" | "cross_site" | "bot" | "opted_out" };

/**
 * Everything decided from the request line and headers, before the body is
 * read: POST only, size cap, same-origin only (Sec-Fetch-Site, else Origin),
 * no bots, and Do-Not-Track / Global Privacy Control honoured (204: accepted,
 * nothing recorded).
 */
export function checkBeaconRequest(req: { method: string; url: string; headers: HeaderBag }): BeaconCheck {
  if (req.method.toUpperCase() !== "POST") return { ok: false, status: 405, reason: "method" };
  const len = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(len) && len > MAX_BEACON_BYTES) return { ok: false, status: 413, reason: "size" };
  if (!sameOrigin(req)) return { ok: false, status: 403, reason: "cross_site" };
  if (isBotUserAgent(req.headers.get("user-agent"))) return { ok: false, status: 403, reason: "bot" };
  if (optedOut(req.headers)) return { ok: false, status: 204, reason: "opted_out" };
  return { ok: true };
}

/** A same-origin browser request: Sec-Fetch-Site says so, or (older browsers) Origin matches. */
export function sameOrigin(req: { url: string; headers: HeaderBag }): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

const SLUG = /^[A-Za-z0-9-]{1,200}$/;

export type ParsedBeacon = { ok: true; items: BeaconItem[] } | { ok: false; status: 400 | 413; reason: "size" | "json" | "shape" };

export function parseBeacon(text: string): ParsedBeacon {
  if (Buffer.byteLength(text, "utf8") > MAX_BEACON_BYTES) return { ok: false, status: 413, reason: "size" };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, reason: "json" };
  }
  if (!body || typeof body !== "object" || (body as { v?: unknown }).v !== 1) return { ok: false, status: 400, reason: "shape" };
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw) || raw.length > MAX_BEACON_ITEMS) return { ok: false, status: 400, reason: "shape" };

  const items: BeaconItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const path = sanitizePath(typeof o.p === "string" ? o.p : "");
    if (o.t === "pv") {
      if (!path || !trackablePath(path)) continue;
      items.push({ t: "pv", path, ref: referrerHost(typeof o.r === "string" ? o.r : "") });
    } else if (o.t === "lv") {
      if (typeof o.s !== "string" || !SLUG.test(o.s)) continue;
      items.push({ t: "lv", slug: o.s, path: path && trackablePath(path) ? path : `/rfps/${o.s}` });
    } else if (o.t === "ev") {
      if (!isClientEvent(o.e)) continue;
      items.push({ t: "ev", event: o.e, path: path && trackablePath(path) ? path : "", props: sanitizeProps(o.x) });
    }
  }
  return { ok: true, items };
}
