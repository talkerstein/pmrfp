import type { MajorProject } from "@/lib/major-projects/data";
import type { BenchmarkView } from "@/lib/data/price-benchmarks";

/**
 * The free-account gate (pure, unit-tested). Signed-out visitors (and
 * crawlers, who are signed out too) get the same indexable summary; the
 * gated parts are simply not in their data, so they can't end up in the
 * HTML. Nothing depends on the user agent: no cloaking. Trade Pro gates
 * (GC, bid list, price ranges) are separate and unchanged.
 */

export interface RelatedItem {
  slug: string;
  title: string;
  deadline: string | null;
}

/** Everyone, signed in or not. */
export interface ProjectSummary {
  slug: string;
  name: string;
  category: MajorProject["category"];
  /** Also in the page's meta description, so it belongs to the summary. */
  owner: string | null;
  city: string | null;
  province: string | null;
  estValueCad: number | null;
  status: MajorProject["status"];
  description: string | null;
  lastSeen: string;
  firstSeen: string;
  stale: boolean;
  staleSince: string | null;
  source: string;
  sources: MajorProject["sources"];
  license: string;
  hasGc: boolean;
  hasBidRoute: boolean;
}

/** Free account and up. */
export interface ProjectMemberDetails {
  statusDate: string | null;
  statusRaw: string | null;
  size: string | null;
  timeline: string | null;
  evidence: MajorProject["evidence"];
  caveats: string | null;
  /** Trade names. */
  trades: string[];
  open: RelatedItem[];
  awards: RelatedItem[];
}

export interface ProjectView {
  summary: ProjectSummary;
  member: ProjectMemberDetails | null;
}

export function majorProjectView(
  p: MajorProject,
  extras: { trades: string[]; open: RelatedItem[]; awards: RelatedItem[] },
  signedIn: boolean,
): ProjectView {
  const summary: ProjectSummary = {
    slug: p.slug,
    name: p.name,
    category: p.category,
    owner: p.owner,
    city: p.city,
    province: p.province,
    estValueCad: p.estValueCad,
    status: p.status,
    description: p.description,
    lastSeen: p.lastSeen,
    firstSeen: p.firstSeen,
    stale: p.stale,
    staleSince: p.staleSince,
    source: p.source,
    sources: p.sources,
    license: p.license,
    hasGc: p.hasGc,
    hasBidRoute: p.hasBidRoute,
  };
  if (!signedIn) return { summary, member: null };
  return {
    summary,
    member: {
      statusDate: p.statusDate,
      statusRaw: p.statusRaw,
      size: p.size,
      timeline: p.timeline,
      evidence: p.evidence,
      caveats: p.caveats,
      trades: extras.trades,
      open: extras.open,
      awards: extras.awards,
    },
  };
}

/**
 * Benchmarks: signed-out visitors keep the headline numbers and summary;
 * example awards, counts by buyer and city, and the methodology need a free
 * account. Trade Pro (`view.pro`) is untouched.
 */
export type GatedBenchmarkView = BenchmarkView & { gated: boolean };

export function gateBenchmarkView(view: BenchmarkView, signedIn: boolean): GatedBenchmarkView {
  if (view.pro || signedIn) return { ...view, gated: false };
  return { pro: false, data: { ...view.data, examples: [], topBuyers: [], cities: [] }, gated: true };
}
