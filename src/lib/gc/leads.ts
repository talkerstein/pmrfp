import type { RfpListItem } from "@/lib/data/types";
import { isPastContract, parseAward } from "@/lib/data/fomo";
import { isPublishableWinner, winnerKey } from "@/lib/data/winners";
import { publicTenderSource } from "@/lib/tenders/sources";
import { awardNoticeUrl } from "@/lib/tenders/awards";

/**
 * GC leads for the owner to email by hand: companies that just won public
 * work and may need subcontractors. Built from the award notices already on
 * the board (same parsing as /contract-winners), grouped by winner. Nothing
 * here sends anything. Pure, so it's testable without a database.
 */

export interface GcLeadAward {
  slug: string;
  title: string;
  amount: number | null;
  value: string | null;
  buyer: string | null;
  date: string | null;
  regionName: string | null;
  categories: string[];
  /** Official notice, when we can build its link from the slug (CanadaBuys). */
  noticeUrl: string | null;
}

export interface GcLead {
  key: string;
  name: string;
  awards: GcLeadAward[];
  totalValue: number;
  latest: string | null;
  regions: string[];
  categories: string[];
  /** At least one award is tagged General Contracting. */
  generalContracting: boolean;
}

/** "…Past public contract issued by Public Services and Procurement Canada." → the buyer. */
export function parseAwardBuyer(summary: string | null): string | null {
  const m = summary?.match(/Past public contract (?:issued by|from) (.+?)\.?\s*$/);
  return m ? m[1].trim() : null;
}

// National firms and facility giants: they have their own sub lists, so a
// cold "post your packages free" email is wasted on them.
const GIANTS =
  /\b(pcl|ellisdon|ellis don|bird construction|aecon|graham construction|pomerleau|ledcor|chandos|ebc|kiewit|black mcdonald|black & mcdonald|johnson controls|siemens|honeywell|otis elevator|otis canada|kone|schindler|tk elevator|thyssenkrupp|brookfield|cbre|jll|jones lang|colliers|cushman|bgis|compass group|sodexo|aramark|iss facility|gdi|stantec|wsp|aecom|snc lavalin|atkinsrealis|hydro one|bell canada|telus|canada post)\b/;
// Public bodies sometimes show up as the "winner" (inter-agency work).
const PUBLIC_BODY =
  /\b(city of|town of|township|municipality|county of|region of|regional municipality|government|ministry|minister|department of|university|college|school board|district school|hospital|health authority|crown corporation|public works|his majesty|her majesty|province of|state of)\b/;

export function isGiantOrPublicBody(name: string): boolean {
  const key = winnerKey(name);
  return GIANTS.test(key) || PUBLIC_BODY.test(name.toLowerCase());
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

export function gcLeadsFromRfps(rfps: RfpListItem[], opts: { today: string; days?: number }): GcLead[] {
  const days = opts.days ?? 30;
  const cutoff = new Date(Date.parse(`${opts.today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const groups = new Map<string, { variants: Map<string, number>; awards: GcLeadAward[] }>();

  for (const r of rfps) {
    if (!isPastContract(r)) continue;
    // deadline = award date on award notices.
    const date = r.deadline?.slice(0, 10) ?? null;
    if (!date || date < cutoff || date > opts.today) continue;
    const { winner, amount, value } = parseAward(r.summary);
    if (!winner || !isPublishableWinner(winner) || isGiantOrPublicBody(winner)) continue;
    const key = winnerKey(winner);
    if (!key) continue;
    const src = publicTenderSource(r.slug);
    const g = groups.get(key) ?? { variants: new Map<string, number>(), awards: [] as GcLeadAward[] };
    g.variants.set(winner, (g.variants.get(winner) ?? 0) + 1);
    g.awards.push({
      slug: r.slug,
      title: r.title,
      amount,
      value,
      buyer: parseAwardBuyer(r.summary),
      date,
      regionName: r.regionName,
      categories: r.categories,
      noticeUrl: src.key === "awards" ? awardNoticeUrl(r.slug.split("-cba-").pop() ?? "") : null,
    });
    groups.set(key, g);
  }

  const out: GcLead[] = [];
  for (const [key, g] of groups) {
    // Mixed case beats SHOUTING, then the most common spelling.
    const name = [...g.variants.entries()].sort(
      (a, b) => Number(/[a-z]/.test(b[0])) - Number(/[a-z]/.test(a[0])) || b[1] - a[1],
    )[0][0];
    const awards = [...g.awards].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const categories = uniq(awards.flatMap((a) => a.categories));
    out.push({
      key,
      name,
      awards,
      totalValue: awards.reduce((s, a) => s + (a.amount ?? 0), 0),
      latest: awards[0]?.date ?? null,
      regions: uniq(awards.map((a) => a.regionName).filter((x): x is string => Boolean(x))),
      categories,
      generalContracting: categories.includes("General Contracting"),
    });
  }
  return out.sort((a, b) => (b.latest ?? "").localeCompare(a.latest ?? "") || b.totalValue - a.totalValue);
}
