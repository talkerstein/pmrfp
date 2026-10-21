import type { RfpListItem } from "@/lib/data/types";

/**
 * The /rfps "Source" filter: every listing, public tenders only, or
 * property-manager RFPs only (?source=public / ?source=pm).
 *
 * Why (persona QA, 2026-10-21): the two options were rendered as ticked
 * checkboxes where clicking one UNticked it, so clicking "Public tender"
 * showed property-manager RFPs and the reverse. Each option is now a plain
 * link to that source; clicking the active one goes back to all.
 */
export type BoardSource = "all" | "public" | "pm";

export function parseBoardSource(raw: string | null | undefined): BoardSource {
  return raw === "public" || raw === "pm" ? raw : "all";
}

/** Public tenders are imported (source_type public_source); everything else was posted on PMRFP. */
export function matchesSource(r: Pick<RfpListItem, "sourceType">, source: BoardSource): boolean {
  if (source === "all") return true;
  return (r.sourceType === "public_source") === (source === "public");
}

/** Where an option links: that source, or back to all when it's already the active one. */
export function sourceLinkTarget(current: BoardSource, option: BoardSource): BoardSource {
  return option === current ? "all" : option;
}
