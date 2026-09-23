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
  ["hvac", /\bhvac\b|heating|ventilation|air condition|chiller|boiler|furnace|refrigeration/],
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
  return s.replace(/\r/g, "").replace(/ | /g, " ").replace(/\n{3,}/g, "\n\n").trim();
}


/** Public-works infrastructure — not work a building trade bids on. */
export const CIVIL =
  /culvert|bridge|watermain|sewer|road (re)?construction|resurfacing|transit|pedestrian bridge|creek|trenchless|pipe lining|red light camera|highway|ditching|dredg|runway|student transportation|transportation of students|school bus|roadway|overpass|shoulder gravel|paving of roads|repairs to roads|\broute \d+|\btrunk \d+|\bbr\d{3,}/i;
