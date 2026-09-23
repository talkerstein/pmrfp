import type { RfpListItem } from "@/lib/data/types";
import { listRfps } from "@/lib/data/rfps";
import { isPastContract, parseAward } from "@/lib/data/fomo";
import { publicTenderSource } from "@/lib/tenders/sources";
import { slugify } from "@/lib/tenders/shared";

/**
 * Contract-winner pages — built from the real public award notices already on
 * the board. Pages exist only for companies with 2+ awards (a single award is
 * already its own page), and never for entries that look like a person's name
 * (the open-data licences exclude personal information) or placeholder text.
 */

export interface WinnerAward {
  slug: string;
  title: string;
  amount: number | null;
  date: string | null;
  issuer: string;
  source: string;
  attribution: string;
  regionName: string | null;
  categories: string[];
}

export interface Winner {
  slug: string;
  name: string;
  awards: WinnerAward[];
  totalValue: number;
  categories: string[];
  issuers: string[];
  regions: string[];
  latest: string | null;
  attributions: string[];
}

/** Placeholders some buyers publish in the "awarded to" field. */
const JUNK = /^(no bids?|multiple bidders|info only|n\/?a|none|cancel+ed|various|tbd|not awarded)$/i;
/** "Alain Roy" — two plain capitalized words… */
const PERSON = /^[A-ZÀ-Ý][a-zà-ÿ'’-]+ [A-ZÀ-Ý][a-zà-ÿ'’-]+$/i;
/** …unless one of them is a business word ("Dexter Construction", "Metro Roofing"). */
const BUSINESS_WORD =
  /\b(construction|constructors?|contracting|contractors?|roofing|paving|asphalt|concrete|electric\w*|mechanical|plumbing|heating|hvac|services?|cleaning|cleaners|janitorial|systems?|group|enterprises?|entreprises?|industries|solutions|maintenance|environmental|builders?|building|restoration|technolog\w*|elevators?|fenc\w*|floors?|flooring|landscap\w*|excavation|painting|painters|glass|glazing|doors?|windows?|security|fire|waste|management|supply|projects?|developments?|infrastructure|engineering|energy|power|drain\w*|masonry|steel|welding|demolition|abatement|excavating|lawn|snow)\b/i;
const LEGAL_SUFFIX = /\b(inc|ltd|limited|ltée|ltee|corp|corporation|co|company|llc|lp|ulc|incorporated)\b/g;

/** Grouping key: "DEXTER CONSTRUCTION CO. LTD." ≡ "Dexter Construction Company Ltd". */
export function winnerKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
}

export function isPublishableWinner(name: string): boolean {
  const n = name.trim();
  if (n.length < 3 || JUNK.test(n)) return false;
  return !PERSON.test(n) || BUSINESS_WORD.test(n);
}

/** Prefer a mixed-case spelling ("Metro Roofing Ltd.") over SHOUTING, then the most common. */
function displayName(variants: Map<string, number>): string {
  return [...variants.entries()]
    .sort((a, b) => Number(/[a-z]/.test(b[0])) - Number(/[a-z]/.test(a[0])) || b[1] - a[1])[0][0];
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** Group the board's past contracts by winning company. Pure — for pages that already have listRfps(). */
export function winnersFromRfps(rfps: RfpListItem[], minAwards = 2): Winner[] {
  const groups = new Map<string, { variants: Map<string, number>; awards: WinnerAward[] }>();
  for (const r of rfps) {
    if (!isPastContract(r)) continue;
    const { winner, amount } = parseAward(r.summary);
    if (!winner || !isPublishableWinner(winner)) continue;
    const key = winnerKey(winner);
    if (!key) continue;
    const g = groups.get(key) ?? { variants: new Map<string, number>(), awards: [] as WinnerAward[] };
    g.variants.set(winner, (g.variants.get(winner) ?? 0) + 1);
    const src = publicTenderSource(r.slug);
    g.awards.push({
      slug: r.slug,
      title: r.title,
      amount,
      date: r.deadline,
      issuer: src.issuer,
      source: src.badge.replace(/^Past public contract · /, ""),
      attribution: src.attribution,
      regionName: r.regionName,
      categories: r.categories,
    });
    groups.set(key, g);
  }

  const out: Winner[] = [];
  const usedSlugs = new Set<string>();
  for (const g of groups.values()) {
    if (g.awards.length < minAwards) continue;
    const name = displayName(g.variants);
    let slug = slugify(name).slice(0, 80);
    if (!slug) continue;
    if (usedSlugs.has(slug)) slug = `${slug}-${g.awards.length}`;
    usedSlugs.add(slug);
    const awards = [...g.awards].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    out.push({
      slug,
      name,
      awards,
      totalValue: awards.reduce((s, a) => s + (a.amount ?? 0), 0),
      categories: uniq(awards.flatMap((a) => a.categories)),
      issuers: uniq(awards.map((a) => a.issuer)),
      regions: uniq(awards.map((a) => a.regionName).filter((x): x is string => Boolean(x))),
      latest: awards[0]?.date ?? null,
      attributions: uniq(awards.map((a) => a.attribution)),
    });
  }
  return out.sort((a, b) => b.totalValue - a.totalValue || b.awards.length - a.awards.length);
}

export async function listWinners(): Promise<Winner[]> {
  return winnersFromRfps(await listRfps());
}

export async function getWinner(slug: string): Promise<Winner | null> {
  return (await listWinners()).find((w) => w.slug === slug) ?? null;
}
