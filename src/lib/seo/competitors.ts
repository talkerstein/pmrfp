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
    seoTitle: "MERX Pricing 2026: Plans $600–$2,004/yr vs a $249 Alternative",
    seoDescription:
      "MERX Premium costs $600 to $2,004 a year. Compare every plan side by side, browse open building tenders free, and see the $249/yr flat option for property and building trades.",
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
    // Rewritten 2026-10-22 from the depth study: only what was read on ConstructConnect / DCN pages that day.
    tagline: "Construction project data and the Daily Commercial News tender list.",
    whatItIs:
      "ConstructConnect owns the Daily Commercial News (DCN). As of October 2026 its Canadian tender list showed 1,924 tenders with eight filters, including work type (new, alteration, service/maintenance/supply) and building type. It also has a list of planned projects, a Construction Directory and a free daily Top 10. Public-sector tenders are free to browse; it says private-sector tenders are only for paid subscribers, and documents, bidders and plan holders sit behind a sales form.",
    whoFor: "Contractors, trades and suppliers who follow construction projects from planning through bidding, across new builds, alterations and service work.",
    pricing:
      "Canada: no public price (sales form). U.S. plans are public: Starter US$129/month per market, Professional from US$199/month per market per seat, Premium from US$10,000/year",
    priceTable: [
      { plan: "Starter (U.S.)", covers: "One market", price: "US$129/month", perYear: "US$1,548 (12 months)" },
      { plan: "Professional (U.S.)", covers: "One market, per seat", price: "from US$199/month", perYear: "from US$2,388 (12 months)" },
      { plan: "Premium (U.S.)", covers: "Larger teams", price: "from US$10,000/year", perYear: "from US$10,000" },
    ],
    priceSource: {
      url: "https://constructconnect.com/pricing",
      checked: "October 22, 2026",
      note: "These are ConstructConnect's U.S. plans. Its Canadian tender service (Daily Commercial News) shows no public price, only a sales form. Also read the same day: canada.constructconnect.com/dcn (tender list, planned projects, Top 10, directory) and pricingsaas.com/companies/constructconnect.",
    },
    strengths: [
      "A large Canadian tender list (1,924 tenders as of October 2026) with eight filters, including work type and building type",
      "Owner address, phone and website shown on tender pages",
      "A planned-project list with stage, start month and value",
      "A free daily Top 10, a Construction Directory and Daily Commercial News coverage",
    ],
    weaknesses: [
      "No public price for the Canadian tender service: documents, bidders and plan holders are behind a sales form",
      "Says private-sector tenders are only available to paid subscribers",
      "Its public pages show neither award history nor price benchmarks by trade",
      "No page per public buyer (a tender shows an owner line); PMRFP has 597 Ontario public buyer pages as of October 2026",
      "Interface in English on every page checked in October 2026; PMRFP runs in English, French and Spanish",
    ],
    angle:
      "ConstructConnect is a broad construction information service: a big tender list, a planning-stage pipeline and a directory. PMRFP is narrower: building and property tenders from public buyers, property-manager RFPs, award history and price bands for your trade, with public prices. Both cover new work, alterations and maintenance. As of October 2026.",
    rows: [
      { feature: "Price", pmrfp: "Trade Pro $29 CAD/month or $249 CAD/yr; public tenders free to browse", them: "Canada: no public price (sales form). U.S.: from US$129/month per market" },
      { feature: "Public-sector tenders", pmrfp: "Free to browse", them: "Free to browse" },
      { feature: "Private-sector work", pmrfp: "Property-manager RFPs are free to browse and to post. None is open right now (Oct 2026)", them: "Paid subscribers only (its wording)" },
      { feature: "Tender list filters", pmrfp: "Trade, place, buyer type, closing window; value where stated", them: "Eight, including work type, building type and value range" },
      { feature: "Owner contact on a tender", pmrfp: "Buyer website, bids page, procurement inbox and phone when we hold them (free); the person named on the notice is Trade Pro", them: "Owner address, phone and website on the tender page" },
      { feature: "Documents, plan holders, bidders", pmrfp: "Not hosted: we link to the buyer's official page", them: "Paid, view-only" },
      { feature: "Award history and price bands", pmrfp: "Award notices with winners and amounts where published; price bands by trade and province", them: "Not on its public pages" },
      { feature: "Company directory", pmrfp: "Yes", them: "Yes (Construction Directory)" },
      { feature: "Planned-project list", pmrfp: "Not yet", them: "Yes" },
      { feature: "Languages", pmrfp: "English, French, Spanish", them: "English (every page checked)" },
    ],
    faqs: [
      { q: "Is ConstructConnect only for new construction?", a: "No. As of October 2026 its Canadian tender list has a \"Service, Maintenance & Supply\" filter and many listings are marked \"SMS:\". It covers new construction, alterations and service work." },
      { q: "Does ConstructConnect have a company directory?", a: "Yes. The Daily Commercial News site has a Construction Directory (checked October 2026)." },
      { q: "Does PMRFP have private-sector work for free?", a: "Property-manager RFPs are free to browse and property managers post them free. None is open right now (October 2026), so what is available today is the public tenders. That is a difference in price, not a claim about volume." },
      { q: "Which should a small trade choose?", a: "Browse the free tender lists on both and see which shows the work you bid on. ConstructConnect's Canadian price comes by sales form; PMRFP's is public." },
    ],
  },
  {
    slug: "dodge",
    name: "Dodge Construction Network",
    tagline: "Enterprise US construction intelligence.",
    whatItIs:
      "Dodge tracks 750,000+ projects a year across North America for large GCs, suppliers, and subs pursuing preconstruction leads.",
    whoFor: "Large firms with enterprise budgets pursuing new-build leads.",
    pricing: "Quote only; no public price (checked Oct 2026)",
    strengths: ["Massive project database", "Deep intelligence", "Strong US coverage"],
    weaknesses: [
      "Priced by quote only; no public price, so you cannot compare before a sales call",
      "US-centric; Canada coverage is secondary",
      "Overkill for small/mid trades; no vendor directory",
    ],
    angle:
      "Dodge sells by quote only. PMRFP is built for the Canadian commercial property market and publishes its price: $249 CAD a year.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "Quote only" },
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
    pricing: "Quote only; no public price (checked Oct 2026)",
    strengths: ["1M+ professionals", "Autodesk integration", "Industry standard in US commercial construction"],
    weaknesses: [
      "Reactive for subs — you wait to be invited",
      "US-centric; Canada secondary",
      "Priced by quote only; no public price",
    ],
    angle:
      "BuildingConnected requires someone to invite you. PMRFP lets you proactively list your company and respond to open RFPs from property managers — no waiting for an invitation.",
    rows: [
      { feature: "Annual price", pmrfp: PRICE, them: "Quote only" },
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
      "If you're not already on someone's preferred list, you don't exist. PMRFP creates a front door for trades that aren't yet connected — and gives property managers a searchable alternative to their rolodex.",
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
