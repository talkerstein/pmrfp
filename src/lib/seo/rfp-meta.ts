/**
 * Search-facing title / description pieces for an RFP detail page.
 *
 * Search Console: RFP pages win clicks on the tender's own name and on the
 * site address ("Dufferin ... tender"), so the title carries the full tender
 * name plus the city, and the description leads with the buyer and the
 * closing date — the two things a bidder checks first.
 */

/** Buyer name out of a public-tender summary ("Public tender from X (City), posted on …"). */
export function buyerFromSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const m = summary.match(/^(?:Public tender|Award notice|Appel d'offres public|Licitación pública) (?:from|de|del) (.+?)(?: \([^)]*\))?(?:,| posted| publié| publicad|\.)/i);
  const name = m?.[1]?.trim();
  return name && name.length <= 90 ? name : null;
}

/** Drop US federal classification codes ("NAICS 237990 PSC Y1PZ--CONS: ") that bury the real name. */
export function cleanTenderTitle(title: string): string {
  return title.replace(/^NAICS\s+\d+\s+(?:PSC\s+[^:]{1,40}:\s*)?/i, "").replace(/\s+/g, " ").trim() || title;
}

/** Cut at a word boundary so Google doesn't do it mid-word. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
}

/** "City, ST" — whichever parts exist, without repeating the city as province. */
export function placeLabel(city: string | null | undefined, province: string | null | undefined): string {
  const parts = [city, province].filter((x): x is string => Boolean(x && x.trim()));
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) parts.pop();
  return parts.join(", ");
}
