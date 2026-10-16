/**
 * Server strings for the small public pages: about, contact, legal (terms,
 * privacy, disclaimer), the referral pages, get-found, services-for-trades,
 * the review link, the RFP keep-alive landing, offline and suspended.
 * `fr` is typed against `en`, so every key must exist in both.
 *
 * Placeholders are filled from lib/site.ts at render time so the English
 * copy stays identical: {fee} REFERRAL.tradeFee, {feeMonthly}
 * REFERRAL.tradeFeeMonthly, {currency}, {annual} PRICING.proAnnual,
 * {monthly} PRICING.proMonthly, {seoAnnual}, {seoMonthly}, {email} SITE.email.
 */
import { COPY } from "@/lib/site";
import { PHOTOS } from "@/lib/photos";
import {
  OGL_CANADA_ATTRIBUTION,
  OGL_NS_ATTRIBUTION,
  OGL_TORONTO_ATTRIBUTION,
  OGL_YUKON_ATTRIBUTION,
  SAM_ATTRIBUTION,
  SEAO_ATTRIBUTION,
} from "@/lib/tenders/sources";

const en = {
  about: {
    meta: {
      title: "About PMRFP: Who Runs It and Where the Data Comes From",
      description:
        "PMRFP is a board of commercial property RFPs and public building tenders in Canada and the U.S., plus a directory of trades. Who runs it, where the tenders come from, and how it works.",
    },
    eyebrow: "About",
    title: "About PMRFP",
    lead: "PMRFP puts commercial property work in one place: RFPs posted by property managers, public building tenders from government buyers in Canada and the U.S., and a directory of the trades who do the work.",
    photoAlt: PHOTOS.torontoFlatiron.alt,
    caption: "Built in Toronto.",
    whoTitle: "Who runs PMRFP",
    /** {sister} and {tcg} are links. */
    whoBody: "PMRFP is built in Toronto by the team behind {sister}, with {tcg}, an affiliate of PMRFP. The founder is R. Talkar.",
    /** {email} and {form} are links; {mail} is `mail` below, or nothing. */
    contactBody: "Questions, corrections or a notice we got wrong: email {email} or use the {form}.{mail}",
    contactForm: "contact form",
    mail: " Mail: {address}.",
    sourcesTitle: "Where the public tenders come from",
    sourcesBody:
      "We check each source every day, sort each notice by trade and region, and link to the official notice. You always bid through the buyer's own portal, never through PMRFP.",
    /** Same order as the list on the page; each licence line is the source's own attribution. */
    sources: [
      { name: "CanadaBuys", what: "Government of Canada tenders and contract awards", licence: OGL_CANADA_ATTRIBUTION as string },
      { name: "City of Toronto", what: "City tenders and awarded contracts", licence: OGL_TORONTO_ATTRIBUTION as string },
      { name: "SEAO (Quebec)", what: "Quebec public tenders and awards, published in French", licence: SEAO_ATTRIBUTION as string },
      { name: "Government of Yukon", what: "Yukon tenders", licence: OGL_YUKON_ATTRIBUTION as string },
      { name: "Nova Scotia", what: "Past public contracts", licence: OGL_NS_ATTRIBUTION as string },
      { name: "SAM.gov", what: "U.S. federal building and facility contract opportunities", licence: SAM_ATTRIBUTION as string },
    ],
    /** {report} and {winners} are links. */
    awardsBody: "We also publish what the award data shows: the {report} and the {winners}.",
    reportLink: "public building contracts report",
    winnersLink: "companies that win most often",
    directoryTitle: "How the directory works",
    /** {paid} is a link. */
    directoryBody:
      "Companies list themselves for free and choose the trades and areas they serve. A company marked verified has been reviewed by the PMRFP team. Otherwise we don't check licences or insurance, so confirm them directly for your project. Property managers, builders and owners post RFPs at no cost. Trades pay only if they choose a {paid}, like Trade Pro, which opens full RFP details and a daily email of new matches.",
    paidPlan: "paid plan",
  },

  contact: {
    meta: {
      title: "Contact PMRFP",
      description: "Get in touch with the PMRFP team — for trades, property managers, and sourcing help.",
    },
    eyebrow: "Contact",
    title: "Get in touch",
    /** {email} is a mailto link. */
    body: "Questions about listing your trade company, posting an RFP, or sourcing vendors? Send us a note and we'll get back to you. You can also email {email}.",
  },

  /** Shared by terms, privacy and disclaimer. */
  legal: {
    eyebrow: "Legal",
    lastUpdated: "Last updated: {date}",
    /** Shown at the top of translated legal pages only; empty in English. */
    translationNote: "",
  },

  terms: {
    meta: { title: "Terms of Service", description: "The terms governing your use of PMRFP." },
    title: "Terms of Service",
    acceptance: {
      title: "1. Acceptance of Terms",
      body: "By accessing or using PMRFP (the “Service”), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the Service. These terms apply to all users, including trade companies, contractors, property managers, builders, and building owners.",
    },
    description: {
      title: "2. Description of Service",
      body: "PMRFP is a platform for posting RFPs and finding trades, serving the Canadian commercial property market. The Service allows trade companies to publish profiles and monitor opportunities, and allows property managers, builders, and owners to post requests for proposals (RFPs) and discover vendors.",
    },
    accounts: {
      title: "3. Accounts & Eligibility",
      body: "You must provide accurate, complete information when creating an account and keep it up to date. You are responsible for safeguarding your account credentials and for all activity that occurs under your account. You must be authorized to act on behalf of any company you represent on the Service.",
    },
    billing: {
      title: "4. Subscriptions & Billing",
      withMonthly:
        "Trade Pro is offered on two billing intervals: ${annual} {currency} per year (annual), or ${monthly} {currency} per month (monthly). Each renews automatically at the end of the current term unless cancelled. You may cancel at any time; cancellation takes effect at the end of your current billing period, and you retain access until then. Fees are non-refundable except where required by law. We may change pricing on a prospective basis with reasonable notice. You may switch between annual and monthly via your billing portal; switching takes effect at the end of your current billing period.",
      annualOnly:
        "Trade Pro is offered at ${annual} {currency} per year and renews automatically at the end of each annual term unless cancelled. You may cancel at any time; cancellation takes effect at the end of your current billing period, and you retain access until then. Fees are non-refundable except where required by law. We may change pricing on a prospective basis with reasonable notice.",
      free: "Property managers, builders, and owners may post RFPs at no cost. Free directory listings are available to trade companies without a paid subscription.",
    },
    use: {
      title: "5. Acceptable Use",
      body: "You agree not to misuse the Service, including by posting false, misleading, spam, infringing, or unlawful content; scraping or harvesting data; attempting to gain unauthorized access; or using the Service to harass other users. We may edit, reject, or remove content that violates these terms.",
    },
    /** Body is `disclaimer` (COPY.disclaimer). */
    noGuarantee: { title: "6. No Guarantee of Work" },
    content: {
      title: "7. Content & Listings",
      body: "You retain ownership of the content you submit, and you grant PMRFP a non-exclusive licence to host, display, and distribute that content as needed to operate the Service. You are solely responsible for the accuracy and legality of your listings, profiles, and RFPs. We may moderate, edit, or remove listings that are incomplete, misleading, spam, or inappropriate.",
    },
    liability: {
      title: "8. Limitation of Liability",
      body: "To the maximum extent permitted by law, PMRFP and its affiliates are not liable for any indirect, incidental, consequential, or punitive damages, or for lost profits, revenue, data, or business opportunities, arising from your use of the Service. The Service is provided “as is” and “as available” without warranties of any kind.",
    },
    termination: {
      title: "9. Termination",
      body: "We may suspend or terminate your access to the Service at any time if you violate these terms or if we discontinue the Service. You may stop using the Service and close your account at any time.",
    },
    changes: {
      title: "10. Changes to These Terms",
      body: "We may update these terms from time to time. When we make material changes, we will update the “last updated” date above and, where appropriate, provide additional notice. Continued use of the Service after changes take effect constitutes acceptance of the revised terms.",
    },
    contact: { title: "11. Contact", body: "Questions about these terms? Reach us at {email}." },
  },

  privacy: {
    meta: { title: "Privacy Policy", description: "How PMRFP collects, uses, and protects your information." },
    title: "Privacy Policy",
    intro:
      "PMRFP respects your privacy. This policy explains what information we collect, how we use it, and the choices you have. It is written with Canadian privacy expectations, including PIPEDA, in mind.",
    sections: [
      {
        title: "Information We Collect",
        body: "We collect information you provide directly, such as your name, company details, email address, service categories, regions, and the content of profiles, RFPs, and messages. We also collect limited technical information automatically, such as device and browser data and usage activity, when you interact with the Service.",
      },
      {
        title: "How We Use It",
        body: "We use your information to operate and improve the Service, including to match trades with relevant opportunities, display directory listings and RFPs, send transactional and matching notifications, process subscriptions, provide support, and maintain security.",
      },
      {
        title: "Cookies & Analytics",
        body: "We use cookies and similar technologies to keep you signed in, remember preferences, and understand how the Service is used. Aggregated analytics help us improve performance and features. You can control cookies through your browser settings, though some features may not function without them.",
      },
      {
        title: "How People Find PMRFP",
        body: "To understand how people find PMRFP, we record the page you first landed on and the referring site or campaign. One first-party cookie (pmrfp_ft, kept for 90 days) holds the first page's address without its query string, the referring website's domain only (never the full address), any campaign tags in the link (utm_source, utm_medium, utm_campaign, utm_content), the date, the page language and your country as estimated by our host. It never holds your IP address. If you create an account, we save these values with it so we can see which channels bring members; we also count first visits per page and channel as daily totals that identify no one. We use no third-party trackers or advertising cookies, and we do no cross-site tracking. Blocking or clearing the cookie doesn't affect the Service.",
      },
      {
        title: "Data Storage",
        body: "Account and platform data is stored using Supabase, our managed database and authentication provider. We take reasonable steps to ensure data is handled securely by our infrastructure providers.",
      },
      {
        title: "Sharing",
        body: "We do not sell your personal information. Information you choose to publish — such as your company profile or an RFP — is visible to other users as part of the Service. We may share data with service providers who help us operate the platform (for example, hosting, payments, and email), and where required by law.",
      },
      {
        title: "Your Rights",
        body: "Under PIPEDA and applicable Canadian privacy law, you may request access to the personal information we hold about you, ask us to correct it, or request its deletion, subject to legal and operational limits. To exercise these rights, contact us using the details below.",
      },
      {
        title: "Security",
        body: "We use administrative, technical, and physical safeguards designed to protect your information. No method of transmission or storage is completely secure, so we cannot guarantee absolute security, but we work to protect your data and respond promptly to any incident.",
      },
    ],
    contact: { title: "Contact", body: "Questions or privacy requests? Reach us at {email}." },
  },

  disclaimer: {
    meta: {
      title: "Disclaimer",
      description: "Important information about how PMRFP works and what it does not guarantee.",
    },
    title: "Disclaimer",
    intro:
      "PMRFP connects trade companies with property managers, builders, and owners. We are not a broker, procurement agent, or legal advisor, and we do not act on behalf of either party. The following statements apply at specific points in the Service.",
    signupLabel: "When you sign up",
    pmLabel: "For property managers posting an RFP",
    interestLabel: "For trades expressing interest",
    contact: "Questions about this disclaimer? Reach us at {email}.",
  },

  /** Legal copy blocks from COPY (lib/site.ts), word for word, in each language. */
  copy: {
    disclaimer: COPY.disclaimer as string,
    signup: COPY.signupDisclaimer as string,
    pmPosting: COPY.pmPostingDisclaimer as string,
    interest: COPY.interestDisclaimer as string,
  },

  /** Shared by the three referral pages. */
  referShared: {
    howEyebrow: "How it works",
    howTitle: "Three steps. No login. No catch.",
    step: "Step {n}",
    team: "— The PMRFP team",
    noCap: "· no cap on referrals · no signup required",
  },

  refer: {
    meta: {
      title: "Refer to PMRFP — Earn up to ${fee} (Trade) or Get Credit (Project)",
      description:
        "Two referral lanes. Refer a trade and earn up to ${fee} cash when they subscribe to Trade Pro. Refer a project and earn public credit on the RFP + a spot on the Top Connectors leaderboard.",
    },
    eyebrow: "Referral program",
    /** {cash} is the highlighted `titleCash`. */
    title: "Two lanes. {cash} for trades. Public credit for projects.",
    titleCash: "Up to ${fee} cash",
    lead: "The cash lane (trade) pays after the trade you refer subscribes to Trade Pro and their payment clears. The credit lane (project) starts when the RFP goes live and pays in visibility — your name on every RFP you bring, plus a spot on the Top Connectors leaderboard.",
    trade: {
      kicker: "Direct-revenue lane",
      title: "Refer a Trade",
      amount: "Up to ${fee} {currency}",
      body: "Refer a trade or service company. ${fee} on an annual Trade Pro plan, paid ~30 days after their payment clears; ${feeMonthly} on a monthly plan, after their third monthly payment clears. By e-transfer.",
      cta: "Refer a trade",
    },
    project: {
      kicker: "Recognition lane",
      title: "Refer a Project",
      amount: "Public credit + leaderboard",
      body: "Refer a property project (pre-listing repairs, maintenance, capital work). When the RFP goes live, your name appears on the listing as the connector and you climb the Top Connectors leaderboard. No cash, just real visibility.",
      cta: "Refer a project",
    },
    whyLabel: "Why two lanes:",
    whyBody:
      "Trade subscriptions are PMRFP’s direct revenue, so the trade lane pays cash. Project referrals create the inventory that retains paying trades — real value, but indirect — so we reward those in recognition (public credit + leaderboard) rather than cash. Both are no-cap and need no signup. The reference visible on the live RFP is the most valuable thing your name can sit next to in this network.",
  },

  referTrade: {
    meta: {
      title: "Refer a Trade — Earn up to ${fee} When They Join Trade Pro",
      description:
        "Know a commercial trade who'd benefit from being listed on PMRFP? Refer them and earn up to ${fee} {currency} after their Trade Pro payment clears.",
    },
    eyebrow: "Trade referral · direct-revenue lane",
    titleLine1: "Refer a trade.",
    /** {earn} is the highlighted `titleEarn`. */
    titleLine2: "{earn} when they join Trade Pro.",
    titleEarn: "Earn up to ${fee}",
    lead: "Know a commercial trade or service company that should be listed on PMRFP? Refer them. When they subscribe to Trade Pro and their payment clears, you earn a finder’s fee by e-transfer: ${fee} {currency} for an annual plan, ${feeMonthly} for a monthly plan.",
    cta: "Refer a trade",
    projectLink: "Have a project instead? Refer it for public credit →",
    offerKicker: "Finder’s fee",
    offerAmount: "Up to ${fee} {currency}",
    offerLines: [
      "· ${fee} cash per referred annual Trade Pro sub",
      "· ${feeMonthly} per referred monthly sub, after their 3rd payment clears",
      "· annual: paid ~30 days after their payment clears",
      "· by e-transfer, once settled (no dispute)",
    ],
    steps: [
      {
        title: "Tell us about the trade",
        desc: "Company name, location, what they do, and (if you have it) their contact. Two minutes.",
      },
      {
        title: "We invite them to list",
        desc: "PMRFP reaches out, helps them set up a profile in the directory, and walks them through Trade Pro.",
      },
      {
        title: "Up to ${fee} when it sticks",
        desc: "Annual Trade Pro: your ${fee} {currency} is paid by e-transfer about 30 days after their payment clears. Monthly Trade Pro: ${feeMonthly} after their third monthly payment clears. Either way it's paid once it's settled with no refund or dispute.",
      },
    ],
    whoEyebrow: "Who refers trades",
    whoTitle: "Anyone who knows a Canadian trade doing commercial work.",
    who: [
      {
        title: "Property managers",
        body: "Refer the trades you actually use. Strengthens your bench and gives them a paper trail. If your employer restricts referral payments, decline the fee and we'll credit you by name instead.",
      },
      {
        title: "Other trades",
        body: "Refer peers in adjacent trades (HVAC ↔ electrical, roofing ↔ waterproofing). Up to ${fee} per referred Pro sub adds up fast.",
      },
      {
        title: "Suppliers + distributors",
        body: "Your trade customers should be listed where commercial RFPs land. Refer them, earn the fee.",
      },
      {
        title: "Trade associations",
        body: "Bulk introduce your members. Each annual Pro activation pays ${fee}. We can do co-marketing for membership lists.",
      },
      {
        title: "Industry consultants",
        body: "You know who's growing and who's hiring. Steer them to PMRFP for visibility, earn on every list.",
      },
      {
        title: "Anyone who knows a good trade",
        body: "Family contractor? Neighbour's roofer? If they do commercial work in Canada, refer them.",
      },
    ],
    whyEyebrow: "Why this lane pays cash and the project lane doesn’t",
    whyTitle: "Honest math. Cash where revenue flows, recognition where it doesn’t.",
    /** Each point renders as <strong>{strong}</strong>{rest}; `rest` starts with its space. */
    why: [
      {
        strong: "A new Trade Pro subscription is ${annual}/yr (or ${monthly}/mo)",
        rest: " in direct revenue to PMRFP. The ${fee} fee only applies to annual plans, and the ~30-day hold means the payment has cleared before it goes out. Monthly plans earn ${feeMonthly}, released after the third monthly payment — so we never pay out more than we've collected.",
      },
      {
        strong: "Project referrals create inventory but not direct revenue,",
        rest: " so we reward those with public credit on the RFP + a Top Connectors leaderboard spot — real visibility, not cash.",
      },
      {
        strong: "No cap on referrals.",
        rest: " Refer 1, refer 50 — same per-referral fee. PM firms with 30+ vendors in their bench can generate real income just by introducing the ones who’d benefit most.",
      },
      {
        strong: "Paid clean.",
        rest: " Once the referred trade’s qualifying payment clears, your e-transfer goes out. No quarterly-payout runaround.",
      },
    ],
    quote:
      "The honest deal: we make money when trades subscribe. So we pay you to bring them the trades worth subscribing. Higher fee, faster payout, direct line.",
    formEyebrow: "Refer a trade",
    formTitle: "Two minutes. Earn up to ${fee} when they join Trade Pro.",
    formLead:
      "Tell us about the trade. If you have their contact details and permission to share, add them. If not, leave blank and we’ll work with you to make the introduction.",
    terms:
      "Finder's fees: ${fee} for an annual Trade Pro plan, paid ~30 days after the referred trade's payment clears; ${feeMonthly} for a monthly plan, paid after the third monthly payment clears — in both cases once settled, with no refund or dispute. Self-referrals and duplicates aren't eligible; the first documented introduction counts. PMRFP does not guarantee that any referred trade will subscribe or remain subscribed.",
  },

  referProject: {
    meta: {
      title: "Refer a Project — Public Credit + Top Connectors Leaderboard",
      description:
        'Know someone with a property project? Refer it to PMRFP. When the RFP goes live, you get public credit ("Introduced by [you]") and a spot on the Top Connectors leaderboard. For cash, refer a trade to Trade Pro (up to ${fee}).',
    },
    eyebrow: "Project referral · recognition lane",
    titleLine1: "Introduce a project.",
    /** {credit} is the highlighted `titleCredit`. */
    titleLine2: "{credit} when the RFP goes live.",
    titleCredit: "Get credit",
    lead: "Know someone with a property project — pre-listing repairs, portfolio maintenance, capital work? Refer it to PMRFP. We’ll help structure the RFP and publish it live. Your name appears on the listing as the connector who brought it, and you climb the Top Connectors leaderboard. Real visibility in the network you care about.",
    cta: "Refer a project",
    cashLink: "Want cash? Refer a trade →",
    offerKicker: "What you get",
    offerTitle: "Public credit + leaderboard",
    offerLines: [
      "· “Introduced by [you]” on every live RFP you bring",
      "· climb the Top Connectors leaderboard at /refer/leaderboard",
      "· optional firm/affiliation shown alongside your name",
      "· monthly summary email of all your referred RFPs",
    ],
    /** {link} is a link reading `cashNoteLink`. */
    cashNote: "Want cash? The {link} per Trade Pro subscription.",
    cashNoteLink: "Refer a Trade lane pays up to ${fee}",
    steps: [
      {
        title: "Tell us about the project",
        desc: "Describe the work, location, and who the property contact is. Two minutes.",
      },
      {
        title: "We structure and post the RFP",
        desc: "PMRFP drafts a clear scope and publishes the RFP to qualified Canadian trades.",
      },
      {
        title: "Public credit + leaderboard placement",
        desc: 'When the RFP goes live, "Introduced by [you]" appears on the listing and your name moves up the Top Connectors leaderboard. Recognition where the people you\'d want to know are watching.',
      },
    ],
    whoEyebrow: "Who refers projects",
    whoTitle: "Built for the professionals who know about property work before anyone else.",
    who: [
      { title: "Real estate agents", body: "Pre-listing repairs, post-sale turnovers, and seller-side capital recommendations." },
      { title: "Mortgage brokers", body: "Pre-funding repairs flagged in the appraisal — without losing the deal." },
      { title: "Real estate lawyers", body: "Estate cleanups, probate property work, and post-closing remediation." },
      { title: "Insurance brokers", body: "Claims-related repair work where a vetted trade speed matters." },
      { title: "Property managers", body: "Peer PM referrals when scope is outside your bench, or you're booked." },
      { title: "Anyone with a project", body: "Owners, neighbours, family — if you know about work that needs doing, refer it." },
    ],
    whyEyebrow: "Why refer",
    whyTitle: "Help your client. Get credited. Stay informed.",
    /** Each point renders as <strong>{strong}</strong>{rest}; `rest` starts with its space. */
    why: [
      {
        strong: "Help your client first.",
        rest: " Their project gets vetted bids fast — better outcome, stronger relationship.",
      },
      {
        strong: "Get publicly credited.",
        rest: " “Introduced by [you]” shows on the live RFP — the connector tag most professionals would pay for. Your name climbs the Top Connectors leaderboard.",
      },
      {
        strong: "No follow-up chasing.",
        rest: " Monthly summary email tells you where each referred project stands.",
      },
      {
        strong: "Give your client a real process.",
        rest: " A documented way to invite relevant trades — vs. recommending “a guy you know.” Clients still choose and vet who they hire.",
      },
      {
        strong: "Optional public credit.",
        rest: " “Introduced by [you]” on the RFP — visibility to the trades in your area.",
      },
    ],
    quote:
      "The smart play for any professional who touches real estate but doesn’t sell trades: be the person who knew how to get the work done. We handle the process. You get the credit for the introduction.",
    formEyebrow: "Refer a project",
    formTitle: "Two minutes. Get credit when the RFP goes live.",
    formLead:
      "Tell us about the project. If you have the property contact’s details and permission to share, add them. If not, leave them blank and we’ll work with you to make the introduction.",
    terms:
      "Project referrals earn public credit on the RFP + a spot on the Top Connectors leaderboard — not cash. The cash-paying lane is /refer-a-trade (up to ${fee} per Trade Pro subscription). PMRFP does not guarantee work or vendor selection. Trades and property contacts make their own decisions.",
  },

  getFound: {
    meta: {
      title: "Get Found — SEO & AI Visibility for Trades",
      description:
        "Your company on the trade + city pages property managers find on Google — and in AI answers. PMRFP member profiles have reached top-10 Google positions in their categories.",
    },
    crumbHome: "Home",
    crumbPage: "Get Found",
    faqs: [
      {
        q: "What does an SEO Listing actually get me?",
        a: "Placement on the PMRFP pages property managers find when they search for your trade in your city — plus your own profile page with your services, service areas, and Google rating. Search engines and AI assistants read these pages because they're structured data-first and kept honest: a page only exists where real companies are listed.",
      },
      {
        q: "What's the AI (AEO) part?",
        a: 'When someone asks ChatGPT or Google\'s AI for "commercial roofing contractors in Mississauga", the engines pull from structured, verifiable pages. PMRFP publishes machine-readable data (schema.org markup on every page, an llms.txt index) and concrete evidence like project case studies — the kind of content answer engines cite.',
      },
      {
        q: "Do you guarantee rankings?",
        a: "No — nobody honestly can. What we control: real pages, real structured data, real project evidence, and a directory Google already ranks in the top 10 for several member profiles. What we don't control: Google.",
      },
      {
        q: "How is this different from Trade Pro?",
        a: "SEO Listing is visibility only. Trade Pro (${annual}/yr) adds the RFP board: see posted projects, get matching alerts, and express interest. You can start with visibility and upgrade any time.",
      },
    ],
    eyebrow: "For trades & service companies",
    title: "Get found on Google — and in AI answers.",
    lead: "Property managers don’t browse directories for fun. They search — on Google, and increasingly by asking AI. PMRFP puts your company on the pages both actually read: trade + city pages with real companies, real projects, and structured data on every one.",
    listFree: "Get listed free",
    seePricing: "See pricing",
    proofTitle: "Proof, not promises",
    proofs: [
      {
        stat: "Top 10",
        line: "Google positions reached by member profile pages in their categories (Search Console, last 90 days).",
      },
      {
        stat: "Page 1",
        line: "positions held by our commercial cost guides — the pages property managers research budgets on.",
      },
      {
        stat: "Every page",
        line: "ships schema.org structured data, and the site publishes an llms.txt index for AI crawlers.",
      },
    ],
    proofNote:
      "Positions vary by query and region and are not guaranteed — see the FAQ for what we do and don’t control.",
    ladderTitle: "How the visibility ladder works",
    tiers: {
      free: {
        name: "Free listing",
        price: "$0",
        lines: [
          "Company profile in the directory",
          "Appear in category + region search on the site",
          "Submit project case studies",
        ],
      },
      seo: {
        name: "SEO Listing",
        price: "${seoAnnual}/yr",
        badge: "or ${seoMonthly}/mo",
        lines: [
          "Placement on your trade + city pages — the ones Google indexes",
          "Unlimited project photo gallery on your profile",
          "Google rating displayed on your profile (official Places data)",
          "Case studies featured on your city pages",
          "Priority ordering over free listings",
        ],
      },
      pro: {
        name: "Trade Pro — ${annual}/yr",
        lines: [
          "Everything in SEO Listing",
          "Full RFP board access + matching alerts",
          "Express interest on posted projects",
        ],
      },
    },
    ladderNote:
      "Start free today — upgrade from your dashboard when the paid tiers fit. Case studies and a complete profile do more for your visibility than any tier alone.",
    faqTitle: "Frequently asked",
    ctaTitle: "Be on the page they find.",
    ctaBody:
      "List your company free in minutes. Add a case study and you're already ahead of most of your competition.",
    ctaSecondary: "See member case studies",
  },

  services: {
    meta: {
      title: "Services for Trades: Card Payments and a Credible Website",
      description:
        "Two services we recommend to trades on PMRFP: taking card payments on the job with Cleverpays, and a website, brand and Google profile from Talkerstein Consulting Group.",
    },
    eyebrow: "Services for trades",
    title: "Get paid on the job. Look the part online.",
    lead: "Winning the work is half of it. These are two services we point trades to: taking card payments on site, and a website and Google profile that make property managers pick up the phone.",
    disclosureLabel: "Disclosure:",
    disclosure:
      "PMRFP has a business relationship with both companies on this page. Talkerstein Consulting Group is an affiliate of PMRFP.",
    /** Same order as the partner list on the page (points too). */
    partners: {
      cleverpays: {
        headline: "Take card payments on the job",
        blurb:
          "Payment processing for Canadian businesses, in English and French. For trades, the useful part is getting paid before you leave the site instead of chasing a cheque.",
        serves: "Canada",
        cta: "Visit Cleverpays",
        points: [
          { t: "In-person payments for mobile teams", d: "Portable card terminals your crew can take to the job." },
          { t: "Card payments by phone or browser", d: "A virtual terminal for taking a customer's card remotely, no device needed." },
          { t: "Invoices customers can pay", d: "Send an invoice with a way to pay it when it arrives." },
          { t: "Statement review", d: "Send your current processing statement and ask a specialist to go through the charges." },
        ],
      },
      talkerstein: {
        headline: "Look credible online",
        blurb:
          "Property managers check you out before they call. Talkerstein sets up the pieces that make a trade look established, done for you. Based in Toronto.",
        serves: "Based in Toronto",
        cta: "Visit Talkerstein",
        points: [
          { t: "A website that turns visits into calls", d: "Shows your work, services and credentials." },
          { t: "Brand and logo", d: "A clean identity property managers take seriously." },
          { t: "Google Business Profile", d: "Set up so local buyers find you when they search your trade." },
          { t: "Help with public tender bids", d: "Support preparing a bid on a government tender." },
        ],
      },
    },
    sellEyebrow: "Sell to contractors?",
    sellTitle: "Get in front of trades across Canada and the U.S.",
    sellBody:
      "If your company sells to commercial trades, like insurance, bonding, software or equipment, talk to us about a spot on this page.",
    contactUs: "Contact us",
  },

  review: {
    metaTitle: "Leave a review",
    usedTitle: "This review link has been used",
    brokenTitle: "This review link isn't working",
    usedBody: "Each link works once, and a review has already been sent with this one. Thanks for taking the time.",
    brokenBody: "It may have been used already, or copied only in part. Try the button in the email again.",
    /** {email} is a mailto link. */
    mistake: "Think that's a mistake? Email {email}.",
    goHome: "Go to PMRFP",
    eyebrow: "Review request",
    title: "How did {trade} do?",
    intro: "{trade} asked for your honest review of this job. It takes about two minutes.",
    /** {trade} may be a link to the company's profile. */
    by: "by {trade}",
  },

  kept: {
    metaTitle: "RFP listing updated",
    ok: {
      title: "Your listing is live again",
      body: "Thanks — your RFP is back on the public board, and we've extended its deadline. When this one passes, we'll check in with you again.",
      bodyDays:
        "Thanks — your RFP is back on the public board, and we've extended its deadline by {days} days. When this one passes, we'll check in with you again.",
    },
    notlive: {
      title: "This RFP is already closed",
      body: "This listing has been awarded, closed, or archived, so there's nothing to keep live. You can post a fresh RFP any time from your dashboard.",
    },
    invalid: {
      title: "That link isn't valid",
      body: "This keep-it-live link doesn't match a current listing. Head to your dashboard to manage your RFPs.",
    },
    error: {
      title: "Something went wrong",
      body: "We couldn't update your listing just now. Please try again, or manage it from your dashboard.",
    },
    cta: "Go to my RFPs",
  },

  offline: {
    title: "You're offline",
    body: "PMRFP needs a connection to load this page. Check your Wi-Fi or mobile data, then try again.",
    note: "Nothing is lost. Your RFPs and saved work will be right here when you're back online.",
    tryAgain: "Try again",
  },

  suspended: {
    metaTitle: "Account suspended",
    title: "Your account is suspended",
    /** {email} is a mailto link. */
    body: "Access to this account is currently paused. If you believe this is a mistake, please contact us at {email}.",
    back: "← Back to PMRFP",
  },
};

const fr: typeof en = {
  about: {
    meta: {
      title: "À propos de PMRFP : qui l'exploite et d'où viennent les données",
      description:
        "PMRFP est un tableau d'appels d'offres en immobilier commercial et d'appels d'offres publics de construction au Canada et aux États-Unis, jumelé à un répertoire d'entrepreneurs. Qui l'exploite, d'où viennent les appels d'offres et comment ça fonctionne.",
    },
    eyebrow: "À propos",
    title: "À propos de PMRFP",
    lead: "PMRFP réunit en un seul endroit les contrats en immobilier commercial : les appels d'offres publiés par les gestionnaires immobiliers, les appels d'offres publics de construction des acheteurs gouvernementaux au Canada et aux États-Unis, et un répertoire des entrepreneurs qui font le travail.",
    photoAlt: "L'édifice Gooderham (Flatiron) de Toronto, avec les tours du centre-ville en arrière-plan",
    caption: "Conçu à Toronto.",
    whoTitle: "Qui exploite PMRFP",
    whoBody:
      "PMRFP est conçu à Toronto par l'équipe derrière {sister}, avec {tcg}, une société affiliée à PMRFP. Le fondateur est R. Talkar.",
    contactBody:
      "Une question, une correction ou un avis que nous avons mal publié? Écrivez à {email} ou utilisez le {form}.{mail}",
    contactForm: "formulaire de contact",
    mail: " Adresse postale : {address}.",
    sourcesTitle: "D'où viennent les appels d'offres publics",
    sourcesBody:
      "Nous vérifions chaque source tous les jours, classons chaque avis par corps de métier et par région, et renvoyons à l'avis officiel. Vous soumissionnez toujours sur le portail de l'acheteur, jamais par l'entremise de PMRFP.",
    sources: [
      {
        name: "AchatsCanada",
        what: "Appels d'offres et contrats octroyés du gouvernement du Canada",
        licence: "Contient des informations visées par la Licence du gouvernement ouvert – Canada.",
      },
      {
        name: "Ville de Toronto",
        what: "Appels d'offres municipaux et contrats octroyés",
        licence: "Contient des informations visées par l'Open Government Licence – Toronto.",
      },
      {
        name: "SEAO (Québec)",
        what: "Appels d'offres publics et contrats octroyés au Québec, publiés en français",
        licence:
          "Source : Système électronique d'appel d'offres (SEAO), Secrétariat du Conseil du trésor du Québec — Données Québec, CC BY 4.0.",
      },
      {
        name: "Gouvernement du Yukon",
        what: "Appels d'offres du Yukon",
        licence: "Contient des informations visées par la Licence du gouvernement ouvert – Yukon.",
      },
      {
        name: "Nouvelle-Écosse",
        what: "Contrats publics antérieurs",
        licence: "Contient des informations visées par l'Open Government Licence – Nova Scotia.",
      },
      {
        name: "SAM.gov",
        what: "Occasions de contrats fédéraux américains pour les bâtiments et les installations",
        licence:
          "Source : SAM.gov Contract Opportunities, U.S. General Services Administration (données du gouvernement fédéral américain, domaine public).",
      },
    ],
    awardsBody: "Nous publions aussi ce que révèlent les données d'octroi : le {report} et les {winners}.",
    reportLink: "rapport sur les contrats publics de construction",
    winnersLink: "entreprises qui remportent le plus souvent des contrats",
    directoryTitle: "Comment fonctionne le répertoire",
    directoryBody:
      "Les entreprises s'inscrivent gratuitement et choisissent les corps de métier et les secteurs qu'elles desservent. Une entreprise marquée comme vérifiée a été examinée par l'équipe de PMRFP. Autrement, nous ne vérifions ni les licences ni les assurances : confirmez-les directement pour votre projet. Les gestionnaires immobiliers, les constructeurs et les propriétaires publient des appels d'offres sans frais. Les entrepreneurs ne paient que s'ils choisissent un {paid}, comme Trade Pro, qui donne accès aux détails complets des appels d'offres et à un courriel quotidien des nouvelles occasions correspondantes.",
    paidPlan: "forfait payant",
  },

  contact: {
    meta: {
      title: "Contacter PMRFP",
      description:
        "Communiquez avec l'équipe de PMRFP — pour les entrepreneurs, les gestionnaires immobiliers et l'aide à la recherche de fournisseurs.",
    },
    eyebrow: "Contact",
    title: "Écrivez-nous",
    body: "Des questions sur l'inscription de votre entreprise, la publication d'un appel d'offres ou la recherche de fournisseurs? Envoyez-nous un message et nous vous répondrons. Vous pouvez aussi écrire à {email}.",
  },

  legal: {
    eyebrow: "Juridique",
    lastUpdated: "Dernière mise à jour : {date}",
    translationNote:
      "Cette traduction est fournie à titre informatif. En cas de divergence, la version anglaise prévaut.",
  },

  terms: {
    meta: { title: "Conditions d'utilisation", description: "Les conditions qui régissent votre utilisation de PMRFP." },
    title: "Conditions d'utilisation",
    acceptance: {
      title: "1. Acceptation des conditions",
      body: "En accédant à PMRFP (le « Service ») ou en l'utilisant, vous acceptez d'être lié par les présentes conditions d'utilisation. Si vous n'acceptez pas ces conditions, vous ne pouvez pas utiliser le Service. Ces conditions s'appliquent à tous les utilisateurs, y compris les entreprises de métiers, les entrepreneurs, les gestionnaires immobiliers, les constructeurs et les propriétaires d'immeubles.",
    },
    description: {
      title: "2. Description du Service",
      body: "PMRFP est une plateforme pour publier des appels d'offres et trouver des entrepreneurs, au service du marché canadien de l'immobilier commercial. Le Service permet aux entreprises de métiers de publier des profils et de suivre des occasions d'affaires, et permet aux gestionnaires immobiliers, aux constructeurs et aux propriétaires de publier des demandes de propositions (appels d'offres) et de découvrir des fournisseurs.",
    },
    accounts: {
      title: "3. Comptes et admissibilité",
      body: "Vous devez fournir des renseignements exacts et complets lors de la création d'un compte et les tenir à jour. Vous êtes responsable de la protection de vos identifiants de connexion et de toute activité effectuée dans votre compte. Vous devez être autorisé à agir au nom de toute entreprise que vous représentez sur le Service.",
    },
    billing: {
      title: "4. Abonnements et facturation",
      withMonthly:
        "Trade Pro est offert selon deux fréquences de facturation : {annual} $ {currency} par année (annuelle) ou {monthly} $ {currency} par mois (mensuelle). Chaque abonnement se renouvelle automatiquement à la fin de la période en cours, sauf s'il est annulé. Vous pouvez annuler en tout temps; l'annulation prend effet à la fin de votre période de facturation en cours, et vous conservez votre accès jusque-là. Les frais ne sont pas remboursables, sauf si la loi l'exige. Nous pouvons modifier nos prix pour l'avenir moyennant un préavis raisonnable. Vous pouvez passer de la facturation annuelle à la facturation mensuelle, et inversement, dans votre portail de facturation; le changement prend effet à la fin de votre période de facturation en cours.",
      annualOnly:
        "Trade Pro est offert au prix de {annual} $ {currency} par année et se renouvelle automatiquement à la fin de chaque période annuelle, sauf s'il est annulé. Vous pouvez annuler en tout temps; l'annulation prend effet à la fin de votre période de facturation en cours, et vous conservez votre accès jusque-là. Les frais ne sont pas remboursables, sauf si la loi l'exige. Nous pouvons modifier nos prix pour l'avenir moyennant un préavis raisonnable.",
      free: "Les gestionnaires immobiliers, les constructeurs et les propriétaires peuvent publier des appels d'offres sans frais. Les entreprises de métiers peuvent obtenir une inscription gratuite au répertoire sans abonnement payant.",
    },
    use: {
      title: "5. Utilisation acceptable",
      body: "Vous acceptez de ne pas faire un usage abusif du Service, notamment en publiant du contenu faux, trompeur, indésirable, contrefaisant ou illégal; en extrayant ou en moissonnant des données; en tentant d'obtenir un accès non autorisé; ou en utilisant le Service pour harceler d'autres utilisateurs. Nous pouvons modifier, refuser ou retirer tout contenu qui enfreint ces conditions.",
    },
    noGuarantee: { title: "6. Aucune garantie de travail" },
    content: {
      title: "7. Contenu et annonces",
      body: "Vous demeurez propriétaire du contenu que vous soumettez, et vous accordez à PMRFP une licence non exclusive pour héberger, afficher et diffuser ce contenu dans la mesure nécessaire à l'exploitation du Service. Vous êtes seul responsable de l'exactitude et de la légalité de vos annonces, de vos profils et de vos appels d'offres. Nous pouvons modérer, modifier ou retirer les annonces incomplètes, trompeuses, indésirables ou inappropriées.",
    },
    liability: {
      title: "8. Limitation de responsabilité",
      body: "Dans toute la mesure permise par la loi, PMRFP et ses sociétés affiliées ne sont pas responsables des dommages indirects, accessoires, consécutifs ou punitifs, ni de la perte de profits, de revenus, de données ou d'occasions d'affaires, découlant de votre utilisation du Service. Le Service est fourni « tel quel » et « selon sa disponibilité », sans garantie d'aucune sorte.",
    },
    termination: {
      title: "9. Résiliation",
      body: "Nous pouvons suspendre ou résilier votre accès au Service en tout temps si vous enfreignez ces conditions ou si nous cessons d'offrir le Service. Vous pouvez cesser d'utiliser le Service et fermer votre compte en tout temps.",
    },
    changes: {
      title: "10. Modifications des présentes conditions",
      body: "Nous pouvons mettre à jour ces conditions à l'occasion. Lorsque nous apporterons des modifications importantes, nous mettrons à jour la date de « dernière mise à jour » ci-dessus et, s'il y a lieu, fournirons un avis supplémentaire. L'utilisation continue du Service après l'entrée en vigueur des modifications constitue une acceptation des conditions révisées.",
    },
    contact: { title: "11. Nous joindre", body: "Des questions sur ces conditions? Écrivez-nous à {email}." },
  },

  privacy: {
    meta: {
      title: "Politique de confidentialité",
      description: "Comment PMRFP recueille, utilise et protège vos renseignements.",
    },
    title: "Politique de confidentialité",
    intro:
      "PMRFP respecte votre vie privée. La présente politique explique quels renseignements nous recueillons, comment nous les utilisons et les choix qui s'offrent à vous. Elle a été rédigée en tenant compte des attentes canadiennes en matière de protection de la vie privée, notamment de la LPRPDE.",
    sections: [
      {
        title: "Renseignements que nous recueillons",
        body: "Nous recueillons les renseignements que vous nous fournissez directement, comme votre nom, les renseignements sur votre entreprise, votre adresse courriel, vos catégories de services, vos régions ainsi que le contenu de vos profils, appels d'offres et messages. Nous recueillons aussi automatiquement des renseignements techniques limités, comme des données sur l'appareil et le navigateur et sur votre utilisation, lorsque vous interagissez avec le Service.",
      },
      {
        title: "Comment nous les utilisons",
        body: "Nous utilisons vos renseignements pour exploiter et améliorer le Service, notamment pour jumeler les entrepreneurs avec des occasions pertinentes, afficher les fiches du répertoire et les appels d'offres, envoyer des notifications transactionnelles et de jumelage, traiter les abonnements, offrir du soutien et assurer la sécurité.",
      },
      {
        title: "Témoins et analytique",
        body: "Nous utilisons des témoins (cookies) et des technologies semblables pour maintenir votre session ouverte, mémoriser vos préférences et comprendre comment le Service est utilisé. Des données analytiques agrégées nous aident à améliorer la performance et les fonctionnalités. Vous pouvez gérer les témoins dans les paramètres de votre navigateur, mais certaines fonctionnalités pourraient ne pas fonctionner sans eux.",
      },
      {
        title: "Comment les gens trouvent PMRFP",
        body: "Pour comprendre comment les gens trouvent PMRFP, nous enregistrons la première page que vous avez visitée et le site ou la campagne qui vous y a dirigé. Un seul témoin interne (pmrfp_ft, conservé 90 jours) contient l'adresse de cette première page sans ses paramètres, le domaine du site référent seulement (jamais l'adresse complète), les balises de campagne du lien, le cas échéant (utm_source, utm_medium, utm_campaign, utm_content), la date, la langue de la page et votre pays tel qu'estimé par notre hébergeur. Il ne contient jamais votre adresse IP. Si vous créez un compte, nous conservons ces valeurs avec celui-ci pour savoir quels canaux nous amènent des membres; nous comptons aussi les premières visites par page et par canal sous forme de totaux quotidiens qui n'identifient personne. Nous n'utilisons aucun traceur tiers ni témoin publicitaire, et nous ne faisons aucun suivi intersites. Bloquer ou effacer ce témoin n'a aucun effet sur le Service.",
      },
      {
        title: "Stockage des données",
        body: "Les données des comptes et de la plateforme sont stockées au moyen de Supabase, notre fournisseur de base de données gérée et d'authentification. Nous prenons des mesures raisonnables pour que nos fournisseurs d'infrastructure traitent les données de façon sécuritaire.",
      },
      {
        title: "Communication des renseignements",
        body: "Nous ne vendons pas vos renseignements personnels. Les renseignements que vous choisissez de publier — comme le profil de votre entreprise ou un appel d'offres — sont visibles par les autres utilisateurs dans le cadre du Service. Nous pouvons communiquer des données aux fournisseurs de services qui nous aident à exploiter la plateforme (par exemple, pour l'hébergement, les paiements et le courriel), ainsi que lorsque la loi l'exige.",
      },
      {
        title: "Vos droits",
        body: "En vertu de la LPRPDE et des lois canadiennes applicables en matière de protection de la vie privée, vous pouvez demander à consulter les renseignements personnels que nous détenons à votre sujet, nous demander de les corriger ou en demander la suppression, sous réserve de limites juridiques et opérationnelles. Pour exercer ces droits, communiquez avec nous au moyen des coordonnées ci-dessous.",
      },
      {
        title: "Sécurité",
        body: "Nous utilisons des mesures de protection administratives, techniques et physiques conçues pour protéger vos renseignements. Aucune méthode de transmission ou de stockage n'est entièrement sécuritaire; nous ne pouvons donc pas garantir une sécurité absolue, mais nous nous efforçons de protéger vos données et d'intervenir rapidement en cas d'incident.",
      },
    ],
    contact: {
      title: "Nous joindre",
      body: "Des questions ou une demande relative à la confidentialité? Écrivez-nous à {email}.",
    },
  },

  disclaimer: {
    meta: {
      title: "Avis de non-responsabilité",
      description: "Renseignements importants sur le fonctionnement de PMRFP et sur ce que la plateforme ne garantit pas.",
    },
    title: "Avis de non-responsabilité",
    intro:
      "PMRFP met en relation des entreprises de métiers avec des gestionnaires immobiliers, des constructeurs et des propriétaires. Nous ne sommes ni un courtier, ni un agent d'approvisionnement, ni un conseiller juridique, et nous n'agissons pour le compte d'aucune des parties. Les énoncés suivants s'appliquent à des étapes précises du Service.",
    signupLabel: "Lors de votre inscription",
    pmLabel: "Pour les gestionnaires immobiliers qui publient un appel d'offres",
    interestLabel: "Pour les entrepreneurs qui manifestent leur intérêt",
    contact: "Des questions sur cet avis? Écrivez-nous à {email}.",
  },

  copy: {
    disclaimer:
      "PMRFP est une plateforme pour publier des appels d'offres et trouver des entrepreneurs. Nous ne garantissons ni la disponibilité des projets, ni le succès des soumissions, ni l'octroi de contrats, ni la réponse des gestionnaires immobiliers, ni des revenus. Les membres sont responsables de leur propre diligence raisonnable, de leurs qualifications, de leurs assurances, de leurs licences, de leurs prix et de leurs ententes.",
    signup:
      "PMRFP est une plateforme pour publier des appels d'offres et trouver des entrepreneurs. PMRFP ne garantit pas la disponibilité des projets, l'octroi de contrats, l'acceptation des soumissions, le paiement, la réponse des gestionnaires immobiliers ni le succès commercial. Les utilisateurs sont responsables de leur propre vérification diligente, de leurs licences, de leurs assurances, de leurs prix et de leurs ententes contractuelles.",
    pmPosting:
      "En soumettant cet appel d'offres, vous confirmez que vous avez l'autorisation de publier cette occasion ou que vous la soumettez pour examen. PMRFP peut modifier, refuser ou retirer les annonces incomplètes, trompeuses, indésirables ou inappropriées.",
    interest:
      "En manifestant votre intérêt, vous comprenez que PMRFP ne représente aucune des parties à titre de courtier, d'agent d'approvisionnement, de conseiller juridique ou de garant des travaux.",
  },

  referShared: {
    howEyebrow: "Comment ça fonctionne",
    howTitle: "Trois étapes. Aucune connexion. Aucun piège.",
    step: "Étape {n}",
    team: "— L'équipe de PMRFP",
    noCap: "· aucun plafond de recommandations · aucune inscription requise",
  },

  refer: {
    meta: {
      title: "Recommander à PMRFP — jusqu'à {fee} $ (entrepreneur) ou une mention publique (projet)",
      description:
        "Deux volets de recommandation. Recommandez un entrepreneur et recevez jusqu'à {fee} $ en argent lorsqu'il s'abonne à Trade Pro. Recommandez un projet et obtenez une mention publique sur l'appel d'offres, en plus d'une place au palmarès des meilleurs apporteurs.",
    },
    eyebrow: "Programme de recommandation",
    title: "Deux volets. {cash} pour les entrepreneurs. Une mention publique pour les projets.",
    titleCash: "Jusqu'à {fee} $ en argent",
    lead: "Le volet argent (entrepreneur) paie une fois que l'entrepreneur recommandé s'abonne à Trade Pro et que son paiement est encaissé. Le volet reconnaissance (projet) commence quand l'appel d'offres est publié et paie en visibilité — votre nom sur chaque appel d'offres que vous apportez, plus une place au palmarès des meilleurs apporteurs.",
    trade: {
      kicker: "Volet revenus directs",
      title: "Recommander un entrepreneur",
      amount: "Jusqu'à {fee} $ {currency}",
      body: "Recommandez une entreprise de métier ou de services. {fee} $ pour un forfait Trade Pro annuel, versés environ 30 jours après l'encaissement de son paiement; {feeMonthly} $ pour un forfait mensuel, après l'encaissement de son troisième paiement mensuel. Par virement Interac.",
      cta: "Recommander un entrepreneur",
    },
    project: {
      kicker: "Volet reconnaissance",
      title: "Recommander un projet",
      amount: "Mention publique + palmarès",
      body: "Recommandez un projet immobilier (réparations avant mise en vente, entretien, travaux d'immobilisation). Quand l'appel d'offres est publié, votre nom apparaît sur l'annonce comme apporteur et vous montez au palmarès des meilleurs apporteurs. Pas d'argent, mais une vraie visibilité.",
      cta: "Recommander un projet",
    },
    whyLabel: "Pourquoi deux volets :",
    whyBody:
      "les abonnements des entrepreneurs sont les revenus directs de PMRFP, alors le volet entrepreneur paie en argent. Les recommandations de projets créent l'inventaire qui fidélise les entrepreneurs payants — une vraie valeur, mais indirecte — alors nous les récompensons par de la reconnaissance (mention publique + palmarès) plutôt qu'en argent. Les deux volets sont sans plafond et ne demandent aucune inscription. La mention visible sur l'appel d'offres publié est ce que votre nom peut côtoyer de plus précieux dans ce réseau.",
  },

  referTrade: {
    meta: {
      title: "Recommander un entrepreneur — jusqu'à {fee} $ quand il s'abonne à Trade Pro",
      description:
        "Vous connaissez un entrepreneur commercial qui gagnerait à être inscrit sur PMRFP? Recommandez-le et recevez jusqu'à {fee} $ {currency} une fois son paiement Trade Pro encaissé.",
    },
    eyebrow: "Recommandation d'entrepreneur · volet revenus directs",
    titleLine1: "Recommandez un entrepreneur.",
    titleLine2: "{earn} quand il s'abonne à Trade Pro.",
    titleEarn: "Recevez jusqu'à {fee} $",
    lead: "Vous connaissez une entreprise de métier ou de services commerciale qui devrait être inscrite sur PMRFP? Recommandez-la. Quand elle s'abonne à Trade Pro et que son paiement est encaissé, vous recevez une prime d'apporteur par virement Interac : {fee} $ {currency} pour un forfait annuel, {feeMonthly} $ pour un forfait mensuel.",
    cta: "Recommander un entrepreneur",
    projectLink: "Vous avez plutôt un projet? Recommandez-le pour une mention publique →",
    offerKicker: "Prime d'apporteur",
    offerAmount: "Jusqu'à {fee} $ {currency}",
    offerLines: [
      "· {fee} $ en argent par abonnement Trade Pro annuel recommandé",
      "· {feeMonthly} $ par abonnement mensuel recommandé, après l'encaissement du 3e paiement",
      "· annuel : versée environ 30 jours après l'encaissement du paiement",
      "· par virement Interac, une fois le paiement réglé (sans contestation)",
    ],
    steps: [
      {
        title: "Parlez-nous de l'entrepreneur",
        desc: "Nom de l'entreprise, emplacement, ce qu'elle fait et (si vous les avez) ses coordonnées. Deux minutes.",
      },
      {
        title: "Nous l'invitons à s'inscrire",
        desc: "PMRFP communique avec l'entreprise, l'aide à créer son profil dans le répertoire et lui présente Trade Pro.",
      },
      {
        title: "Jusqu'à {fee} $ quand l'abonnement tient",
        desc: "Trade Pro annuel : vos {fee} $ {currency} sont versés par virement Interac environ 30 jours après l'encaissement de son paiement. Trade Pro mensuel : {feeMonthly} $ après l'encaissement de son troisième paiement mensuel. Dans les deux cas, le versement se fait une fois le paiement réglé, sans remboursement ni contestation.",
      },
    ],
    whoEyebrow: "Qui recommande des entrepreneurs",
    whoTitle: "Quiconque connaît un entrepreneur canadien qui fait des travaux commerciaux.",
    who: [
      {
        title: "Gestionnaires immobiliers",
        body: "Recommandez les entrepreneurs avec qui vous travaillez vraiment. Ça renforce votre liste de fournisseurs et leur donne un historique documenté. Si votre employeur restreint les paiements de recommandation, refusez la prime et nous vous mentionnerons plutôt par votre nom.",
      },
      {
        title: "Autres entrepreneurs",
        body: "Recommandez des pairs dans des corps de métier connexes (CVC ↔ électricité, toiture ↔ imperméabilisation). Jusqu'à {fee} $ par abonnement Pro recommandé, ça s'additionne vite.",
      },
      {
        title: "Fournisseurs et distributeurs",
        body: "Vos clients entrepreneurs devraient être inscrits là où arrivent les appels d'offres commerciaux. Recommandez-les et touchez la prime.",
      },
      {
        title: "Associations de métiers",
        body: "Présentez vos membres en bloc. Chaque activation Pro annuelle rapporte {fee} $. Nous pouvons faire du comarketing auprès de vos listes de membres.",
      },
      {
        title: "Consultants de l'industrie",
        body: "Vous savez qui est en croissance et qui embauche. Dirigez-les vers PMRFP pour leur visibilité et touchez une prime à chaque inscription.",
      },
      {
        title: "Quiconque connaît un bon entrepreneur",
        body: "L'entrepreneur de la famille? Le couvreur du voisin? S'il fait des travaux commerciaux au Canada, recommandez-le.",
      },
    ],
    whyEyebrow: "Pourquoi ce volet paie en argent, et pas le volet projet",
    whyTitle: "Des calculs honnêtes. De l'argent là où il y a des revenus, de la reconnaissance là où il n'y en a pas.",
    why: [
      {
        strong: "Un nouvel abonnement Trade Pro rapporte {annual} $/an (ou {monthly} $/mois)",
        rest: " en revenus directs à PMRFP. La prime de {fee} $ ne s'applique qu'aux forfaits annuels, et le délai d'environ 30 jours garantit que le paiement est encaissé avant le versement. Les forfaits mensuels rapportent {feeMonthly} $, versés après le troisième paiement mensuel — ainsi, nous ne versons jamais plus que ce que nous avons encaissé.",
      },
      {
        strong: "Les recommandations de projets créent de l'inventaire, mais pas de revenus directs;",
        rest: " nous les récompensons donc par une mention publique sur l'appel d'offres et une place au palmarès des meilleurs apporteurs — une vraie visibilité, pas de l'argent.",
      },
      {
        strong: "Aucun plafond de recommandations.",
        rest: " Recommandez-en 1 ou 50 — même prime par recommandation. Les firmes de gestion immobilière qui comptent plus de 30 fournisseurs peuvent générer de vrais revenus simplement en présentant ceux qui en profiteraient le plus.",
      },
      {
        strong: "Un paiement sans détour.",
        rest: " Dès que le paiement admissible de l'entrepreneur recommandé est encaissé, votre virement Interac part. Pas de versements trimestriels à attendre.",
      },
    ],
    quote:
      "L'entente honnête : nous gagnons de l'argent quand les entrepreneurs s'abonnent. Alors nous vous payons pour nous amener les entrepreneurs qui valent la peine d'être abonnés. Prime plus élevée, versement plus rapide, ligne directe.",
    formEyebrow: "Recommander un entrepreneur",
    formTitle: "Deux minutes. Recevez jusqu'à {fee} $ quand il s'abonne à Trade Pro.",
    formLead:
      "Parlez-nous de l'entrepreneur. Si vous avez ses coordonnées et la permission de les transmettre, ajoutez-les. Sinon, laissez les champs vides et nous ferons la présentation avec vous.",
    terms:
      "Primes d'apporteur : {fee} $ pour un forfait Trade Pro annuel, versés environ 30 jours après l'encaissement du paiement de l'entrepreneur recommandé; {feeMonthly} $ pour un forfait mensuel, versés après l'encaissement du troisième paiement mensuel — dans les deux cas une fois le paiement réglé, sans remboursement ni contestation. Les autorecommandations et les doublons ne sont pas admissibles; la première présentation documentée l'emporte. PMRFP ne garantit pas qu'un entrepreneur recommandé s'abonnera ou restera abonné.",
  },

  referProject: {
    meta: {
      title: "Recommander un projet — mention publique + palmarès des meilleurs apporteurs",
      description:
        "Vous connaissez quelqu'un qui a un projet immobilier? Recommandez-le à PMRFP. Quand l'appel d'offres est publié, vous obtenez une mention publique (« Présenté par [vous] ») et une place au palmarès des meilleurs apporteurs. Pour de l'argent, recommandez un entrepreneur à Trade Pro (jusqu'à {fee} $).",
    },
    eyebrow: "Recommandation de projet · volet reconnaissance",
    titleLine1: "Présentez un projet.",
    titleLine2: "{credit} quand l'appel d'offres est publié.",
    titleCredit: "Obtenez une mention",
    lead: "Vous connaissez quelqu'un qui a un projet immobilier — réparations avant mise en vente, entretien d'un portefeuille, travaux d'immobilisation? Recommandez-le à PMRFP. Nous vous aiderons à structurer l'appel d'offres et à le publier. Votre nom apparaît sur l'annonce comme l'apporteur du projet, et vous montez au palmarès des meilleurs apporteurs. Une vraie visibilité dans le réseau qui compte pour vous.",
    cta: "Recommander un projet",
    cashLink: "Vous préférez de l'argent? Recommandez un entrepreneur →",
    offerKicker: "Ce que vous obtenez",
    offerTitle: "Mention publique + palmarès",
    offerLines: [
      "· « Présenté par [vous] » sur chaque appel d'offres publié que vous apportez",
      "· montez au palmarès des meilleurs apporteurs sur /refer/leaderboard",
      "· votre firme ou affiliation affichée à côté de votre nom (facultatif)",
      "· un courriel mensuel qui résume tous les appels d'offres que vous avez recommandés",
    ],
    cashNote: "Vous préférez de l'argent? Le {link} par abonnement Trade Pro.",
    cashNoteLink: "volet Recommander un entrepreneur paie jusqu'à {fee} $",
    steps: [
      {
        title: "Parlez-nous du projet",
        desc: "Décrivez les travaux, l'emplacement et la personne-ressource de l'immeuble. Deux minutes.",
      },
      {
        title: "Nous structurons et publions l'appel d'offres",
        desc: "PMRFP rédige une description claire des travaux et publie l'appel d'offres auprès d'entrepreneurs canadiens qualifiés.",
      },
      {
        title: "Mention publique + place au palmarès",
        desc: "Quand l'appel d'offres est publié, « Présenté par [vous] » apparaît sur l'annonce et votre nom monte au palmarès des meilleurs apporteurs. De la reconnaissance là où regardent les gens que vous voulez connaître.",
      },
    ],
    whoEyebrow: "Qui recommande des projets",
    whoTitle: "Conçu pour les professionnels qui entendent parler des travaux immobiliers avant tout le monde.",
    who: [
      {
        title: "Courtiers immobiliers",
        body: "Réparations avant mise en vente, remises en état après la vente et recommandations de travaux majeurs côté vendeur.",
      },
      {
        title: "Courtiers hypothécaires",
        body: "Réparations signalées dans l'évaluation avant le financement — sans perdre la transaction.",
      },
      {
        title: "Avocats en droit immobilier",
        body: "Nettoyage de successions, travaux sur des propriétés en succession et correctifs après la conclusion de la vente.",
      },
      {
        title: "Courtiers d'assurance",
        body: "Réparations liées à des réclamations, où la rapidité d'un entrepreneur fiable compte.",
      },
      {
        title: "Gestionnaires immobiliers",
        body: "Recommandations entre gestionnaires quand les travaux dépassent votre liste de fournisseurs ou que vous êtes débordé.",
      },
      {
        title: "Quiconque a un projet",
        body: "Propriétaires, voisins, famille — si vous savez que des travaux doivent être faits, recommandez-les.",
      },
    ],
    whyEyebrow: "Pourquoi recommander",
    whyTitle: "Aidez votre client. Obtenez le mérite. Restez informé.",
    why: [
      {
        strong: "Aidez d'abord votre client.",
        rest: " Son projet reçoit rapidement des soumissions d'entrepreneurs vérifiés — meilleur résultat, relation plus solide.",
      },
      {
        strong: "Obtenez une mention publique.",
        rest: " « Présenté par [vous] » s'affiche sur l'appel d'offres publié — la mention d'apporteur que la plupart des professionnels paieraient pour avoir. Votre nom monte au palmarès des meilleurs apporteurs.",
      },
      {
        strong: "Pas de relances à faire.",
        rest: " Un courriel mensuel vous indique où en est chaque projet recommandé.",
      },
      {
        strong: "Offrez un vrai processus à votre client.",
        rest: " Une façon documentée d'inviter les bons entrepreneurs — plutôt que de recommander « un gars que vous connaissez ». Les clients choisissent et vérifient toujours eux-mêmes qui ils embauchent.",
      },
      {
        strong: "Mention publique facultative.",
        rest: " « Présenté par [vous] » sur l'appel d'offres — de la visibilité auprès des entrepreneurs de votre région.",
      },
    ],
    quote:
      "Le bon réflexe pour tout professionnel qui touche à l'immobilier sans vendre de services de métiers : être la personne qui savait comment faire faire les travaux. Nous nous occupons du processus. Vous obtenez le mérite de la présentation.",
    formEyebrow: "Recommander un projet",
    formTitle: "Deux minutes. Obtenez une mention quand l'appel d'offres est publié.",
    formLead:
      "Parlez-nous du projet. Si vous avez les coordonnées de la personne-ressource de l'immeuble et la permission de les transmettre, ajoutez-les. Sinon, laissez les champs vides et nous ferons la présentation avec vous.",
    terms:
      "Les recommandations de projets donnent droit à une mention publique sur l'appel d'offres et à une place au palmarès des meilleurs apporteurs — pas à de l'argent. Le volet payé en argent est /refer-a-trade (jusqu'à {fee} $ par abonnement Trade Pro). PMRFP ne garantit ni l'obtention de travaux ni le choix d'un fournisseur. Les entrepreneurs et les personnes-ressources des immeubles prennent leurs propres décisions.",
  },

  getFound: {
    meta: {
      title: "Soyez trouvé — visibilité SEO et IA pour les entrepreneurs",
      description:
        "Votre entreprise sur les pages par corps de métier et par ville que les gestionnaires immobiliers trouvent sur Google — et dans les réponses de l'IA. Des profils de membres PMRFP ont atteint le top 10 de Google dans leur catégorie.",
    },
    crumbHome: "Accueil",
    crumbPage: "Soyez trouvé",
    faqs: [
      {
        q: "Qu'est-ce que la Fiche SEO m'apporte concrètement?",
        a: "Une place sur les pages de PMRFP que les gestionnaires immobiliers trouvent quand ils cherchent votre corps de métier dans votre ville — plus votre propre page de profil avec vos services, vos secteurs desservis et votre note Google. Les moteurs de recherche et les assistants IA lisent ces pages parce qu'elles sont structurées autour des données et tenues honnêtes : une page n'existe que là où de vraies entreprises sont inscrites.",
      },
      {
        q: "Et la partie IA (AEO)?",
        a: "Quand quelqu'un demande à ChatGPT ou à l'IA de Google des « couvreurs commerciaux à Laval », les moteurs puisent dans des pages structurées et vérifiables. PMRFP publie des données lisibles par machine (balisage schema.org sur chaque page, un index llms.txt) et des preuves concrètes comme des études de cas de projets — le genre de contenu que citent les moteurs de réponse.",
      },
      {
        q: "Garantissez-vous le classement?",
        a: "Non — personne ne peut honnêtement le faire. Ce que nous contrôlons : de vraies pages, de vraies données structurées, de vraies preuves de projets et un répertoire que Google classe déjà dans le top 10 pour plusieurs profils de membres. Ce que nous ne contrôlons pas : Google.",
      },
      {
        q: "En quoi est-ce différent de Trade Pro?",
        a: "La Fiche SEO, c'est de la visibilité seulement. Trade Pro ({annual} $/an) ajoute le tableau des appels d'offres : voyez les projets publiés, recevez des alertes correspondantes et manifestez votre intérêt. Vous pouvez commencer par la visibilité et passer à un forfait supérieur en tout temps.",
      },
    ],
    eyebrow: "Pour les entrepreneurs et les entreprises de services",
    title: "Soyez trouvé sur Google — et dans les réponses de l'IA.",
    lead: "Les gestionnaires immobiliers ne parcourent pas les répertoires pour le plaisir. Ils cherchent — sur Google, et de plus en plus en interrogeant l'IA. PMRFP place votre entreprise sur les pages que les deux lisent vraiment : des pages par corps de métier et par ville avec de vraies entreprises, de vrais projets et des données structurées sur chacune.",
    listFree: "Inscrivez-vous gratuitement",
    seePricing: "Voir les prix",
    proofTitle: "Des preuves, pas des promesses",
    proofs: [
      {
        stat: "Top 10",
        line: "Positions Google atteintes par des pages de profils de membres dans leur catégorie (Search Console, 90 derniers jours).",
      },
      {
        stat: "Page 1",
        line: "Positions occupées par nos guides de coûts commerciaux — les pages où les gestionnaires immobiliers préparent leurs budgets.",
      },
      {
        stat: "Chaque page",
        line: "comporte des données structurées schema.org, et le site publie un index llms.txt pour les robots d'IA.",
      },
    ],
    proofNote:
      "Les positions varient selon la requête et la région et ne sont pas garanties — consultez la FAQ pour savoir ce que nous contrôlons et ce que nous ne contrôlons pas.",
    ladderTitle: "Comment fonctionnent les paliers de visibilité",
    tiers: {
      free: {
        name: "Inscription gratuite",
        price: "0 $",
        lines: [
          "Profil d'entreprise dans le répertoire",
          "Présence dans la recherche par catégorie et par région sur le site",
          "Soumission d'études de cas de projets",
        ],
      },
      seo: {
        name: "Fiche SEO",
        price: "{seoAnnual} $/an",
        badge: "ou {seoMonthly} $/mois",
        lines: [
          "Place sur les pages de votre corps de métier et de votre ville — celles que Google indexe",
          "Galerie de photos de projets illimitée sur votre profil",
          "Note Google affichée sur votre profil (données officielles de Google Places)",
          "Études de cas mises en avant sur les pages de votre ville",
          "Classement prioritaire devant les inscriptions gratuites",
        ],
      },
      pro: {
        name: "Trade Pro — {annual} $/an",
        lines: [
          "Tout ce qu'offre la Fiche SEO",
          "Accès complet au tableau des appels d'offres + alertes correspondantes",
          "Manifestation d'intérêt pour les projets publiés",
        ],
      },
    },
    ladderNote:
      "Commencez gratuitement dès aujourd'hui — passez à un palier payant depuis votre tableau de bord quand ça vous convient. Des études de cas et un profil complet font plus pour votre visibilité que n'importe quel palier à lui seul.",
    faqTitle: "Questions fréquentes",
    ctaTitle: "Soyez sur la page qu'ils trouvent.",
    ctaBody:
      "Inscrivez votre entreprise gratuitement en quelques minutes. Ajoutez une étude de cas et vous devancez déjà la plupart de vos concurrents.",
    ctaSecondary: "Voir les études de cas des membres",
  },

  services: {
    meta: {
      title: "Services pour les entrepreneurs : paiements par carte et site Web crédible",
      description:
        "Deux services que nous recommandons aux entrepreneurs sur PMRFP : accepter les paiements par carte sur le chantier avec Cleverpays, et un site Web, une image de marque et un profil Google par Talkerstein Consulting Group.",
    },
    eyebrow: "Services pour les entrepreneurs",
    title: "Soyez payé sur le chantier. Ayez l'air sérieux en ligne.",
    lead: "Décrocher le contrat, c'est la moitié du travail. Voici deux services que nous recommandons aux entrepreneurs : accepter les paiements par carte sur place, et un site Web et un profil Google qui donnent envie aux gestionnaires immobiliers de prendre le téléphone.",
    disclosureLabel: "Divulgation :",
    disclosure:
      "PMRFP entretient une relation d'affaires avec les deux entreprises présentées sur cette page. Talkerstein Consulting Group est une société affiliée à PMRFP.",
    partners: {
      cleverpays: {
        headline: "Acceptez les paiements par carte sur le chantier",
        blurb:
          "Traitement des paiements pour les entreprises canadiennes, en français et en anglais. Pour les entrepreneurs, l'avantage, c'est d'être payé avant de quitter le chantier plutôt que de courir après un chèque.",
        serves: "Canada",
        cta: "Visiter Cleverpays",
        points: [
          {
            t: "Paiements en personne pour les équipes mobiles",
            d: "Des terminaux de paiement portatifs que votre équipe peut apporter sur le chantier.",
          },
          {
            t: "Paiements par carte au téléphone ou dans le navigateur",
            d: "Un terminal virtuel pour accepter la carte d'un client à distance, sans appareil.",
          },
          { t: "Des factures que vos clients peuvent payer", d: "Envoyez une facture accompagnée d'un moyen de la payer dès sa réception." },
          {
            t: "Analyse de relevé",
            d: "Envoyez votre relevé de traitement actuel et demandez à un spécialiste d'en examiner les frais.",
          },
        ],
      },
      talkerstein: {
        headline: "Ayez l'air crédible en ligne",
        blurb:
          "Les gestionnaires immobiliers vérifient qui vous êtes avant d'appeler. Talkerstein met en place pour vous les éléments qui donnent à un entrepreneur l'image d'une entreprise établie. Basée à Toronto.",
        serves: "Basée à Toronto",
        cta: "Visiter Talkerstein",
        points: [
          { t: "Un site Web qui transforme les visites en appels", d: "Présente vos réalisations, vos services et vos qualifications." },
          { t: "Image de marque et logo", d: "Une identité soignée que les gestionnaires immobiliers prennent au sérieux." },
          {
            t: "Fiche d'établissement Google",
            d: "Configurée pour que les acheteurs de votre région vous trouvent quand ils cherchent votre corps de métier.",
          },
          {
            t: "Aide pour les soumissions aux appels d'offres publics",
            d: "Du soutien pour préparer une soumission à un appel d'offres gouvernemental.",
          },
        ],
      },
    },
    sellEyebrow: "Vous vendez aux entrepreneurs?",
    sellTitle: "Rejoignez les entrepreneurs partout au Canada et aux États-Unis.",
    sellBody:
      "Si votre entreprise vend aux entrepreneurs commerciaux, par exemple de l'assurance, du cautionnement, des logiciels ou de l'équipement, parlez-nous d'une place sur cette page.",
    contactUs: "Nous joindre",
  },

  review: {
    metaTitle: "Laisser un avis",
    usedTitle: "Ce lien d'avis a déjà été utilisé",
    brokenTitle: "Ce lien d'avis ne fonctionne pas",
    usedBody:
      "Chaque lien ne fonctionne qu'une fois, et un avis a déjà été envoyé avec celui-ci. Merci d'avoir pris le temps.",
    brokenBody:
      "Il a peut-être déjà été utilisé, ou n'a été copié qu'en partie. Essayez de nouveau le bouton dans le courriel.",
    mistake: "Vous croyez que c'est une erreur? Écrivez à {email}.",
    goHome: "Aller à PMRFP",
    eyebrow: "Demande d'avis",
    title: "Qu'avez-vous pensé du travail de {trade}?",
    intro: "{trade} vous demande votre avis honnête sur ce travail. Ça prend environ deux minutes.",
    by: "par {trade}",
  },

  kept: {
    metaTitle: "Annonce d'appel d'offres mise à jour",
    ok: {
      title: "Votre annonce est de nouveau en ligne",
      body: "Merci — votre appel d'offres est de retour sur le tableau public, et nous avons prolongé sa date limite. Quand celle-ci sera passée, nous ferons de nouveau le point avec vous.",
      bodyDays:
        "Merci — votre appel d'offres est de retour sur le tableau public, et nous avons prolongé sa date limite de {days} jours. Quand celle-ci sera passée, nous ferons de nouveau le point avec vous.",
    },
    notlive: {
      title: "Cet appel d'offres est déjà fermé",
      body: "Cette annonce a été octroyée, fermée ou archivée; il n'y a donc rien à garder en ligne. Vous pouvez publier un nouvel appel d'offres en tout temps depuis votre tableau de bord.",
    },
    invalid: {
      title: "Ce lien n'est pas valide",
      body: "Ce lien de maintien en ligne ne correspond à aucune annonce en cours. Rendez-vous dans votre tableau de bord pour gérer vos appels d'offres.",
    },
    error: {
      title: "Une erreur s'est produite",
      body: "Nous n'avons pas pu mettre à jour votre annonce pour le moment. Veuillez réessayer, ou gérez-la depuis votre tableau de bord.",
    },
    cta: "Voir mes appels d'offres",
  },

  offline: {
    title: "Vous êtes hors ligne",
    body: "PMRFP a besoin d'une connexion pour charger cette page. Vérifiez votre Wi-Fi ou vos données cellulaires, puis réessayez.",
    note: "Rien n'est perdu. Vos appels d'offres et votre travail enregistré vous attendront à votre retour en ligne.",
    tryAgain: "Réessayer",
  },

  suspended: {
    metaTitle: "Compte suspendu",
    title: "Votre compte est suspendu",
    body: "L'accès à ce compte est actuellement suspendu. Si vous croyez qu'il s'agit d'une erreur, veuillez nous écrire à {email}.",
    back: "← Retour à PMRFP",
  },
};

/** Licence names are proper names with no official Spanish version, so they stay in English. */
const OGL_ES = (who: string) => `Contiene información autorizada bajo la Open Government Licence – ${who}.`;

const es: typeof en = {
  about: {
    meta: {
      title: "Acerca de PMRFP: quién lo dirige y de dónde vienen los datos",
      description:
        "PMRFP es un tablero de solicitudes de propuestas para propiedades comerciales y de licitaciones públicas de edificios en Canadá y EE. UU., además de un directorio de contratistas. Quién lo dirige, de dónde vienen las licitaciones y cómo funciona.",
    },
    eyebrow: "Acerca de",
    title: "Acerca de PMRFP",
    lead: "PMRFP reúne en un solo lugar el trabajo en propiedades comerciales: solicitudes de propuestas publicadas por administradores de propiedades, licitaciones públicas de edificios de compradores gubernamentales en Canadá y EE. UU., y un directorio de los contratistas que hacen el trabajo.",
    photoAlt: "El edificio Gooderham (Flatiron) de Toronto, con las torres del centro detrás",
    caption: "Hecho en Toronto.",
    whoTitle: "Quién dirige PMRFP",
    whoBody:
      "PMRFP lo desarrolla en Toronto el equipo detrás de {sister}, junto con {tcg}, una empresa afiliada a PMRFP. El fundador es R. Talkar.",
    contactBody: "¿Preguntas, correcciones o un aviso que publicamos mal? Escriba a {email} o use el {form}.{mail}",
    contactForm: "formulario de contacto",
    mail: " Dirección postal: {address}.",
    sourcesTitle: "De dónde vienen las licitaciones públicas",
    sourcesBody:
      "Revisamos cada fuente todos los días, clasificamos cada aviso por oficio y región, y enlazamos al aviso oficial. Usted siempre presenta su oferta en el portal del propio comprador, nunca a través de PMRFP.",
    sources: [
      {
        name: "CanadaBuys",
        what: "Licitaciones y adjudicaciones de contratos del Gobierno de Canadá",
        licence: OGL_ES("Canada"),
      },
      { name: "Ciudad de Toronto", what: "Licitaciones y contratos adjudicados de la ciudad", licence: OGL_ES("Toronto") },
      {
        name: "SEAO (Quebec)",
        what: "Licitaciones públicas y adjudicaciones de Quebec, publicadas en francés",
        licence:
          "Fuente: Système électronique d'appel d'offres (SEAO), Secrétariat du Conseil du trésor du Québec — Données Québec, CC BY 4.0.",
      },
      { name: "Gobierno de Yukón", what: "Licitaciones de Yukón", licence: OGL_ES("Yukon") },
      { name: "Nueva Escocia", what: "Contratos públicos anteriores", licence: OGL_ES("Nova Scotia") },
      {
        name: "SAM.gov",
        what: "Oportunidades de contratos federales de EE. UU. para edificios e instalaciones",
        licence:
          "Fuente: SAM.gov Contract Opportunities, U.S. General Services Administration (datos del gobierno federal de EE. UU., dominio público).",
      },
    ],
    awardsBody: "También publicamos lo que muestran los datos de adjudicación: el {report} y las {winners}.",
    reportLink: "informe de contratos públicos de edificios",
    winnersLink: "empresas que ganan con más frecuencia",
    directoryTitle: "Cómo funciona el directorio",
    directoryBody:
      "Las empresas se registran gratis y eligen los oficios y las zonas que atienden. Una empresa marcada como verificada fue revisada por el equipo de PMRFP. De lo contrario, no verificamos licencias ni seguros, así que confírmelos directamente para su proyecto. Los administradores de propiedades, constructores y propietarios publican solicitudes de propuestas sin costo. Los contratistas solo pagan si eligen un {paid}, como Trade Pro, que da acceso a todos los detalles de las solicitudes de propuestas y a un correo diario con las nuevas coincidencias.",
    paidPlan: "plan de pago",
  },

  contact: {
    meta: {
      title: "Contactar a PMRFP",
      description:
        "Póngase en contacto con el equipo de PMRFP: para contratistas, administradores de propiedades y ayuda para encontrar proveedores.",
    },
    eyebrow: "Contacto",
    title: "Póngase en contacto",
    body: "¿Preguntas sobre cómo registrar su empresa, publicar una solicitud de propuestas o encontrar proveedores? Envíenos un mensaje y le responderemos. También puede escribir a {email}.",
  },

  legal: {
    eyebrow: "Legal",
    lastUpdated: "Última actualización: {date}",
    translationNote:
      "Esta traducción se ofrece a título informativo. En caso de discrepancia, prevalece la versión en inglés.",
  },

  terms: {
    meta: { title: "Términos del servicio", description: "Los términos que rigen su uso de PMRFP." },
    title: "Términos del servicio",
    acceptance: {
      title: "1. Aceptación de los términos",
      body: "Al acceder a PMRFP (el “Servicio”) o utilizarlo, usted acepta quedar obligado por estos Términos del servicio. Si no está de acuerdo con estos términos, no puede utilizar el Servicio. Estos términos se aplican a todos los usuarios, incluidas las empresas de oficios, los contratistas, los administradores de propiedades, los constructores y los propietarios de edificios.",
    },
    description: {
      title: "2. Descripción del Servicio",
      body: "PMRFP es una plataforma para publicar solicitudes de propuestas y encontrar contratistas, al servicio del mercado canadiense de propiedades comerciales. El Servicio permite a las empresas de oficios publicar perfiles y seguir oportunidades, y permite a los administradores de propiedades, constructores y propietarios publicar solicitudes de propuestas (RFP) y encontrar proveedores.",
    },
    accounts: {
      title: "3. Cuentas y elegibilidad",
      body: "Debe proporcionar información exacta y completa al crear una cuenta y mantenerla actualizada. Usted es responsable de proteger las credenciales de su cuenta y de toda la actividad que se realice en ella. Debe estar autorizado para actuar en nombre de cualquier empresa que represente en el Servicio.",
    },
    billing: {
      title: "4. Suscripciones y facturación",
      withMonthly:
        "Trade Pro se ofrece con dos intervalos de facturación: ${annual} {currency} al año (anual) o ${monthly} {currency} al mes (mensual). Cada uno se renueva automáticamente al final del período vigente, salvo que se cancele. Puede cancelar en cualquier momento; la cancelación entra en vigor al final de su período de facturación vigente, y usted conserva el acceso hasta entonces. Las tarifas no son reembolsables, salvo cuando la ley lo exija. Podemos cambiar los precios a futuro con un aviso razonable. Puede cambiar entre la facturación anual y la mensual desde su portal de facturación; el cambio entra en vigor al final de su período de facturación vigente.",
      annualOnly:
        "Trade Pro se ofrece a ${annual} {currency} al año y se renueva automáticamente al final de cada período anual, salvo que se cancele. Puede cancelar en cualquier momento; la cancelación entra en vigor al final de su período de facturación vigente, y usted conserva el acceso hasta entonces. Las tarifas no son reembolsables, salvo cuando la ley lo exija. Podemos cambiar los precios a futuro con un aviso razonable.",
      free: "Los administradores de propiedades, constructores y propietarios pueden publicar solicitudes de propuestas sin costo. Las empresas de oficios pueden tener fichas gratuitas en el directorio sin una suscripción de pago.",
    },
    use: {
      title: "5. Uso aceptable",
      body: "Usted se compromete a no hacer un uso indebido del Servicio, lo que incluye publicar contenido falso, engañoso, no deseado (spam), infractor o ilícito; extraer o recolectar datos; intentar obtener acceso no autorizado; o usar el Servicio para acosar a otros usuarios. Podemos editar, rechazar o eliminar el contenido que infrinja estos términos.",
    },
    noGuarantee: { title: "6. Sin garantía de trabajo" },
    content: {
      title: "7. Contenido y anuncios",
      body: "Usted conserva la propiedad del contenido que envía y otorga a PMRFP una licencia no exclusiva para alojar, mostrar y distribuir ese contenido según sea necesario para operar el Servicio. Usted es el único responsable de la exactitud y la legalidad de sus anuncios, perfiles y solicitudes de propuestas. Podemos moderar, editar o eliminar los anuncios que estén incompletos o que sean engañosos, no deseados (spam) o inapropiados.",
    },
    liability: {
      title: "8. Limitación de responsabilidad",
      body: "En la máxima medida permitida por la ley, PMRFP y sus afiliadas no son responsables de ningún daño indirecto, incidental, consecuente o punitivo, ni de la pérdida de ganancias, ingresos, datos u oportunidades de negocio, que se derive de su uso del Servicio. El Servicio se proporciona “tal cual” y “según disponibilidad”, sin garantías de ningún tipo.",
    },
    termination: {
      title: "9. Terminación",
      body: "Podemos suspender o terminar su acceso al Servicio en cualquier momento si usted infringe estos términos o si dejamos de ofrecer el Servicio. Usted puede dejar de usar el Servicio y cerrar su cuenta en cualquier momento.",
    },
    changes: {
      title: "10. Cambios en estos términos",
      body: "Podemos actualizar estos términos periódicamente. Cuando hagamos cambios importantes, actualizaremos la fecha de “última actualización” indicada arriba y, cuando corresponda, daremos un aviso adicional. El uso continuado del Servicio después de que los cambios entren en vigor constituye la aceptación de los términos revisados.",
    },
    contact: { title: "11. Contacto", body: "¿Preguntas sobre estos términos? Escríbanos a {email}." },
  },

  privacy: {
    meta: { title: "Política de privacidad", description: "Cómo PMRFP recopila, usa y protege su información." },
    title: "Política de privacidad",
    intro:
      "PMRFP respeta su privacidad. Esta política explica qué información recopilamos, cómo la usamos y qué opciones tiene usted. Está redactada teniendo en cuenta las expectativas canadienses en materia de privacidad, incluida la PIPEDA.",
    sections: [
      {
        title: "Información que recopilamos",
        body: "Recopilamos la información que usted nos proporciona directamente, como su nombre, los datos de su empresa, su dirección de correo electrónico, sus categorías de servicio, sus regiones y el contenido de sus perfiles, solicitudes de propuestas y mensajes. También recopilamos automáticamente información técnica limitada, como datos del dispositivo y del navegador y actividad de uso, cuando usted interactúa con el Servicio.",
      },
      {
        title: "Cómo la usamos",
        body: "Usamos su información para operar y mejorar el Servicio, lo que incluye relacionar a los contratistas con oportunidades pertinentes, mostrar las fichas del directorio y las solicitudes de propuestas, enviar notificaciones transaccionales y de coincidencias, procesar suscripciones, brindar soporte y mantener la seguridad.",
      },
      {
        title: "Cookies y analítica",
        body: "Usamos cookies y tecnologías similares para mantener su sesión iniciada, recordar sus preferencias y entender cómo se usa el Servicio. La analítica agregada nos ayuda a mejorar el rendimiento y las funciones. Puede controlar las cookies desde la configuración de su navegador, aunque algunas funciones podrían no funcionar sin ellas.",
      },
      {
        title: "Cómo nos encuentra la gente",
        body: "Para entender cómo la gente encuentra PMRFP, registramos la primera página que visitó y el sitio o la campaña que lo trajo. Una sola cookie propia (pmrfp_ft, guardada 90 días) contiene la dirección de esa primera página sin sus parámetros, solo el dominio del sitio de referencia (nunca la dirección completa), las etiquetas de campaña del enlace, si las hay (utm_source, utm_medium, utm_campaign, utm_content), la fecha, el idioma de la página y su país según lo estima nuestro proveedor de alojamiento. Nunca contiene su dirección IP. Si crea una cuenta, guardamos estos valores con ella para saber qué canales nos traen miembros; también contamos las primeras visitas por página y canal como totales diarios que no identifican a nadie. No usamos rastreadores de terceros ni cookies publicitarias, y no hacemos seguimiento entre sitios. Bloquear o borrar la cookie no afecta al Servicio.",
      },
      {
        title: "Almacenamiento de datos",
        body: "Los datos de las cuentas y de la plataforma se almacenan mediante Supabase, nuestro proveedor administrado de base de datos y autenticación. Tomamos medidas razonables para que nuestros proveedores de infraestructura manejen los datos de forma segura.",
      },
      {
        title: "Compartir información",
        body: "No vendemos su información personal. La información que usted decide publicar, como el perfil de su empresa o una solicitud de propuestas, es visible para otros usuarios como parte del Servicio. Podemos compartir datos con proveedores de servicios que nos ayudan a operar la plataforma (por ejemplo, de alojamiento, pagos y correo electrónico) y cuando la ley lo exija.",
      },
      {
        title: "Sus derechos",
        body: "En virtud de la PIPEDA y de la legislación canadiense de privacidad aplicable, usted puede solicitar acceso a la información personal que tenemos sobre usted, pedirnos que la corrijamos o solicitar que la eliminemos, con sujeción a límites legales y operativos. Para ejercer estos derechos, contáctenos mediante los datos que aparecen a continuación.",
      },
      {
        title: "Seguridad",
        body: "Usamos medidas de protección administrativas, técnicas y físicas diseñadas para proteger su información. Ningún método de transmisión o almacenamiento es completamente seguro, por lo que no podemos garantizar una seguridad absoluta, pero trabajamos para proteger sus datos y responder con prontitud ante cualquier incidente.",
      },
    ],
    contact: {
      title: "Contacto",
      body: "¿Preguntas o solicitudes relacionadas con la privacidad? Escríbanos a {email}.",
    },
  },

  disclaimer: {
    meta: {
      title: "Descargo de responsabilidad",
      description: "Información importante sobre cómo funciona PMRFP y lo que no garantiza.",
    },
    title: "Descargo de responsabilidad",
    intro:
      "PMRFP conecta a empresas de oficios con administradores de propiedades, constructores y propietarios. No somos corredores, agentes de adquisiciones ni asesores legales, y no actuamos en nombre de ninguna de las partes. Las siguientes declaraciones se aplican en momentos específicos del Servicio.",
    signupLabel: "Cuando se registra",
    pmLabel: "Para administradores de propiedades que publican una solicitud de propuestas",
    interestLabel: "Para contratistas que manifiestan interés",
    contact: "¿Preguntas sobre este descargo de responsabilidad? Escríbanos a {email}.",
  },

  copy: {
    disclaimer:
      "PMRFP es una plataforma para publicar solicitudes de propuestas y encontrar contratistas. No garantizamos la disponibilidad de proyectos, el éxito de las ofertas, la adjudicación de contratos, la respuesta de los administradores de propiedades ni ingresos. Los miembros son responsables de su propia diligencia debida, calificaciones, seguros, licencias, precios y acuerdos.",
    signup:
      "PMRFP es una plataforma para publicar solicitudes de propuestas y encontrar contratistas. PMRFP no garantiza la disponibilidad de proyectos, la adjudicación de contratos, la aceptación de ofertas, el pago, la respuesta de los administradores de propiedades ni el éxito comercial. Los usuarios son responsables de su propia diligencia debida, licencias, seguros, precios y acuerdos contractuales.",
    pmPosting:
      "Al enviar esta solicitud de propuestas, usted confirma que tiene autorización para publicar esta oportunidad o que la envía para su revisión. PMRFP puede editar, rechazar o eliminar los anuncios que estén incompletos o que sean engañosos, no deseados (spam) o inapropiados.",
    interest:
      "Al manifestar su interés, usted entiende que PMRFP no representa a ninguna de las partes como corredor, agente de adquisiciones, asesor legal ni garante del trabajo.",
  },

  referShared: {
    howEyebrow: "Cómo funciona",
    howTitle: "Tres pasos. Sin iniciar sesión. Sin trampas.",
    step: "Paso {n}",
    team: "— El equipo de PMRFP",
    noCap: "· sin límite de recomendaciones · no requiere registro",
  },

  refer: {
    meta: {
      title: "Recomiende a PMRFP: gane hasta ${fee} (contratista) u obtenga reconocimiento (proyecto)",
      description:
        "Dos vías de recomendación. Recomiende a un contratista y gane hasta ${fee} en efectivo cuando se suscriba a Trade Pro. Recomiende un proyecto y obtenga reconocimiento público en la solicitud de propuestas y un lugar en la clasificación Top Connectors.",
    },
    eyebrow: "Programa de recomendaciones",
    title: "Dos vías. {cash} por contratistas. Reconocimiento público por proyectos.",
    titleCash: "Hasta ${fee} en efectivo",
    lead: "La vía en efectivo (contratista) paga después de que el contratista que usted recomendó se suscribe a Trade Pro y su pago se acredita. La vía de reconocimiento (proyecto) empieza cuando la solicitud de propuestas se publica y paga en visibilidad: su nombre en cada solicitud de propuestas que aporte, además de un lugar en la clasificación Top Connectors.",
    trade: {
      kicker: "Vía de ingresos directos",
      title: "Recomendar a un contratista",
      amount: "Hasta ${fee} {currency}",
      body: "Recomiende a una empresa de oficios o de servicios. ${fee} por un plan anual de Trade Pro, pagados unos 30 días después de que se acredite su pago; ${feeMonthly} por un plan mensual, después de que se acredite su tercer pago mensual. Por transferencia electrónica Interac.",
      cta: "Recomendar a un contratista",
    },
    project: {
      kicker: "Vía de reconocimiento",
      title: "Recomendar un proyecto",
      amount: "Reconocimiento público + clasificación",
      body: "Recomiende un proyecto inmobiliario (reparaciones antes de la venta, mantenimiento, obras de capital). Cuando la solicitud de propuestas se publique, su nombre aparecerá en el anuncio como el conector y usted subirá en la clasificación Top Connectors. Sin efectivo, solo visibilidad real.",
      cta: "Recomendar un proyecto",
    },
    whyLabel: "Por qué dos vías:",
    whyBody:
      "las suscripciones de los contratistas son los ingresos directos de PMRFP, así que la vía de contratistas paga en efectivo. Las recomendaciones de proyectos crean el inventario que retiene a los contratistas que pagan (un valor real, pero indirecto), así que las recompensamos con reconocimiento (mención pública + clasificación) en lugar de efectivo. Ninguna de las dos vías tiene límite ni requiere registro. La mención visible en la solicitud de propuestas publicada es lo más valioso que puede acompañar a su nombre en esta red.",
  },

  referTrade: {
    meta: {
      title: "Recomiende a un contratista: gane hasta ${fee} cuando se una a Trade Pro",
      description:
        "¿Conoce a un contratista comercial que se beneficiaría de aparecer en PMRFP? Recomiéndelo y gane hasta ${fee} {currency} después de que se acredite su pago de Trade Pro.",
    },
    eyebrow: "Recomendación de contratista · vía de ingresos directos",
    titleLine1: "Recomiende a un contratista.",
    titleLine2: "{earn} cuando se una a Trade Pro.",
    titleEarn: "Gane hasta ${fee}",
    lead: "¿Conoce a una empresa comercial de oficios o de servicios que debería aparecer en PMRFP? Recomiéndela. Cuando se suscriba a Trade Pro y su pago se acredite, usted gana una comisión por referido por transferencia electrónica Interac: ${fee} {currency} por un plan anual, ${feeMonthly} por un plan mensual.",
    cta: "Recomendar a un contratista",
    projectLink: "¿Tiene más bien un proyecto? Recomiéndelo y obtenga reconocimiento público →",
    offerKicker: "Comisión por referido",
    offerAmount: "Hasta ${fee} {currency}",
    offerLines: [
      "· ${fee} en efectivo por cada suscripción anual a Trade Pro recomendada",
      "· ${feeMonthly} por cada suscripción mensual recomendada, después de que se acredite su 3.er pago",
      "· anual: se paga unos 30 días después de que se acredite su pago",
      "· por transferencia electrónica Interac, una vez liquidada (sin disputas)",
    ],
    steps: [
      {
        title: "Cuéntenos sobre el contratista",
        desc: "Nombre de la empresa, ubicación, a qué se dedica y (si lo tiene) su contacto. Dos minutos.",
      },
      {
        title: "Lo invitamos a registrarse",
        desc: "PMRFP se comunica con la empresa, la ayuda a crear su perfil en el directorio y le explica Trade Pro.",
      },
      {
        title: "Hasta ${fee} cuando la suscripción se mantiene",
        desc: "Trade Pro anual: sus ${fee} {currency} se pagan por transferencia electrónica Interac unos 30 días después de que se acredite su pago. Trade Pro mensual: ${feeMonthly} después de que se acredite su tercer pago mensual. En ambos casos se paga una vez liquidada, sin reembolso ni disputa.",
      },
    ],
    whoEyebrow: "Quién recomienda contratistas",
    whoTitle: "Cualquier persona que conozca a un contratista canadiense que haga trabajo comercial.",
    who: [
      {
        title: "Administradores de propiedades",
        body: "Recomiende a los contratistas con los que realmente trabaja. Fortalece su lista de proveedores y les da un historial documentado. Si su empleador restringe los pagos por recomendación, rechace la comisión y, en su lugar, le daremos el crédito con su nombre.",
      },
      {
        title: "Otros contratistas",
        body: "Recomiende a colegas de oficios afines (HVAC ↔ electricidad, techado ↔ impermeabilización). Hasta ${fee} por cada suscripción Pro recomendada se acumula rápido.",
      },
      {
        title: "Proveedores y distribuidores",
        body: "Sus clientes contratistas deberían aparecer donde llegan las solicitudes de propuestas comerciales. Recomiéndelos y gane la comisión.",
      },
      {
        title: "Asociaciones de oficios",
        body: "Presente a sus miembros en bloque. Cada activación anual de Pro paga ${fee}. Podemos hacer comarketing con sus listas de miembros.",
      },
      {
        title: "Consultores de la industria",
        body: "Usted sabe quién está creciendo y quién está contratando. Diríjalos a PMRFP para que ganen visibilidad y gane con cada registro.",
      },
      {
        title: "Cualquiera que conozca a un buen contratista",
        body: "¿El contratista de la familia? ¿El techador del vecino? Si hacen trabajo comercial en Canadá, recomiéndelos.",
      },
    ],
    whyEyebrow: "Por qué esta vía paga en efectivo y la de proyectos no",
    whyTitle: "Cuentas honestas. Efectivo donde hay ingresos, reconocimiento donde no los hay.",
    why: [
      {
        strong: "Una nueva suscripción a Trade Pro son ${annual} al año (o ${monthly} al mes)",
        rest: " en ingresos directos para PMRFP. La comisión de ${fee} solo aplica a los planes anuales, y la espera de unos 30 días garantiza que el pago se haya acreditado antes de que salga. Los planes mensuales ganan ${feeMonthly}, que se liberan después del tercer pago mensual; así nunca pagamos más de lo que hemos cobrado.",
      },
      {
        strong: "Las recomendaciones de proyectos crean inventario, pero no ingresos directos,",
        rest: " así que las recompensamos con reconocimiento público en la solicitud de propuestas y un lugar en la clasificación Top Connectors: visibilidad real, no efectivo.",
      },
      {
        strong: "Sin límite de recomendaciones.",
        rest: " Recomiende a 1 o a 50: la misma comisión por recomendación. Las empresas de administración de propiedades con más de 30 proveedores en su lista pueden generar ingresos reales con solo presentar a los que más se beneficiarían.",
      },
      {
        strong: "Pago limpio.",
        rest: " En cuanto se acredita el pago que califica del contratista recomendado, sale su transferencia electrónica Interac. Sin vueltas con pagos trimestrales.",
      },
    ],
    quote:
      "El trato honesto: ganamos dinero cuando los contratistas se suscriben. Por eso le pagamos por traernos a los contratistas que vale la pena suscribir. Comisión más alta, pago más rápido, línea directa.",
    formEyebrow: "Recomendar a un contratista",
    formTitle: "Dos minutos. Gane hasta ${fee} cuando se una a Trade Pro.",
    formLead:
      "Cuéntenos sobre el contratista. Si tiene sus datos de contacto y permiso para compartirlos, agréguelos. Si no, deje los campos en blanco y trabajaremos con usted para hacer la presentación.",
    terms:
      "Comisiones por referido: ${fee} por un plan anual de Trade Pro, pagados unos 30 días después de que se acredite el pago del contratista recomendado; ${feeMonthly} por un plan mensual, pagados después de que se acredite el tercer pago mensual; en ambos casos, una vez liquidado, sin reembolso ni disputa. Las autorrecomendaciones y los duplicados no son elegibles; cuenta la primera presentación documentada. PMRFP no garantiza que ningún contratista recomendado se suscriba o siga suscrito.",
  },

  referProject: {
    meta: {
      title: "Recomiende un proyecto: reconocimiento público + clasificación Top Connectors",
      description:
        "¿Conoce a alguien con un proyecto inmobiliario? Recomiéndelo a PMRFP. Cuando la solicitud de propuestas se publique, obtendrá reconocimiento público (“Presentado por [usted]”) y un lugar en la clasificación Top Connectors. Si prefiere efectivo, recomiende a un contratista a Trade Pro (hasta ${fee}).",
    },
    eyebrow: "Recomendación de proyecto · vía de reconocimiento",
    titleLine1: "Presente un proyecto.",
    titleLine2: "{credit} cuando la solicitud de propuestas se publique.",
    titleCredit: "Obtenga reconocimiento",
    lead: "¿Conoce a alguien con un proyecto inmobiliario, como reparaciones antes de la venta, mantenimiento de un portafolio u obras de capital? Recomiéndelo a PMRFP. Le ayudaremos a estructurar la solicitud de propuestas y a publicarla. Su nombre aparece en el anuncio como el conector que la trajo, y usted sube en la clasificación Top Connectors. Visibilidad real en la red que le importa.",
    cta: "Recomendar un proyecto",
    cashLink: "¿Prefiere efectivo? Recomiende a un contratista →",
    offerKicker: "Lo que obtiene",
    offerTitle: "Reconocimiento público + clasificación",
    offerLines: [
      "· “Presentado por [usted]” en cada solicitud de propuestas publicada que aporte",
      "· suba en la clasificación Top Connectors en /refer/leaderboard",
      "· su empresa o afiliación junto a su nombre (opcional)",
      "· un correo mensual con el resumen de todas las solicitudes de propuestas que recomendó",
    ],
    cashNote: "¿Prefiere efectivo? La {link} por cada suscripción a Trade Pro.",
    cashNoteLink: "vía Recomendar a un contratista paga hasta ${fee}",
    steps: [
      {
        title: "Cuéntenos sobre el proyecto",
        desc: "Describa el trabajo, la ubicación y quién es el contacto de la propiedad. Dos minutos.",
      },
      {
        title: "Estructuramos y publicamos la solicitud de propuestas",
        desc: "PMRFP redacta un alcance claro y publica la solicitud de propuestas para contratistas canadienses calificados.",
      },
      {
        title: "Reconocimiento público + lugar en la clasificación",
        desc: "Cuando la solicitud de propuestas se publica, “Presentado por [usted]” aparece en el anuncio y su nombre sube en la clasificación Top Connectors. Reconocimiento donde miran las personas que a usted le interesa conocer.",
      },
    ],
    whoEyebrow: "Quién recomienda proyectos",
    whoTitle: "Pensado para los profesionales que se enteran del trabajo en propiedades antes que nadie.",
    who: [
      {
        title: "Agentes inmobiliarios",
        body: "Reparaciones antes de la venta, puesta a punto después de la venta y recomendaciones de obras de capital del lado del vendedor.",
      },
      {
        title: "Corredores hipotecarios",
        body: "Reparaciones previas al financiamiento señaladas en la tasación, sin perder la operación.",
      },
      {
        title: "Abogados de bienes raíces",
        body: "Limpieza de sucesiones, trabajos en propiedades en sucesión y correcciones después del cierre.",
      },
      {
        title: "Corredores de seguros",
        body: "Reparaciones relacionadas con reclamos, donde importa la rapidez de un contratista verificado.",
      },
      {
        title: "Administradores de propiedades",
        body: "Recomendaciones entre colegas cuando el alcance supera su lista de proveedores o cuando usted no tiene capacidad.",
      },
      {
        title: "Cualquier persona con un proyecto",
        body: "Propietarios, vecinos, familia: si sabe de un trabajo que hay que hacer, recomiéndelo.",
      },
    ],
    whyEyebrow: "Por qué recomendar",
    whyTitle: "Ayude a su cliente. Obtenga reconocimiento. Manténgase informado.",
    why: [
      {
        strong: "Primero, ayude a su cliente.",
        rest: " Su proyecto recibe ofertas verificadas rápido: mejor resultado, relación más sólida.",
      },
      {
        strong: "Obtenga reconocimiento público.",
        rest: " “Presentado por [usted]” aparece en la solicitud de propuestas publicada: la mención de conector por la que la mayoría de los profesionales pagaría. Su nombre sube en la clasificación Top Connectors.",
      },
      {
        strong: "Sin tener que dar seguimiento.",
        rest: " Un correo mensual le indica en qué punto está cada proyecto recomendado.",
      },
      {
        strong: "Dele a su cliente un proceso real.",
        rest: " Una forma documentada de invitar a los contratistas indicados, en lugar de recomendar a “un conocido”. Los clientes siguen eligiendo y verificando a quién contratan.",
      },
      {
        strong: "Reconocimiento público opcional.",
        rest: " “Presentado por [usted]” en la solicitud de propuestas: visibilidad ante los contratistas de su zona.",
      },
    ],
    quote:
      "La jugada inteligente para cualquier profesional que trabaja con bienes raíces pero no vende servicios de oficios: ser la persona que sabía cómo lograr que se hiciera el trabajo. Nosotros nos encargamos del proceso. Usted se lleva el reconocimiento por la presentación.",
    formEyebrow: "Recomendar un proyecto",
    formTitle: "Dos minutos. Obtenga reconocimiento cuando la solicitud de propuestas se publique.",
    formLead:
      "Cuéntenos sobre el proyecto. Si tiene los datos del contacto de la propiedad y permiso para compartirlos, agréguelos. Si no, déjelos en blanco y trabajaremos con usted para hacer la presentación.",
    terms:
      "Las recomendaciones de proyectos otorgan reconocimiento público en la solicitud de propuestas y un lugar en la clasificación Top Connectors, no efectivo. La vía que paga en efectivo es /refer-a-trade (hasta ${fee} por suscripción a Trade Pro). PMRFP no garantiza trabajo ni la selección de proveedores. Los contratistas y los contactos de las propiedades toman sus propias decisiones.",
  },

  getFound: {
    meta: {
      title: "Hágase encontrar: visibilidad SEO e IA para contratistas",
      description:
        "Su empresa en las páginas por oficio y ciudad que los administradores de propiedades encuentran en Google, y en las respuestas de IA. Perfiles de miembros de PMRFP han llegado al top 10 de Google en sus categorías.",
    },
    crumbHome: "Inicio",
    crumbPage: "Hágase encontrar",
    faqs: [
      {
        q: "¿Qué obtengo realmente con una Ficha SEO?",
        a: "Presencia en las páginas de PMRFP que los administradores de propiedades encuentran cuando buscan su oficio en su ciudad, además de su propia página de perfil con sus servicios, zonas de servicio y calificación de Google. Los buscadores y los asistentes de IA leen estas páginas porque están estructuradas en torno a los datos y se mantienen honestas: una página solo existe donde hay empresas reales registradas.",
      },
      {
        q: "¿Y la parte de IA (AEO)?",
        a: "Cuando alguien le pregunta a ChatGPT o a la IA de Google por “contratistas de techado comercial en Mississauga”, los motores toman la información de páginas estructuradas y verificables. PMRFP publica datos legibles por máquinas (marcado schema.org en cada página, un índice llms.txt) y pruebas concretas como casos de estudio de proyectos: el tipo de contenido que citan los motores de respuesta.",
      },
      {
        q: "¿Garantizan posiciones?",
        a: "No. Nadie puede hacerlo con honestidad. Lo que sí controlamos: páginas reales, datos estructurados reales, pruebas reales de proyectos y un directorio que Google ya ubica en el top 10 para varios perfiles de miembros. Lo que no controlamos: Google.",
      },
      {
        q: "¿En qué se diferencia de Trade Pro?",
        a: "La Ficha SEO es solo visibilidad. Trade Pro (${annual} al año) agrega el tablero de solicitudes de propuestas: vea los proyectos publicados, reciba alertas de coincidencias y manifieste interés. Puede empezar con visibilidad y mejorar su plan en cualquier momento.",
      },
    ],
    eyebrow: "Para contratistas y empresas de servicios",
    title: "Hágase encontrar en Google y en las respuestas de IA.",
    lead: "Los administradores de propiedades no recorren directorios por gusto. Buscan: en Google y, cada vez más, preguntándole a la IA. PMRFP pone a su empresa en las páginas que ambos realmente leen: páginas por oficio y ciudad con empresas reales, proyectos reales y datos estructurados en cada una.",
    listFree: "Regístrese gratis",
    seePricing: "Ver precios",
    proofTitle: "Pruebas, no promesas",
    proofs: [
      {
        stat: "Top 10",
        line: "Posiciones de Google alcanzadas por páginas de perfil de miembros en sus categorías (Search Console, últimos 90 días).",
      },
      {
        stat: "Página 1",
        line: "posiciones que ocupan nuestras guías de costos comerciales, las páginas donde los administradores de propiedades investigan presupuestos.",
      },
      {
        stat: "Cada página",
        line: "incluye datos estructurados schema.org, y el sitio publica un índice llms.txt para los rastreadores de IA.",
      },
    ],
    proofNote:
      "Las posiciones varían según la búsqueda y la región, y no están garantizadas. Consulte las preguntas frecuentes para ver lo que controlamos y lo que no.",
    ladderTitle: "Cómo funciona la escalera de visibilidad",
    tiers: {
      free: {
        name: "Ficha gratuita",
        price: "$0",
        lines: [
          "Perfil de la empresa en el directorio",
          "Aparezca en las búsquedas por categoría y región del sitio",
          "Envíe casos de estudio de proyectos",
        ],
      },
      seo: {
        name: "Ficha SEO",
        price: "${seoAnnual} al año",
        badge: "o ${seoMonthly} al mes",
        lines: [
          "Presencia en las páginas de su oficio y su ciudad, las que Google indexa",
          "Galería ilimitada de fotos de proyectos en su perfil",
          "Calificación de Google en su perfil (datos oficiales de Places)",
          "Casos de estudio destacados en las páginas de su ciudad",
          "Prioridad de orden sobre las fichas gratuitas",
        ],
      },
      pro: {
        name: "Trade Pro — ${annual} al año",
        lines: [
          "Todo lo incluido en la Ficha SEO",
          "Acceso completo al tablero de solicitudes de propuestas + alertas de coincidencias",
          "Manifieste interés en los proyectos publicados",
        ],
      },
    },
    ladderNote:
      "Empiece gratis hoy y mejore su plan desde su panel cuando los niveles de pago le convengan. Los casos de estudio y un perfil completo hacen más por su visibilidad que cualquier nivel por sí solo.",
    faqTitle: "Preguntas frecuentes",
    ctaTitle: "Esté en la página que encuentran.",
    ctaBody:
      "Registre su empresa gratis en minutos. Agregue un caso de estudio y ya estará por delante de la mayor parte de su competencia.",
    ctaSecondary: "Ver casos de estudio de miembros",
  },

  services: {
    meta: {
      title: "Servicios para contratistas: pagos con tarjeta y un sitio web creíble",
      description:
        "Dos servicios que recomendamos a los contratistas en PMRFP: aceptar pagos con tarjeta en la obra con Cleverpays, y un sitio web, una marca y un perfil de Google de Talkerstein Consulting Group.",
    },
    eyebrow: "Servicios para contratistas",
    title: "Cobre en la obra. Luzca profesional en línea.",
    lead: "Ganar el trabajo es solo la mitad. Estos son dos servicios que recomendamos a los contratistas: aceptar pagos con tarjeta en el sitio, y un sitio web y un perfil de Google que hagan que los administradores de propiedades levanten el teléfono.",
    disclosureLabel: "Divulgación:",
    disclosure:
      "PMRFP tiene una relación comercial con las dos empresas de esta página. Talkerstein Consulting Group es una empresa afiliada a PMRFP.",
    partners: {
      cleverpays: {
        headline: "Acepte pagos con tarjeta en la obra",
        blurb:
          "Procesamiento de pagos para empresas canadienses, en inglés y francés. Para los contratistas, lo útil es cobrar antes de irse de la obra en lugar de andar detrás de un cheque.",
        serves: "Canadá",
        cta: "Visitar Cleverpays",
        points: [
          { t: "Pagos en persona para equipos móviles", d: "Terminales de tarjeta portátiles que su equipo puede llevar a la obra." },
          {
            t: "Pagos con tarjeta por teléfono o en el navegador",
            d: "Una terminal virtual para cobrar la tarjeta de un cliente a distancia, sin necesidad de un dispositivo.",
          },
          { t: "Facturas que los clientes pueden pagar", d: "Envíe una factura con una forma de pagarla en cuanto llegue." },
          {
            t: "Revisión de estados de cuenta",
            d: "Envíe su estado de cuenta de procesamiento actual y pida a un especialista que revise los cargos.",
          },
        ],
      },
      talkerstein: {
        headline: "Luzca creíble en línea",
        blurb:
          "Los administradores de propiedades lo investigan antes de llamar. Talkerstein prepara por usted las piezas que hacen que un contratista se vea establecido. Con sede en Toronto.",
        serves: "Con sede en Toronto",
        cta: "Visitar Talkerstein",
        points: [
          { t: "Un sitio web que convierte visitas en llamadas", d: "Muestra su trabajo, sus servicios y sus credenciales." },
          { t: "Marca y logotipo", d: "Una identidad limpia que los administradores de propiedades toman en serio." },
          {
            t: "Perfil de Empresa de Google",
            d: "Configurado para que los compradores locales lo encuentren cuando buscan su oficio.",
          },
          { t: "Ayuda con ofertas para licitaciones públicas", d: "Apoyo para preparar una oferta para una licitación del gobierno." },
        ],
      },
    },
    sellEyebrow: "¿Vende a contratistas?",
    sellTitle: "Llegue a contratistas de todo Canadá y EE. UU.",
    sellBody:
      "Si su empresa vende a contratistas comerciales, por ejemplo seguros, fianzas, software o equipos, hable con nosotros sobre un espacio en esta página.",
    contactUs: "Contáctenos",
  },

  review: {
    metaTitle: "Deje una reseña",
    usedTitle: "Este enlace de reseña ya se usó",
    brokenTitle: "Este enlace de reseña no funciona",
    usedBody: "Cada enlace funciona una sola vez, y ya se envió una reseña con este. Gracias por tomarse el tiempo.",
    brokenBody: "Es posible que ya se haya usado o que se haya copiado solo en parte. Vuelva a intentarlo con el botón del correo.",
    mistake: "¿Cree que es un error? Escriba a {email}.",
    goHome: "Ir a PMRFP",
    eyebrow: "Solicitud de reseña",
    title: "¿Cómo le fue con {trade}?",
    intro: "{trade} le pidió su reseña honesta sobre este trabajo. Toma unos dos minutos.",
    by: "por {trade}",
  },

  kept: {
    metaTitle: "Anuncio de solicitud de propuestas actualizado",
    ok: {
      title: "Su anuncio vuelve a estar publicado",
      body: "Gracias. Su solicitud de propuestas volvió al tablero público y extendimos su fecha límite. Cuando esta pase, volveremos a consultarle.",
      bodyDays:
        "Gracias. Su solicitud de propuestas volvió al tablero público y extendimos su fecha límite {days} días. Cuando esta pase, volveremos a consultarle.",
    },
    notlive: {
      title: "Esta solicitud de propuestas ya está cerrada",
      body: "Este anuncio fue adjudicado, cerrado o archivado, así que no hay nada que mantener publicado. Puede publicar una nueva solicitud de propuestas en cualquier momento desde su panel.",
    },
    invalid: {
      title: "Ese enlace no es válido",
      body: "Este enlace para mantener el anuncio publicado no corresponde a ningún anuncio vigente. Vaya a su panel para administrar sus solicitudes de propuestas.",
    },
    error: {
      title: "Algo salió mal",
      body: "No pudimos actualizar su anuncio en este momento. Inténtelo de nuevo o adminístrelo desde su panel.",
    },
    cta: "Ir a mis solicitudes de propuestas",
  },

  offline: {
    title: "No tiene conexión",
    body: "PMRFP necesita conexión para cargar esta página. Revise su Wi-Fi o sus datos móviles e inténtelo de nuevo.",
    note: "No se pierde nada. Sus solicitudes de propuestas y su trabajo guardado estarán aquí cuando vuelva a tener conexión.",
    tryAgain: "Intentar de nuevo",
  },

  suspended: {
    metaTitle: "Cuenta suspendida",
    title: "Su cuenta está suspendida",
    body: "El acceso a esta cuenta está en pausa por ahora. Si cree que se trata de un error, contáctenos en {email}.",
    back: "← Volver a PMRFP",
  },
};

export default { en, fr, es };
