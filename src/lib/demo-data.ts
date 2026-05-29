/**
 * Demo fixtures used when Supabase is not configured (DEMO MODE), so the
 * public site is fully browsable with zero setup. Mirrors supabase/seed.sql
 * + reference data. Not used once a real Supabase project is connected.
 */

export interface DemoCategory { slug: string; name: string; icon: string }
export interface DemoRegion { slug: string; name: string; province: string | null }
export interface DemoPropertyType { slug: string; name: string }

export const DEMO_CATEGORIES: DemoCategory[] = [
  { slug: "electrical", name: "Electrical", icon: "Zap" },
  { slug: "plumbing", name: "Plumbing", icon: "Droplets" },
  { slug: "hvac", name: "HVAC", icon: "Wind" },
  { slug: "roofing", name: "Roofing", icon: "Home" },
  { slug: "general-contracting", name: "General Contracting", icon: "HardHat" },
  { slug: "cleaning-janitorial", name: "Cleaning / Janitorial", icon: "SprayCan" },
  { slug: "landscaping", name: "Landscaping", icon: "Trees" },
  { slug: "snow-removal", name: "Snow Removal", icon: "Snowflake" },
  { slug: "security-systems", name: "Security Systems", icon: "ShieldCheck" },
  { slug: "fire-safety", name: "Fire Safety", icon: "Flame" },
  { slug: "elevator-services", name: "Elevator Services", icon: "ArrowUpDown" },
  { slug: "restoration", name: "Restoration", icon: "Wrench" },
  { slug: "painting", name: "Painting", icon: "PaintRoller" },
  { slug: "flooring", name: "Flooring", icon: "Grid3x3" },
  { slug: "glass-and-windows", name: "Glass and Windows", icon: "AppWindow" },
  { slug: "pest-control", name: "Pest Control", icon: "Bug" },
  { slug: "locksmith", name: "Locksmith", icon: "Lock" },
  { slug: "concrete-and-asphalt", name: "Concrete and Asphalt", icon: "Layers" },
  { slug: "waste-removal", name: "Waste Removal", icon: "Trash2" },
  { slug: "building-automation", name: "Building Automation", icon: "Cpu" },
  { slug: "handyman-maintenance", name: "Handyman / Maintenance", icon: "Hammer" },
  { slug: "garage-doors", name: "Garage Doors", icon: "DoorOpen" },
  { slug: "waterproofing", name: "Waterproofing", icon: "Umbrella" },
  { slug: "masonry", name: "Masonry", icon: "Blocks" },
  { slug: "drywall", name: "Drywall", icon: "Square" },
  { slug: "carpentry", name: "Carpentry", icon: "Ruler" },
  { slug: "fencing", name: "Fencing", icon: "Fence" },
  { slug: "property-maintenance", name: "Property Maintenance", icon: "Building2" },
  { slug: "appliance-repair", name: "Appliance Repair", icon: "WashingMachine" },
  { slug: "lighting", name: "Lighting", icon: "Lightbulb" },
  { slug: "energy-efficiency", name: "Energy Efficiency", icon: "Leaf" },
  { slug: "ev-charging", name: "EV Charging", icon: "PlugZap" },
  { slug: "access-control", name: "Access Control", icon: "KeyRound" },
  { slug: "cameras-surveillance", name: "Cameras / Surveillance", icon: "Camera" },
  { slug: "parking-lot-maintenance", name: "Parking Lot Maintenance", icon: "Car" },
  { slug: "signage", name: "Signage", icon: "Signpost" },
  { slug: "millwork", name: "Millwork", icon: "Hammer" },
  { slug: "demolition", name: "Demolition", icon: "Hammer" },
  { slug: "environmental-hazardous-materials", name: "Environmental / Hazardous Materials", icon: "Biohazard" },
  { slug: "dumpster-bin-rental", name: "Dumpster & Bin Rental", icon: "Container" },
  { slug: "mold-remediation", name: "Mold Remediation", icon: "Biohazard" },
];

export const DEMO_REGIONS: DemoRegion[] = [
  { slug: "canada", name: "Canada", province: null },
  { slug: "ontario", name: "Ontario", province: "Ontario" },
  { slug: "greater-toronto-area", name: "Greater Toronto Area", province: "Ontario" },
  { slug: "toronto", name: "Toronto", province: "Ontario" },
  { slug: "north-york", name: "North York", province: "Ontario" },
  { slug: "vaughan", name: "Vaughan", province: "Ontario" },
  { slug: "richmond-hill", name: "Richmond Hill", province: "Ontario" },
  { slug: "markham", name: "Markham", province: "Ontario" },
  { slug: "mississauga", name: "Mississauga", province: "Ontario" },
  { slug: "brampton", name: "Brampton", province: "Ontario" },
  { slug: "oakville", name: "Oakville", province: "Ontario" },
  { slug: "burlington", name: "Burlington", province: "Ontario" },
  { slug: "hamilton", name: "Hamilton", province: "Ontario" },
  { slug: "kitchener-waterloo", name: "Kitchener-Waterloo", province: "Ontario" },
  { slug: "london", name: "London", province: "Ontario" },
  { slug: "ottawa", name: "Ottawa", province: "Ontario" },
  { slug: "montreal", name: "Montreal", province: "Quebec" },
  { slug: "calgary", name: "Calgary", province: "Alberta" },
  { slug: "edmonton", name: "Edmonton", province: "Alberta" },
  { slug: "vancouver", name: "Vancouver", province: "British Columbia" },
  { slug: "winnipeg", name: "Winnipeg", province: "Manitoba" },
];

export const DEMO_PROPERTY_TYPES: DemoPropertyType[] = [
  { slug: "condominium", name: "Condominium" },
  { slug: "apartment-building", name: "Apartment Building" },
  { slug: "rental-residential", name: "Rental Residential" },
  { slug: "townhome-complex", name: "Townhome Complex" },
  { slug: "student-housing", name: "Student Housing" },
  { slug: "purpose-built-rental", name: "Purpose-Built Rental" },
  { slug: "single-family-rental-portfolio", name: "Single-Family Rental Portfolio" },
  { slug: "commercial-office", name: "Commercial Office" },
  { slug: "retail-plaza", name: "Retail Plaza" },
  { slug: "industrial-building", name: "Industrial Building" },
  { slug: "warehouse", name: "Warehouse" },
  { slug: "mixed-use-property", name: "Mixed-Use Property" },
  { slug: "institutional", name: "Institutional" },
  { slug: "school", name: "School" },
  { slug: "medical-building", name: "Medical Building" },
  { slug: "religious-facility", name: "Religious Facility" },
  { slug: "hotel", name: "Hotel" },
  { slug: "senior-living", name: "Senior Living" },
  { slug: "parking-structure", name: "Parking Structure" },
  { slug: "land-development", name: "Land Development" },
  { slug: "multi-site-portfolio", name: "Multi-Site Portfolio" },
];

export interface DemoVendor {
  slug: string;
  name: string;
  city: string;
  province: string;
  shortDescription: string;
  fullDescription: string;
  yearsInBusiness: number;
  employeeCountRange: string;
  insuranceStatus: string;
  wsibStatus: string;
  emergencyService: boolean;
  verified: boolean;
  featured: boolean;
  contactVisibility: "show_contact" | "request_intro" | "hide_contact";
  website: string | null;
  email: string | null;
  phone: string | null;
  categories: string[];
  regions: string[];
  propertyTypes: string[];
}

export const DEMO_VENDORS: DemoVendor[] = [
  {
    slug: "northline-electrical", name: "Northline Electrical Ltd.", city: "Toronto", province: "Ontario",
    shortDescription: "Commercial & condominium electrical maintenance and service upgrades across the GTA.",
    fullDescription: "Northline Electrical is a licensed electrical contractor serving commercial and multi-residential properties across the Greater Toronto Area. We handle preventive maintenance contracts, service upgrades, EV charger installs, and emergency call-outs.",
    yearsInBusiness: 18, employeeCountRange: "11-50", insuranceStatus: "Fully insured ($5M liability)", wsibStatus: "Active",
    emergencyService: true, verified: true, featured: true, contactVisibility: "request_intro",
    website: "https://example.com", email: "contact@example.com", phone: "(416) 555-0142",
    categories: ["electrical", "lighting", "ev-charging"], regions: ["toronto", "north-york", "greater-toronto-area"], propertyTypes: ["condominium", "commercial-office"],
  },
  {
    slug: "summit-mechanical-hvac", name: "Summit Mechanical (HVAC)", city: "North York", province: "Ontario",
    shortDescription: "HVAC preventive maintenance and mechanical services for apartment and office buildings.",
    fullDescription: "Summit Mechanical provides scheduled HVAC preventive maintenance, rooftop unit service, and mechanical retrofits for commercial and multi-residential portfolios.",
    yearsInBusiness: 12, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: true, verified: true, featured: false, contactVisibility: "show_contact",
    website: "https://example.com", email: "contact@example.com", phone: "(416) 555-0173",
    categories: ["hvac", "building-automation"], regions: ["north-york", "toronto"], propertyTypes: ["apartment-building", "commercial-office"],
  },
  {
    slug: "ironclad-roofing", name: "IronClad Roofing", city: "Mississauga", province: "Ontario",
    shortDescription: "Flat-roof TPO, commercial re-roofs, and leak repair for plazas and warehouses.",
    fullDescription: "IronClad Roofing specializes in commercial flat-roof systems, preventive roof maintenance programs, and emergency leak response for retail and industrial properties.",
    yearsInBusiness: 22, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: true, verified: true, featured: false, contactVisibility: "request_intro",
    website: "https://example.com", email: "contact@example.com", phone: "(905) 555-0118",
    categories: ["roofing", "waterproofing"], regions: ["mississauga", "greater-toronto-area"], propertyTypes: ["retail-plaza", "warehouse"],
  },
  {
    slug: "pureclean-facility", name: "PureClean Facility Services", city: "Hamilton", province: "Ontario",
    shortDescription: "Janitorial and cleaning contracts for multi-residential and office properties.",
    fullDescription: "PureClean delivers daily janitorial, common-area cleaning, and post-construction cleanup for property managers across the Golden Horseshoe.",
    yearsInBusiness: 9, employeeCountRange: "51-200", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: false, verified: true, featured: false, contactVisibility: "request_intro",
    website: "https://example.com", email: "contact@example.com", phone: "(905) 555-0190",
    categories: ["cleaning-janitorial", "property-maintenance"], regions: ["hamilton", "burlington"], propertyTypes: ["rental-residential", "commercial-office"],
  },
  {
    slug: "gta-snowpro", name: "GTA SnowPro", city: "Vaughan", province: "Ontario",
    shortDescription: "Commercial snow removal and de-icing for plazas, condos, and parking structures.",
    fullDescription: "GTA SnowPro runs dedicated seasonal snow and ice management contracts with 24/7 dispatch and salting for commercial properties.",
    yearsInBusiness: 14, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: true, verified: false, featured: false, contactVisibility: "hide_contact",
    website: "https://example.com", email: "contact@example.com", phone: "(905) 555-0155",
    categories: ["snow-removal", "landscaping"], regions: ["vaughan", "richmond-hill", "markham"], propertyTypes: ["retail-plaza", "condominium"],
  },
  {
    slug: "apex-asphalt-concrete", name: "Apex Asphalt & Concrete", city: "Brampton", province: "Ontario",
    shortDescription: "Parking lot asphalt repair, line painting, and concrete work for commercial sites.",
    fullDescription: "Apex provides asphalt repair, sealcoating, line painting, and concrete repairs for retail plazas, industrial yards, and parking structures.",
    yearsInBusiness: 16, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: false, verified: false, featured: false, contactVisibility: "request_intro",
    website: "https://example.com", email: "contact@example.com", phone: "(905) 555-0166",
    categories: ["concrete-and-asphalt", "parking-lot-maintenance"], regions: ["brampton", "mississauga"], propertyTypes: ["retail-plaza", "industrial-building"],
  },
  {
    slug: "guardian-fire-safety", name: "Guardian Fire & Safety", city: "Ottawa", province: "Ontario",
    shortDescription: "Fire alarm inspection, extinguisher service, and life-safety compliance.",
    fullDescription: "Guardian Fire & Safety handles annual fire-alarm verification, sprinkler inspection, and life-safety compliance for commercial and institutional buildings.",
    yearsInBusiness: 20, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: true, verified: true, featured: false, contactVisibility: "show_contact",
    website: "https://example.com", email: "contact@example.com", phone: "(613) 555-0144",
    categories: ["fire-safety", "security-systems"], regions: ["ottawa"], propertyTypes: ["institutional", "commercial-office"],
  },
  {
    slug: "vista-glass-windows", name: "Vista Glass & Windows", city: "Markham", province: "Ontario",
    shortDescription: "Commercial glass replacement, storefront, and window repair.",
    fullDescription: "Vista Glass provides commercial storefront glazing, emergency board-up, and window replacement for offices and retail.",
    yearsInBusiness: 7, employeeCountRange: "1-10", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: true, verified: false, featured: false, contactVisibility: "request_intro",
    website: "https://example.com", email: "contact@example.com", phone: "(905) 555-0177",
    categories: ["glass-and-windows"], regions: ["markham", "toronto"], propertyTypes: ["commercial-office", "retail-plaza"],
  },
  // ── Ported from the original pmrfp.com (legacy member companies) ──
  {
    slug: "toronto-painters", name: "Toronto Painters", city: "Toronto", province: "Ontario",
    shortDescription: "Commercial & residential painting — interiors, common areas, and exterior repaints.",
    fullDescription: "Toronto Painters delivers interior and exterior painting for condominiums, apartments, offices, and retail spaces across the GTA, including common-area repaints and occupied-building scheduling.",
    yearsInBusiness: 12, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: false, verified: true, featured: false, contactVisibility: "request_intro",
    website: null, email: null, phone: null,
    categories: ["painting", "drywall"], regions: ["toronto", "north-york", "greater-toronto-area"], propertyTypes: ["condominium", "apartment-building", "commercial-office"],
  },
  {
    slug: "northview-windows-doors", name: "Northview Windows and Doors", city: "Toronto", province: "Ontario",
    shortDescription: "Window and door supply, replacement, and repair for residential & commercial buildings.",
    fullDescription: "Northview Windows and Doors handles window and door replacement, storefront glazing, and repairs for condominiums, apartments, and commercial properties across the Greater Toronto Area.",
    yearsInBusiness: 15, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: false, verified: true, featured: false, contactVisibility: "request_intro",
    website: null, email: null, phone: null,
    categories: ["glass-and-windows", "garage-doors"], regions: ["toronto", "greater-toronto-area", "markham"], propertyTypes: ["condominium", "apartment-building", "commercial-office"],
  },
];

export const DEMO_SUPPLIERS: DemoVendor[] = [
  {
    slug: "maple-building-supply", name: "Maple Building Supply Co.", city: "Vaughan", province: "Ontario",
    shortDescription: "Wholesale building products & materials for commercial trades and builders across the GTA.",
    fullDescription: "Maple Building Supply distributes drywall, insulation, fasteners, and general building products to commercial trades, builders, and property maintenance teams across the Greater Toronto Area, with contractor pricing and job-site delivery.",
    yearsInBusiness: 25, employeeCountRange: "51-200", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: false, verified: true, featured: true, contactVisibility: "show_contact",
    website: "https://example.com", email: "sales@example.com", phone: "(905) 555-0211",
    categories: ["drywall", "general-contracting", "property-maintenance"], regions: ["vaughan", "toronto", "greater-toronto-area"], propertyTypes: ["commercial-office", "condominium"],
  },
  {
    slug: "voltline-electrical-supply", name: "Voltline Electrical Supply", city: "Mississauga", province: "Ontario",
    shortDescription: "Electrical distributor — panels, EV chargers, lighting & wire for commercial contractors.",
    fullDescription: "Voltline supplies electrical contractors and property managers with panels, breakers, EV charging equipment, commercial lighting, and wire — with same-day pickup and contractor accounts.",
    yearsInBusiness: 17, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: true, verified: true, featured: false, contactVisibility: "show_contact",
    website: "https://example.com", email: "sales@example.com", phone: "(905) 555-0233",
    categories: ["electrical", "lighting", "ev-charging"], regions: ["mississauga", "brampton", "greater-toronto-area"], propertyTypes: ["commercial-office", "industrial-building"],
  },
  {
    slug: "thermair-hvac-distribution", name: "ThermAir HVAC Distribution", city: "North York", province: "Ontario",
    shortDescription: "HVAC equipment & parts distributor for mechanical contractors.",
    fullDescription: "ThermAir distributes rooftop units, furnaces, filters, and HVAC parts to mechanical contractors and building operators, with technical support and stocked Toronto warehouse.",
    yearsInBusiness: 12, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: true, verified: false, featured: false, contactVisibility: "request_intro",
    website: "https://example.com", email: "sales@example.com", phone: "(416) 555-0255",
    categories: ["hvac", "building-automation"], regions: ["north-york", "toronto"], propertyTypes: ["apartment-building", "commercial-office"],
  },
  {
    slug: "proclean-janitorial-supply", name: "ProClean Janitorial Supply", city: "Hamilton", province: "Ontario",
    shortDescription: "Janitorial & cleaning supplies for facility and cleaning companies.",
    fullDescription: "ProClean supplies cleaning chemicals, paper, equipment, and PPE to janitorial companies and property managers across the Golden Horseshoe, with bulk pricing and scheduled delivery.",
    yearsInBusiness: 14, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: false, verified: true, featured: false, contactVisibility: "show_contact",
    website: "https://example.com", email: "sales@example.com", phone: "(905) 555-0277",
    categories: ["cleaning-janitorial", "waste-removal"], regions: ["hamilton", "burlington"], propertyTypes: ["rental-residential", "commercial-office"],
  },
  {
    slug: "maple-electric-supply", name: "Maple Electric Supply", city: "Toronto", province: "Ontario",
    shortDescription: "Electrical supply distributor for contractors — fixtures, panels, wire & lighting.",
    fullDescription: "Maple Electric Supply distributes electrical materials, lighting, panels, and wire to contractors and property-maintenance teams across the GTA, with contractor accounts and job-site delivery.",
    yearsInBusiness: 20, employeeCountRange: "11-50", insuranceStatus: "Fully insured", wsibStatus: "Active",
    emergencyService: false, verified: true, featured: false, contactVisibility: "show_contact",
    website: null, email: null, phone: null,
    categories: ["electrical", "lighting"], regions: ["toronto", "greater-toronto-area"], propertyTypes: ["commercial-office", "apartment-building"],
  },
];

export interface DemoRfp {
  slug: string;
  title: string;
  summary: string;
  scope: string;
  requirements: string;
  category: string;
  propertyType: string;
  region: string;
  city: string;
  province: string;
  deadline: string;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetPublic: boolean;
  contactVisibility: "public_contact" | "pmrfp_mediated" | "anonymous_until_interest_approved";
}

export const DEMO_RFPS: DemoRfp[] = [
  {
    slug: "condominium-electrical-maintenance-contract", title: "Condominium Electrical Maintenance Contract",
    summary: "Annual preventive electrical maintenance for a 240-unit condominium tower in downtown Toronto.",
    scope: "Scheduled quarterly inspection of common-area electrical systems, emergency lighting testing, panel servicing, and on-call response for a 240-unit high-rise condominium.",
    requirements: "Licensed electrical contractor (ECRA/ESA), $5M liability insurance, WSIB clearance, minimum 5 years commercial experience, references from condominium clients.",
    category: "electrical", propertyType: "condominium", region: "toronto", city: "Toronto", province: "Ontario",
    deadline: "2026-07-15", budgetMin: 20000, budgetMax: 40000, budgetPublic: true, contactVisibility: "pmrfp_mediated",
  },
  {
    slug: "commercial-plaza-snow-removal-services", title: "Commercial Plaza Snow Removal Services",
    summary: "Seasonal snow removal and de-icing for a multi-tenant retail plaza in Mississauga.",
    scope: "Full-season snow plowing, sidewalk clearing, and salting/de-icing for a 90,000 sq ft retail plaza with 24/7 trigger-based dispatch.",
    requirements: "Proof of insurance, dedicated equipment, 24/7 dispatch capability, salt supply, references for commercial snow contracts.",
    category: "snow-removal", propertyType: "retail-plaza", region: "mississauga", city: "Mississauga", province: "Ontario",
    deadline: "2026-09-30", budgetMin: null, budgetMax: null, budgetPublic: false, contactVisibility: "pmrfp_mediated",
  },
  {
    slug: "apartment-building-hvac-preventive-maintenance", title: "Apartment Building HVAC Preventive Maintenance",
    summary: "Preventive HVAC maintenance program for a 3-building apartment portfolio in North York.",
    scope: "Bi-annual HVAC servicing, rooftop unit maintenance, boiler inspection, and filter programs across three mid-rise apartment buildings.",
    requirements: "Licensed HVAC contractor (TSSA), liability insurance, WSIB, references for multi-residential portfolios.",
    category: "hvac", propertyType: "apartment-building", region: "north-york", city: "North York", province: "Ontario",
    deadline: "2026-08-01", budgetMin: 15000, budgetMax: 30000, budgetPublic: false, contactVisibility: "public_contact",
  },
  {
    slug: "retail-property-parking-lot-asphalt-repair", title: "Retail Property Parking Lot Asphalt Repair",
    summary: "Asphalt repair and line painting for a retail property parking lot in Vaughan.",
    scope: "Pothole repair, crack sealing, partial resurfacing, and re-striping of a 120-space retail parking lot.",
    requirements: "Insured asphalt contractor, equipment for hot-mix repair, traffic management plan, weekend work capability.",
    category: "concrete-and-asphalt", propertyType: "retail-plaza", region: "vaughan", city: "Vaughan", province: "Ontario",
    deadline: "2026-07-31", budgetMin: 25000, budgetMax: 50000, budgetPublic: true, contactVisibility: "anonymous_until_interest_approved",
  },
  {
    slug: "multi-residential-cleaning-services-contract", title: "Multi-Residential Cleaning Services Contract",
    summary: "Daily janitorial and common-area cleaning for a rental residential community in Hamilton.",
    scope: "Daily common-area cleaning, garbage room management, and periodic deep-cleans across a 180-unit rental community.",
    requirements: "Insured janitorial company, WSIB, supervised staff, references for multi-residential cleaning.",
    category: "cleaning-janitorial", propertyType: "rental-residential", region: "hamilton", city: "Hamilton", province: "Ontario",
    deadline: "2026-08-20", budgetMin: null, budgetMax: null, budgetPublic: false, contactVisibility: "pmrfp_mediated",
  },
  // ── Ported from the original pmrfp.com (legacy opportunities, refreshed) ──
  {
    slug: "exterior-wall-modification-commercial", title: "Exterior Wall Modification — Commercial Building",
    summary: "Structural exterior wall modification and re-cladding for a commercial building in Québec.",
    scope: "Modification of an existing exterior wall assembly including framing changes, cladding, weatherproofing, and restoration of the building envelope to current code.",
    requirements: "Licensed contractor (RBQ), liability insurance, CNESST registration, and experience with commercial building-envelope work.",
    category: "masonry", propertyType: "commercial-office", region: "montreal", city: "Montréal", province: "Quebec",
    deadline: "2026-08-10", budgetMin: null, budgetMax: null, budgetPublic: false, contactVisibility: "pmrfp_mediated",
  },
  {
    slug: "emergency-exit-extension-rbq-compliance", title: "Emergency Exit Extension & RBQ Compliance",
    summary: "Emergency exit extension and code-compliance work to meet Québec RBQ standards.",
    scope: "Construction of an extended emergency egress including framing, fire-rated assemblies, signage, and full compliance documentation to RBQ standards.",
    requirements: "RBQ licence, fire-code experience, liability insurance, CNESST, and references for life-safety compliance work.",
    category: "general-contracting", propertyType: "commercial-office", region: "montreal", city: "Québec City", province: "Quebec",
    deadline: "2026-07-28", budgetMin: null, budgetMax: null, budgetPublic: false, contactVisibility: "pmrfp_mediated",
  },
  {
    slug: "flooring-paint-ceiling-renovation", title: "Flooring, Paint & Ceiling Renovation",
    summary: "Interior finishing — flooring, painting, and ceiling renovation for a Toronto residential property.",
    scope: "Removal and replacement of flooring, a full repaint, and ceiling repair/replacement across a multi-unit interior renovation.",
    requirements: "Insured interior-finishing contractor, WSIB, dust-control plan, and references for occupied-building renovations.",
    category: "flooring", propertyType: "apartment-building", region: "toronto", city: "Toronto", province: "Ontario",
    deadline: "2026-08-05", budgetMin: null, budgetMax: null, budgetPublic: false, contactVisibility: "pmrfp_mediated",
  },
  {
    slug: "hvac-system-replacement-montreal", title: "HVAC System Replacement",
    summary: "Full HVAC system replacement for a commercial property in Montréal.",
    scope: "Removal of end-of-life HVAC equipment and supply/installation of new rooftop units, ductwork modifications, controls, and commissioning.",
    requirements: "Licensed HVAC contractor (RBQ/CMMTQ), liability insurance, CNESST, and references for commercial HVAC replacements.",
    category: "hvac", propertyType: "commercial-office", region: "montreal", city: "Montréal", province: "Quebec",
    deadline: "2026-09-05", budgetMin: 40000, budgetMax: 90000, budgetPublic: true, contactVisibility: "public_contact",
  },
  {
    slug: "kitchen-bathroom-renovations", title: "Kitchen & Bathroom Renovations",
    summary: "Kitchen and bathroom renovations across units in a Toronto residential property.",
    scope: "Multi-unit kitchen and bathroom renovations including cabinetry, plumbing fixtures, tiling, and finishing for a residential building.",
    requirements: "Insured general contractor, WSIB, plumbing sub-trade coordination, and references for multi-unit residential renovations.",
    category: "general-contracting", propertyType: "rental-residential", region: "toronto", city: "Toronto", province: "Ontario",
    deadline: "2026-08-18", budgetMin: null, budgetMax: null, budgetPublic: false, contactVisibility: "pmrfp_mediated",
  },
  {
    slug: "mold-remediation-specialist", title: "Mold Remediation Specialist",
    summary: "Mold assessment and remediation for a residential building near Montréal (Boisbriand).",
    scope: "Inspection, containment, removal, and remediation of mold-affected areas, with air-quality testing and clearance documentation.",
    requirements: "Certified mold-remediation specialist, environmental/hazmat protocols, liability insurance, CNESST, and clearance reporting.",
    category: "restoration", propertyType: "apartment-building", region: "montreal", city: "Boisbriand", province: "Quebec",
    deadline: "2026-07-22", budgetMin: null, budgetMax: null, budgetPublic: false, contactVisibility: "anonymous_until_interest_approved",
  },
  {
    slug: "electrical-service-contractor-gta", title: "Electrical Service Contractor",
    summary: "Licensed electrician needed for service and repair work across a GTA property portfolio.",
    scope: "On-call electrical service, repairs, fixture and panel work, and code corrections across a portfolio of commercial and residential properties.",
    requirements: "ECRA/ESA licensed electrician, liability insurance, WSIB, and availability for scheduled and emergency calls.",
    category: "electrical", propertyType: "multi-site-portfolio", region: "greater-toronto-area", city: "Toronto", province: "Ontario",
    deadline: "2026-07-20", budgetMin: null, budgetMax: null, budgetPublic: false, contactVisibility: "pmrfp_mediated",
  },
];

export interface DemoResource {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  publishedAt: string;
}

export const DEMO_RESOURCES: DemoResource[] = [
  {
    slug: "how-commercial-property-rfps-work-in-canada",
    title: "How Commercial Property RFPs Work in Canada",
    excerpt: "A plain-English guide to how property managers issue RFPs and how trades can respond.",
    body: "## How Commercial Property RFPs Work in Canada\n\nCommercial property work in Canada often moves through preferred-vendor lists, referrals, and fragmented RFP channels. This guide explains how property managers issue RFPs, what they look for, and how your company can position itself.\n\n### What is an RFP?\n\nA Request for Proposal (RFP) is how a property manager, builder, or owner formally invites vendors to bid on a project or service contract.\n\n### How to respond effectively\n\n- Read the scope carefully\n- Confirm insurance and licensing requirements\n- Submit a clear, complete capability statement\n\nPMRFP gives you a focused place to monitor these opportunities and express interest.",
    publishedAt: "2026-05-01",
  },
  {
    slug: "vendor-prequalification-checklist",
    title: "Vendor Prequalification Checklist",
    excerpt: "The documents and credentials property managers commonly require from vendors.",
    body: "## Vendor Prequalification Checklist\n\nBefore you can win commercial property work, you usually need to prequalify. Here is what property managers commonly ask for:\n\n- Proof of liability insurance\n- WSIB clearance certificate\n- Trade licensing / certifications\n- References from similar properties\n- Capability statement\n- Health & safety policy\n\nKeep these ready so you can respond to opportunities fast.",
    publishedAt: "2026-05-08",
  },
  {
    slug: "snow-removal-rfp-checklist",
    title: "Snow Removal RFP Checklist",
    excerpt: "What to include when bidding on a commercial snow removal contract.",
    body: "## Snow Removal RFP Checklist\n\nBidding on a commercial snow removal contract? Make sure your proposal covers:\n\n- Trigger depth and response times\n- Equipment and salt supply\n- 24/7 dispatch\n- Insurance and slip-and-fall coverage\n- Site map and service zones\n\nA complete proposal stands out.",
    publishedAt: "2026-05-15",
  },
];

export function categoryName(slug: string): string {
  return DEMO_CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
}
export function regionName(slug: string): string {
  return DEMO_REGIONS.find((r) => r.slug === slug)?.name ?? slug;
}
export function propertyTypeName(slug: string): string {
  return DEMO_PROPERTY_TYPES.find((p) => p.slug === slug)?.name ?? slug;
}
