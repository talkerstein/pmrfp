import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { torontoDay } from "./model";

/**
 * Impression counts without a database write per view. Each server instance
 * adds views up in memory (day × sponsor × placement × trade × region) and
 * writes them in ONE batched RPC call when the buffer is a minute old or
 * large; the email crons flush once at the end of a run. Counts are
 * aggregate and approximate (an instance recycled before it flushes loses
 * its last minute), which is what a monthly sponsor report needs.
 */

export interface ImpressionKey {
  sponsor: string;
  placement: string;
  trade?: string;
  region?: string;
}

export const FLUSH_AFTER_MS = 60_000;
export const FLUSH_AT_KEYS = 200;

const buffer = new Map<string, number>();
let since = 0;
let flushing: Promise<void> | null = null;

const keyOf = (day: string, k: ImpressionKey) =>
  [day, k.sponsor.slice(0, 40), k.placement.slice(0, 40), (k.trade ?? "").slice(0, 60), (k.region ?? "").slice(0, 60)].join("\u0001");

export function countImpression(k: ImpressionKey, n = 1): void {
  if (!k.sponsor || !k.placement || n <= 0) return;
  if (!buffer.size) since = Date.now();
  const key = keyOf(torontoDay(), k);
  buffer.set(key, (buffer.get(key) ?? 0) + n);
}

/** Buffered rows (for tests and the flush). */
export function bufferedImpressions(): { day: string; sponsor: string; placement: string; trade: string; region: string; n: number }[] {
  return [...buffer.entries()].map(([key, n]) => {
    const [day, sponsor, placement, trade, region] = key.split("\u0001");
    return { day, sponsor, placement, trade, region, n };
  });
}

export function shouldFlush(now = Date.now()): boolean {
  return buffer.size > 0 && (buffer.size >= FLUSH_AT_KEYS || now - since >= FLUSH_AFTER_MS);
}

/** Writes the buffer in one RPC when it's due (or always with `force`). Never throws. */
export async function flushImpressions(force = false): Promise<void> {
  if (flushing) return flushing;
  if (!(force ? buffer.size > 0 : shouldFlush())) return;
  const rows = bufferedImpressions();
  buffer.clear();
  since = 0;
  if (!isServiceConfigured()) return;
  flushing = (async () => {
    try {
      const { error } = await createServiceClient().rpc("record_sponsor_impressions", { p_rows: rows });
      if (error) console.warn("[sponsors] impressions flush failed:", error.message);
    } catch (e) {
      console.warn("[sponsors] impressions flush failed:", e instanceof Error ? e.message : e);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
