import { listRfps } from "@/lib/data/rfps";
import { winnersFromRfps, type Winner } from "@/lib/data/winners";

/**
 * Contract-winner facts for badges and claims: name, how many published
 * award notices, and the years they span. Built from the shared cached board
 * snapshot (lib/data/board-snapshot), then memoised per server instance for
 * 10 minutes, so a badge image load is a map lookup, not a board scan.
 */

export interface WinnerFacts {
  slug: string;
  name: string;
  awards: number;
  from: number | null;
  to: number | null;
}

const TTL_MS = 10 * 60_000;
let memo: { at: number; map: Map<string, WinnerFacts> } | null = null;
let inflight: Promise<Map<string, WinnerFacts>> | null = null;

/** Pure: a winner → its badge facts (count and years of the real notices). */
export function factsOf(w: Pick<Winner, "slug" | "name" | "awards">): WinnerFacts {
  const years = w.awards.map((a) => Number(a.date?.slice(0, 4))).filter((y) => Number.isFinite(y) && y > 1990);
  return {
    slug: w.slug,
    name: w.name,
    awards: w.awards.length,
    from: years.length ? Math.min(...years) : null,
    to: years.length ? Math.max(...years) : null,
  };
}

async function load(): Promise<Map<string, WinnerFacts>> {
  const rfps = await listRfps();
  return new Map(winnersFromRfps(rfps, 1).map((w) => [w.slug, factsOf(w)]));
}

export async function winnerFacts(slug: string): Promise<WinnerFacts | null> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.map.get(slug) ?? null;
  inflight ??= load()
    .then((map) => {
      memo = { at: Date.now(), map };
      return map;
    })
    .finally(() => {
      inflight = null;
    });
  try {
    return (await inflight).get(slug) ?? null;
  } catch {
    // Board unavailable: keep serving the last good copy if there is one.
    return memo?.map.get(slug) ?? null;
  }
}
