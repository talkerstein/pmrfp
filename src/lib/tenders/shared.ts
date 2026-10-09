/**
 * Shared by every public-tender source: which PMRFP trade a piece of work is,
 * and which work a trade can't bid on at all.
 */

// Ordered: title/commodity-code matches win. Word boundaries matter —
// "Defence" must not read as fencing.
export const RULES: [slug: string, pattern: RegExp][] = [
  ["snow-removal", /snow (removal|clearing|plow)|de-?icing|winter maintenance/],
  ["cleaning-janitorial", /janitor|custodial|cleaning services?|building cleaning|window cleaning/],
  ["landscaping", /landscap|grounds? maintenance|\blawn|mowing|grass cutting|tree (removal|pruning|trimming)/],
  ["hvac", /\bhvac\b|heating|ventilation|air condition|chiller|cooling tower|boiler|furnace|refrigeration/],
  ["roofing", /\broof/],
  ["electrical", /electrical|electrician|generator|switchgear|power distribution/],
  ["plumbing", /plumbing|plumber|backflow|water heater|hot water tank|sewer|septic|cistern/],
  ["painting", /\bpainting\b|paint services/],
  ["pest-control", /pest control|extermina|rodent control/],
  ["elevator-services", /elevator|escalator/],
  ["fire-safety", /fire (alarm|suppression|protection|extinguish|sprinkler|safety)|sprinkler|life safety/],
  ["security-systems", /(electronic )?security systems?|access control|intrusion detection|cctv/],
  ["flooring", /flooring|carpet|floor finish/],
  ["garage-doors", /overhead (steel )?doors?|roll-?up doors?|garage doors?|dock doors?/],
  ["signage", /signage|wayfinding/],
  ["waste-removal", /waste (removal|management|collection|disposal)|garbage/],
  ["concrete-and-asphalt", /asphalt|paving|concrete (repair|work)|shotcrete/],
  ["glass-and-windows", /window (replacement|repair|installation)|glazing|curtain wall/],
  ["demolition", /demolition/],
  ["environmental-hazardous-materials", /asbestos|hazardous materials?|designated substance|abatement|mould|mold remediation/],
  ["fencing", /\bfenc(e|es|ing)\b|service gates?/],
  ["masonry", /masonry|brickwork|stone repair/],
  ["waterproofing", /waterproof|caulking/],
  ["general-contracting", /renovation|general contract|building repair|fit-?up|retrofit|rehabilitation|reconstruction|wharf repairs?|construction services for/],
  ["property-maintenance", /facilit(y|ies) maintenance|building maintenance|property maintenance|operations and maintenance/],
];

// Services a trade can't bid on, even when a keyword above matches.
export const EXCLUDE =
  /software|cyber|\bit\b services|information technology|consult|architect|engineering services|\ba&e\b|design services|modell?ing|assessment|study|research|laboratory|testing|training|translation|aircraft|vessel|\bship|satellite|weapon|ammunition|medical|pharmac|spare parts|advisory|equipment rental|design engineering|pre-design|\brental\b/;


export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function clean(s: string): string {
  return repairFeedText(s).replace(/\r/g, "").replace(/ | /g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Some feeds (Nova Scotia's awards CSV) ship U+FFFD where the source had a
 * dash or a curly quote. On the page it shows as a box; in an OG image it makes
 * the renderer fetch a font for it and fail. A spaced one was a dash.
 */
export function repairFeedText(s: string): string {
  return s.replace(/\s\uFFFD\s/g, " – ").replace(/\uFFFD/g, "");
}


/**
 * Building work the trade RULES miss because the title names the building,
 * not the trade: "Fire Station #2 New Construction", "Storage Building
 * Replacement", "Classroom Upfit". Read as general contracting.
 */
export const BUILDING_WORK =
  /new construction|construction of (?:an? |the )?(?:new )?[a-z#0-9' -]{0,40}\b(?:building|station|center|facility|school|shelter|hall|housing|gym|library|clinic)|(?:building|facility|school|station|hall) (?:replacement|addition|expansion|upgrades?)|(?:housing|building|facility|station|center|clinic|school) construction|\bup-?fit\b|balcony|bathroom|restroom|interior (?:finish|improvement)|exterior envelope|envelope (?:repair|restoration)|tenant improvement/;

/** Trade slugs for a title: the shared RULES, else BUILDING_WORK → general contracting. */
export function tradesFor(title: string): string[] {
  const byRule = [...new Set(RULES.filter(([, p]) => p.test(title)).map(([slug]) => slug))];
  if (byRule.length) return byRule.slice(0, 3);
  return BUILDING_WORK.test(title) ? ["general-contracting"] : [];
}

/**
 * When a tender was published, as an rfp_posts timestamp. Anything from
 * yesterday on counts as today, so a fresh notice reaches the alerts cron.
 */
export function publishedAt(posted: string | null | undefined, today: string): string {
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const day = (posted ?? "").slice(0, 10);
  return !/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= yesterday ? `${today}T00:00:00Z` : `${day}T00:00:00Z`;
}

/** "Some long title…" capped for cards. */
export function cap(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Public-works infrastructure — not work a building trade bids on. */
export const CIVIL =
  /culvert|bridge|watermain|sewer|road (re)?construction|resurfacing|transit|pedestrian bridge|creek|trenchless|pipe lining|red light camera|highway|ditching|dredg|runway|student transportation|transportation of students|school bus|roadway|overpass|shoulder gravel|paving of roads|repairs to roads|\broute \d+|\btrunk \d+|\bbr\d{3,}/i;
