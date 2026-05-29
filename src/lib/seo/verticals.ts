/** Vertical / persona value-prop data for /for/[vertical] SEO + conversion pages. */

export interface Vertical {
  slug: string;
  name: string; // e.g. "Builders"
  who: string; // short audience descriptor
  headline: string;
  positioning: string;
  pains: string[];
  valueProps: { title: string; desc: string }[];
  features: string[];
  faqs: { q: string; a: string }[];
  cta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  metaTitle: string;
  metaDescription: string;
}

export const VERTICALS: Vertical[] = [
  {
    slug: "builders",
    name: "Builders",
    who: "General contractors, developers & builders",
    headline: "Find the right subs — fast. Without the cold calls.",
    positioning:
      "PMRFP is where Canadian builders post RFPs and get qualified trade proposals back — replacing the chaotic preferred-vendor list with a structured, competitive process.",
    pains: [
      "Hours lost tracking down subcontractor contacts for each trade",
      "The same 3 subs bid every time — no price pressure",
      "No visibility into a sub's commercial experience or credentials",
      "No paper trail if a vendor relationship goes sideways",
      "Chasing proposals over email and voicemail",
    ],
    valueProps: [
      { title: "Post once, get proposals", desc: "Publish an RFP and qualified trades respond directly — no chasing." },
      { title: "A vetted bench, on demand", desc: "Search a directory of commercial trade companies by category and region." },
      { title: "See credentials up front", desc: "Vendor profiles show experience, service areas, insurance, and specialties." },
      { title: "A documented process", desc: "Every RFP and response is tracked — an audit trail for each engagement." },
      { title: "Free for the demand side", desc: "Posting and browsing cost nothing — zero cost to find vendors." },
    ],
    features: ["Post RFPs", "Directory search by trade + region", "Vendor shortlisting", "Interest tracking"],
    faqs: [
      { q: "We already have preferred vendors.", a: "Good — PMRFP supplements your list. When a preferred sub can't take a job, you have a vetted backup pool ready." },
      { q: "Is this just a bidding war on price?", a: "No. RFPs support scope-based selection — you evaluate on fit and credentials, not just the lowest number." },
    ],
    cta: { label: "Post an RFP", href: "/sign-up" },
    secondaryCta: { label: "Browse the directory", href: "/directory" },
    metaTitle: "PMRFP for Builders — Find & RFP Commercial Subcontractors in Canada",
    metaDescription:
      "Builders and developers: post RFPs and get qualified trade proposals back from a vetted directory of Canadian commercial subcontractors. Free to post.",
  },
  {
    slug: "tradesmen",
    name: "Trade Contractors",
    who: "Electricians, HVAC, roofers, cleaners, snow & more",
    headline: "Stop waiting for the phone to ring.",
    positioning:
      "PMRFP is Canada's commercial trade directory — your $249/yr listing puts your company in front of property managers, developers, and builders actively looking for your trade in your city.",
    pains: [
      "90% of work comes from 2–3 relationships — one dry spell and revenue craters",
      "Government tender platforms are bureaucratic and mostly public-sector work",
      "HomeStars and TrustedPros only send residential leads — wrong buyer, wrong deal size",
      "Cold-calling property managers is slow and expensive",
      "No way to showcase commercial credentials to new prospects",
    ],
    valueProps: [
      { title: "Get discovered", desc: "Property managers, builders, and owners browse the directory by trade + city — be there when they do." },
      { title: "Real commercial RFPs", desc: "Access the recurring maintenance, renovation, and fit-out work that pays steadily." },
      { title: "Flat $249/yr — not pay-per-lead", desc: "Unlimited visibility for one predictable annual fee." },
      { title: "Show your credentials", desc: "Your profile highlights insurance, WSIB, service area, specialties, and project types." },
      { title: "Express interest directly", desc: "Respond to opportunities yourself — no intermediary, no shared-lead scramble." },
    ],
    features: ["Directory listing", "RFP board", "Express interest", "Matching alerts", "Saved opportunities"],
    faqs: [
      { q: "I get enough work from word of mouth.", a: "For now. PMRFP is your insurance policy — a second channel when referrals dry up." },
      { q: "Does PMRFP guarantee contracts?", a: "No. PMRFP provides visibility and opportunity access — not guaranteed awards, responses, or revenue." },
    ],
    cta: { label: "List your company — $249/yr", href: "/sign-up" },
    secondaryCta: { label: "See pricing", href: "/pricing" },
    metaTitle: "PMRFP for Trade Contractors — Win Commercial Property Work in Canada",
    metaDescription:
      "Trade contractors: get listed where property managers search, access commercial RFPs, and win recurring work. Flat $249 CAD/year — not pay-per-lead.",
  },
  {
    slug: "sales-teams",
    name: "Sales Teams",
    who: "Business-development reps at trade & vendor companies",
    headline: "Your next commercial contract is already posted.",
    positioning:
      "For business-development reps at trade and vendor companies, PMRFP is a live feed of commercial property RFPs paired with directory exposure that gets you shortlisted before the RFP is even issued.",
    pains: [
      "A thin, inconsistent pipeline that leans too hard on account farming",
      "Hours wasted chasing government or new-build leads that don't fit your sweet spot",
      "No central source for private commercial property RFPs in Ontario",
      "Hard to demonstrate credentials and past work to cold prospects",
      "Long sales cycles with property management firms",
    ],
    valueProps: [
      { title: "Be visible before the RFP", desc: "Property managers browse the directory when building a shortlist — get found early." },
      { title: "A real pipeline", desc: "The RFP board is a structured, actionable feed of live private-sector opportunities." },
      { title: "Predictable BD budget", desc: "Flat annual cost beats unpredictable per-lead spend." },
      { title: "A living capability statement", desc: "Your company profile is visible to every registered property operator." },
      { title: "Warmer than cold outreach", desc: "Express interest converts faster than cold-calling a PM who's never heard of you." },
    ],
    features: ["Directory listing", "RFP alerts by trade + region", "Express interest", "Company profile management"],
    faqs: [
      { q: "Our company is already on some PM lists.", a: "Are you on all of them? PMRFP exposes you to property managers outside your existing network, especially mid-market portfolios." },
      { q: "How do we measure ROI?", a: "One new commercial maintenance contract typically pays back the annual fee many times over." },
    ],
    cta: { label: "Add your company", href: "/sign-up" },
    secondaryCta: { label: "View opportunities", href: "/rfps" },
    metaTitle: "PMRFP for Sales Teams — A Commercial RFP Pipeline for Trades",
    metaDescription:
      "BD and sales reps at trade companies: a live feed of Canadian commercial property RFPs plus directory exposure that gets you shortlisted early. Flat annual pricing.",
  },
  {
    slug: "investors",
    name: "Property Investors & Owners",
    who: "Real-estate investors & portfolio owners",
    headline: "Your portfolio deserves better vendors than whoever answers first.",
    positioning:
      "PMRFP gives real-estate investors and property owners a searchable, credentialed directory of commercial trade contractors — so you stop relying on whoever your last PM recommended.",
    pains: [
      "Finding qualified trades for commercial properties takes too long",
      "Preferred-vendor lists are opaque, unvetted, and don't travel between properties",
      "No structured way to run a competitive quote for maintenance or capital work",
      "Paying above-market rates with no competitive pressure on incumbents",
      "Credential and compliance gaps create insurance and liability exposure",
    ],
    valueProps: [
      { title: "Browse vetted trades", desc: "Search by category, region, and credential — free." },
      { title: "Run a real process", desc: "Post an RFP for any property and receive structured proposals." },
      { title: "Price transparency", desc: "A competitive process surfaces fair pricing and scope." },
      { title: "Lower your risk", desc: "Profiles surface insurance, licensing, and past work to reduce liability exposure." },
      { title: "Free on the demand side", desc: "No cost for owners and investors to post or browse." },
    ],
    features: ["Directory browsing", "RFP posting", "Vendor shortlisting", "Credential visibility"],
    faqs: [
      { q: "My property manager handles this.", a: "PMRFP complements your PM — it's the tool they can use to find qualified vendors for your assets." },
      { q: "I only have a few properties.", a: "PMRFP is free on the demand side — zero cost to post an RFP or browse vendors." },
    ],
    cta: { label: "Browse the directory", href: "/directory" },
    secondaryCta: { label: "Post an RFP", href: "/sign-up" },
    metaTitle: "PMRFP for Property Investors — Find Vetted Commercial Vendors in Canada",
    metaDescription:
      "Real-estate investors and owners: browse a credentialed directory of commercial trade contractors and run competitive RFPs for your portfolio. Free to post and browse.",
  },
];

export function getVertical(slug: string): Vertical | null {
  return VERTICALS.find((v) => v.slug === slug) ?? null;
}
