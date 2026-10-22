import type { SupabaseClient } from "@supabase/supabase-js";

export type Db = SupabaseClient;
export type SelectError = { message: string; code?: string };

export const chunk = <T,>(xs: T[], n = 200): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/**
 * `select … in (ids)` over chunks (a long `in` list overflows the URL): the
 * rows from every chunk. A failing chunk stops the loop and returns its error;
 * the caller decides whether that is fatal.
 */
export async function selectIn<T>(
  ids: string[],
  q: (chunkIds: string[]) => PromiseLike<{ data: unknown; error: SelectError | null }>,
): Promise<{ rows: T[]; error: SelectError | null }> {
  const rows: T[] = [];
  for (const c of chunk([...new Set(ids)])) {
    if (!c.length) continue;
    const { data, error } = await q(c);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
  }
  return { rows, error: null };
}
