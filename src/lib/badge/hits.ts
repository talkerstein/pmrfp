import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { torontoDay } from "@/lib/sponsors/model";
import type { BadgeKind } from "./snippet";

/**
 * Badge image loads by embedding domain, without a database write per load.
 * Same pattern as sponsor impressions (lib/sponsors/impressions): each server
 * instance adds loads up in memory (day × kind × slug × domain) and writes
 * them in ONE batched RPC when the buffer is a minute old or large. Counts
 * are aggregate and approximate (an instance recycled before it flushes
 * loses its last minute) — enough to see who embedded a badge.
 */

export const BADGE_FLUSH_AFTER_MS = 60_000;
export const BADGE_FLUSH_AT_KEYS = 200;
/** Never let one instance's buffer grow without bound. */
const MAX_KEYS = 5000;

const buffer = new Map<string, number>();
let since = 0;
let flushing: Promise<void> | null = null;

export function countBadgeHit(kind: BadgeKind, slug: string, referrer: string): void {
  if (!slug || buffer.size >= MAX_KEYS) return;
  if (!buffer.size) since = Date.now();
  const key = [torontoDay(), kind, slug.slice(0, 120), referrer.slice(0, 120)].join("\u0001");
  buffer.set(key, (buffer.get(key) ?? 0) + 1);
}

export function bufferedBadgeHits(): { day: string; kind: string; slug: string; referrer: string; n: number }[] {
  return [...buffer.entries()].map(([key, n]) => {
    const [day, kind, slug, referrer] = key.split("\u0001");
    return { day, kind, slug, referrer, n };
  });
}

function due(now = Date.now()): boolean {
  return buffer.size > 0 && (buffer.size >= BADGE_FLUSH_AT_KEYS || now - since >= BADGE_FLUSH_AFTER_MS);
}

/** Writes the buffer in one RPC when it's due (or always with `force`). Never throws. */
export async function flushBadgeHits(force = false): Promise<void> {
  if (flushing) return flushing;
  if (!(force ? buffer.size > 0 : due())) return;
  const rows = bufferedBadgeHits();
  buffer.clear();
  since = 0;
  if (!isServiceConfigured()) return;
  flushing = (async () => {
    try {
      const { error } = await createServiceClient().rpc("record_badge_hits", { p_rows: rows });
      if (error) console.warn("[badge] hits flush failed:", error.message);
    } catch (e) {
      console.warn("[badge] hits flush failed:", e instanceof Error ? e.message : e);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
