import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { torontoDay } from "./cookie";
import type { Channel } from "./channel";

/**
 * Daily counts of NEW visitors by landing page and channel, aggregate only
 * (no cookie value, no user, no IP). Same pattern as the sponsor
 * impressions and badge counters: each server instance adds first visits up
 * in memory (day × channel × landing path) and writes them in ONE batched
 * RPC when the buffer is a minute old or large, from the proxy's after().
 * Never a database write per request. Counts are approximate (an instance
 * recycled before it flushes loses its last minute).
 */

export const LANDING_FLUSH_AFTER_MS = 60_000;
export const LANDING_FLUSH_AT_KEYS = 200;
/** Never let one instance's buffer grow without bound. */
const MAX_KEYS = 5000;
export const MAX_LANDING_PATH = 120;

const buffer = new Map<string, number>();
let since = 0;
let flushing: Promise<void> | null = null;

export function countLanding(channel: Channel, path: string, now = new Date()): void {
  if (!channel || buffer.size >= MAX_KEYS) return;
  if (!buffer.size) since = now.getTime();
  const key = [torontoDay(now), channel, (path || "/").slice(0, MAX_LANDING_PATH)].join("\u0001");
  buffer.set(key, (buffer.get(key) ?? 0) + 1);
}

/** Buffered rows (for tests and the flush). */
export function bufferedLandings(): { day: string; channel: string; path: string; n: number }[] {
  return [...buffer.entries()].map(([key, n]) => {
    const [day, channel, path] = key.split("\u0001");
    return { day, channel, path, n };
  });
}

export function shouldFlushLandings(now = Date.now()): boolean {
  return buffer.size > 0 && (buffer.size >= LANDING_FLUSH_AT_KEYS || now - since >= LANDING_FLUSH_AFTER_MS);
}

/** Writes the buffer in one RPC when it's due (or always with `force`). Never throws. */
export async function flushLandings(force = false): Promise<void> {
  if (flushing) return flushing;
  if (!(force ? buffer.size > 0 : shouldFlushLandings())) return;
  const rows = bufferedLandings();
  buffer.clear();
  since = 0;
  if (!isServiceConfigured()) return;
  flushing = (async () => {
    try {
      const { error } = await createServiceClient().rpc("record_landings", { p_rows: rows });
      if (error) console.warn("[attribution] landings flush failed:", error.message);
    } catch (e) {
      console.warn("[attribution] landings flush failed:", e instanceof Error ? e.message : e);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
