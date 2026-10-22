import type { ClientEvent } from "./events";
import { browserOptedOut } from "./privacy";

/**
 * Browser side of the first-party analytics beacon (/api/t). Tiny, no
 * cookies of its own, no third party. Queues page views, listing views and
 * a few funnel events, then sends them in one small POST after 1.5 s (or
 * with sendBeacon when the tab is hidden or closed).
 *
 * Nothing is queued when the browser sends Do-Not-Track or Global Privacy
 * Control, or on the website widgets (/embed/*).
 */

export type BeaconProps = Record<string, string | number | boolean | null>;

type Item =
  | { t: "pv"; p: string; r?: string }
  | { t: "lv"; s: string; p: string }
  | { t: "ev"; e: ClientEvent; p: string; x?: BeaconProps };

const ENDPOINT = "/api/t";
const DELAY_MS = 1500;
const MAX_ITEMS = 20;
/** The server refuses anything over 4096 bytes. */
const MAX_BODY = 3800;

let queue: Item[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

export function trackingAllowed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.pathname.startsWith("/embed")) return false;
    return !browserOptedOut(navigator as Navigator & { globalPrivacyControl?: boolean }, window as Window & { doNotTrack?: string | null });
  } catch {
    return false;
  }
}

function send(body: string, beacon: boolean) {
  try {
    if (beacon && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      body,
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "text/plain" },
    }).catch(() => {});
  } catch {
    // Analytics never breaks the page.
  }
}

/** Sends everything queued, in as many small POSTs as it takes. */
export function flushTracking(beacon = false): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  while (queue.length) {
    const batch: Item[] = [];
    while (queue.length && batch.length < MAX_ITEMS) {
      const next = queue[0];
      if (batch.length && JSON.stringify({ v: 1, items: [...batch, next] }).length > MAX_BODY) break;
      batch.push(queue.shift()!);
    }
    const body = JSON.stringify({ v: 1, items: batch });
    if (body.length <= MAX_BODY) send(body, beacon);
  }
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("pagehide", () => flushTracking(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushTracking(true);
  });
}

function enqueue(item: Item) {
  if (!trackingAllowed()) return;
  queue.push(item);
  listen();
  if (queue.length >= MAX_ITEMS) flushTracking();
  else if (!timer) timer = setTimeout(() => flushTracking(), DELAY_MS);
}

/** A page view. `referrer`: the referring site, sent as its host only (first page of a visit). */
export function trackPageView(path: string, referrer?: string | null): void {
  let r: string | undefined;
  if (referrer) {
    try {
      r = new URL(referrer).hostname;
    } catch {
      r = undefined;
    }
  }
  enqueue({ t: "pv", p: path.slice(0, 200), ...(r ? { r } : {}) });
}

/** A listing (RFP) page view, by slug. Counted once per visitor per day on the server. */
export function trackListingView(slug: string): void {
  enqueue({ t: "lv", s: slug.slice(0, 200), p: window.location.pathname.slice(0, 200) });
}

/** A browser-side funnel event (signup_viewed, signup_step, pricing_viewed, upgrade_clicked, writer_started). */
export function track(event: ClientEvent, props?: BeaconProps): void {
  enqueue({ t: "ev", e: event, p: typeof window === "undefined" ? "/" : window.location.pathname.slice(0, 200), ...(props ? { x: props } : {}) });
}

/** Tests only. */
export function _queuedForTests(): readonly Item[] {
  return queue;
}
export function _resetForTests(): void {
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
}
