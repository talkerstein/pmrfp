import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";

/**
 * Per-instance write buffer for first-party tracking. Nothing is written to
 * the database on the request path: the beacon and the server helper add
 * rows here, and ONE batched RPC (record_site_beacon) writes them a few
 * seconds later from after(). Page views and referrers are summed per day,
 * path and country; a visitor is kept once per day; a listing view is kept
 * once per listing per visitor per day (the database's unique index makes
 * that hold across instances too).
 *
 * Approximate by design: an instance recycled before it flushes loses at
 * most a few seconds of counts.
 */

export const FLUSH_DELAY_MS = 5_000;
/** Flush right away once this many rows are waiting. */
export const FLUSH_AT_ROWS = 300;
/** Hard cap: past this, new rows are dropped until the next flush. */
const MAX_ROWS = 5_000;
/** Listing views already sent today from this instance (dedupe before the DB). */
const MAX_SEEN = 50_000;

export interface VisitorRow {
  day: string;
  h: string;
  country: string;
  lang: string;
  signed_in: boolean;
}
export interface ViewRow {
  day: string;
  slug: string;
  h: string;
  user_id: string | null;
  country: string | null;
  lang: string | null;
}
export interface EventRow {
  event: string;
  path: string | null;
  lang: string | null;
  country: string | null;
  role: string | null;
  user_id: string | null;
  anon_hash: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  props: Record<string, unknown>;
  at: string;
}

const visitors = new Map<string, VisitorRow>();
const pages = new Map<string, number>();
const referrers = new Map<string, number>();
const views = new Map<string, ViewRow>();
let events: EventRow[] = [];
let seenDay = "";
const seenViews = new Set<string>();
let pending: Promise<void> | null = null;

const SEP = "\u0001";

function size(): number {
  return visitors.size + pages.size + referrers.size + views.size + events.length;
}

export function bufferVisitor(v: VisitorRow): void {
  const k = `${v.day}${SEP}${v.h}`;
  const had = visitors.get(k);
  if (had) {
    if (v.signed_in) had.signed_in = true;
    return;
  }
  if (size() >= MAX_ROWS) return;
  visitors.set(k, { ...v });
}

export function bufferPageView(day: string, path: string, country: string): void {
  const k = [day, path, country].join(SEP);
  if (!pages.has(k) && size() >= MAX_ROWS) return;
  pages.set(k, (pages.get(k) ?? 0) + 1);
}

export function bufferReferrer(day: string, host: string, country: string): void {
  const k = [day, host, country].join(SEP);
  if (!referrers.has(k) && size() >= MAX_ROWS) return;
  referrers.set(k, (referrers.get(k) ?? 0) + 1);
}

/** False when this visitor already viewed this listing today (nothing added). */
export function bufferListingView(v: ViewRow): boolean {
  if (seenDay !== v.day) {
    seenDay = v.day;
    seenViews.clear();
  }
  const k = [v.day, v.slug, v.h].join(SEP);
  if (seenViews.has(k) || views.has(k)) return false;
  if (size() >= MAX_ROWS) return false;
  views.set(k, { ...v });
  if (seenViews.size < MAX_SEEN) seenViews.add(k);
  return true;
}

export function bufferEvent(e: EventRow): void {
  if (size() >= MAX_ROWS) return;
  events.push(e);
}

export interface Batch {
  visitors: VisitorRow[];
  pages: { day: string; path: string; country: string; n: number }[];
  referrers: { day: string; host: string; country: string; n: number }[];
  views: ViewRow[];
  events: EventRow[];
}

/** What's waiting (tests, and the flush). */
export function pendingBatch(): Batch {
  return {
    visitors: [...visitors.values()],
    pages: [...pages.entries()].map(([k, n]) => {
      const [day, path, country] = k.split(SEP);
      return { day, path, country, n };
    }),
    referrers: [...referrers.entries()].map(([k, n]) => {
      const [day, host, country] = k.split(SEP);
      return { day, host, country, n };
    }),
    views: [...views.values()],
    events: [...events],
  };
}

function takeBatch(): Batch | null {
  if (!size()) return null;
  const b = pendingBatch();
  visitors.clear();
  pages.clear();
  referrers.clear();
  views.clear();
  events = [];
  return b;
}

/** Writes everything waiting in one RPC. Never throws. */
export async function flushNow(): Promise<void> {
  const batch = takeBatch();
  if (!batch || !isServiceConfigured()) return;
  try {
    const { error } = await createServiceClient().rpc("record_site_beacon", { p: batch });
    if (error) console.warn("[tracking] flush failed:", error.message);
  } catch (e) {
    console.warn("[tracking] flush failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * The shared flush for this instance: right away when the buffer is big,
 * else after FLUSH_DELAY_MS so concurrent requests share one write. Pass
 * the returned promise to after() so the function stays alive until it's done.
 */
export function scheduleFlush(delayMs = FLUSH_DELAY_MS): Promise<void> {
  if (size() >= FLUSH_AT_ROWS) {
    const now = flushNow();
    return pending ? Promise.all([pending, now]).then(() => undefined) : now;
  }
  if (pending) return pending;
  pending = (async () => {
    // Rows that arrive while a write is in flight go out in the next round,
    // still inside the same after() (a few rounds at most).
    for (let round = 0; round < 3; round++) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      await flushNow();
      if (!size()) break;
    }
  })().finally(() => {
    pending = null;
  });
  return pending;
}

/** Tests only. */
export function resetTrackingBuffer(): void {
  takeBatch();
  seenDay = "";
  seenViews.clear();
  pending = null;
}
