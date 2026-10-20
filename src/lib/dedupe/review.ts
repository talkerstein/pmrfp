/**
 * Shared bits for the duplicate tables (duplicate_reviews,
 * organization_join_requests): pair keys and "table not there yet".
 * Pure.
 */

/** Order-independent pair: smaller id first (matches the a_id < b_id check). */
export function orderedPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

export function pairKey(x: string, y: string): string {
  return orderedPair(x, y).join(":");
}

/**
 * True for a PostgREST / Postgres error that means the table or column
 * doesn't exist yet (a pending migration), as opposed to a real failure.
 */
export function isMissingRelation(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204") return true;
  return /does not exist|could not find the table|schema cache/i.test(error.message ?? "");
}

export type ReviewStatus = "open" | "dismissed" | "merged" | "disabled";

export interface ReviewRow {
  kind: "account" | "company";
  a_id: string;
  b_id: string;
  status: ReviewStatus;
  source: string;
  reasons: string[];
  note: string | null;
  created_at: string;
}
