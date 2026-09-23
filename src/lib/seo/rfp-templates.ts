/**
 * RFP template library — pre-built, lawyer-friendly RFP scaffolds property managers
 * can grab, customize in seconds, and post. Each template is a real working scope of
 * work, NOT a fill-in-the-blank stub. They cover the top 20 commercial + residential
 * property jobs Canadian PMs put out to bid.
 *
 * SEO play: each template page targets "{job} RFP template", "scope of work for
 * {job}", "how to write an RFP for {job}". Cross-linked to /cost-guides + /trades.
 *
 * Conversion play: "Use this template" → /pm-dashboard/rfps/new with the title,
 * summary, scope, requirements, and category pre-filled via query params (anon →
 * signup wall first). Trades benefit from the resulting inventory; PMs benefit
 * from going from zero to posted in 60 seconds.
 */

export interface TimelinePhase {
  label: string;
  detail: string;
}

export interface RfpTemplate {
  /** URL slug. */
  slug: string;
  /** Display H1, e.g. "Flat Roof Replacement RFP Template". */
  name: string;
  /** Buyer search phrase used in the eyebrow + JSON-LD HowTo `name`. */
  query: string;
  /** Maps to a real /trades/[tradeSlug] category. */
  tradeSlug: string;
  tradeName: string;
  /** Optional cross-link to a matching /cost-guides/[slug]. */
  costGuideSlug?: string;
  /** Short tag line shown on the index card. */
  pitch: string;
  /** "When to use this template" plain-English block. */
  whenToUse: string;
  /** Sample title that gets pre-filled into the RFP form. */
  titleSample: string;
  /** Sample 2-line summary pre-filled into the RFP form. */
  summarySample: string;
  /** Full scope-of-work text pre-filled into the RFP form. Markdown-ish bullets. */
  scope: string;
  /** Standard requirements pre-filled into the RFP form. */
  requirements: string;
  /** Suggested timeline (with milestones / payment if relevant). */
  timeline: TimelinePhase[];
  /** Site access + safety notes shown on the detail page. */
  siteAccess: string;
  /** Questions every interested trade should answer so bids are comparable. */
  questions: string[];
  /** What the PM will weigh when picking a winner. */
  evaluationCriteria: string[];
  /** Buyer FAQs (powers FAQPage JSON-LD). */
  faqs: { q: string; a: string }[];
  metaTitle: string;
  metaDescription: string;
}

export const RFP_TEMPLATES: RfpTemplate[] = [
  // ---------- ROOFING ----------
  {
    slug: "flat-roof-replacement",
    name: "Flat Roof Replacement RFP Template",
    query: "flat roof replacement RFP template",
    tradeSlug: "roofing",
    tradeName: "Roofing",
    costGuideSlug: "commercial-roof-replacement-cost",
    pitch: "Tear-off + new single-ply membrane on a commercial or multi-unit building.",
    whenToUse:
      "Your existing flat roof is past 75% of its expected life, you've had repeat leaks, or your reserve study has flagged replacement in the next 12–24 months. Works for commercial buildings, mid-rise residential, and multi-unit properties with low-slope membrane roofs (TPO, EPDM, modified bitumen, BUR).",
    titleSample: "Flat Roof Replacement — [Property Name / Address]",
    summarySample:
      "Tear-off and replacement of the existing low-slope membrane roof on our [size] sq ft commercial property. Looking for a 20+ year warranty and a certified installer.",
    scope: `Scope of work:
- Tear-off and disposal of existing roof system down to deck (estimated [X] sq ft).
- Inspect and report on deck condition; quote allowance for deck repair as separate line item.
- Install new tapered insulation to current code R-value and positive drainage.
- Install new single-ply membrane system (vendor to specify: TPO, EPDM, or modified bitumen) with manufacturer-certified installation.
- All flashings, edge metal, drains, and penetrations included.
- Daily site cleanup; final disposal manifest provided.
- Final manufacturer inspection and issuance of NDL warranty.

Out of scope unless quoted as add-alternates:
- Structural deck replacement beyond [X]% of total area.
- Roof access modifications (ladders, hatches).
- HVAC unit reset / re-curbing.`,
    requirements: `- $5M general liability insurance with PMRFP / building owner named as additional insured (certificate required before mobilization).
- WSIB clearance certificate in good standing.
- Manufacturer-certified installer for the membrane system being bid.
- Three references for similar projects (size + membrane type) completed in the last 24 months.
- Roofer must hold a current certification with the membrane manufacturer being bid.
- Project manager assigned to the job with site contact info.`,
    timeline: [
      { label: "RFP open", detail: "21 days for trades to express interest and submit pricing." },
      { label: "Shortlist + site walk-throughs", detail: "Top 3 invited to walk the roof and finalize quote." },
      { label: "Award + contract", detail: "Decision within 1 week of site walks; standard CCDC short-form contract." },
      { label: "Mobilization", detail: "Within 4 weeks of award (weather permitting)." },
      { label: "Project completion", detail: "Typically 2–4 weeks once started, depending on roof size and weather." },
    ],
    siteAccess: "Roof access via interior stairwell + roof hatch. Crane staging area available in north parking lot (limited, must coordinate). Work hours 7am–6pm weekdays; weekend work requires advance approval.",
    questions: [
      "Which membrane system are you proposing and why (vs. alternatives)?",
      "What manufacturer NDL warranty length and coverage do you offer?",
      "How will you protect the building interior from leaks during tear-off?",
      "What's your protocol if you discover wet insulation or rotted deck mid-job?",
      "Per-square-foot rate for additional deck repair (T&M allowance)?",
      "What's the projected timeline from mobilization to final inspection?",
    ],
    evaluationCriteria: [
      "Total cost (including disclosed add-alternates).",
      "Membrane and warranty quality.",
      "References — comparable size + scope completed in last 24 months.",
      "Project timeline and ability to meet our desired completion window.",
      "Quality of submission and clarity of scope.",
    ],
    faqs: [
      { q: "How long does a flat roof replacement take?", a: "For a typical 10,000–30,000 sq ft commercial roof, expect 2–4 weeks of on-site work once mobilized, weather permitting. Larger or more complex roofs can take longer." },
      { q: "Should I get a roof condition report first?", a: "If you're unsure whether you need replacement or just repair, a paid roof condition report from an independent consultant (not a bidder) is usually $1,500–$4,000 well-spent." },
      { q: "Is this template legally binding?", a: "No. This is a scoping template to help you get apples-to-apples bids. Your final contract should be reviewed by your lawyer and ideally use a standard CCDC short-form for clarity." },
    ],
    metaTitle: "Flat Roof Replacement RFP Template (Canada, 2026)",
    metaDescription:
      "Free, ready-to-use RFP template for commercial flat roof replacement in Canada. Pre-filled scope, requirements, timeline, and evaluation criteria — post in 60 seconds.",
  },
  {
    slug: "emergency-roof-repair",
    name: "Emergency Roof Repair RFP Template",
    query: "emergency roof repair RFP template",
    tradeSlug: "roofing",
    tradeName: "Roofing",
    pitch: "Active leak or storm damage — need a roofer on site within 48 hours.",
    whenToUse:
      "You have an active leak, storm damage, or sudden membrane failure that needs same-week (often same-day) response. This template prioritizes response time and rapid quote over the longer evaluation cycle of a full replacement.",
    titleSample: "Emergency Roof Repair — Active Leak — [Property Name]",
    summarySample:
      "Active leak in [unit/area] of our [property type] property. Need a roofer on site within 48 hours to assess, stop the leak, and provide a written quote for permanent repair.",
    scope: `Immediate (within 48 hours):
- On-site assessment of leak source and extent of damage.
- Temporary patch / tarp to stop water intrusion until permanent repair.
- Written report with photos and recommended permanent repair scope.

Permanent repair scope (to be quoted within 5 business days of assessment):
- Detail of membrane / flashing / drain / penetration to be repaired.
- Materials and method (must match existing roof system warranty terms where possible).
- Warranty on the repair (minimum 2 years).

Out of scope: full roof replacement (separate RFP) unless assessment determines repair is not viable, in which case provide a referral or separate quote.`,
    requirements: `- $5M general liability insurance with the property owner named as additional insured.
- WSIB clearance in good standing.
- Emergency response capability (on-site within 48 hours of award).
- Familiarity with the existing membrane type to avoid voiding any active warranty.
- Available to perform work during business hours; after-hours rate disclosed up front.`,
    timeline: [
      { label: "RFP open", detail: "48 hours for trades to confirm availability and rate." },
      { label: "Award", detail: "Same day as RFP close — fastest qualified responder typically wins." },
      { label: "Mobilization", detail: "Within 48 hours of award." },
      { label: "Temporary patch + report", detail: "Same day as mobilization." },
      { label: "Permanent repair", detail: "Within 2 weeks, weather permitting." },
    ],
    siteAccess: "Roof access via [stairwell / hatch / ladder]. Property contact will meet you on site. After-hours access available with advance notice.",
    questions: [
      "Can you be on site within 48 hours of award?",
      "What's your emergency call-out rate (including after-hours)?",
      "Are you familiar with [our membrane type] and able to repair without voiding our warranty?",
      "What's included in your written assessment report?",
      "What warranty do you offer on the permanent repair?",
    ],
    evaluationCriteria: [
      "Speed of response (must meet 48-hour window).",
      "Emergency rate transparency.",
      "Membrane compatibility / warranty protection.",
      "Quality of references for similar emergency work.",
    ],
    faqs: [
      { q: "How much does an emergency roof repair cost?", a: "Emergency call-out + temporary patch typically runs $500–$2,500 in Canada. Permanent repair pricing depends on the scope discovered during the assessment." },
      { q: "Will an emergency repair void my roof warranty?", a: "Only if it's done by an installer who isn't certified for your membrane system. Always confirm the bidder is certified before authorizing repairs." },
    ],
    metaTitle: "Emergency Roof Repair RFP Template — 48-Hour Response",
    metaDescription:
      "Free RFP template for emergency commercial roof repair in Canada. Pre-filled response-time requirements, scope, and evaluation criteria. Post and get quotes today.",
  },
  {
    slug: "annual-roof-inspection-contract",
    name: "Annual Roof Inspection & Maintenance Contract RFP Template",
    query: "annual roof inspection contract RFP template",
    tradeSlug: "roofing",
    tradeName: "Roofing",
    pitch: "Twice-yearly inspection + minor repair allowance for portfolio properties.",
    whenToUse:
      "You manage one or more properties and want a roofing contractor on retainer for proactive inspection, minor repair, and warranty preservation — instead of waiting for leaks. Especially useful for portfolios of 3+ buildings.",
    titleSample: "Annual Roof Inspection & Maintenance Contract — [# Properties]",
    summarySample:
      "Multi-year roof inspection and minor-maintenance contract for [#] properties totalling approximately [X] sq ft of roof area. Quarterly or twice-yearly inspections with a maintenance allowance.",
    scope: `Inspection scope:
- Two scheduled inspections per year (spring + fall) per property.
- Visual inspection of membrane, flashings, drains, penetrations, and parapet walls.
- Written report per inspection with photos and prioritized findings (immediate / 12 mo / 24 mo).

Maintenance scope (included up to allowance):
- Drain clearing, minor flashing re-sealing, debris removal, minor membrane patching.
- Maintenance allowance of $[X] per year per property; work beyond allowance quoted separately for owner approval.

Documentation:
- Annual portfolio summary report (all properties consolidated).
- Maintenance log per property kept current.
- Warranty preservation: all maintenance documented to satisfy manufacturer warranty terms.`,
    requirements: `- $5M general liability insurance, owner named as additional insured (all properties).
- WSIB clearance in good standing.
- Certified installer for the membrane systems on our portfolio (list provided on interest).
- Scheduling flexibility — willing to coordinate inspections around tenant operations.
- Online or PDF reporting portal preferred.`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Shortlist + portfolio tour", detail: "Top 3 invited to tour 2–3 representative properties." },
      { label: "Contract award", detail: "1-year initial term, renewable annually." },
      { label: "First inspection cycle", detail: "Begins within 30 days of contract signing." },
    ],
    siteAccess: "Property managers will provide roof access keys / fob and primary contact per property. Inspections to be scheduled at least 7 days in advance.",
    questions: [
      "What's your per-inspection rate per property (and per sq ft if portfolio-priced)?",
      "How do you structure the maintenance allowance — flat-rate or T&M up to a cap?",
      "Do you have a digital reporting tool clients can log into?",
      "How do you handle warranty documentation for manufacturer-certified roofs?",
      "What's your typical response time for follow-up issues found during an inspection?",
    ],
    evaluationCriteria: [
      "Per-property annual cost (inspection + maintenance allowance).",
      "Reporting quality and tooling.",
      "Portfolio experience and references.",
      "Coverage area (must serve all our property locations).",
    ],
    faqs: [
      { q: "Why bother with a maintenance contract?", a: "Documented inspection + maintenance is usually required to keep manufacturer NDL warranties valid. Skipping it can void a 20-year warranty over a missed drain cleaning." },
      { q: "How often should commercial roofs be inspected?", a: "Industry standard is twice a year (spring + fall) plus after any major weather event. More frequent for buildings with heavy rooftop equipment or chronic issues." },
    ],
    metaTitle: "Annual Roof Inspection Contract RFP Template (Canada)",
    metaDescription:
      "Free RFP template for annual roof inspection and maintenance contracts in Canada. Twice-yearly inspections + maintenance allowance — protect your warranty.",
  },

  // ---------- HVAC ----------
  {
    slug: "rooftop-unit-replacement",
    name: "Rooftop Unit (RTU) Replacement RFP Template",
    query: "rooftop unit replacement RFP template",
    tradeSlug: "hvac",
    tradeName: "HVAC",
    costGuideSlug: "commercial-hvac-replacement-cost",
    pitch: "Like-for-like or upgraded RTU replacement, including crane and curb work.",
    whenToUse:
      "An existing rooftop HVAC unit is 15+ years old, repair frequency is rising, or you're planning a proactive replacement before failure. Works for single-unit or bulk replacement across a portfolio.",
    titleSample: "Rooftop HVAC Unit Replacement — [#] units at [Property]",
    summarySample:
      "Replace [#] existing [tonnage] ton rooftop units at our [property type]. Looking for like-for-like or upgrade options (high-efficiency) with full crane, curb, and controls integration.",
    scope: `Scope of work:
- Disconnect, decommission, and dispose of [#] existing rooftop units ([tonnage] tons each).
- Supply and install new rooftop units of equivalent or upgraded capacity and efficiency (vendor to recommend).
- Curb adapters as required for new units to mate to existing curbs.
- Crane lift and rigging.
- Electrical re-connection, gas re-connection (where applicable), condensate management.
- Controls integration with existing thermostats or BAS (specify what we have).
- Commissioning, start-up, and 1-year labour warranty.
- All permits and inspections.

Add-alternates (price separately):
- High-efficiency unit upgrade (specify SEER/IEER targets).
- BAS integration if not currently connected.
- Economizer / CO2 sensor add-ons.`,
    requirements: `- $5M general liability insurance, owner named as additional insured.
- WSIB clearance.
- TSSA certification (Ontario) or provincial equivalent for gas-fired equipment.
- Crane operator certified and insured.
- Refrigerant handling certification (Canada CARO / ODP-compliant).
- Manufacturer authorized installer (specify which manufacturers you carry).
- Three references for RTU replacement projects in the last 18 months.`,
    timeline: [
      { label: "RFP open", detail: "21 days for trades to express interest." },
      { label: "Shortlist + site walks", detail: "Top 3 visit site to confirm scope." },
      { label: "Award", detail: "Within 1 week of site walks." },
      { label: "Equipment lead time", detail: "Typically 4–10 weeks depending on unit availability." },
      { label: "Installation", detail: "1–2 days per unit (single day for like-for-like)." },
    ],
    siteAccess: "Roof access via stairwell + hatch. Crane staging requires coordination with parking lot (and possibly a city street permit). Work hours 7am–6pm weekdays.",
    questions: [
      "Which manufacturer(s) are you proposing and why?",
      "Like-for-like vs. high-efficiency upgrade — cost difference and ROI estimate?",
      "What's the equipment lead time once we award?",
      "Is the existing curb compatible or do we need adapters?",
      "What's included in commissioning and start-up?",
      "Labour and parts warranty terms?",
    ],
    evaluationCriteria: [
      "Total installed cost.",
      "Equipment quality, efficiency, and warranty.",
      "Lead time and ability to meet our target install window.",
      "Experience with our building type and BAS (if applicable).",
    ],
    faqs: [
      { q: "Should I replace one unit or all of them at once?", a: "Bundling replacements usually lowers the per-unit price and lets you standardize on one manufacturer for parts. Always list all candidate units in the RFP and ask for bundled pricing." },
      { q: "Like-for-like or high-efficiency upgrade?", a: "Ask for both. High-efficiency units cost more up front but the energy savings often pay back in 3–7 years. Make the bidder show the math." },
    ],
    metaTitle: "Rooftop HVAC Unit Replacement RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial rooftop HVAC unit replacement in Canada. Pre-filled scope, crane requirements, warranty terms, and evaluation criteria.",
  },
  {
    slug: "annual-hvac-maintenance-contract",
    name: "Annual HVAC Maintenance Contract RFP Template",
    query: "HVAC maintenance contract RFP template",
    tradeSlug: "hvac",
    tradeName: "HVAC",
    pitch: "Preventive maintenance contract — quarterly or biannual, with filter + repair allowance.",
    whenToUse:
      "You want predictable HVAC costs, fewer emergency calls, and proper warranty documentation. Best for buildings with multiple rooftop units, mid- to large-scale residential, and any property where downtime is costly.",
    titleSample: "Annual HVAC Preventive Maintenance Contract — [Property / Portfolio]",
    summarySample:
      "Looking for a 1- to 3-year preventive maintenance contract for [#] HVAC units across [#] properties. Includes quarterly maintenance visits, filter changes, and a repair allowance.",
    scope: `Scheduled maintenance (4x per year per unit unless otherwise specified):
- Coil cleaning (condenser + evaporator).
- Filter replacement (standard MERV [#] filters included; high-MERV upgrade as add-alt).
- Belt and bearing inspection / replacement.
- Refrigerant pressure check and top-up (R-410A / R-454B compatible).
- Electrical connection inspection and tightening.
- Drain pan and condensate line clearing.
- Thermostat / control calibration.
- Per-visit written report with findings and recommendations.

Annual:
- Combustion analysis (gas units).
- Comprehensive efficiency report.
- Reserve study input — equipment age and remaining useful life per unit.

Repair allowance:
- $[X] / year covers minor repairs and parts under $[Y] per occurrence.
- Larger repairs quoted separately for approval before work proceeds.

Emergency response:
- After-hours emergency call-out rate disclosed up front.
- Target response time: [X] hours.`,
    requirements: `- $5M general liability insurance.
- WSIB clearance.
- TSSA or provincial equivalent for gas-fired equipment.
- Refrigerant handling certification.
- Technician certifications (red seal HVAC / refrigeration mechanic).
- Online reporting / customer portal preferred.`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Shortlist + portfolio walk-through", detail: "Top 3 invited to tour and price." },
      { label: "Contract start", detail: "1- to 3-year term, mutually renewable." },
    ],
    siteAccess: "PM provides roof / mechanical room access. Schedule visits at least 5 business days in advance. After-hours work coordinated as needed.",
    questions: [
      "Per-unit annual rate (and any portfolio discount)?",
      "What's included in the repair allowance? Cap per visit, cap per year?",
      "Emergency response time and after-hours rate?",
      "Do you have a customer portal for service records?",
      "How do you document warranty work to keep manufacturer warranties intact?",
    ],
    evaluationCriteria: [
      "Per-unit annual cost.",
      "Repair allowance generosity and transparency.",
      "Response time guarantees.",
      "Reporting quality and portal access.",
      "Portfolio experience.",
    ],
    faqs: [
      { q: "What's the ROI on preventive maintenance?", a: "Properly maintained HVAC equipment lasts 30–50% longer and runs 10–25% more efficiently. The contract usually pays for itself in avoided emergency calls and extended equipment life." },
      { q: "1-year or 3-year contract?", a: "1-year is safer if it's a new vendor relationship. 3-year usually gets you better pricing and locks in rates. Make sure the contract has a clear exit clause for non-performance." },
    ],
    metaTitle: "HVAC Maintenance Contract RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial HVAC preventive maintenance contracts in Canada. Quarterly visits, repair allowance, and emergency response terms pre-filled.",
  },
  {
    slug: "boiler-replacement",
    name: "Boiler Replacement RFP Template",
    query: "commercial boiler replacement RFP template",
    tradeSlug: "hvac",
    tradeName: "HVAC",
    pitch: "Heating boiler replacement for multi-unit residential or commercial buildings.",
    whenToUse:
      "Your existing hot water or steam boiler is at end of life, failing inspections, or you want to upgrade to a high-efficiency condensing boiler for energy savings. Common in mid-rise residential, schools, and older commercial buildings.",
    titleSample: "Boiler Replacement — [Property Name]",
    summarySample:
      "Replace existing [X]-BTU [hot water / steam] boiler at our [property type]. Looking for high-efficiency upgrade options and minimal heating downtime.",
    scope: `Scope of work:
- Decommission, drain, and remove existing boiler ([model / age]).
- Supply and install new boiler with equivalent or upgraded capacity ([BTU input]).
- New venting / chimney liner as required for high-efficiency condensing unit.
- Gas line modifications if needed.
- Controls integration (modulating controls, outdoor reset, BAS integration if applicable).
- New circulating pumps and zone valves if existing are end-of-life (quote separately).
- Commissioning, start-up, and tenant heating restored within [X] days.
- TSSA inspection and certificate.
- All permits.

Add-alternates:
- Domestic hot water tank replacement (if shared boiler system).
- Pipe insulation upgrade.
- Heat-exchanger upgrade.`,
    requirements: `- $5M general liability insurance.
- TSSA Gas Technician 2 minimum (TSSA Gas Tech 1 for larger units).
- WSIB clearance.
- Manufacturer authorized installer.
- Three references for similar boiler replacements in the last 24 months.
- Plan for maintaining heating service during the swap (especially critical in winter — temporary boiler if needed).`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Shortlist + mechanical room walk", detail: "Top 3 visit." },
      { label: "Award", detail: "Within 1 week of site walks." },
      { label: "Equipment lead time", detail: "4–12 weeks for higher-capacity units." },
      { label: "Installation", detail: "3–7 days typical; temporary boiler may be required if work is in heating season." },
    ],
    siteAccess: "Mechanical room access via [location]. Boiler swap-out usually requires partial heating shut-down — coordinate with tenants 2+ weeks in advance.",
    questions: [
      "High-efficiency condensing vs. mid-efficiency — cost difference + projected energy savings?",
      "What's the equipment lead time?",
      "Do you require a temporary boiler during the swap (and what does that cost)?",
      "What's the projected tenant downtime?",
      "What manufacturer warranty applies?",
    ],
    evaluationCriteria: [
      "Installed cost (including temporary heating if required).",
      "Efficiency and projected energy savings.",
      "Manufacturer + labour warranty.",
      "Minimization of tenant downtime.",
      "References on comparable projects.",
    ],
    faqs: [
      { q: "Can I replace a boiler in winter?", a: "Yes, but you'll likely need a temporary boiler to maintain tenant heating during the swap. Budget $5k–$15k extra for the rental + setup." },
      { q: "Is a high-efficiency condensing boiler always the right choice?", a: "Usually for buildings under 90% existing efficiency — but the venting upgrade and condensate handling can add cost. Make the bidder show projected payback." },
    ],
    metaTitle: "Boiler Replacement RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial / multi-unit residential boiler replacement in Canada. Pre-filled scope, TSSA requirements, and warranty terms.",
  },

  // ---------- EXTERIOR / GROUNDS ----------
  {
    slug: "parking-lot-resurfacing",
    name: "Parking Lot Resurfacing RFP Template",
    query: "parking lot resurfacing RFP template",
    tradeSlug: "concrete-and-asphalt",
    tradeName: "Concrete and Asphalt",
    costGuideSlug: "parking-lot-paving-cost",
    pitch: "Mill + overlay or full reconstruction of a commercial parking lot.",
    whenToUse:
      "Your parking lot has surface cracking, potholes, or alligator cracking suggesting base failure. Reseal isn't cutting it anymore and you need a more substantial fix.",
    titleSample: "Parking Lot Resurfacing — [Property Name] — [X] sq ft",
    summarySample:
      "Mill and overlay (or full reconstruction — bidder to recommend) of our [X] sq ft asphalt parking lot. Includes new line painting and minor catch basin work.",
    scope: `Scope of work:
- Pre-construction condition survey with recommendation: mill + overlay vs. full reconstruction.
- Mill existing asphalt to [depth] (or full removal for reconstruction).
- Repair or replace failed base course as required.
- New HL3 (or equivalent) asphalt to [depth] over compacted base.
- Restore positive drainage to existing catch basins; adjust catch basin frames as needed.
- New line painting matching existing layout (or new layout per attached drawing).
- Accessibility (barrier-free) parking space painting + signage per AODA / provincial code.
- Speed bumps, stop bars, directional arrows as existing.

Add-alternates:
- Catch basin replacement (per unit).
- Curb repair or replacement (per linear ft).
- Concrete sidewalk repair (per sq ft).
- Crack-sealing of adjacent intact areas.`,
    requirements: `- $5M general liability insurance.
- WSIB clearance.
- Three references for commercial parking lots of similar size in the last 24 months.
- Compliance with provincial road construction safety standards.
- Phased work plan to maintain partial site access for tenants throughout the project.`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Site walk", detail: "Top 3 walk the lot and confirm scope." },
      { label: "Award", detail: "Within 1 week." },
      { label: "Mobilization", detail: "Weather-dependent — paving season May–October in most of Canada." },
      { label: "Completion", detail: "Most lots 1–2 weeks; phased schedule preserves tenant access." },
    ],
    siteAccess: "Property remains occupied during work. Bidder must propose a phased schedule maintaining at least [X]% of stalls available at all times. Night or weekend pours possible — disclose premium.",
    questions: [
      "Mill + overlay vs. full reconstruction — what do you recommend and why?",
      "What asphalt mix are you proposing and what's the warranty?",
      "How will you phase the work to keep the lot operational?",
      "What's your line-painting subcontractor and AODA compliance plan?",
      "Per-unit cost for catch basin adjustment / replacement?",
    ],
    evaluationCriteria: [
      "Per-square-foot cost.",
      "Phasing plan and tenant impact.",
      "Asphalt quality / warranty.",
      "Compliance with AODA / accessibility requirements.",
      "References on similar-size commercial lots.",
    ],
    faqs: [
      { q: "Mill and overlay or full reconstruction?", a: "Mill + overlay works if the base is sound and damage is surface-level. Full reconstruction is needed if you see alligator cracking, sinkholes, or base failure. Ask the bidder to inspect and recommend." },
      { q: "Why does asphalt cost so much more than it used to?", a: "Liquid asphalt cement prices have risen significantly post-2020. Get bids in early in the paving season for the best pricing." },
    ],
    metaTitle: "Parking Lot Resurfacing RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial parking lot resurfacing in Canada. Mill + overlay or full reconstruction, phasing plan, and AODA compliance pre-filled.",
  },
  {
    slug: "snow-removal-seasonal-contract",
    name: "Snow Removal Seasonal Contract RFP Template",
    query: "snow removal contract RFP template",
    tradeSlug: "snow-removal",
    tradeName: "Snow Removal",
    costGuideSlug: "commercial-snow-removal-cost",
    pitch: "Per-season or per-event snow + ice contract for commercial properties.",
    whenToUse:
      "You need a snow contractor locked in before the season starts. Whether you prefer a fixed-fee per-season contract (predictable) or per-event (you only pay when it snows), this template covers both.",
    titleSample: "Snow Removal & Ice Management — [Property Name] — [Season]",
    summarySample:
      "Seasonal snow removal and salting / sanding contract for our [property type] at [address]. [Per-season fixed fee / per-event]. Coverage Nov 15 – April 15.",
    scope: `Scope of work:
- Plowing of all parking areas, driveways, and loading docks at [X] cm trigger depth.
- Sidewalk clearing (snow + ice) to property entrances within [X] hours of snowfall ending.
- Salting / sanding of all walking surfaces and high-risk vehicle areas.
- 24/7 monitoring during snowfall events.
- Mid-season salt re-application as needed.
- End-of-season cleanup (sand removal from lawn edges).

Pricing structure options (bidder to quote both):
1. Per-season fixed fee: covers unlimited events at the contracted scope.
2. Per-event: per-push rate + per-salt-application rate.

Service standards:
- All vehicle areas cleared within [X] hours of snowfall ending.
- Sidewalks cleared within [X] hours.
- Salting applied at every event and when temperatures cause refreeze risk.
- Service log per event provided (start time, end time, materials used).`,
    requirements: `- $5M general liability insurance with slip-and-fall coverage.
- WSIB clearance.
- Documented service log per event (date, time, action, materials).
- GPS tracking of equipment (preferred).
- Backup equipment and crew documented (no excuses for "trucks broke down").
- Service area coverage map.
- Three references for commercial properties of similar size in the last 2 seasons.`,
    timeline: [
      { label: "RFP open", detail: "Post by August / September for best pricing." },
      { label: "Award", detail: "October 1 latest." },
      { label: "Pre-season inspection", detail: "Walk the site with the contractor before first snow." },
      { label: "Season", detail: "November 15 – April 15 (or as defined)." },
    ],
    siteAccess: "Full property access required. Property has [X] parking spaces, [X] linear ft of sidewalk, and [X] entrances. Site map provided on interest.",
    questions: [
      "Per-season fixed fee vs. per-event pricing — what do you recommend and why?",
      "What's your trigger depth and response time guarantee?",
      "Do you have GPS-tracked equipment?",
      "What's your backup plan if a primary truck goes down mid-storm?",
      "What's your slip-and-fall liability coverage?",
      "What's included vs. add-on (e.g. end-of-season cleanup, mid-season salt)?",
    ],
    evaluationCriteria: [
      "Total seasonal cost (compare per-season and per-event scenarios).",
      "Response time guarantees.",
      "Liability coverage.",
      "Service documentation and GPS tracking.",
      "Local references and proven reliability.",
    ],
    faqs: [
      { q: "Per-season or per-event?", a: "Per-season is predictable and usually the right choice for high-traffic commercial properties. Per-event can be cheaper in a mild winter but exposes you to bad-winter cost surprises and slip-and-fall risk from delayed response." },
      { q: "Why is slip-and-fall coverage so important?", a: "If a slip-and-fall suit happens on your property, the snow contractor's insurance is the first line of defence. $5M minimum is standard for commercial properties." },
    ],
    metaTitle: "Snow Removal Contract RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial snow removal and ice management contracts in Canada. Per-season or per-event pricing, response times, liability coverage.",
  },
  {
    slug: "landscaping-annual-contract",
    name: "Landscaping Annual Contract RFP Template",
    query: "commercial landscaping contract RFP template",
    tradeSlug: "landscaping",
    tradeName: "Landscaping",
    pitch: "Lawn, bed, and tree care — May to October on a commercial property.",
    whenToUse:
      "You manage a property with grounds that need weekly upkeep — mowing, weeding, beds, tree pruning, fertilizer, irrigation. Best for commercial buildings, multi-unit residential, and properties where curb appeal matters.",
    titleSample: "Landscaping & Grounds Maintenance — [Property Name] — [Season]",
    summarySample:
      "Annual landscaping contract for our [property type] at [address]. Covers weekly maintenance May–October, spring + fall cleanup, and irrigation start-up / shut-down.",
    scope: `Weekly / bi-weekly (May–October):
- Lawn mowing, edging, trimming.
- Garden bed weeding and maintenance.
- Walkway and parking lot edge clearing of grass clippings.
- Visual inspection of trees and shrubs; report on issues.

Seasonal:
- Spring cleanup (early May): debris removal, bed prep, mulch refresh, pruning.
- Fall cleanup (October): leaf removal, bed winterization, perennial cut-back.
- Irrigation start-up (May) and shut-down + blow-out (October).

Annual:
- Fertilizer (one or two applications — bidder to recommend).
- Weed control (per provincial cosmetic pesticide regs).
- Aeration + overseeding (fall).

Add-alternates (price separately):
- Tree pruning (above visual inspection level).
- Tree / shrub removal or replacement.
- New planting design + install.
- Mulch top-up (additional applications).`,
    requirements: `- $2M general liability insurance.
- WSIB clearance.
- Pesticide applicator licence (provincial) for any chemical applications.
- Three references for properties of similar size in the last 2 seasons.
- Schedule: visits on consistent day(s) of the week.`,
    timeline: [
      { label: "RFP open", detail: "Post by February / March for best pricing." },
      { label: "Award", detail: "April 1 latest." },
      { label: "Season start", detail: "Spring cleanup early May." },
      { label: "Season end", detail: "Fall cleanup October." },
    ],
    siteAccess: "Property has [X] sq ft of lawn, [X] linear ft of beds, [X] mature trees. Site map provided on interest.",
    questions: [
      "Weekly or bi-weekly visits — what do you recommend for our property type?",
      "What's included in spring vs. fall cleanup?",
      "How do you handle organic / pesticide-free preferences if we ask?",
      "What's your equipment list (mowers, blowers — gas or electric)?",
      "Per-visit cost vs. flat-season cost?",
    ],
    evaluationCriteria: [
      "Total seasonal cost.",
      "Quality of references and photos of work.",
      "Reliability of scheduling.",
      "Equipment quality and noise / emissions standards (if relevant).",
    ],
    faqs: [
      { q: "Is electric / quiet equipment worth the premium?", a: "For mixed-use or residential-adjacent properties, yes — fewer tenant complaints and increasingly required by some municipalities. Cost premium is usually 10–15%." },
      { q: "Weekly or bi-weekly?", a: "Weekly is standard for commercial properties with visible lawn. Bi-weekly works for properties where curb appeal is less important." },
    ],
    metaTitle: "Landscaping Contract RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial landscaping and grounds maintenance contracts in Canada. Weekly visits, seasonal cleanups, irrigation, fertilizer.",
  },
  {
    slug: "exterior-painting",
    name: "Exterior Painting RFP Template",
    query: "commercial exterior painting RFP template",
    tradeSlug: "painting",
    tradeName: "Painting",
    costGuideSlug: "commercial-painting-cost",
    pitch: "Full or partial exterior paint job on commercial or multi-unit buildings.",
    whenToUse:
      "Your building's paint is fading, chipping, or hasn't been touched in 7+ years. Common scope for stucco, wood-sided, or metal-clad commercial and residential properties.",
    titleSample: "Exterior Painting — [Property Name] — [X] sq ft",
    summarySample:
      "Full exterior repaint of our [property type] at [address]. Approximately [X] sq ft of [surface type]. Includes prep, primer, and 2 coats of finish.",
    scope: `Scope of work:
- Pressure washing of all exterior surfaces to be painted.
- Scraping, sanding, and prep of failing paint areas.
- Minor caulking and crack repair (allowance — major repairs quoted separately).
- Primer where bare substrate exposed or surface change.
- 2 coats of premium exterior latex / acrylic (vendor to recommend product).
- Trim, doors, soffits, fascia per attached colour schedule.
- Daily site cleanup; final walk-through and touch-up.
- Manufacturer + applicator warranty.

Out of scope unless quoted as add-alts:
- Stucco repair / re-stucco.
- Wood replacement.
- Window glazing.`,
    requirements: `- $2M general liability insurance.
- WSIB clearance.
- Working at heights certification for all crew.
- Three references for similar exterior commercial projects in the last 24 months.
- Boom lift / scaffolding cost included in bid.
- Compliance with VOC regulations (low-VOC products preferred).`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Site walk", detail: "Top 3 bidders walk site." },
      { label: "Award", detail: "Within 1 week." },
      { label: "Mobilization", detail: "Weather-dependent — best window May–September." },
      { label: "Completion", detail: "1–3 weeks depending on building size." },
    ],
    siteAccess: "Building remains occupied. Coordinate boom lift placement with parking. Work hours 7am–6pm weekdays. Notify tenants 48 hours before painting their facade.",
    questions: [
      "Which paint product line are you proposing and what's the manufacturer warranty?",
      "What's your prep / surface failure repair allowance — and what triggers an add-cost?",
      "Boom lift vs. scaffolding — what does your bid include?",
      "Crew size and projected timeline?",
      "How will you protect landscaping, windows, and parked vehicles?",
    ],
    evaluationCriteria: [
      "Total cost.",
      "Paint product quality and warranty.",
      "Crew experience and references.",
      "Project timeline.",
      "Protection plan for tenants and landscaping.",
    ],
    faqs: [
      { q: "How long should an exterior paint job last?", a: "On a properly prepped surface with premium product, 7–10 years. Cheap product or rushed prep can cut that in half." },
      { q: "Should I pay more for premium paint?", a: "Yes — the cost difference is small compared to labour, and premium product lasts almost twice as long. The bidder using bargain paint isn't saving you money over a 10-year window." },
    ],
    metaTitle: "Exterior Painting RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial exterior painting projects in Canada. Pre-filled scope, prep allowance, paint quality requirements, and warranty terms.",
  },

  // ---------- INTERIOR ----------
  {
    slug: "common-area-painting",
    name: "Common Area Painting RFP Template",
    query: "common area painting RFP template",
    tradeSlug: "painting",
    tradeName: "Painting",
    costGuideSlug: "commercial-painting-cost",
    pitch: "Hallways, lobbies, stairwells — interior repaint with minimal tenant disruption.",
    whenToUse:
      "Refresh interior common areas in a multi-unit residential, office, or mixed-use building. Best when scope is well-defined (corridors, stairwells, lobby) and you want minimal tenant disruption.",
    titleSample: "Common Area Painting — Corridors + Stairwells — [Property Name]",
    summarySample:
      "Repaint of common-area corridors ([X] floors), stairwells ([X]), and main lobby at our [property type]. Tenants in residence — work to be scheduled around resident traffic.",
    scope: `Scope of work:
- Light prep: patching nail holes, minor drywall repair, caulking.
- Primer over patched areas and over door frames where colour changes.
- 2 coats of premium interior latex on all walls.
- Doors, frames, baseboards, ceilings (specify which — usually walls + door frames only).
- Daily protection of flooring and furnishings.
- Daily site cleanup; no tenant access blocked overnight.

Phasing:
- One floor at a time, weekdays only.
- Notify residents 48 hours before each floor.
- Stairwells painted off-hours (evenings / weekends) if life-safety allows.

Add-alternates:
- Drywall repair beyond allowance ([X] sq ft).
- Ceiling paint.
- Door + door frame full repaint.`,
    requirements: `- $2M general liability insurance.
- WSIB clearance.
- Low-VOC paint (zero-VOC preferred — tenants in residence).
- All workers vetted for occupied-building work (no smoking, professional appearance, work permits as required).
- Three references for occupied multi-unit residential or commercial projects.`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Award", detail: "Within 2 weeks of RFP close." },
      { label: "Mobilization", detail: "Coordinate start date with property management." },
      { label: "Completion", detail: "Typically 2–6 weeks depending on building size and phasing." },
    ],
    siteAccess: "Building occupied. Work weekdays 8am–5pm in corridors, 8am–8pm in stairwells (subject to tenant complaint). Park in [designated area]. Use service elevator for materials.",
    questions: [
      "Are you using zero-VOC paint? Which product?",
      "How will you phase work to minimize tenant disruption?",
      "Crew size and projected timeline?",
      "How do you handle tenant complaints during occupied work?",
      "What's included vs. add-alt — please confirm doors, frames, ceilings?",
    ],
    evaluationCriteria: [
      "Total cost.",
      "Tenant-friendly approach (low-VOC, phasing plan, complaint handling).",
      "References for occupied-building work.",
      "Paint product quality.",
    ],
    faqs: [
      { q: "Zero-VOC vs. low-VOC paint — really worth it?", a: "For tenants in residence, yes. Zero-VOC eliminates odour and chemical sensitivity complaints. Cost premium is small ($5–$10 / gallon)." },
      { q: "How long does common-area painting take?", a: "A typical mid-rise (10 floors) takes 3–4 weeks at one floor per week. Stairwells and lobby add 1–2 weeks." },
    ],
    metaTitle: "Common Area Painting RFP Template (Canada)",
    metaDescription:
      "Free RFP template for common-area interior painting in occupied buildings. Zero-VOC, tenant-friendly phasing, full scope pre-filled.",
  },
  {
    slug: "corridor-flooring-replacement",
    name: "Corridor Flooring Replacement RFP Template",
    query: "corridor flooring replacement RFP template",
    tradeSlug: "flooring",
    tradeName: "Flooring",
    pitch: "Carpet, LVT, or vinyl plank replacement in multi-unit corridors.",
    whenToUse:
      "Existing carpet or flooring in corridors is worn, stained, or off-trend. Common in mid-rise residential and office buildings. Best scoped at full-floor or full-corridor level for consistent look.",
    titleSample: "Corridor Flooring Replacement — [Property Name] — [X] floors",
    summarySample:
      "Replace corridor flooring across [X] floors of our [property type]. Bidders to propose two options: commercial-grade carpet tile, and luxury vinyl plank (LVT).",
    scope: `Scope of work:
- Remove and dispose of existing flooring (carpet + underpad / vinyl / etc.) on [X] floors.
- Inspect subfloor condition; report on any required repair (T&M allowance).
- Floor prep: levelling compound where needed, vacuum, primer per manufacturer spec.
- Supply and install new flooring per selected option:
  - OPTION A: commercial-grade carpet tile (specify product class).
  - OPTION B: luxury vinyl plank (LVT, 5mm+ wear layer).
- New transition strips, vinyl base.
- Daily protection of tenant doors and adjacent finishes.
- Final cleaning and walk-through.

Phasing:
- One floor at a time, weekday work hours.
- Notify residents 7 days before their floor.
- Service elevator coordination required.

Add-alternates:
- Subfloor repair beyond allowance.
- Door undercut for clearance.
- Lobby + amenity space flooring.`,
    requirements: `- $2M general liability insurance.
- WSIB clearance.
- Manufacturer-trained installer for selected product.
- Three references for occupied multi-unit corridor flooring in the last 24 months.
- Plan for protecting unit door frames and tenant furniture in corridor.`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Sample submission", detail: "All bidders submit physical samples of both options." },
      { label: "Award", detail: "Within 2 weeks of RFP close." },
      { label: "Project completion", detail: "Typically 1 day per corridor per floor; 2–6 weeks total." },
    ],
    siteAccess: "Building occupied. Work weekdays 8am–5pm. Service elevator available for materials. Each floor will be partially impassable for 1 day during install — plan tenant communication accordingly.",
    questions: [
      "Per-sq-ft installed cost for each option (carpet tile + LVT)?",
      "What's your wear-layer warranty?",
      "How do you handle subfloor failures discovered mid-project?",
      "Crew size and projected timeline per floor?",
      "Can you provide physical samples of recommended products?",
    ],
    evaluationCriteria: [
      "Total installed cost per option.",
      "Product quality, wear layer, and warranty.",
      "Installer certifications.",
      "References for occupied multi-unit corridor work.",
      "Phasing and tenant impact plan.",
    ],
    faqs: [
      { q: "Carpet tile or LVT?", a: "Carpet tile is warmer underfoot and quieter but harder to clean. LVT is more durable, easier to clean, and better in high-moisture areas (laundry corridors). Most properties end up choosing LVT for new builds and carpet tile for residential corridors." },
      { q: "How long does corridor flooring last?", a: "Premium carpet tile: 10–15 years. LVT with a 20-mil wear layer: 15–20 years. Cheaper products half that." },
    ],
    metaTitle: "Corridor Flooring Replacement RFP Template (Canada)",
    metaDescription:
      "Free RFP template for replacing corridor flooring in occupied multi-unit buildings. Carpet tile vs. LVT, phasing, full scope pre-filled.",
  },

  // ---------- MECHANICAL / ELECTRICAL ----------
  {
    slug: "elevator-service-contract",
    name: "Elevator Service Contract RFP Template",
    query: "elevator service contract RFP template",
    tradeSlug: "elevator-services",
    tradeName: "Elevator Services",
    pitch: "Monthly maintenance + emergency call-out contract for one or more elevators.",
    whenToUse:
      "Your existing elevator service contract is up for renewal, or you're tired of the incumbent's service. Multi-year contracts dominate this category — switching is rare so it's worth doing right.",
    titleSample: "Elevator Service Contract — [Property Name] — [#] elevators",
    summarySample:
      "[#]-year service contract for [#] elevators at our [property type]. Monthly preventive maintenance, emergency call-out, and TSSA-required annual inspections.",
    scope: `Scope of work:
- Monthly preventive maintenance per ASME A17.1 / CSA B44.
- All wear-item replacement (cables, brake pads, rollers, controllers per OEM schedule).
- 24/7 emergency call-out, [X]-hour response time guarantee.
- Annual TSSA inspection coordination and certificate.
- Modernization recommendations and reserve-fund input.
- Online customer portal with service log and call-out history.

Inclusions (full-maintenance contract):
- All parts and labour included (vs. parts-not-included "oil & grease" contracts).
- Major component replacement up to $[X] per elevator per year.
- Major modernization quoted separately.

Out of scope:
- Modernization / upgrades.
- Cab interior finishes.
- Vandalism repair.

Service standards:
- Response time: [X] hours non-emergency / [X] minutes emergency (entrapment).
- Uptime target: [X]% per elevator per month.
- Penalty / credit clause for missed uptime targets.`,
    requirements: `- TSSA-licensed elevator mechanic.
- $5M general liability insurance.
- WSIB clearance.
- 24/7 dispatch capability with local mechanics (not just call centre).
- Online customer portal.
- Three references for similar building types in the last 2 years.
- Transparent escalation path if our concerns aren't addressed.`,
    timeline: [
      { label: "RFP open", detail: "30 days (longer due to multi-year nature of contract)." },
      { label: "Shortlist + site walk", detail: "Top 3 walk site, inspect equipment, propose maintenance plan." },
      { label: "Award", detail: "Within 2 weeks of site walks." },
      { label: "Contract term", detail: "Typical 1–3 years with renewal options. 90-day termination clause preferred." },
      { label: "Start date", detail: "Aligned with current contract end date." },
    ],
    siteAccess: "Mechanical room access via [location]. Pit access via main floor. Coordinate maintenance during off-peak hours where possible.",
    questions: [
      "Full-maintenance vs. oil-and-grease contract — what do you recommend and why?",
      "Per-elevator monthly rate?",
      "What's your emergency response time guarantee, and what happens if you miss it?",
      "What's your local mechanic-to-elevator ratio?",
      "What's included vs. add-on for major component replacement?",
      "Do you offer an online customer portal? Can we see a demo?",
      "What's the contract termination clause?",
    ],
    evaluationCriteria: [
      "Per-elevator monthly cost.",
      "Coverage scope (full vs. partial maintenance).",
      "Response time guarantees and accountability.",
      "Local mechanic depth.",
      "Customer portal quality.",
      "Termination flexibility.",
    ],
    faqs: [
      { q: "Why do elevator contracts feel impossible to escape?", a: "Because most are 5-year auto-renewing 'oil-and-grease' contracts that escalate. Insist on 1–3 year initial term with a 90-day no-cause termination clause." },
      { q: "Full-maintenance or oil-and-grease?", a: "Full-maintenance is more expensive monthly but caps your big-ticket exposure. Oil-and-grease is cheap monthly but bills you separately for cables, controllers, etc. — which can be $$$ surprises. Most owners with budget predictability needs choose full-maintenance." },
    ],
    metaTitle: "Elevator Service Contract RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial elevator service and maintenance contracts in Canada. Full-maintenance scope, response-time guarantees, fair termination clauses.",
  },
  {
    slug: "electrical-panel-upgrade",
    name: "Electrical Panel Upgrade RFP Template",
    query: "electrical panel upgrade RFP template",
    tradeSlug: "electrical",
    tradeName: "Electrical",
    costGuideSlug: "commercial-electrical-cost",
    pitch: "Service upgrade or main panel replacement for commercial or multi-unit buildings.",
    whenToUse:
      "Your existing electrical service is undersized, aging, or required for a building expansion / EV charging / new tenant. Common in older commercial and multi-unit residential buildings.",
    titleSample: "Electrical Panel / Service Upgrade — [Property Name]",
    summarySample:
      "Upgrade existing [X]A main electrical service to [X]A at our [property type]. Includes new main panel, utility coordination, and any required sub-panel work.",
    scope: `Scope of work:
- Engineering / design (or coordination with our consulting engineer).
- Utility coordination for service upgrade (LDC connection / metering).
- Decommission existing main panel.
- Supply and install new [X]A main panel with appropriate breaker configuration.
- Supply and install [#] new sub-panels (if required).
- New service conductors from utility connection to panel.
- All grounding and bonding per Canadian Electrical Code.
- ESA / provincial inspection coordination and certificate.
- Permits.
- Tenant downtime: managed to under [X] hours; after-hours work if needed (disclose premium).

Add-alternates:
- New sub-panels per floor / per area.
- EV charging panel + circuit allowance.
- Generator transfer switch.
- Surge protection.`,
    requirements: `- Master electrician on staff.
- ESA-licensed contractor (Ontario) or provincial equivalent.
- $5M general liability insurance.
- WSIB clearance.
- Three references for similar service upgrades in the last 24 months.
- Plan for managing tenant power outage during cut-over.
- Coordination with local utility and building inspector.`,
    timeline: [
      { label: "RFP open", detail: "30 days." },
      { label: "Site walk", detail: "Top 3 bidders walk site with engineer." },
      { label: "Award", detail: "Within 2 weeks of site walks." },
      { label: "Permit + utility lead time", detail: "Typically 4–12 weeks for service upgrade approval." },
      { label: "Installation", detail: "Cut-over typically 1 evening / weekend; full project 4–6 weeks." },
    ],
    siteAccess: "Main electrical room access via [location]. Cut-over to be scheduled off-hours to minimize tenant impact.",
    questions: [
      "What's the engineering / permit cost, and is it included?",
      "What's the lead time from award to utility cut-over?",
      "How will you manage tenant power outage?",
      "Per-unit cost for additional sub-panels (add-alts)?",
      "What ESA / inspection costs are included?",
    ],
    evaluationCriteria: [
      "Total installed cost.",
      "Engineering / utility coordination quality.",
      "Tenant downtime plan.",
      "References for similar service upgrades.",
      "Master electrician and crew experience.",
    ],
    faqs: [
      { q: "How long does an electrical service upgrade take?", a: "From RFP award to power cut-over, typically 8–16 weeks — most of which is utility and permit lead time, not actual installation." },
      { q: "Do I need a consulting engineer?", a: "For service upgrades over 600A or anything triggering a building permit, usually yes. The bidder can recommend or include one." },
    ],
    metaTitle: "Electrical Panel Upgrade RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial electrical service and panel upgrades in Canada. ESA coordination, tenant downtime planning, full scope pre-filled.",
  },
  {
    slug: "led-lighting-retrofit",
    name: "LED Lighting Retrofit RFP Template",
    query: "LED lighting retrofit RFP template",
    tradeSlug: "lighting",
    tradeName: "Lighting",
    pitch: "Replace old fluorescent / HID lighting with LED for energy savings.",
    whenToUse:
      "Your building still has T8/T12 fluorescent, halogen, or HID lighting. Energy savings + reduced maintenance + utility rebates often pay back the retrofit in 2–5 years. Common in parking garages, common areas, and exterior building lighting.",
    titleSample: "LED Lighting Retrofit — [Property Name] — [# fixtures]",
    summarySample:
      "Retrofit [# fixtures] across [parking garage / common areas / exterior] of our [property type] to LED. Includes utility rebate coordination and disposal of existing fixtures.",
    scope: `Scope of work:
- Existing-fixture audit + recommendation: full-fixture replacement vs. LED retrofit kit per location.
- Supply and install [# fixtures] of LED fixtures / retrofit kits (DLC-listed for utility rebate eligibility).
- Disposal of existing fixtures and lamps per provincial regulations (especially for HID lamps containing mercury).
- New controls if required: occupancy sensors, daylight harvesting, dimming.
- Utility rebate paperwork (Save On Energy / Hydro Québec / etc.) — bidder coordinates application.
- Photometric report verifying lighting levels meet minimum standards.
- Manufacturer warranty (minimum 5 years parts).

Add-alternates:
- Networked controls (BAS / cloud-managed).
- Emergency battery backup integration.
- Site lighting (parking lot pole lights).`,
    requirements: `- ESA-licensed (Ontario) or provincial equivalent.
- $5M general liability insurance.
- WSIB clearance.
- Familiar with utility rebate programs in our province.
- Three references for similar retrofits in the last 18 months.
- Proven track record of getting rebates approved (request rebate-pull-through data).`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Site walk + audit", detail: "Top 3 conduct fixture audit and recommend approach." },
      { label: "Award", detail: "Within 2 weeks of audits." },
      { label: "Rebate application", detail: "Submitted before mobilization." },
      { label: "Installation", detail: "Typically 1–3 weeks depending on fixture count and access." },
    ],
    siteAccess: "Parking garage / common areas / exterior — coordinate work with tenant operations. Lift required for high ceilings.",
    questions: [
      "Per-fixture installed cost (split by fixture type)?",
      "Projected energy savings ($/year) and payback period including rebate?",
      "What utility rebate are we eligible for, and do you handle the paperwork?",
      "Manufacturer + labour warranty terms?",
      "Are you recommending full-fixture replacement or retrofit kits, and why?",
    ],
    evaluationCriteria: [
      "Net cost (installed cost minus utility rebate).",
      "Projected energy savings and payback.",
      "Fixture quality and warranty.",
      "Track record of getting rebates approved.",
      "Photometric performance.",
    ],
    faqs: [
      { q: "What's the typical payback on a LED retrofit?", a: "2–5 years for most commercial buildings, often less with utility rebates. Parking garages with 24/7 lighting tend to have the fastest payback." },
      { q: "Full-fixture replacement or retrofit kit?", a: "Replacement gives longer life and modern controls but costs more. Retrofit kits are cheaper and faster but inherit the existing fixture's lifespan. Bidder should recommend per location." },
    ],
    metaTitle: "LED Lighting Retrofit RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial LED lighting retrofits in Canada. Utility rebate coordination, payback analysis, full scope pre-filled.",
  },

  // ---------- SAFETY / COMPLIANCE ----------
  {
    slug: "annual-fire-safety-inspection",
    name: "Annual Fire Safety Inspection Contract RFP Template",
    query: "fire safety inspection contract RFP template",
    tradeSlug: "fire-safety",
    tradeName: "Fire Safety",
    pitch: "Code-required annual inspection of alarms, sprinklers, extinguishers, and exit lighting.",
    whenToUse:
      "You need an Ontario Fire Code (or provincial equivalent) certified inspection of fire alarm, sprinkler, extinguishers, and emergency lighting systems. Required annually for commercial and most multi-unit residential buildings.",
    titleSample: "Annual Fire Safety Inspection & Maintenance — [Property Name]",
    summarySample:
      "Annual inspection and maintenance of fire alarm, sprinkler, extinguishers, exit lighting, and other life-safety systems at our [property type], per [provincial fire code].",
    scope: `Annual scope per CAN/ULC-S536 and provincial fire code:
- Fire alarm panel + all devices (heat / smoke / pull stations / horns / strobes).
- Sprinkler system (wet / dry / pre-action) — annual inspection per NFPA 25.
- Standpipe and hose inspections.
- Portable fire extinguishers (annual service + 6-year teardown / 12-year hydrostatic where due).
- Emergency / exit lighting (monthly visual, annual 90-min discharge).
- Kitchen suppression systems (semi-annual if applicable).
- Smoke control / pressurization systems (where applicable).
- Generator fuel quality test (where applicable).
- Inspection certificate per device, retained in fire safety binder.

Reporting:
- Written report with all deficiencies categorized: code violation (must-fix), recommended, deferred.
- Quote for repair of any deficiencies (owner-approval required before work).
- Online portal with inspection history and certificates.

Add-alternates:
- 5-year sprinkler full-flow test (when due).
- Magnetic door release testing.
- Fire pump annual.
- Battery replacement allowance.`,
    requirements: `- CFAA-certified fire alarm technician (Canadian Fire Alarm Association).
- Sprinkler company licensed per provincial requirements.
- $5M general liability insurance.
- WSIB clearance.
- Three references for similar property types in the last 12 months.
- Online portal with searchable inspection history.
- Clear conflict-of-interest disclosure (some bidders quote inspection cheap and pad repair quotes — we'll be comparing).`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Award", detail: "Within 2 weeks." },
      { label: "First inspection", detail: "Scheduled within 30 days of award." },
      { label: "Contract term", detail: "1- or 3-year." },
    ],
    siteAccess: "Property contact will coordinate access to mechanical rooms, sprinkler valve rooms, and all floors. Notice to tenants required for in-suite smoke detector tests.",
    questions: [
      "Per-property annual cost?",
      "Is the cost itemized (alarm vs. sprinkler vs. extinguishers) so we can compare apples-to-apples?",
      "How do you handle deficiency repair quotes — are you independent or biased toward upselling?",
      "Do you have a customer portal? Can we see a demo?",
      "What's your conflict-of-interest policy?",
    ],
    evaluationCriteria: [
      "Total annual cost.",
      "Cost transparency (itemized).",
      "Reputation for honest deficiency reporting (this matters a lot).",
      "Portal quality.",
      "Technician certifications.",
    ],
    faqs: [
      { q: "Why is fire inspection cost so variable?", a: "Cheap inspections often come with padded deficiency repair quotes — that's how they make money. Get itemized inspection + at least 2 second opinions on any large deficiency before authorizing repair." },
      { q: "Can I split inspection and repair vendors?", a: "Yes, and you probably should. Some PMs use one company for inspection (so they have no incentive to inflate deficiencies) and a separate one for repair (competitive on price)." },
    ],
    metaTitle: "Fire Safety Inspection Contract RFP Template (Canada)",
    metaDescription:
      "Free RFP template for annual fire safety inspection contracts in Canada. CFAA-certified, transparent pricing, deficiency reporting standards.",
  },
  {
    slug: "mold-remediation",
    name: "Mold Remediation RFP Template",
    query: "mold remediation RFP template",
    tradeSlug: "mold-remediation",
    tradeName: "Mold Remediation",
    costGuideSlug: "mold-remediation-cost",
    pitch: "Containment, removal, and clearance for mold in commercial or residential properties.",
    whenToUse:
      "You've had a leak, flood, or chronic moisture issue and have visible or suspected mold. Especially urgent in occupied multi-unit residential where tenants may have health concerns or be threatening legal action.",
    titleSample: "Mold Remediation — [Property Name] — [Affected Area]",
    summarySample:
      "Mold remediation in [area] of our [property type], approximately [X] sq ft of affected area. Source of moisture: [identified / to be investigated]. Requires containment, removal, and post-remediation clearance.",
    scope: `Scope of work:
- Pre-remediation assessment with our independent IH (industrial hygienist) — bidder to coordinate.
- Containment per IICRC S520: full barrier with negative-pressure HEPA filtration.
- PPE for all workers per provincial standards.
- Removal and disposal of all affected porous materials (drywall, insulation, carpet, etc.) per provincial regulations.
- HEPA vacuuming and antimicrobial treatment of all non-porous surfaces.
- Final cleaning of containment area.
- Tenant communication plan (especially critical in residential).

Source repair (separate scope but coordinate):
- Leak / moisture source must be repaired before remediation completion.
- If repair scope unknown, bidder to provide allowance.

Post-remediation:
- Third-party clearance testing by independent IH (not the remediation company — required for credibility).
- Clearance certificate.
- Rebuild scope quoted separately (or by separate contractor).`,
    requirements: `- IICRC-certified mold remediation technician (or provincial equivalent).
- $5M general liability insurance with mold-specific coverage.
- WSIB clearance.
- Compliance with provincial Ministry of Labour mold-work guidelines.
- Three references for similar-size projects in the last 18 months.
- Willingness to work with an independent IH (this is a deal-breaker — never use a remediation company's in-house IH for clearance).`,
    timeline: [
      { label: "RFP open", detail: "10 days (typically faster than non-urgent work)." },
      { label: "IH assessment", detail: "Independent — typically before bidder mobilization." },
      { label: "Award", detail: "Within 1 week of RFP close." },
      { label: "Mobilization", detail: "Within 1 week of award." },
      { label: "Remediation", detail: "Typically 1–3 weeks." },
      { label: "Clearance + rebuild", detail: "Clearance within 1 week of remediation completion; rebuild separate." },
    ],
    siteAccess: "Affected unit / area. Tenant relocation may be required (coordinate with PM). Containment will block normal access during remediation.",
    questions: [
      "Will you work with our independent IH for both pre-assessment and clearance?",
      "What's your containment protocol (per IICRC S520)?",
      "Per-sq-ft cost for remediation? What's separately quoted (rebuild, IH, tenant relocation)?",
      "Tenant communication — do you handle it or is that on us?",
      "What's your timeline from mobilization to clearance?",
    ],
    evaluationCriteria: [
      "Total remediation cost.",
      "Use of independent IH (deal-breaker).",
      "Containment quality and IICRC compliance.",
      "Tenant communication approach.",
      "References for similar work.",
    ],
    faqs: [
      { q: "Why insist on an independent IH?", a: "Because if the same company does both removal and clearance testing, there's an obvious conflict of interest. Independent IH protects you legally and reputationally." },
      { q: "Will tenants need to relocate?", a: "Depends on scope. Small containment in one room may not require relocation. Full-unit remediation usually does. Budget for short-term hotel costs." },
    ],
    metaTitle: "Mold Remediation RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial / residential mold remediation in Canada. IICRC-compliant containment, independent IH clearance, tenant communication plan.",
  },
  {
    slug: "pest-control-contract",
    name: "Pest Control Contract RFP Template",
    query: "commercial pest control contract RFP template",
    tradeSlug: "pest-control",
    tradeName: "Pest Control",
    pitch: "Quarterly preventive + on-call pest contract — IPM (Integrated Pest Management) approach.",
    whenToUse:
      "You manage one or more properties and want a pest control contractor on retainer for proactive prevention and reactive call-outs. IPM (integrated pest management) is now the preferred approach — fewer chemicals, more inspection and exclusion.",
    titleSample: "Pest Control Service Contract — [Property / Portfolio]",
    summarySample:
      "Annual pest control contract for our [property type]. IPM approach with quarterly preventive visits + on-call response. Coverage for [common pests: rodents, cockroaches, bedbugs, etc.].",
    scope: `Scheduled service (4x per year):
- Interior + exterior perimeter inspection.
- Rodent station inspection + bait refresh.
- Exterior crack-and-crevice treatment.
- Common area inspection (lobby, garbage room, mechanical rooms).
- Written report per visit.

Reactive service (included or per-call rate):
- Tenant-reported pest issues — response within [X] hours.
- Treatment per pest type (cockroach, bedbug, ant, etc.).
- Follow-up visits as needed.

IPM principles:
- Inspection-first approach.
- Exclusion (sealing entry points) before chemical treatment.
- Targeted, lowest-toxicity products.
- Reduced-pesticide approach in tenant areas.

Add-alternates:
- Bedbug-specific treatment (per unit).
- Wildlife removal (raccoons, squirrels, etc.).
- Pre-treatment of common areas before / after tenant move-outs.`,
    requirements: `- Provincial pest control licence in good standing.
- $2M general liability insurance.
- WSIB clearance.
- Technicians trained in IPM.
- Compliance with provincial cosmetic pesticide regulations.
- Online customer portal with service history.
- Three references for similar property types in the last 12 months.`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Award", detail: "Within 2 weeks." },
      { label: "Contract term", detail: "1- or 2-year." },
    ],
    siteAccess: "Common areas + on-call unit access via PM. Tenant notification required 24 hours before in-suite work.",
    questions: [
      "Per-property annual cost? What's included vs. add-on (bedbugs, wildlife)?",
      "On-call response time guarantee?",
      "What's your IPM approach? Specific examples please.",
      "What products do you use? Are they low-toxicity / tenant-safe?",
      "Do you have a customer portal? Can we see a demo?",
    ],
    evaluationCriteria: [
      "Per-property annual cost.",
      "IPM-first approach (vs. pesticide-first).",
      "Response time guarantees.",
      "Portal quality.",
      "Local references.",
    ],
    faqs: [
      { q: "Why IPM instead of regular spraying?", a: "Regular pesticide spraying is increasingly restricted by provincial regs and unpopular with tenants. IPM (inspection + exclusion + targeted treatment) is more effective long-term and produces fewer tenant complaints." },
      { q: "Is bedbug treatment usually included?", a: "Rarely — most contracts price bedbug treatment as a per-unit add-on because it's labour-intensive. Ask for the per-unit rate up front." },
    ],
    metaTitle: "Pest Control Contract RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial pest control contracts in Canada. IPM-based approach, quarterly visits, on-call response, transparent pricing.",
  },

  // ---------- CLEANING / RESTORATION ----------
  {
    slug: "janitorial-annual-contract",
    name: "Janitorial Annual Contract RFP Template",
    query: "janitorial cleaning contract RFP template",
    tradeSlug: "cleaning-janitorial",
    tradeName: "Cleaning / Janitorial",
    costGuideSlug: "commercial-cleaning-cost",
    pitch: "Daily / nightly cleaning contract for commercial or multi-unit residential common areas.",
    whenToUse:
      "You're rebidding your janitorial contract (recommended every 2–3 years to keep pricing honest), or starting fresh on a new property. Best for commercial office, retail, and mid-rise residential.",
    titleSample: "Janitorial Cleaning Contract — [Property Name]",
    summarySample:
      "Daily / nightly cleaning contract for our [property type] at [address]. Approximately [X] sq ft of cleanable area including common areas, washrooms, and elevators.",
    scope: `Daily / nightly:
- Vacuum all carpeted areas.
- Sweep + mop hard-surface floors.
- Wipe down all common-area surfaces (counters, doors, handles, switches).
- Empty all garbage and recycling.
- Clean and restock washrooms (paper, soap, toilets, sinks, floors, mirrors).
- Elevator interior wipe-down.
- Lobby + entry glass cleaning.

Weekly:
- Spot-clean carpet stains.
- Deep-clean washrooms.
- Polish stainless steel.
- Detail-clean elevator tracks.
- High-touch surface disinfection.

Monthly:
- Strip + wax hard floors (or as scheduled).
- Carpet spot extraction.
- Wall and high-dust cleaning.
- Mechanical room cleaning.

Quarterly:
- Carpet hot-water extraction.
- Window cleaning (interior).
- Mechanical / electrical room deep clean.

Annual:
- Exterior window cleaning (coordinated separately or as add-alt).
- Hard floor strip + refinish.

Supplies:
- All consumables (paper, soap, garbage bags) included in contract.
- Branded supplies optional (specify if required).

Communication:
- Daily logbook in service room.
- Online portal for tenant requests and incident reporting.
- Monthly walk-through with property manager.`,
    requirements: `- $5M general liability insurance.
- WSIB clearance.
- All staff are direct employees (not subcontracted) with criminal background checks.
- Supervisor present or on-call for each shift.
- Online portal for incident tracking and tenant requests.
- Three references for similar property types in the last 2 years.
- Compliance with provincial cleaning chemical labelling and WHMIS standards.`,
    timeline: [
      { label: "RFP open", detail: "21 days." },
      { label: "Site walks", detail: "Top 3 invited to walk site and confirm scope." },
      { label: "Award", detail: "Within 2 weeks." },
      { label: "Transition", detail: "30 days from award to first night of service." },
      { label: "Contract term", detail: "2-year typical with annual review." },
    ],
    siteAccess: "Service entrance + supply room. Work hours: typically overnight 10pm–6am for commercial; flexible for residential. Service elevator available.",
    questions: [
      "Per-square-foot per month all-in cost?",
      "Are staff direct employees or subcontracted? Background checks?",
      "Supervisor model — is there one on every shift?",
      "Are consumables (paper, soap) included in price?",
      "Online portal for tenant requests — can we see a demo?",
      "Monthly meeting cadence?",
    ],
    evaluationCriteria: [
      "Per-sq-ft monthly cost.",
      "Staff model (direct employee vs. sub).",
      "Supervisor coverage.",
      "Consumables included vs. extra.",
      "Portal and communication quality.",
      "References on similar property types.",
    ],
    faqs: [
      { q: "Should I rebid janitorial every year?", a: "Every 2–3 years is the sweet spot. Annual rebids create churn; longer than 3 years invites price drift and service slippage." },
      { q: "Direct employees vs. subcontracted — does it matter?", a: "Yes. Direct-employee contractors have better staff retention, accountability, and quality consistency. Subcontracted models have higher turnover and inconsistent service." },
    ],
    metaTitle: "Janitorial Cleaning Contract RFP Template (Canada)",
    metaDescription:
      "Free RFP template for commercial janitorial cleaning contracts in Canada. Daily/weekly/monthly scope, direct-employee requirement, transparent pricing.",
  },
  {
    slug: "post-damage-restoration",
    name: "Post-Damage Restoration RFP Template",
    query: "fire water damage restoration RFP template",
    tradeSlug: "restoration",
    tradeName: "Restoration",
    pitch: "Water, fire, or smoke damage restoration — emergency-response project.",
    whenToUse:
      "You've had a flood, fire, smoke event, or sewer back-up and need a restoration company on site fast. Usually insurance is involved — make sure your restoration vendor works with your insurer and uses Xactimate pricing.",
    titleSample: "Restoration After [Water / Fire / Smoke] Damage — [Property Name]",
    summarySample:
      "Emergency restoration of [X] sq ft of [water / fire / smoke] damage at our [property type]. Insurance claim # [if applicable]. Need response within 24 hours for assessment.",
    scope: `Emergency phase (within 24 hours):
- On-site assessment with documentation (photos, moisture readings, damage inventory).
- Water extraction (if applicable).
- Containment + drying setup (HEPA filtration, air movers, dehumidifiers).
- Initial scope of work + estimated cost using Xactimate (industry standard, insurance-friendly).
- Coordination with insurance adjuster.

Drying / cleanup phase:
- Daily moisture monitoring + logging.
- Removal of unsalvageable materials.
- Antimicrobial treatment.
- Smoke / soot cleaning (for fire / smoke damage).
- Content cleaning + storage (if applicable).

Reconstruction phase:
- Rebuild scope: drywall, insulation, flooring, paint per pre-loss condition.
- Coordination with subtrades (electrical, plumbing).
- Final inspection + tenant move-back coordination.

Documentation throughout:
- Daily progress reports + photos.
- Insurance-compliant documentation (Xactimate, T&M logs).
- Direct billing to insurance where possible.`,
    requirements: `- IICRC-certified for water, fire, smoke (per scope).
- Xactimate-proficient estimating.
- Direct billing relationships with major Canadian insurers preferred.
- $5M general liability insurance with pollution / environmental coverage.
- WSIB clearance.
- 24/7 emergency response.
- Three references for similar projects in the last 12 months.
- Tenant communication plan (for occupied buildings).`,
    timeline: [
      { label: "RFP open", detail: "48 hours (emergency-tight)." },
      { label: "Award", detail: "Same day if possible — get response moving." },
      { label: "Mobilization", detail: "Within 24 hours of award." },
      { label: "Drying / mitigation", detail: "3–7 days typical." },
      { label: "Reconstruction", detail: "Scope-dependent — typically 2–8 weeks." },
    ],
    siteAccess: "Affected area + adjacent. Tenant relocation may be required (coordinate with PM and insurance). Power / water shut-offs as needed.",
    questions: [
      "Can you be on site within 24 hours?",
      "Do you bill insurance directly?",
      "Are you Xactimate-proficient and IICRC-certified?",
      "Per-sq-ft mitigation rate? Reconstruction rate (or scope-based)?",
      "How do you document for insurance claims?",
      "Tenant relocation coordination — included or extra?",
    ],
    evaluationCriteria: [
      "Response time (24-hour mobilization is a deal-breaker).",
      "Insurance billing relationships.",
      "IICRC certifications.",
      "References for similar projects.",
      "Documentation rigor.",
    ],
    faqs: [
      { q: "Will insurance cover the full cost?", a: "Depends on the policy and the cause of loss. Restoration companies that bill insurance directly know how to maximize coverage. Always document everything from minute one — photos before any work begins." },
      { q: "What's Xactimate?", a: "Xactimate is the standard estimating software used by insurance adjusters. Restoration companies that use it speak the same language as your insurer — fewer billing disputes." },
    ],
    metaTitle: "Post-Damage Restoration RFP Template (Canada)",
    metaDescription:
      "Free RFP template for emergency water, fire, and smoke damage restoration in Canada. 24-hour response, Xactimate, insurance-direct billing pre-filled.",
  },
];

export function getRfpTemplate(slug: string): RfpTemplate | undefined {
  return RFP_TEMPLATES.find((t) => t.slug === slug);
}

/** Templates that map to a given trade slug (used on /trades/[category]). */
export function getTemplatesForTrade(tradeSlug: string): RfpTemplate[] {
  return RFP_TEMPLATES.filter((t) => t.tradeSlug === tradeSlug);
}

/** Template that maps to a given cost-guide slug (used on /cost-guides/[slug]). */
export function getTemplateForCostGuide(costGuideSlug: string): RfpTemplate | undefined {
  return RFP_TEMPLATES.find((t) => t.costGuideSlug === costGuideSlug);
}
