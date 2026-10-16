/**
 * What each member may see of a lead. Free members get the counts and a
 * few leads with title, place, date and summary. Trade Pro (and trial)
 * members get the full list plus the Pro fields: GC / contractor / award
 * winner, the buyer or owner, the bid-list or prequalification link, the
 * bid route and the source page. The Pro fields are dropped HERE, on the
 * server, so they never reach a free member's HTML. Pure.
 */
import type { Lead, LeadProFields } from "./match";

export const FREE_LEAD_LIMIT = 3;
export const PRO_LEAD_LIMIT = 25;

export interface LeadView extends Omit<Lead, "pro"> {
  pro: LeadProFields | null;
}

/** The leads one viewer gets, already stripped for free members. */
export function leadsForViewer(leads: readonly Lead[], isPro: boolean, limit?: number): LeadView[] {
  const max = limit ?? (isPro ? PRO_LEAD_LIMIT : FREE_LEAD_LIMIT);
  return leads.slice(0, max).map((l) => (isPro ? { ...l } : freeView(l)));
}

function freeView(l: Lead): LeadView {
  return {
    ...l,
    // An award's notice text names the winner: free members get the title only.
    summary: l.kind === "award" ? null : clip(l.summary, 220),
    pro: null,
  };
}

function clip(s: string | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Leads the Pro fields are worth reading for (the ids to fetch under the member's session). */
export function projectIdsNeedingPro(leads: readonly Lead[], limit = PRO_LEAD_LIMIT): string[] {
  return leads
    .slice(0, limit)
    .filter((l) => l.key.startsWith("mp:") && (l.hasContractor || l.hasBidRoute))
    .map((l) => l.key.slice(3));
}

/** Fill in the project Pro fields read under the member's session (RLS). */
export function attachProjectPro(
  leads: readonly Lead[],
  pro: ReadonlyMap<string, { generalContractor: string | null; bidListUrl: string | null; bidRoute: string | null }>,
): Lead[] {
  if (!pro.size) return [...leads];
  return leads.map((l) => {
    if (!l.key.startsWith("mp:")) return l;
    const p = pro.get(l.key.slice(3));
    if (!p) return l;
    return {
      ...l,
      pro: {
        contractor: p.generalContractor,
        buyer: l.pro?.buyer ?? null,
        bidListUrl: p.bidListUrl,
        bidRoute: p.bidRoute,
        sourceUrl: l.pro?.sourceUrl ?? null,
      },
    };
  });
}
