/**
 * Where PMRFP works: Canadian provinces and territories, and U.S. states.
 * Free-text `province` columns hold the full name ("Ontario", "Texas").
 */

export const CA_PROVINCES = [
  "Ontario",
  "Quebec",
  "British Columbia",
  "Alberta",
  "Manitoba",
  "Saskatchewan",
  "Nova Scotia",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Prince Edward Island",
  "Yukon",
  "Northwest Territories",
  "Nunavut",
] as const;

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

export const US_STATE_NAMES = Object.values(US_STATES).sort();

const US_NAME_SET = new Set(US_STATE_NAMES.map((n) => n.toLowerCase()));

/** "Texas", "TX" or "texas" → true. */
export function isUsState(province: string | null | undefined): boolean {
  const p = (province ?? "").trim();
  if (!p) return false;
  return US_NAME_SET.has(p.toLowerCase()) || !!US_STATES[p.toUpperCase()];
}

/** Region slug for a U.S. state (code or name): "us-new-york". Matches migration 20260923000005. */
export function usStateRegionSlug(state: string): string | null {
  const name = US_STATES[state.toUpperCase()] ?? US_STATE_NAMES.find((n) => n.toLowerCase() === state.toLowerCase());
  return name ? `us-${name.toLowerCase().replace(/[^a-z]+/g, "-")}` : null;
}
