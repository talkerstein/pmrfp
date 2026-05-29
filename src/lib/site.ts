/**
 * Central site config + navigation + canonical copy blocks.
 * Copy blocks come from the PMRFP spec (§29) — no fake guarantees, B2B tone.
 */

export const SITE = {
  name: "PMRFP",
  longName: "PMRFP — Property Management RFP",
  tagline: "Commercial & residential property RFPs and vendor discovery, built for Canadian trades.",
  description:
    "PMRFP helps Canadian trades and service companies get listed, monitor commercial and residential property RFPs, and connect with property managers, builders, and building owners.",
  url: "https://pmrfp.com",
  email: "hello@pmrfp.com",
  supportEmail: "support@pmrfp.com",
  country: "Canada",
  // Light sister-company tie to PermitClub (brand bridge only)
  sisterBrand: { name: "PermitClub", url: "https://permitclub.com" },
} as const;

export const PRICING = {
  proAnnual: 249,
  featuredAnnual: 599,
  currency: "CAD",
  earlyBirdNote: "Early-bird: lock in $249/yr — rises to $399 once we hit 100 subscribers.",
  featuredNote:
    "Featured includes everything in Trade Pro, plus priority placement at the top of your categories and regions.",
} as const;

/** Primary public navigation (§30 header) */
export const MAIN_NAV = [
  { href: "/for-trades", label: "For Trades" },
  { href: "/for-property-managers", label: "For Property Managers" },
  { href: "/directory", label: "Directory" },
  { href: "/rfps", label: "RFPs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
] as const;

/** Trade dashboard sidebar (§10.3) */
export const TRADE_NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/company", label: "Company Profile" },
  { href: "/dashboard/rfps", label: "RFP Feed" },
  { href: "/dashboard/saved-rfps", label: "Saved RFPs" },
  { href: "/dashboard/interests", label: "My Interests" },
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
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
] as const;

export const FOOTER_COLS = [
  {
    heading: "Product",
    links: [
      { label: "Directory", href: "/directory" },
      { label: "Supplier Directory", href: "/suppliers" },
      { label: "RFP Opportunities", href: "/rfps" },
      { label: "Trade Categories", href: "/trades" },
      { label: "Browse by Region", href: "/regions" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "For Trades", href: "/for-trades" },
      { label: "For Suppliers", href: "/for/suppliers" },
      { label: "For Property Managers", href: "/for-property-managers" },
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
      { label: "Resource Hub", href: "/resources" },
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

/** Canonical copy blocks (§29) — reuse everywhere, never reword the disclaimer. */
export const COPY = {
  disclaimer:
    "PMRFP is a vendor discovery and RFP visibility platform. We do not guarantee project availability, bid success, contract awards, property manager response, or revenue. Members are responsible for their own due diligence, qualifications, insurance, licensing, pricing, and agreements.",
  signupDisclaimer:
    "PMRFP is a vendor discovery and RFP visibility platform. PMRFP does not guarantee project availability, contract awards, bid acceptance, payment, property manager response, or commercial success. Users are responsible for their own due diligence, licensing, insurance, pricing, and contractual arrangements.",
  tradeValue:
    "Commercial property work often moves through relationships, preferred vendor lists, referrals, and fragmented RFP channels. PMRFP helps your company become easier to find and gives you a focused place to monitor property-related opportunities.",
  pmValue:
    "Finding the right vendor can be time-consuming. PMRFP gives property managers, builders, and owners a simple way to post project needs, discover relevant trades, and compare interested companies without committing to a hiring decision upfront.",
  pmPostingDisclaimer:
    "By submitting this RFP, you confirm that you have authority to post this opportunity or are submitting it for review. PMRFP may edit, reject, or remove listings that are incomplete, misleading, spam, or inappropriate.",
  interestDisclaimer:
    "By expressing interest, you understand that PMRFP does not represent either party as a broker, procurement agent, legal advisor, or guarantor of work.",
} as const;
