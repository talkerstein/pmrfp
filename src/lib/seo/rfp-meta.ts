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

/** Words and marks that look wrong as the last thing in a cut title ("… for the", "… and"). */
const DANGLING = /(?:[\s,;:–—\-/&(]+|\s+(?:of|the|and|for|to|at|in|on|or|a|an|with|de|du|des|la|le|les|et|pour|au|aux|d|l|y|del|para|en))$/i;

/**
 * At most `max` characters, always ending on a whole word (never "Roofin…"),
 * with no dangling "of" / "and" / "for". A single token longer than `max`
 * is the only thing that is cut hard. No ellipsis: use for <title> text.
 */
export function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  // The cut fell inside a word unless the next character is a space.
  if (s[max] !== " ") {
    const sp = out.lastIndexOf(" ");
    if (sp > 0) out = out.slice(0, sp);
  }
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(DANGLING, "");
  }
  return out || s.slice(0, max);
}

/** Like cutAtWord, with an ellipsis when something was cut. The result is at most `max` characters. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${cutAtWord(s, max - 1)}…`;
}

/** "City, ST" — whichever parts exist, without repeating the city as province. */
export function placeLabel(city: string | null | undefined, province: string | null | undefined): string {
  const parts = [city, province].filter((x): x is string => Boolean(x && x.trim()));
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) parts.pop();
  return parts.join(", ");
}
