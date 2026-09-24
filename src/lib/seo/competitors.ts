/**
 * Competitor data for programmatic /vs/[competitor] comparison pages.
 * Honest positioning — PMRFP is newer, cheaper, and Canada-commercial-property
 * focused. No false claims about competitors. Sourced from May 2026 research.
 */

export interface ComparisonRow {
  feature: string;
  pmrfp: string;
  them: string;
}

export interface Competitor {
  slug: string;
  name: string;
  tagline: string; // short "X is ..." line
  whatItIs: string;
  whoFor: string;
  pricing: string;
  strengths: string[];
  weaknesses: string[];
  angle: string; // PMRFP's honest positioning vs them
  rows: ComparisonRow[];
  faqs: { q: string; a: string }[];
  /** Overrides the default "<name> vs PMRFP" title when Search Console shows a sharper query. */
  seoTitle?: string;
  seoDescription?: string;
  /** Show live open public-tender counts and samples (competitor sells tender access). */
  publicTenderProof?: boolean;
  /** The competitor's published prices, shown as the first table on the page. Only
   *  figures read off their own pricing page, with where and when they were checked. */
  priceTable?: { plan: string; covers: string; price: string; perYear: string }[];
  priceSource?: { url: string; checked: string; note?: string };
}

const PRICE = "$249 CAD/yr (flat)";

export const COMPETITORS: Competitor[] = [
  {
    slug: "merx",
    name: "MERX",
    // Search Console (Jun–Sep 2026): this page earns ~1,000 impressions on
    // "merx", "merx canada", "merx pricing" and "merx rfp" but ~0.3% CTR. Those
    // searchers already pay for tender leads — lead with price and the
    // alternative, the two things they came to check.
    seoTitle: "MERX Pricing (2026) & a Cheaper Alternative for Building Trades",
    seoDescription:
      "MERX Premium costs $50 to $167 a month, billed annually ($600 to $2,004 a year). What each plan covers, and a $249/yr option if you only bid on building and property work.",
    // Read off merx.com/public/pricing on 2026-09-24 (Canadian Tenders tab,
    // annual billing). Re-check before changing; never estimate.
    priceTable: [
      { plan: "Basic", covers: "Solicitations from participating member agencies", price: "Free", perYear: "$0" },
      { plan: "Premium Local", covers: "One province (territories included)", price: "$50/month, billed annually", perYear: "$600" },
      { plan: "Premium Regional", covers: "One region", price: "$100/month, billed annually", perYear: "$1,200" },
      { plan: "Premium National", covers: "All of Canada", price: "$167/month, billed annually", perYear: "$2,004" },
    ],
    priceSource: {
      url: "https://www.merx.com/public/pricing",
      checked: "September 24, 2026",
      note: "CAD, before tax. MERX says annual billing saves 50% over monthly. Private construction leads are a separate subscription (for example Ontario at $113.17/month, billed annually).",
    },
    publicTenderProof: true,
    tagline: "Canada's largest public-tender aggregator.",
    whatItIs:
      "MERX pulls federal, provincial, municipal and MASH-sector tenders (plus some private construction) into one feed, sold by province, region or all of Canada. It hosts electronic bid submission for the buyers who publish on it.",
    whoFor: "Vendors bidding on public tenders in every sector, across many provinces.",
    pricing:
      "Basic is free; Premium is $50 (one province), $100 (one region) or $167 (all of Canada) a month, billed annually",
    strengths: [
      "Largest Canadian tender database, every sector",
      "Every province and territory, bilingual",
      "Electronic bid submission for buyers that publish on MERX",
    ],
    weaknesses: [
      "You pay for every sector when you only bid on building and property work",
      "Wider coverage costs more — regional and national plans are annual-only",
      "No private property-manager RFPs, contract-winner history or company directory",
    ],
    angle:
      "MERX sells the whole Canadian tender feed. If you only bid on building and property work, PMRFP puts the tenders that matter — CanadaBuys, City of Toronto, Quebec's SEAO and Yukon — next to private RFPs from property managers, with daily alerts for $249 a year.",
    rows: [
      { feature: "Price", pmrfp: `${PRICE}, or $29/mo`, them: "Free Basic; Premium $50 to $167/mo billed annually ($600 to $2,004/yr)" },
      { feature: "Public tenders", pmrfp: "CanadaBuys, City of Toronto, Quebec SEAO, Yukon", them: "Federal, provincial, municipal, MASH — every sector" },
      { feature: "Private property-manager RFPs", pmrfp: "Yes", them: "No" },
      { feature: "Filtered to building & property trades", pmrfp: "Yes", them: "You filter by category" },
      { feature: "Who won past contracts, and for how much", pmrfp: "Yes — free", them: "Award notices, where the buyer posts them" },
      { feature: "Company profile in a public directory", pmrfp: "Yes", them: "No" },
      { feature: "Submit bids on the platform", pmrfp: "No — you bid on the issuer's portal", them: "Yes, for MERX-hosted tenders" },
    ],
    faqs: [
      { q: "How much does MERX cost?", a: "On MERX's pricing page (checked September 24, 2026), Basic is free and Premium is sold by coverage, billed annually: Local (one province) $50 a month, Regional $100 a month, National $167 a month. That's $600, $1,200 or $2,004 a year, in CAD before tax. MERX says annual billing saves 50% over paying monthly. PMRFP Trade Pro is $249 CAD a year, or $29 a month." },
      { q: "How much is MERX for Ontario?", a: "Ontario on its own is the Premium Local plan: $50 a month billed annually, $600 a year before tax (checked September 24, 2026). MERX's private construction leads are a separate subscription; the Ontario plan is $113.17 a month, billed annually." },
      { q: "Is MERX free?", a: "You can browse tender summaries on MERX with a free account. Documents, email alerts and bidding need a paid subscription." },
      { q: "Is there a cheaper alternative to MERX?", a: "If you only bid on building, maintenance and property work, yes. PMRFP collects public tenders from CanadaBuys, the City of Toronto, Quebec's SEAO and Yukon, adds private RFPs from property managers, and emails you the day a match posts — $249 CAD a year. If you bid across every sector and province, MERX's wider coverage is worth its price." },
      { q: "Does PMRFP have government tenders?", a: "Yes. Every morning PMRFP imports open building and property tenders from CanadaBuys, the City of Toronto, Quebec's SEAO and the Government of Yukon, under their open-data licences. You still submit your bid on the issuer's own portal." },
      { q: "Can I use both?", a: "Many trades do. MERX for the broadest public-sector coverage, PMRFP for property-manager RFPs, filtered building tenders, past contract winners and a directory profile that gets you found." },
    ],
  },
  {
    slug: "vendorpm",
    name: "VendorPM",
    tagline: "Toronto-built vendor management for property managers.",
    whatItIs:
      "VendorPM is a vendor lifecycle + compliance platform used by property managers across tens of thousands of buildings to source, onboard, and track vendors.",
    whoFor: "Mid-to-large property management firms managing vendor compliance at scale.",
    pricing: "Enterprise / custom (vendors pay for membership tiers)",
    strengths: [
      "Canadian-built and commercial-property focused",
      "Strong compliance / insurance tracking",
      "Large building network",
    ],
    weaknesses: [
      "Oriented to enterprise PM workflows and vendor compliance, not open RFP discovery",
      "Vendor membership pricing is higher and less transparent",
      "Less of an SEO-discoverable public directory for winning net-new work",
    ],
    angle:
      "VendorPM is a great compliance tool for large PM firms. PMRFP is a lower-cost, discovery-first front door — a public directory plus an open RFP board — built so trades get found and win new commercial work, not just manage paperwork for buildings they already serve.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "Custom / higher" },
      { feature: "Primary job", pmrfp: "Discovery + open RFPs", them: "Vendor compliance / lifecycle" },
      { feature: "Public, SEO-friendly directory", pmrfp: "Yes", them: "Limited" },
      { feature: "Open RFP board", pmrfp: "Yes", them: "Invitation-based" },
      { feature: "Commercial property focus", pmrfp: "Yes", them: "Yes" },
    ],
    faqs: [
      { q: "How is PMRFP different from VendorPM?", a: "VendorPM is primarily a compliance and vendor-management tool for large property managers. PMRFP is discovery-first: a public directory and open RFP board priced flat at $249/yr so trades can be found and win new work." },
      { q: "I'm already on VendorPM — why add PMRFP?", a: "They do different jobs. VendorPM keeps you compliant on the buildings that already use you; PMRFP gets you discovered by the ones that don't, through a public directory and open RFP board. Many trades run both — VendorPM for existing accounts, PMRFP to win new ones." },
    ],
  },
  {
    slug: "bidnet-direct",
    publicTenderProof: true,
    name: "BidNet Direct",
    tagline: "North American public-sector bid aggregator.",
    whatItIs:
      "BidNet Direct aggregates US and Canadian government tenders with a Canadian public-tenders module and an alert system.",
    whoFor: "Vendors pursuing municipal and provincial government contracts.",
    pricing: "Subscription, ~US$500–$1,500/yr typical (Canada pricing not public)",
    strengths: ["Covers thousands of public agencies", "Good alert system", "Free for buyers"],
    weaknesses: [
      "US-centric with a Canadian add-on feel",
      "No vendor directory or marketing",
      "No private commercial real-estate angle",
    ],
    angle:
      "BidNet is a US-first government-tender tool. PMRFP is Canadian: building and property tenders from CanadaBuys, Toronto, Quebec and Yukon, plus private RFPs from property managers who never post on government portals.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "≈US$500–$1,500/yr" },
      { feature: "Focus", pmrfp: "Canadian building & property work — public tenders + private RFPs", them: "Government tenders" },
      { feature: "Vendor directory", pmrfp: "Yes", them: "No" },
      { feature: "Canada-native", pmrfp: "Yes", them: "US-primary" },
    ],
    faqs: [
      { q: "Does PMRFP have government tenders?", a: "Yes, for building and property work: PMRFP imports open tenders from CanadaBuys, the City of Toronto, Quebec's SEAO and Yukon every morning, next to private RFPs from property managers. BidNet covers far more US agencies." },
    ],
  },
  {
    slug: "biddingo",
    publicTenderProof: true,
    name: "Biddingo",
    tagline: "Canadian MASH-sector tender platform.",
    whatItIs:
      "Biddingo is a Canadian-built platform for municipal, school-board, and hospital procurement, with strong Ontario coverage.",
    whoFor: "Vendors bidding on Canadian public / MASH-sector tenders.",
    pricing: "Free basic; Premium ≈$499 CAD/yr",
    strengths: ["True Canadian platform", "Strong Ontario MASH coverage", "Free trial"],
    weaknesses: [
      "Government / MASH-skewed, not commercial property",
      "No vendor directory or company marketing",
      "Limited private-sector listings",
    ],
    angle:
      "Biddingo serves the public sector. PMRFP serves the private commercial real-estate market — and gives your company a marketing profile, not just a bid inbox.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "≈$499 CAD/yr" },
      { feature: "Focus", pmrfp: "Private commercial property", them: "MASH / public sector" },
      { feature: "Vendor directory", pmrfp: "Yes", them: "No" },
      { feature: "Canada-native", pmrfp: "Yes", them: "Yes" },
    ],
    faqs: [
      { q: "Is PMRFP cheaper than Biddingo?", a: "Yes — $249/yr flat versus roughly $499/yr for Biddingo Premium, and PMRFP includes a searchable vendor directory listing." },
    ],
  },
  {
    slug: "constructconnect",
    name: "ConstructConnect",
    tagline: "Canada's dominant preconstruction intelligence platform.",
    whatItIs:
      "ConstructConnect (with Link2Build and the Daily Commercial News) tracks preconstruction projects, plans, and permits for GCs, sub-trades, and suppliers.",
    whoFor: "Trades and suppliers chasing new-construction project leads.",
    pricing: "Custom quote — reportedly ≈$1,500–$3,000+/yr (not publicly listed)",
    strengths: ["Deep preconstruction project data", "Editorial credibility (DCN)", "Large Canadian base"],
    weaknesses: [
      "Expensive — out of reach for many small trades",
      "Oriented to new-build leads, not property maintenance/renovation RFPs",
      "No vendor directory or marketing profile",
    ],
    angle:
      "ConstructConnect is for chasing new construction. PMRFP is for winning the recurring maintenance, renovation, and fit-out work from existing commercial property operators — a steadier, far more affordable market for most trades.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "Custom quote (reportedly ≈$1,500–$3,000+/yr)" },
      { feature: "Opportunity type", pmrfp: "Existing-property RFPs", them: "New-build preconstruction" },
      { feature: "Vendor directory", pmrfp: "Yes", them: "No" },
      { feature: "Entry-level cost", pmrfp: "Low, flat", them: "High" },
    ],
    faqs: [
      { q: "Which should a small trade choose?", a: "If you want affordable access to recurring commercial property work, PMRFP. If you have the budget to chase large new-build projects, ConstructConnect. They serve different needs." },
    ],
  },
  {
    slug: "dodge",
    name: "Dodge Construction Network",
    tagline: "Enterprise US construction intelligence.",
    whatItIs:
      "Dodge tracks 750,000+ projects a year across North America for large GCs, suppliers, and subs pursuing preconstruction leads.",
    whoFor: "Large firms with enterprise budgets pursuing new-build leads.",
    pricing: "≈US$6,000–$12,000+/yr per user",
    strengths: ["Massive project database", "Deep intelligence", "Strong US coverage"],
    weaknesses: [
      "Very expensive — more per year than many trades profit on a single job",
      "US-centric; Canada coverage is secondary",
      "Overkill for small/mid trades; no vendor directory",
    ],
    angle:
      "Dodge costs more per year than many small trades make on a single contract. PMRFP is purpose-built for the Canadian commercial property market at a tiny fraction of the price.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "≈US$6,000–$12,000+/yr" },
      { feature: "Canada-native", pmrfp: "Yes", them: "US-primary" },
      { feature: "Small-trade accessible", pmrfp: "Yes", them: "No" },
      { feature: "Vendor directory", pmrfp: "Yes", them: "No" },
    ],
    faqs: [
      { q: "Is PMRFP an alternative to Dodge?", a: "For Canadian trades focused on commercial property work, PMRFP delivers directory exposure and relevant RFPs without Dodge's enterprise price tag." },
    ],
  },
  {
    slug: "trustedpros",
    name: "TrustedPros",
    tagline: "Canadian residential contractor reviews + leads.",
    whatItIs:
      "TrustedPros is a Canadian contractor review and lead platform focused on residential homeowners.",
    whoFor: "Residential homeowners finding contractors.",
    pricing: "Subscription + leads (pricing not transparent)",
    strengths: ["Canadian-born", "Established since 2004", "Profiles and reviews"],
    weaknesses: ["Residential only — no commercial", "Lead quality questioned", "Opaque pricing"],
    angle:
      "TrustedPros is for home renovations. PMRFP is for commercial property — a different buyer, a bigger deal size, and a higher credibility standard.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "Opaque, lead-based" },
      { feature: "Market", pmrfp: "Commercial property", them: "Residential" },
      { feature: "RFP access", pmrfp: "Yes", them: "No" },
      { feature: "Buyer", pmrfp: "Property managers / owners", them: "Homeowners" },
    ],
    faqs: [
      { q: "Will PMRFP send me residential leads?", a: "No. PMRFP is commercial property only — property managers, builders, and owners, not homeowners." },
    ],
  },
  {
    slug: "homestars",
    name: "HomeStars",
    tagline: "Canada's largest residential contractor review platform.",
    whatItIs:
      "HomeStars (part of Angi/IAC) is Canada's biggest residential contractor review and referral platform.",
    whoFor: "Residential homeowners; contractors pay per lead or subscription.",
    pricing: "Pay-per-lead (≈$15–$85+ CAD/lead) + subscription tiers",
    strengths: ["Largest Canadian consumer-contractor platform", "Strong reviews", "National coverage"],
    weaknesses: [
      "Strictly residential — no commercial property angle",
      "Pay-per-lead drives up cost in competitive trades",
      "No RFP functionality",
    ],
    angle:
      "HomeStars is for kitchen renovations. PMRFP is for commercial maintenance and fit-out contracts that are often worth 5–10x more per job — with a flat fee instead of per-lead charges.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "Per-lead, variable" },
      { feature: "Market", pmrfp: "Commercial property", them: "Residential" },
      { feature: "Cost model", pmrfp: "Flat annual", them: "Pay-per-lead" },
      { feature: "RFP access", pmrfp: "Yes", them: "No" },
    ],
    faqs: [
      { q: "Is PMRFP like HomeStars for commercial?", a: "Similar idea — get discovered — but PMRFP serves commercial property buyers, adds an RFP board, and charges a flat $249/yr instead of per lead." },
    ],
  },
  {
    slug: "angi",
    name: "Angi (Angi Leads)",
    tagline: "US home-services marketplace.",
    whatItIs:
      "Angi (formerly Angie's List) is a US home-services marketplace, operating in Canada largely through HomeStars.",
    whoFor: "Residential homeowners.",
    pricing: "Per-lead (≈$15–$100+ CAD), often shared leads",
    strengths: ["Large North American brand", "Broad trade coverage"],
    weaknesses: [
      "US-centric and residential",
      "Shared leads — the same lead goes to several contractors",
      "Per-lead model resented by many trades",
    ],
    angle:
      "Angi sends you the same shared lead that went to four other contractors. PMRFP connects you to property managers issuing real commercial RFPs — you compete on merit and fit, not who calls back fastest.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "Per-lead, variable" },
      { feature: "Leads", pmrfp: "Express interest on real RFPs", them: "Shared leads" },
      { feature: "Market", pmrfp: "Commercial property", them: "Residential" },
      { feature: "Canada-native", pmrfp: "Yes", them: "US-primary" },
    ],
    faqs: [
      { q: "Are PMRFP opportunities exclusive?", a: "RFPs are open to qualified members, but you respond directly with your own proposal — it's not a shared lead blasted to dozens of contractors." },
    ],
  },
  {
    slug: "planhub",
    name: "PlanHub",
    tagline: "US commercial-construction bidding platform.",
    whatItIs:
      "PlanHub is a US cloud bidding platform connecting general contractors and subs on commercial construction projects.",
    whoFor: "US commercial construction GCs and subcontractors.",
    pricing: "Subs free–≈US$1,199/yr; GCs custom",
    strengths: ["Large US commercial project database", "Free-for-subs entry", "Modern interface"],
    weaknesses: [
      "Primarily US market — weak Canada coverage",
      "New-build construction focus, not property maintenance",
      "No vendor directory",
    ],
    angle:
      "PlanHub is a US tool for US construction bids. PMRFP is Canadian-built for Canadian commercial property operators and the recurring work they award.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "Free–≈US$1,199/yr" },
      { feature: "Canada coverage", pmrfp: "Canada-first", them: "US-primary" },
      { feature: "Opportunity type", pmrfp: "Existing-property RFPs", them: "New-build bids" },
      { feature: "Vendor directory", pmrfp: "Yes", them: "No" },
    ],
    faqs: [
      { q: "Does PlanHub work in Canada?", a: "Its coverage is US-centric. For Canadian commercial property work, PMRFP is purpose-built." },
    ],
  },
  {
    slug: "buildingconnected",
    name: "BuildingConnected",
    tagline: "Autodesk's preconstruction bid network.",
    whatItIs:
      "BuildingConnected (owned by Autodesk) is a preconstruction network where GCs manage bid invites and subs receive invitations.",
    whoFor: "Mid-to-large GCs and the subs they invite, mostly in US commercial construction.",
    pricing: "Subs free (reactive) or ≈US$149/mo; GCs ≈US$3,600–$5,000+/yr",
    strengths: ["1M+ professionals", "Autodesk integration", "Industry standard in US commercial construction"],
    weaknesses: [
      "Reactive for subs — you wait to be invited",
      "US-centric; Canada secondary",
      "Complex and costly for small shops",
    ],
    angle:
      "BuildingConnected requires someone to invite you. PMRFP lets you proactively list your company and respond to open RFPs from property managers — no waiting for an invitation.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "Free–≈US$149/mo (subs)" },
      { feature: "Lead model", pmrfp: "Proactive — open RFPs", them: "Invitation-only" },
      { feature: "Canada coverage", pmrfp: "Canada-first", them: "US-primary" },
      { feature: "Vendor directory", pmrfp: "Yes", them: "No" },
    ],
    faqs: [
      { q: "Do I have to be invited to use PMRFP?", a: "No. You list your company and can express interest in any open RFP that fits — no invitation required." },
    ],
  },
  {
    slug: "status-quo",
    name: "the status quo",
    tagline: "Referrals, preferred-vendor lists, and email.",
    whatItIs:
      "How most commercial property managers and trades find each other today — word of mouth, internal vendor lists, cold calls, and email.",
    whoFor: "Everyone who hasn't found a better system.",
    pricing: "Free in money, expensive in time and missed opportunity",
    strengths: ["High trust from known referrals", "No subscription", "Works for established players"],
    weaknesses: [
      "If you're not already on a list, you're invisible",
      "Geography-locked and opaque",
      "No competitive pricing signal or documented process",
    ],
    angle:
      "If you're not already on someone's preferred list, you don't exist. PMRFP creates a front door for trades that aren't yet connected — and gives property managers a searchable, vetted alternative to their rolodex.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "$0 (high time cost)" },
      { feature: "Discoverability for new vendors", pmrfp: "Yes", them: "No" },
      { feature: "Competitive RFP process", pmrfp: "Yes", them: "Rare" },
      { feature: "Canada-wide reach", pmrfp: "Yes", them: "Local only" },
    ],
    faqs: [
      { q: "Why pay if referrals work?", a: "Referrals work — until they dry up. PMRFP is the second channel that keeps your pipeline full when word of mouth goes quiet, and opens doors outside your existing network." },
    ],
  },
];

export function getCompetitor(slug: string): Competitor | null {
  return COMPETITORS.find((c) => c.slug === slug) ?? null;
}
