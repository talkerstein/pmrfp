import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { torontoDay } from "@/lib/sponsors/model";

/**
 * Click-outs from PMRFP to a company's website (/out/<slug>), counted per
 * company per day WITHOUT a database write per click. Same pattern as the
 * badge image loads (lib/badge/hits): each server instance adds clicks up in
 * memory and writes them in ONE batched RPC (record_org_link_clicks) when the
 * buffer is a minute old or large. Counts are aggregate and approximate (an
 * instance recycled before it flushes loses its last minute). No visitor is
 * identified or stored.
 */

export const CLICK_FLUSH_AFTER_MS = 60_000;
export const CLICK_FLUSH_AT_KEYS = 100;
const MAX_KEYS = 5000;

const buffer = new Map<string, number>();
let since = 0;
let flushing: Promise<void> | null = null;

export function countOutClick(slug: string, day: string = torontoDay()): void {
  if (!slug || buffer.size >= MAX_KEYS) return;
  if (!buffer.size) since = Date.now();
  const key = `${day}\u0001${slug.slice(0, 160)}`;
  buffer.set(key, (buffer.get(key) ?? 0) + 1);
}

export function bufferedOutClicks(): { day: string; slug: string; n: number }[] {
  return [...buffer.entries()].map(([key, n]) => {
    const [day, slug] = key.split("\u0001");
    return { day, slug, n };
  });
}

/** Tests only. */
export function resetOutClicks(): void {
  buffer.clear();
  since = 0;
  flushing = null;
}

function due(now = Date.now()): boolean {
  return buffer.size > 0 && (buffer.size >= CLICK_FLUSH_AT_KEYS || now - since >= CLICK_FLUSH_AFTER_MS);
}

/** Writes the buffer in one RPC when it's due (or always with `force`). Never throws. */
export async function flushOutClicks(force = false): Promise<void> {
  if (flushing) return flushing;
  if (!(force ? buffer.size > 0 : due())) return;
  const rows = bufferedOutClicks();
  buffer.clear();
  since = 0;
  if (!isServiceConfigured()) return;
  flushing = (async () => {
    try {
      const { error } = await createServiceClient().rpc("record_org_link_clicks", { p_rows: rows });
      if (error) console.warn("[links] click flush failed:", error.message);
    } catch (e) {
      console.warn("[links] click flush failed:", e instanceof Error ? e.message : e);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

export interface OrgClickStats {
  last30: number;
  total: number;
}

/** "N visits to your website from PMRFP" for the company's own dashboard (service role; the caller checked the session). Null when unavailable. */
export async function getOrgClickStats(orgId: string): Promise<OrgClickStats | null> {
  if (!isServiceConfigured()) return null;
  try {
    const { data, error } = await createServiceClient().from("org_link_clicks").select("day,clicks").eq("org_id", orgId).limit(2000);
    if (error) return null;
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const rows = (data ?? []) as { day: string; clicks: number }[];
    return {
      total: rows.reduce((n, r) => n + r.clicks, 0),
      last30: rows.filter((r) => r.day >= cutoff).reduce((n, r) => n + r.clicks, 0),
    };
  } catch {
    return null;
  }
}
