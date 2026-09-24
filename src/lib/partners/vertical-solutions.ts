/**
 * One custom solution per trade, built by Talkerstein Consulting Group
 * (PMRFP's affiliate) and shown on that trade's /trades/[category] page.
 * Plan: briefs/strategy/2026-09-23-vertical-solutions.md.
 *
 * Rules that keep this a normal, disclosed sister-company link and not a link
 * scheme: one block per TRADE page (never on trade × city pages), copy written
 * for that trade, a descriptive anchor, and the affiliate disclosure. A block
 * only renders once its talkerstein.com page actually exists (see
 * liveSolutionFor), so nothing links to a 404 and a trade switches on by
 * itself the day its page is published.
 */
export interface VerticalSolution {
  tradeSlug: string;
  name: string;
  /** Section heading on the trade page. */
  headline: string;
  pitch: string;
  /** What the property manager gets, in three short lines. */
  points: string[];
  href: string;
  anchor: string;
}

export const VERTICAL_SOLUTIONS: VerticalSolution[] = [
  {
    tradeSlug: "snow-removal",
    name: "Storm Log",
    headline: "Storm Log: prove every visit, at every property",
    pitch:
      "When a slip-and-fall claim lands, the question is what happened at that property, on that day, at that time. Storm Log gives each property a record your property manager can check any time.",
    points: [
      "Every visit time-stamped by GPS, with photos and the salt applied",
      "A private link per property for the property manager, no app to install",
      "A season report per property when the snow melts",
    ],
    href: "https://talkerstein.com/solutions/snow-removal-contractors",
    anchor: "See Storm Log for snow removal contractors",
  },
];

export function solutionForTrade(tradeSlug: string): VerticalSolution | null {
  return VERTICAL_SOLUTIONS.find((s) => s.tradeSlug === tradeSlug) ?? null;
}

/**
 * The trade's solution, but only if its talkerstein.com page is live (Framer
 * answers a real 404 for pages that don't exist). Checked at most every 6
 * hours through the fetch cache; any error or timeout hides the block.
 */
export async function liveSolutionFor(tradeSlug: string): Promise<VerticalSolution | null> {
  const s = solutionForTrade(tradeSlug);
  if (!s) return null;
  try {
    const res = await fetch(s.href, {
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? s : null;
  } catch {
    return null;
  }
}
