/**
 * A member's local clock for quiet hours: the time zone of their province or
 * state (its main one; a few states and provinces span two), else Eastern.
 * Pure (Intl only).
 */
import { US_STATES } from "@/lib/geo";

export const DEFAULT_TIME_ZONE = "America/Toronto";

const CA: Record<string, string> = {
  ontario: "America/Toronto",
  quebec: "America/Toronto",
  "québec": "America/Toronto",
  "british columbia": "America/Vancouver",
  alberta: "America/Edmonton",
  manitoba: "America/Winnipeg",
  saskatchewan: "America/Regina",
  "nova scotia": "America/Halifax",
  "new brunswick": "America/Moncton",
  "newfoundland and labrador": "America/St_Johns",
  "prince edward island": "America/Halifax",
  yukon: "America/Whitehorse",
  "northwest territories": "America/Yellowknife",
  nunavut: "America/Iqaluit",
};
const CA_CODES: Record<string, string> = {
  on: "ontario", qc: "quebec", bc: "british columbia", ab: "alberta", mb: "manitoba", sk: "saskatchewan",
  ns: "nova scotia", nb: "new brunswick", nl: "newfoundland and labrador", pe: "prince edward island",
  yt: "yukon", nt: "northwest territories", nu: "nunavut",
};

const EASTERN = ["CT", "DE", "DC", "FL", "GA", "IN", "KY", "ME", "MD", "MA", "MI", "NH", "NJ", "NY", "NC", "OH", "PA", "RI", "SC", "VT", "VA", "WV"];
const CENTRAL = ["AL", "AR", "IL", "IA", "KS", "LA", "MN", "MS", "MO", "NE", "ND", "OK", "SD", "TN", "TX", "WI"];
const MOUNTAIN = ["CO", "ID", "MT", "NM", "UT", "WY"];
const PACIFIC = ["CA", "NV", "OR", "WA"];
const US: Record<string, string> = {
  ...Object.fromEntries(EASTERN.map((c) => [c, "America/New_York"])),
  ...Object.fromEntries(CENTRAL.map((c) => [c, "America/Chicago"])),
  ...Object.fromEntries(MOUNTAIN.map((c) => [c, "America/Denver"])),
  ...Object.fromEntries(PACIFIC.map((c) => [c, "America/Los_Angeles"])),
  AZ: "America/Phoenix",
  AK: "America/Anchorage",
  HI: "Pacific/Honolulu",
  PR: "America/Puerto_Rico",
};
const US_BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]));

/** "Ontario" / "ON" / "Texas" / "TX" → IANA zone. Unknown or empty → null. */
export function provinceTimeZone(province: string | null | undefined): string | null {
  const p = (province ?? "").trim().toLowerCase();
  if (!p) return null;
  if (CA[p]) return CA[p];
  if (CA_CODES[p]) return CA[CA_CODES[p]];
  const us = US[p.toUpperCase()] ?? US[US_BY_NAME[p] ?? ""];
  return us ?? null;
}

export interface LocalClock {
  /** YYYY-MM-DD in that zone. */
  date: string;
  /** 0-23. */
  hour: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localClock(at: Date, timeZone: string = DEFAULT_TIME_ZONE): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    weekday: WEEKDAY[get("weekday")] ?? 0,
  };
}
