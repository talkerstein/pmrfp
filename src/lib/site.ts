/**
 * Central site config + navigation + canonical copy blocks.
 * Copy blocks come from the PMRFP spec (§29) — no fake guarantees, B2B tone.
 */

export const SITE = {
  name: "PMRFP",
  longName: "PMRFP — Property Management RFP",
  tagline: "Property managers post building RFPs free. Vetted trades bid on the work. Region by region across Canada and the U.S.",
  description:
    "PMRFP is where property managers post commercial and residential building RFPs free, and vetted trades get listed and bid on the work — by region across Canada and the United States.",
  url: "https://pmrfp.com",
  email: "info@pmrfp.com",
  supportEmail: "info@pmrfp.com",
  country: "Canada",
  // Light sister-company tie to PermitClub (brand bridge only)
  sisterBrand: { name: "PermitClub", url: "https://permitclub.com" },
} as const;

export const PRICING = {
  proAnnual: 249,
  proMonthly: 29,
  featuredAnnual: 599,
  seoAnnual: 120,
  seoMonthly: 12,
  /** Realtor Pro: unlimited trusted trades + a contact button on the page. */
  realtorAnnual: 249,
  seoNote:
    "SEO Listing: your company on the trade + city pages property managers find on Google and in AI answers, plus an unlimited project photo gallery. Directory placement only — RFP access is Trade Pro.",
  currency: "CAD",
  earlyBirdNote: "Early-bird: lock in $249/yr — rises to $399 once we hit 100 subscribers.",
  featuredNote:
    "Featured includes everything in Trade Pro, plus priority placement at the top of your categories and regions.",
  monthlyNote: "Try us month-to-month at $29/mo. Switch to annual any time and save $99.",
  // Policy: NO refunds (founder decision 2026-06-05). Subscriptions are
  // non-refundable; members cancel anytime and keep access to the end of the
  // paid period. (Chargeback exposure is handled operationally, not via refunds.)
  guaranteeNote: "Cancel anytime — your access runs to the end of your billing period. Subscriptions are non-refundable.",
  // ROI anchor: one won commercial RFP dwarfs the annual fee.
  roiNote: "One won commercial RFP typically covers years of Trade Pro.",
} as const;

/**
 * Referral program — anyone can introduce either:
 *   1. a TRADE (vendor) → CASH fee paid when they activate Trade Pro
 *      ($249/yr). Direct revenue justifies the cash payout.
 *   2. a PROJECT (RFP) → NO cash. Public credit on the RFP + top-connectors
 *      leaderboard. Avoids open accounts-payable liability while still
 *      incentivizing the relationship-building professionals (REAs, mortgage
 *      brokers, RE lawyers) who naturally know about projects. If their
 *      referred project later converts a trade to Pro, that trade-side fee
 *      becomes payable under the trade lane.
 *
 * See /refer (hub), /refer-a-trade (cash lane), /refer-a-project (recognition).
 */
export const REFERRAL = {
  currency: "CAD",
  // Cash lane (trade) — direct revenue justifies aggressive CAC.
  // ONE rule (audit F13/F14, 2026-09-17): $75 only on an ANNUAL Trade Pro or
  // Featured subscription. A monthly sub ($29) paid a $75 bounty before the
  // member had even paid $75 back, so monthly referrals earn a smaller fee
  // released after the third monthly payment clears ($87 collected).
  tradeFee: 75,
  tradeFeeMonthly: 25,
  monthlyPaymentsRequired: 3,
  // Recognition lane (project) — no cash. Public credit + leaderboard.
  projectIncentive: "Public credit on the RFP + top-connectors leaderboard",
  // Headline number (for the cash lane only).
  maxFee: 75,
  // Short copy (used in banner + nav).
  oneLiner: "Refer a trade to Trade Pro and earn up to $75. Refer a project and get public credit.",
  shortCta: "Refer to PMRFP",
} as const;

/** Primary public navigation (§30 header) */
// Find work, find a trade, jobs (hiring people), hire trades (PMs), pay.
// "For Trades" is what the homepage already is; guides live in the footer.
export const MAIN_NAV = [
  { href: "/rfps", label: "RFPs" },
  { href: "/directory", label: "Trade Directory" },
  { href: "/jobs", label: "Jobs" },
  { href: "/for-property-managers", label: "For Property Managers" },
  { href: "/pricing", label: "Pricing" },
] as const;

/** Secondary nav slot — sits between primary nav and auth CTAs in the header.
 * Referral is intentionally OUT of the primary nav for now — the link is shared
 * strategically. Still reachable via the footer (Resources) + direct /refer links. */
export const SECONDARY_NAV: readonly { href: string; label: string }[] = [];

/** Trade dashboard sidebar (§10.3) */
export const TRADE_NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/company", label: "Company Profile" },
  { href: "/dashboard/rfps", label: "RFP Feed" },
  { href: "/dashboard/saved-rfps", label: "Saved RFPs" },
  { href: "/dashboard/interests", label: "My Interests" },
  // Projects covers both the photo capture and the typed case-study form
  // (linked from the Projects page), so one entry instead of two.
  { href: "/dashboard/projects", label: "Projects" },
  { href: "/jobs/manage", label: "Hiring" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

/** Property manager dashboard sidebar (§10.4) */
export const PM_NAV = [
  { href: "/pm-dashboard", label: "Home" },
  { href: "/pm-dashboard/rfps", label: "My RFPs" },
  { href: "/pm-dashboard/rfps/new", label: "Post an RFP" },
  { href: "/rfp-writer", label: "RFP Writer" },
  { href: "/pm-dashboard/saved-vendors", label: "Trusted trades" },
  { href: "/jobs/manage", label: "Hiring" },
] as const;

/** Admin dashboard sidebar (§10.5) */
export const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/rfps", label: "RFPs" },
  { href: "/admin/gc-leads", label: "GC Leads" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/interests", label: "Interests" },
  { href: "/admin/contact-requests", label: "Contact Requests" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/regions", label: "Regions" },
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/case-studies", label: "Case Studies" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/sponsors", label: "Sponsors" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
] as const;

// Three short columns: 18 links plus a 4-link legal row (22, down from 37). Pages that
// left the footer are still one click away: /for lists every solution page,
// /vs every comparison, /resources every guide; sign in / join are in the header.
export const FOOTER_COLS = [
  {
    heading: "Find work",
    links: [
      { label: "Browse RFPs", href: "/rfps" },
      { label: "Trade Jobs", href: "/jobs" },
      { label: "Contract Winners", href: "/contract-winners" },
      { label: "Public Contracts Report", href: "/reports/public-building-contracts" },
      { label: "Trades", href: "/trades" },
      { label: "Regions", href: "/regions" },
      { label: "Supplier Directory", href: "/suppliers" },
    ],
  },
  {
    heading: "Who it's for",
    links: [
      { label: "For Trades", href: "/for-trades" },
      { label: "For Property Managers", href: "/for-property-managers" },
      { label: "All Solutions", href: "/for" },
      { label: "Get Found (SEO & AI)", href: "/get-found" },
      { label: "Pricing", href: "/pricing" },
      { label: "Advertise with us", href: "/advertise" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "RFP Writer (free)", href: "/rfp-writer" },
      { label: "RFP Templates", href: "/rfp-templates" },
      { label: "Cost Guides", href: "/cost-guides" },
      { label: "Guides", href: "/resources" },
      { label: "Case Studies", href: "/case-studies" },
      { label: "Compare", href: "/vs" },
      { label: "Vendor Badge", href: "/badge" },
      { label: "Website Widgets", href: "/widgets" },
      { label: "Services for Trades", href: "/services-for-trades" },
      { label: `Refer a trade — earn $${REFERRAL.tradeFee}`, href: "/refer-a-trade" },
    ],
  },
] as const;

/** Bottom-row links under the footer columns. */
export const FOOTER_LEGAL = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Disclaimer", href: "/disclaimer" },
] as const;

/** Canonical copy blocks (§29) — reuse everywhere. Disclaimer legal substance is
 * verbatim from spec; the jargon opener was reworded with founder approval
 * (2026-06-09 clarity pass). The first sentence must contain no internal
 * periods — the homepage strip bolds the text before the first ".". */
export const COPY = {
  disclaimer:
    "PMRFP is a platform for posting RFPs and finding trades. We do not guarantee project availability, bid success, contract awards, property manager response, or revenue. Members are responsible for their own due diligence, qualifications, insurance, licensing, pricing, and agreements.",
  signupDisclaimer:
    "PMRFP is a platform for posting RFPs and finding trades. PMRFP does not guarantee project availability, contract awards, bid acceptance, payment, property manager response, or commercial success. Users are responsible for their own due diligence, licensing, insurance, pricing, and contractual arrangements.",
  tradeValue:
    "Most building work goes to trades the property manager already knows. PMRFP gets you on the list: a searchable company profile, plus the RFPs they post — matched to your trade and region.",
  pmValue:
    "Post your project once, free. Trades that match your category and region see it and respond. Compare them in one place — no obligation to hire.",
  pmPostingDisclaimer:
    "By submitting this RFP, you confirm that you have authority to post this opportunity or are submitting it for review. PMRFP may edit, reject, or remove listings that are incomplete, misleading, spam, or inappropriate.",
  interestDisclaimer:
    "By expressing interest, you understand that PMRFP does not represent either party as a broker, procurement agent, legal advisor, or guarantor of work.",
} as const;
