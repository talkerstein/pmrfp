/**
 * Central site config + navigation + canonical copy blocks.
 * Copy blocks come from the PMRFP spec (§29) — no fake guarantees, B2B tone.
 */

export const SITE = {
  name: "PMRFP",
  longName: "PMRFP — Property Management RFP",
  tagline: "Property managers post building RFPs free. Vetted trades bid on the work. Region by region across Canada.",
  description:
    "PMRFP is where property managers post commercial and residential building RFPs free, and vetted trades get listed and bid on the work — by region across Canada.",
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
  seoAnnual: 99,
  seoNote:
    "SEO Listing: your company on the trade + city pages property managers find on Google and in AI answers. Directory placement only — RFP access is Trade Pro.",
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
  tradeFee: 75,
  // Recognition lane (project) — no cash. Public credit + leaderboard.
  projectIncentive: "Public credit on the RFP + top-connectors leaderboard",
  // Headline number (for the cash lane only).
  maxFee: 75,
  // Short copy (used in banner + nav).
  oneLiner: "Refer a trade and earn $75. Refer a project and get public credit.",
  shortCta: "Refer to PMRFP",
} as const;

/** Primary public navigation (§30 header) */
export const MAIN_NAV = [
  { href: "/for-property-managers", label: "For Property Managers" },
  { href: "/for-trades", label: "For Trades" },
  { href: "/directory", label: "Trade Directory" },
  { href: "/rfps", label: "RFPs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Guides" },
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
  { href: "/dashboard/case-studies/new", label: "Submit a Case Study" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

/** Property manager dashboard sidebar (§10.4) */
export const PM_NAV = [
  { href: "/pm-dashboard", label: "Home" },
  { href: "/pm-dashboard/rfps", label: "My RFPs" },
  { href: "/pm-dashboard/rfps/new", label: "Post an RFP" },
  { href: "/pm-dashboard/saved-vendors", label: "Saved Vendors" },
] as const;

/** Admin dashboard sidebar (§10.5) */
export const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/rfps", label: "RFPs" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/interests", label: "Interests" },
  { href: "/admin/contact-requests", label: "Contact Requests" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/regions", label: "Regions" },
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/case-studies", label: "Case Studies" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
] as const;

export const FOOTER_COLS = [
  {
    heading: "Product",
    links: [
      { label: "Trade Directory", href: "/directory" },
      { label: "Supplier Directory", href: "/suppliers" },
      { label: "Browse RFPs", href: "/rfps" },
      { label: "Trade Categories", href: "/trades" },
      { label: "Browse by Region", href: "/regions" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "For Trades", href: "/for-trades" },
      { label: "Get Found (SEO & AI)", href: "/get-found" },
      { label: "For Suppliers", href: "/for/suppliers" },
      { label: "For Property Managers", href: "/for-property-managers" },
      { label: "Post an RFP for me", href: "/post-for-me" },
      { label: "For Condo Boards", href: "/for/condo-boards" },
      { label: "For Builders", href: "/for/builders" },
      { label: "For Investors", href: "/for/investors" },
      { label: "For Real Estate", href: "/for/real-estate" },
    ],
  },
  {
    heading: "Compare",
    links: [
      { label: "All comparisons", href: "/vs" },
      { label: "PMRFP vs MERX", href: "/vs/merx" },
      { label: "PMRFP vs HomeStars", href: "/vs/homestars" },
      { label: "PMRFP vs ConstructConnect", href: "/vs/constructconnect" },
      { label: "PMRFP vs the status quo", href: "/vs/status-quo" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Case Studies", href: "/case-studies" },
      { label: "Resource Hub", href: "/resources" },
      { label: "RFP Templates", href: "/rfp-templates" },
      { label: "Cost Guides", href: "/cost-guides" },
      { label: `Refer a trade — earn $${REFERRAL.tradeFee}`, href: "/refer-a-trade" },
      { label: `Refer a project — get credit`, href: "/refer-a-project" },
      { label: "Grow Your Business", href: "/resources/grow" },
      { label: "Vendor Badge", href: "/badge" },
      { label: "Contact", href: "/contact" },
      { label: "Sign In", href: "/sign-in" },
      { label: "Join PMRFP", href: "/sign-up" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Disclaimer", href: "/disclaimer" },
    ],
  },
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
