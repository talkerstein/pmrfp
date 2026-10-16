/**
 * Which trades a big project is a LEAD for, when the source doesn't name
 * them. Most PMRFP members are subcontractors (painters, windows, masonry,
 * tile, garage doors) hired by the general contractor on a building job;
 * their way in is the GC's bid list, months before anything is tendered.
 *
 * Rule of thumb from how buildings get built: every new or renovated
 * building needs the envelope, interior-finish, MEP and site trades; civil
 * and energy jobs need a much shorter list. Property-maintenance services
 * (snow, pest control, locksmiths, appliance repair) come after the
 * building is finished, so a construction project is NOT a lead for them —
 * their leads are bids and awards. Pure.
 */
import type { MajorProjectCategory } from "@/lib/major-projects/model";

/** Trades every building project needs at some stage. */
const BUILDING_TRADES = [
  "general-contracting",
  "concrete-and-asphalt",
  "masonry",
  "carpentry",
  "millwork",
  "drywall",
  "painting",
  "flooring",
  "glass-and-windows",
  "roofing",
  "waterproofing",
  "electrical",
  "lighting",
  "plumbing",
  "hvac",
  "fire-safety",
  "building-automation",
  "security-systems",
  "access-control",
  "cameras-surveillance",
  "signage",
  "landscaping",
  "fencing",
  "demolition",
  "environmental-hazardous-materials",
  "dumpster-bin-rental",
  "waste-removal",
  "cleaning-janitorial", // post-construction clean
  "energy-efficiency",
  "temporary-workforce",
  "security-personnel", // site security
] as const;

/** Extra trades for buildings with parking, loading docks, elevators, EV stalls. */
const MULTI_STOREY = ["elevator-services", "garage-doors", "ev-charging"] as const;

/** Civil / energy / resource work: site and power trades only. */
const HEAVY_TRADES = [
  "general-contracting",
  "concrete-and-asphalt",
  "electrical",
  "demolition",
  "fencing",
  "environmental-hazardous-materials",
  "dumpster-bin-rental",
  "waste-removal",
  "temporary-workforce",
  "security-personnel",
] as const;

export const PROJECT_LEAD_TRADES: Record<MajorProjectCategory, ReadonlySet<string>> = {
  commercial: new Set([...BUILDING_TRADES, ...MULTI_STOREY]),
  institutional: new Set([...BUILDING_TRADES, ...MULTI_STOREY]),
  multi_residential: new Set([...BUILDING_TRADES, ...MULTI_STOREY]),
  mixed_use: new Set([...BUILDING_TRADES, ...MULTI_STOREY]),
  industrial: new Set([...BUILDING_TRADES, "garage-doors", "ev-charging"]),
  data_centre: new Set([...BUILDING_TRADES, "garage-doors"]),
  infrastructure: new Set([...HEAVY_TRADES, "landscaping", "lighting", "signage"]),
  energy: new Set(HEAVY_TRADES),
  mining: new Set(HEAVY_TRADES),
  oil_gas: new Set(HEAVY_TRADES),
  other: new Set(["general-contracting"]),
};

/** Building-finish and MEP trades that win work through a GC (a GC award is a lead for them). */
export const GC_SUB_TRADES: ReadonlySet<string> = new Set(BUILDING_TRADES.filter((t) => t !== "general-contracting"));

export type TradeMatch = "named" | "typical";

/**
 * Member trades a project is a lead for. "named" = the source (or our
 * importer's reading of it) lists the trade; "typical" = this kind of
 * project normally needs it.
 */
export function projectTradeMatch(
  project: { category: MajorProjectCategory; tradesNeeded: readonly string[] },
  memberTrades: ReadonlySet<string>,
): { trades: string[]; match: TradeMatch } | null {
  const named = project.tradesNeeded.filter((t) => memberTrades.has(t));
  if (named.length) return { trades: named, match: "named" };
  const usual = PROJECT_LEAD_TRADES[project.category] ?? PROJECT_LEAD_TRADES.other;
  const typical = [...memberTrades].filter((t) => usual.has(t));
  return typical.length ? { trades: typical, match: "typical" } : null;
}
