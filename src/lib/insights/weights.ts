import type { InsightKind, Persona } from "./types";

/**
 * What each persona cares about most (briefs/strategy/2026-10-16-personas.md):
 *   recurring  renewals, incumbents, seasonality, price
 *   specialty  who won and at what price
 *   subtrade   projects, permits and the GCs who will hire subs
 * Weight × the fact's own score = its rank on the dashboard and in the brief.
 */
export const PERSONA_WEIGHTS: Record<Persona, Record<InsightKind, number>> = {
  recurring: {
    renewals: 1,
    incumbent_streak: 0.95,
    seasonality: 0.9,
    price_band: 0.8,
    price_move: 0.7,
    competitor_wins: 0.7,
    buyer_surge: 0.6,
    volume: 0.6,
    new_projects: 0.2,
    gc_named: 0.1,
  },
  specialty: {
    competitor_wins: 1,
    price_band: 0.95,
    price_move: 0.85,
    incumbent_streak: 0.7,
    renewals: 0.7,
    buyer_surge: 0.6,
    volume: 0.6,
    new_projects: 0.5,
    gc_named: 0.4,
    seasonality: 0.4,
  },
  subtrade: {
    new_projects: 1,
    gc_named: 0.95,
    volume: 0.7,
    price_band: 0.6,
    competitor_wins: 0.4,
    seasonality: 0.4,
    buyer_surge: 0.3,
    price_move: 0.3,
    renewals: 0.2,
    incumbent_streak: 0.2,
  },
};

const PERSONA_LIST: Persona[] = ["recurring", "specialty", "subtrade"];

/** Personas a kind matters to (weight ≥ 0.5), for the fact's `personas` field. */
export const PERSONAS_FOR = Object.fromEntries(
  (Object.keys(PERSONA_WEIGHTS.recurring) as InsightKind[]).map((k) => [k, PERSONA_LIST.filter((p) => PERSONA_WEIGHTS[p][k] >= 0.5)]),
) as unknown as Record<InsightKind, readonly Persona[]>;
