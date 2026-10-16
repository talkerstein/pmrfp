/**
 * Which kind of trade company a member is, from its trades (persona research,
 * briefs/strategy/2026-10-16-personas.md). Decides what the lifecycle copy
 * leads with:
 *   recurring  service contracts (snow, janitorial, landscaping, pest, waste,
 *              security guards): who holds the contract, what it paid, the
 *              rebid
 *   specialty  mechanical / specialty (HVAC, electrical, roofing, fire,
 *              elevators…): who won, at what price
 *   subtrade   small subtrades (painting, windows, masonry, tile, flooring…):
 *              project leads, permits and getting found; softer upsell
 * Pure.
 */
export type Persona = "recurring" | "specialty" | "subtrade";

const RECURRING = new Set([
  "snow-removal",
  "cleaning-janitorial",
  "landscaping",
  "pest-control",
  "waste-removal",
  "dumpster-bin-rental",
  "security-personnel",
  "parking-lot-maintenance",
  "property-maintenance",
  "handyman-maintenance",
]);

const SPECIALTY = new Set([
  "hvac",
  "electrical",
  "roofing",
  "fire-safety",
  "elevator-services",
  "plumbing",
  "building-automation",
  "security-systems",
  "access-control",
  "cameras-surveillance",
  "waterproofing",
  "energy-efficiency",
  "ev-charging",
  "lighting",
  "garage-doors",
  "environmental-hazardous-materials",
  "general-contracting",
]);

/** The member's persona: the most common kind among its trades (first trade breaks ties). Unknown trades count as subtrade. */
export function personaOf(tradeSlugs: readonly string[]): Persona {
  if (!tradeSlugs.length) return "subtrade";
  const kind = (s: string): Persona => (RECURRING.has(s) ? "recurring" : SPECIALTY.has(s) ? "specialty" : "subtrade");
  const n: Record<Persona, number> = { recurring: 0, specialty: 0, subtrade: 0 };
  for (const s of tradeSlugs) n[kind(s)]++;
  const first = kind(tradeSlugs[0]);
  const best = Math.max(n.recurring, n.specialty, n.subtrade);
  return n[first] === best ? first : (["recurring", "specialty", "subtrade"] as const).find((p) => n[p] === best)!;
}
