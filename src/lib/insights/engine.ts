import { personaOf } from "@/lib/lifecycle/persona";
import { runDetectors, type InsightData, type InsightScope } from "./detectors";
import { PERSONA_WEIGHTS } from "./weights";
import type { DetectorResult, InsightFact, InsightKind, Persona } from "./types";

/**
 * Detectors → a ranked list for one persona. Pure. Ranking is the persona's
 * weight for the kind × the fact's own score (bigger moves, bigger
 * samples), ties broken by id so the order never changes for the same data.
 * At most MAX_PER_KIND facts of one kind, so one trade with lots of data
 * doesn't crowd out everything else.
 */

export const MAX_PER_KIND = 2;

export function rankFacts(facts: readonly InsightFact[], persona: Persona): InsightFact[] {
  const w = PERSONA_WEIGHTS[persona];
  const scored = facts
    .map((f) => ({ f, s: w[f.kind] * f.score }))
    .sort((a, b) => b.s - a.s || a.f.id.localeCompare(b.f.id));
  const perKind = new Map<InsightKind, number>();
  const seen = new Set<string>();
  const out: InsightFact[] = [];
  for (const { f } of scored) {
    if (seen.has(f.id)) continue;
    const n = perKind.get(f.kind) ?? 0;
    if (n >= MAX_PER_KIND) continue;
    perKind.set(f.kind, n + 1);
    seen.add(f.id);
    out.push(f);
  }
  return out;
}

/** The week's free headline: the best-ranked free-tier fact, or null. */
export function headlineOf(ranked: readonly InsightFact[]): InsightFact | null {
  return ranked.find((f) => f.tier === "free") ?? null;
}

export interface InsightRun extends DetectorResult {
  persona: Persona;
  ranked: InsightFact[];
}

/** Everything for one scope: detectors, persona (from the trades unless given), ranking. */
export function insightsFor(data: InsightData, scope: InsightScope, persona?: Persona): InsightRun {
  const result = runDetectors(data, scope);
  const p = persona ?? personaOf(scope.trades.map((t) => t.slug));
  return { ...result, persona: p, ranked: rankFacts(result.facts, p) };
}
