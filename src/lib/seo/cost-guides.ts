/**
 * Commercial property cost-guide data for /cost-guides + /cost-guides/[slug].
 *
 * SEO play: capture high-intent buyer research queries ("commercial roof
 * replacement cost", "office renovation cost per sq ft") and convert the
 * researcher into an RFP poster — the job-supply side of the marketplace.
 *
 * IMPORTANT: every figure here is a general planning estimate for Canadian
 * commercial work, NOT a quote. The page UI surfaces this prominently and
 * always routes to "post an RFP" for real, scope-specific pricing.
 */

export interface CostRow {
  item: string;
  range: string;
  note?: string;
}

export interface CostGuide {
  slug: string;
  /** Noun phrase for the H1, e.g. "Commercial Roof Replacement". */
  name: string;
  /** The buyer search phrase, used in the eyebrow. */
  query: string;
  /** Maps to a real /trades/[tradeSlug] category. */
  tradeSlug: string;
  tradeName: string;
  headline: string;
  intro: string;
  /** Headline range shown in the hero. */
  typicalRange: string;
  /** Unit the headline range is expressed in, e.g. "installed, per sq ft". */
  rangeUnit: string;
  rows: CostRow[];
  factors: { title: string; desc: string }[];
  faqs: { q: string; a: string }[];
  metaTitle: string;
  metaDescription: string;
}

export const COST_GUIDES: CostGuide[] = [
  {
    slug: "commercial-roof-replacement-cost",
    name: "Commercial Roof Replacement",
    query: "commercial roof replacement cost",
    tradeSlug: "roofing",
    tradeName: "Roofing",
    headline: "How much does commercial roof replacement cost in Canada?",
    intro:
      "Replacing a commercial roof is usually priced by the square foot of installed roof area, then adjusted for tear-off, deck repair, insulation, access, and membrane type. Flat low-slope systems (TPO, EPDM, modified bitumen) dominate Canadian commercial buildings, and the membrane you choose is the single biggest cost lever.",
    typicalRange: "$8 – $22 / sq ft",
    rangeUnit: "installed, including tear-off",
    rows: [
      { item: "EPDM (rubber) membrane", range: "$8 – $14 / sq ft", note: "Most economical single-ply; good lifespan in cold climates." },
      { item: "TPO membrane", range: "$9 – $16 / sq ft", note: "Energy-efficient white reflective surface; popular for retrofits." },
      { item: "Modified bitumen (2-ply)", range: "$10 – $17 / sq ft", note: "Durable, torch- or self-adhered." },
      { item: "Built-up roof (BUR / tar & gravel)", range: "$11 – $19 / sq ft" },
      { item: "Tear-off & disposal of old roof", range: "$1.50 – $4 / sq ft", note: "Higher with multiple existing layers or asbestos." },
      { item: "Tapered insulation upgrade", range: "$2 – $6 / sq ft", note: "Often required to meet current code/drainage." },
    ],
    factors: [
      { title: "Roof size & sections", desc: "Larger continuous roofs cost less per square foot; many small sections and penetrations push the rate up." },
      { title: "Tear-off vs. recover", desc: "Removing old layers (and disposal) adds cost; a recover over a sound deck is cheaper but not always code-compliant." },
      { title: "Deck & structural repair", desc: "Rotted decking, drains, and parapet work discovered mid-job are common change-order drivers." },
      { title: "Access & occupancy", desc: "Crane staging, occupied buildings, and night/weekend work to avoid disruption raise labour cost." },
      { title: "Warranty tier", desc: "Manufacturer NDL warranties (15–30 yr) require certified installers and specific assemblies, adding to the bid." },
    ],
    faqs: [
      { q: "How long does a commercial roof last?", a: "Most single-ply and modified-bitumen commercial roofs last 20–30 years with maintenance. Getting two or three competitive RFP responses lets you compare warranty terms, not just price." },
      { q: "Repair or replace?", a: "If the membrane is past 75% of its expected life and you're seeing repeat leaks, replacement is usually more economical than chasing patches. A scoped RFP gets you both options priced." },
      { q: "Are these prices guaranteed?", a: "No. These are general Canadian planning ranges, not quotes. Actual pricing depends on your building, region, and scope — post an RFP to get real numbers from interested roofers." },
    ],
    metaTitle: "Commercial Roof Replacement Cost in Canada (2026 Guide) | PMRFP",
    metaDescription:
      "What commercial roof replacement costs per square foot in Canada by membrane type (TPO, EPDM, modified bitumen), plus the factors that move the price. Get real quotes by posting an RFP.",
  },
  {
    slug: "commercial-hvac-replacement-cost",
    name: "Commercial HVAC Replacement",
    query: "commercial HVAC replacement cost",
    tradeSlug: "hvac",
    tradeName: "HVAC",
    headline: "How much does commercial HVAC replacement cost in Canada?",
    intro:
      "Commercial HVAC is usually priced per rooftop unit (RTU) or per ton of cooling capacity, plus curb adaptation, crane lift, electrical, controls, and gas. Rooftop package units are the workhorse of Canadian commercial buildings; chillers and built-up systems sit well above this range.",
    typicalRange: "$9,000 – $30,000",
    rangeUnit: "per rooftop unit, installed",
    rows: [
      { item: "Rooftop unit, 3–5 ton", range: "$9,000 – $16,000", note: "Small retail / office; includes crane and curb adapter." },
      { item: "Rooftop unit, 7.5–10 ton", range: "$16,000 – $30,000" },
      { item: "Per ton of cooling (rule of thumb)", range: "$2,000 – $4,000 / ton" },
      { item: "Curb adapter & rigging", range: "$1,200 – $4,000 / unit", note: "Replacing a different make/model usually needs an adapter." },
      { item: "Controls / BAS integration", range: "$800 – $5,000+", note: "Higher when tying into building automation." },
      { item: "Preventive maintenance contract", range: "$300 – $900 / unit / yr" },
    ],
    factors: [
      { title: "Tonnage & efficiency", desc: "Higher capacity and high-efficiency (high SEER/IEER) units cost more up front but lower operating cost." },
      { title: "Crane & roof access", desc: "Tight sites, tall buildings, and downtown lifts add rigging and permit cost." },
      { title: "Like-for-like vs. upgrade", desc: "Matching the existing curb and electrical is cheapest; changing fuel, voltage, or capacity adds work." },
      { title: "Controls & zoning", desc: "Integrating with a building automation system or adding economizers/CO2 sensors increases the bid." },
      { title: "Number of units", desc: "Replacing a bank of RTUs at once usually earns a better per-unit rate than one-offs." },
    ],
    faqs: [
      { q: "What's the lifespan of a commercial RTU?", a: "Typically 15–20 years. Past 15 years, rising repair frequency and refrigerant phase-outs (e.g. R-410A transitions) often justify replacement." },
      { q: "Should I replace all units at once?", a: "Bundling replacements usually lowers the per-unit price and lets you standardize on one manufacturer for parts. Post a single RFP listing all units to get bundled pricing." },
      { q: "Are these prices guaranteed?", a: "No — they're general Canadian planning ranges, not quotes. Your real number depends on tonnage, access, and controls. Post an RFP to get competitive bids from HVAC contractors." },
    ],
    metaTitle: "Commercial HVAC Replacement Cost in Canada (2026 Guide) | PMRFP",
    metaDescription:
      "Commercial HVAC and rooftop unit replacement costs in Canada — per unit and per ton — plus the factors that drive the price. Get real quotes by posting an RFP.",
  },
  {
    slug: "office-renovation-cost",
    name: "Office Renovation & Fit-Out",
    query: "office renovation cost per square foot",
    tradeSlug: "general-contracting",
    tradeName: "General Contracting",
    headline: "How much does an office renovation cost per square foot in Canada?",
    intro:
      "Office renovations and tenant fit-outs are priced per square foot of usable area, and the spread is wide because finishes, mechanical/electrical scope, and whether you're touching the base building all swing the number. A cosmetic refresh and a full gut-and-rebuild can differ by 4–5x.",
    typicalRange: "$50 – $250 / sq ft",
    rangeUnit: "depending on scope & finish level",
    rows: [
      { item: "Cosmetic refresh (paint, flooring, lighting)", range: "$30 – $70 / sq ft" },
      { item: "Standard fit-out (new layout, basic MEP)", range: "$80 – $150 / sq ft" },
      { item: "High-end / full fit-out", range: "$150 – $250+ / sq ft", note: "Custom millwork, premium finishes, full MEP." },
      { item: "Demolition / strip-out", range: "$6 – $15 / sq ft" },
      { item: "HVAC & electrical reconfiguration", range: "$20 – $60 / sq ft" },
      { item: "Architectural / permit / design fees", range: "8 – 15% of project", note: "On top of construction cost." },
    ],
    factors: [
      { title: "Finish level", desc: "Builder-grade vs. designer finishes, glass walls, and custom millwork are the biggest swing factor." },
      { title: "Mechanical & electrical scope", desc: "Moving HVAC, sprinklers, and electrical to suit a new layout is far more than a cosmetic refresh." },
      { title: "Base-building condition", desc: "Older buildings may need code upgrades (accessibility, fire, electrical) triggered by the permit." },
      { title: "Schedule & after-hours work", desc: "Occupied-floor and after-hours work to keep a business running adds premium labour." },
      { title: "Permits & approvals", desc: "Permit timelines, landlord approvals, and design fees add cost and time beyond construction." },
    ],
    faqs: [
      { q: "What's included in a 'fit-out'?", a: "Typically demolition, partitions, ceilings, flooring, lighting, HVAC/electrical reconfiguration, millwork, and finishes — built to a tenant's layout. Scope it clearly in your RFP so bids are comparable." },
      { q: "How do I keep bids comparable?", a: "Give every contractor the same scope, drawings, and finish schedule. An RFP that spells out the scope once gets you apples-to-apples proposals instead of guesswork." },
      { q: "Are these prices guaranteed?", a: "No — these are general Canadian planning ranges, not quotes. Real pricing depends heavily on finish level and MEP scope. Post an RFP to get competitive bids from general contractors." },
    ],
    metaTitle: "Office Renovation Cost Per Square Foot in Canada (2026) | PMRFP",
    metaDescription:
      "Office renovation and tenant fit-out costs per square foot in Canada — from cosmetic refresh to full fit-out — plus the factors that move the price. Get real quotes by posting an RFP.",
  },
  {
    slug: "commercial-electrical-cost",
    name: "Commercial Electrical Work",
    query: "commercial electrician cost",
    tradeSlug: "electrical",
    tradeName: "Electrical",
    headline: "How much does commercial electrical work cost in Canada?",
    intro:
      "Commercial electrical is priced by the job, by the device count, or by service-upgrade capacity (amps). Most property-level work — panel upgrades, lighting retrofits, service calls, and tenant power — falls into predictable bands, but anything touching the main service or requiring an ESA inspection adds engineering and permit cost.",
    typicalRange: "$95 – $165 / hr",
    rangeUnit: "licensed electrician labour",
    rows: [
      { item: "Service call / diagnostics", range: "$150 – $400", note: "Trip + first hour; emergency rates higher." },
      { item: "Panel / service upgrade (200A)", range: "$2,500 – $6,000" },
      { item: "Service upgrade (400–600A)", range: "$6,000 – $20,000+", note: "May require utility coordination + ESA." },
      { item: "LED lighting retrofit", range: "$80 – $250 / fixture", note: "Rebates can offset a meaningful share." },
      { item: "EV charger install (commercial L2)", range: "$2,000 – $7,000 / port", note: "Excludes major service upgrades." },
      { item: "Tenant power / new circuits", range: "$300 – $1,200 / circuit" },
    ],
    factors: [
      { title: "Service capacity", desc: "Upgrading the main service (amps) is the costliest electrical work and may involve the utility and an ESA inspection." },
      { title: "Device & fixture count", desc: "Lighting retrofits and outlet/circuit work scale with quantity — volume usually earns a better rate." },
      { title: "Access & ceilings", desc: "Hard-lid ceilings, occupied space, and high or tight runs increase labour hours." },
      { title: "Permits & inspection", desc: "ESA permits and inspections (in Ontario) and equivalent provincial authorities add cost and schedule." },
      { title: "After-hours work", desc: "Shutdowns for occupied buildings often must happen nights/weekends at premium rates." },
    ],
    faqs: [
      { q: "Do I need an ESA permit?", a: "In Ontario, most commercial electrical work requires an ESA permit and inspection; other provinces have equivalent authorities. A licensed contractor handles this — confirm it's in their proposal." },
      { q: "Can lighting retrofits pay for themselves?", a: "Often, through energy savings and utility rebates. Ask bidders to include the rebate-adjusted payback in their RFP response." },
      { q: "Are these prices guaranteed?", a: "No — these are general Canadian planning ranges, not quotes. Post an RFP to get real, scope-specific bids from licensed commercial electricians." },
    ],
    metaTitle: "Commercial Electrician Cost in Canada (2026 Guide) | PMRFP",
    metaDescription:
      "Commercial electrical costs in Canada — service upgrades, panels, lighting retrofits, EV chargers, and hourly rates — plus what drives the price. Get real quotes by posting an RFP.",
  },
  {
    slug: "commercial-painting-cost",
    name: "Commercial Painting",
    query: "commercial painting cost",
    tradeSlug: "painting",
    tradeName: "Painting",
    headline: "How much does commercial painting cost in Canada?",
    intro:
      "Commercial painting is priced per square foot of wall (or floor) area, with prep, height, coatings, and access driving the spread. Interior repaints sit at the low end; exterior, high-ceiling, and specialty-coating work (epoxy floors, intumescent fireproofing) runs well above.",
    typicalRange: "$1.50 – $4.50 / sq ft",
    rangeUnit: "interior wall area, 2 coats",
    rows: [
      { item: "Interior walls (2 coats)", range: "$1.50 – $3.50 / sq ft" },
      { item: "Interior with heavy prep / patching", range: "$3 – $5 / sq ft" },
      { item: "Exterior (per sq ft of surface)", range: "$2.50 – $6 / sq ft", note: "Higher with lifts/scaffolding." },
      { item: "Epoxy floor coating", range: "$4 – $12 / sq ft" },
      { item: "High ceilings / lift work", range: "+15 – 40%", note: "Premium over standard-height rates." },
      { item: "Line striping (parking)", range: "$4 – $9 / stall" },
    ],
    factors: [
      { title: "Surface prep", desc: "Patching, sanding, priming, and mould or stain remediation can exceed the painting itself on neglected surfaces." },
      { title: "Height & access", desc: "Lifts, scaffolding, and swing stages for high or exterior work add equipment and labour cost." },
      { title: "Coating type", desc: "Standard latex is cheapest; epoxy, anti-graffiti, intumescent, and industrial coatings cost more per square foot." },
      { title: "Occupancy & scheduling", desc: "Painting around an operating business, often after hours, raises labour cost." },
      { title: "Area & repeat work", desc: "Large continuous areas and recurring multi-property contracts earn better rates." },
    ],
    faqs: [
      { q: "How is commercial painting quoted?", a: "Usually per square foot of surface area, with separate line items for prep, coatings, and access. Provide square footage and surface condition in your RFP for accurate bids." },
      { q: "Can I get one price across multiple buildings?", a: "Yes — portfolio owners often bundle repaint cycles into one contract for a better rate. Post a single RFP covering all locations." },
      { q: "Are these prices guaranteed?", a: "No — these are general Canadian planning ranges, not quotes. Post an RFP to get real bids from commercial painters." },
    ],
    metaTitle: "Commercial Painting Cost in Canada (2026 Guide) | PMRFP",
    metaDescription:
      "Commercial painting costs in Canada per square foot — interior, exterior, epoxy floors, and high-access work — plus what drives the price. Get real quotes by posting an RFP.",
  },
  {
    slug: "parking-lot-paving-cost",
    name: "Parking Lot Paving & Asphalt",
    query: "parking lot paving cost",
    tradeSlug: "concrete-and-asphalt",
    tradeName: "Concrete and Asphalt",
    headline: "How much does parking lot paving cost in Canada?",
    intro:
      "Parking-lot asphalt is priced per square foot for paving and per job for maintenance like sealcoating and crack-fill. Whether you're resurfacing (overlay) or doing full-depth reconstruction is the biggest cost driver — reconstruction can be 2–3x an overlay.",
    typicalRange: "$3 – $9 / sq ft",
    rangeUnit: "new asphalt, installed",
    rows: [
      { item: "Asphalt overlay (resurface)", range: "$2.50 – $5 / sq ft", note: "Over a sound base." },
      { item: "Full-depth reconstruction", range: "$6 – $12 / sq ft", note: "Excavation + new base + asphalt." },
      { item: "Sealcoating", range: "$0.20 – $0.45 / sq ft", note: "Every 2–3 years; protects the surface." },
      { item: "Crack filling", range: "$1 – $3 / linear ft" },
      { item: "Line striping & markings", range: "$5 – $12 / stall" },
      { item: "Catch basin / drainage repair", range: "$1,500 – $5,000 / basin" },
    ],
    factors: [
      { title: "Overlay vs. reconstruction", desc: "A sound base only needs an overlay; a failed base requires excavation and rebuild at multiples of the cost." },
      { title: "Base & drainage condition", desc: "Poor drainage and a weak granular base cause premature failure — repairing it up front protects the investment." },
      { title: "Lot size & mobilization", desc: "Larger lots lower the per-square-foot rate; small lots carry fixed mobilization cost." },
      { title: "Phasing around traffic", desc: "Keeping a lot partly open during work, or night paving, adds cost." },
      { title: "Accessibility & markings", desc: "Code-compliant accessible stalls, signage, and fresh striping are usually part of the scope." },
    ],
    faqs: [
      { q: "How often should a lot be sealcoated?", a: "Every 2–3 years to protect the asphalt and extend its life. Many owners bundle sealcoating and striping into a recurring maintenance contract via one RFP." },
      { q: "Overlay or full reconstruction?", a: "If the base is sound and cracking is surface-level, an overlay works. Widespread alligator cracking and potholes usually signal base failure. A scoped RFP gets both options priced." },
      { q: "Are these prices guaranteed?", a: "No — these are general Canadian planning ranges, not quotes. Post an RFP to get real bids from paving contractors." },
    ],
    metaTitle: "Parking Lot Paving Cost in Canada (2026 Guide) | PMRFP",
    metaDescription:
      "Commercial parking lot paving and asphalt costs in Canada — overlay, reconstruction, sealcoating, and striping — plus what drives the price. Get real quotes by posting an RFP.",
  },
  {
    slug: "commercial-snow-removal-cost",
    name: "Commercial Snow Removal",
    query: "commercial snow removal cost",
    tradeSlug: "snow-removal",
    tradeName: "Snow Removal",
    headline: "How much does commercial snow removal cost in Canada?",
    intro:
      "Commercial snow contracts are priced per push, per season (flat seasonal), or per hour, plus salting/de-icing. Seasonal contracts trade predictability for the contractor carrying weather risk; per-push is cheaper in a mild winter and more in a heavy one. Lot size and trigger depth set the rate.",
    typicalRange: "$3,500 – $25,000",
    rangeUnit: "per seasonal contract (lot-dependent)",
    rows: [
      { item: "Per-push plowing (small lot)", range: "$75 – $250 / visit" },
      { item: "Per-push plowing (large lot)", range: "$250 – $900 / visit" },
      { item: "Seasonal contract (small lot)", range: "$3,500 – $8,000 / season" },
      { item: "Seasonal contract (large lot)", range: "$10,000 – $25,000+ / season" },
      { item: "Salting / de-icing", range: "$100 – $500 / application" },
      { item: "Sidewalk clearing", range: "$50 – $200 / visit" },
    ],
    factors: [
      { title: "Lot size & layout", desc: "Square footage, number of entrances, islands, and snow-storage room all affect time on site." },
      { title: "Contract structure", desc: "Seasonal (flat) shifts weather risk to the contractor; per-push shifts it to you. Each suits a different risk appetite." },
      { title: "Trigger depth & service level", desc: "A 2 cm trigger with priority clearing costs more than a 5 cm trigger with standard timing." },
      { title: "Salting & liability", desc: "Slip-and-fall liability makes de-icing and documented service logs valuable — and a cost line." },
      { title: "Sidewalks & accessibility", desc: "Hand-clearing walkways, entrances, and accessible routes adds labour beyond plowing." },
    ],
    faqs: [
      { q: "Seasonal or per-push — which is cheaper?", a: "Over many winters they roughly even out. Seasonal gives you a fixed budget and shifts weather risk to the contractor; per-push can win in mild years. Ask for both in your RFP." },
      { q: "Is salting included?", a: "Not always — confirm whether de-icing, sidewalks, and a service log are in scope. Spell out the service level in your RFP so bids are comparable." },
      { q: "Are these prices guaranteed?", a: "No — these are general Canadian planning ranges, not quotes. Post an RFP to get real bids from snow-removal contractors for your specific site." },
    ],
    metaTitle: "Commercial Snow Removal Cost in Canada (2026 Guide) | PMRFP",
    metaDescription:
      "Commercial snow removal costs in Canada — per push, seasonal, salting, and sidewalks — plus the factors that drive the price. Get real quotes by posting an RFP.",
  },
  {
    slug: "commercial-cleaning-cost",
    name: "Commercial Cleaning & Janitorial",
    query: "commercial cleaning cost",
    tradeSlug: "cleaning-janitorial",
    tradeName: "Cleaning / Janitorial",
    headline: "How much does commercial cleaning cost in Canada?",
    intro:
      "Janitorial contracts are priced per square foot per month, per hour, or per visit, depending on frequency and the type of space. Frequency (daily vs. weekly), restroom count, and specialty work like floor care and post-construction cleanup are the main cost drivers.",
    typicalRange: "$0.08 – $0.30 / sq ft",
    rangeUnit: "per month, recurring janitorial",
    rows: [
      { item: "Office cleaning (monthly, per sq ft)", range: "$0.08 – $0.20 / sq ft / mo" },
      { item: "Medical / lab cleaning", range: "$0.15 – $0.35 / sq ft / mo", note: "Higher compliance + disinfection." },
      { item: "Hourly janitorial rate", range: "$28 – $50 / hr" },
      { item: "Floor strip & wax", range: "$0.30 – $0.75 / sq ft" },
      { item: "Carpet cleaning", range: "$0.15 – $0.40 / sq ft" },
      { item: "Post-construction cleanup", range: "$0.30 – $0.80 / sq ft" },
    ],
    factors: [
      { title: "Frequency", desc: "Daily service costs more per month than weekly, but lowers the per-visit rate. Match frequency to actual foot traffic." },
      { title: "Space type", desc: "Medical, lab, food, and industrial spaces require more rigorous protocols and supplies than standard office." },
      { title: "Restrooms & high-touch areas", desc: "Restroom count and high-touch disinfection drive labour and consumable cost." },
      { title: "Specialty floor care", desc: "Strip-and-wax, burnishing, and carpet extraction are usually quoted separately from routine cleaning." },
      { title: "Supplies & consumables", desc: "Whether paper, soap, and liners are contractor- or owner-supplied changes the monthly number." },
    ],
    faqs: [
      { q: "How is janitorial usually priced?", a: "Most commercial contracts are a flat monthly rate based on square footage and frequency, with floor care and consumables as separate lines. Give square footage and frequency in your RFP for accurate bids." },
      { q: "Can I cover multiple sites in one contract?", a: "Yes — portfolio owners commonly bundle locations for a better rate and one point of contact. Post a single RFP listing all sites." },
      { q: "Are these prices guaranteed?", a: "No — these are general Canadian planning ranges, not quotes. Post an RFP to get real bids from janitorial companies." },
    ],
    metaTitle: "Commercial Cleaning Cost in Canada (2026 Guide) | PMRFP",
    metaDescription:
      "Commercial cleaning and janitorial costs in Canada — per square foot, hourly, and floor care — plus what drives the price. Get real quotes by posting an RFP.",
  },
  {
    slug: "mold-remediation-cost",
    name: "Commercial Mold Remediation",
    query: "mold remediation cost",
    tradeSlug: "mold-remediation",
    tradeName: "Mold Remediation",
    headline: "How much does commercial mold remediation cost in Canada?",
    intro:
      "Mold remediation is priced by the affected area and the containment level required. Small, contained jobs are predictable; large or hidden contamination behind walls, in HVAC, or tied to ongoing water intrusion escalates quickly because the source must be fixed too.",
    typicalRange: "$15 – $40 / sq ft",
    rangeUnit: "affected area, with containment",
    rows: [
      { item: "Small contained area (< 30 sq ft)", range: "$750 – $2,500" },
      { item: "Moderate area (30–100 sq ft)", range: "$2,500 – $7,000" },
      { item: "Large / multi-room", range: "$7,000 – $30,000+" },
      { item: "Third-party air/clearance testing", range: "$400 – $1,200 / test", note: "Pre- and post-remediation." },
      { item: "HVAC system remediation", range: "$2,000 – $8,000+" },
      { item: "Source repair (leak/waterproofing)", range: "varies", note: "Quoted separately — must fix the cause." },
    ],
    factors: [
      { title: "Affected area & location", desc: "Surface mold on drywall is cheaper than contamination inside wall cavities, ceilings, or ductwork." },
      { title: "Containment level", desc: "Larger contaminated areas require negative-air containment, HEPA filtration, and PPE protocols that raise cost." },
      { title: "Underlying water source", desc: "Remediation fails unless the moisture source (leak, flashing, grading) is repaired — usually a separate scope." },
      { title: "Testing & clearance", desc: "Independent pre- and post-testing for documentation and tenant assurance adds cost but protects you legally." },
      { title: "Occupancy & disruption", desc: "Working in an occupied building with tenant notice and off-hours work increases labour." },
    ],
    faqs: [
      { q: "Why such a wide price range?", a: "Hidden mold and an unresolved water source can turn a small job into a large one. A scoped RFP — ideally after an inspection — gets you realistic, comparable bids." },
      { q: "Do I need independent testing?", a: "For larger jobs, third-party clearance testing protects you and reassures tenants that the area is safe. Ask bidders to include testing in their RFP response." },
      { q: "Are these prices guaranteed?", a: "No — these are general Canadian planning ranges, not quotes. Post an RFP to get real bids from qualified remediation contractors." },
    ],
    metaTitle: "Commercial Mold Remediation Cost in Canada (2026 Guide) | PMRFP",
    metaDescription:
      "Commercial mold remediation costs in Canada by affected area and containment level, plus testing and source repair. Get real quotes by posting an RFP.",
  },
  {
    slug: "commercial-window-replacement-cost",
    name: "Commercial Window Replacement",
    query: "commercial window replacement cost",
    tradeSlug: "glass-and-windows",
    tradeName: "Glass and Windows",
    headline: "How much does commercial window replacement cost in Canada?",
    intro:
      "Commercial glazing is priced per window or per square foot of glazing, with storefront, curtain wall, and high-rise work at the upper end. Frame system, glass spec (double vs. triple, low-E, tempered), and access (lifts, swing stages) drive most of the spread.",
    typicalRange: "$700 – $2,500",
    rangeUnit: "per standard commercial window, installed",
    rows: [
      { item: "Standard commercial window (per unit)", range: "$700 – $1,800" },
      { item: "Storefront glazing (per sq ft)", range: "$45 – $90 / sq ft" },
      { item: "Curtain wall (per sq ft)", range: "$70 – $150 / sq ft" },
      { item: "Tempered / safety glass upgrade", range: "+20 – 50%", note: "Code-required in many locations." },
      { item: "High-rise / lift access", range: "+25 – 60%", note: "Swing stage or boom lift." },
      { item: "Glass-only replacement (IGU)", range: "$300 – $900 / unit", note: "Failed seals / foggy glass." },
    ],
    factors: [
      { title: "Frame system", desc: "Replacing individual windows is cheaper than storefront or curtain-wall systems, which are engineered assemblies." },
      { title: "Glass specification", desc: "Triple-pane, low-E, tempered, and laminated security glass each add cost over standard double-pane." },
      { title: "Access & height", desc: "Upper-floor and high-rise work needs lifts or swing stages, plus permits and traffic control." },
      { title: "Quantity", desc: "Whole-building replacements earn better per-unit pricing than one-off swaps." },
      { title: "Energy & code upgrades", desc: "Meeting current energy and safety code can require higher-spec glass than what's being replaced." },
    ],
    faqs: [
      { q: "Replace the glass or the whole window?", a: "Foggy glass from a failed seal often only needs the insulated glass unit replaced — far cheaper than the full window. A scoped RFP gets both options priced." },
      { q: "How is glazing quoted?", a: "Per window for individual units, or per square foot for storefront and curtain wall. Provide counts, sizes, and access details in your RFP for accurate bids." },
      { q: "Are these prices guaranteed?", a: "No — these are general Canadian planning ranges, not quotes. Post an RFP to get real bids from commercial glaziers." },
    ],
    metaTitle: "Commercial Window Replacement Cost in Canada (2026 Guide) | PMRFP",
    metaDescription:
      "Commercial window and glazing replacement costs in Canada — per window, storefront, and curtain wall — plus what drives the price. Get real quotes by posting an RFP.",
  },
];

export function getCostGuide(slug: string): CostGuide | null {
  return COST_GUIDES.find((g) => g.slug === slug) ?? null;
}
