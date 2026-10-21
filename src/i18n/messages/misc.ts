/**
 * Server strings for the small public pages: about, contact, legal (terms,
 * privacy, disclaimer), the referral pages, get-found, services-for-trades,
 * the review link, the RFP keep-alive landing, offline and suspended.
 * `fr` is typed against `en`, so every key must exist in both.
 *
 * Placeholders are filled from lib/site.ts at render time so the English
 * copy stays identical: {fee} REFERRAL.tradeFee, {feeMonthly}
 * REFERRAL.tradeFeeMonthly, {currency}, {annual} PRICING.proAnnual,
 * {monthly} PRICING.proMonthly, {featuredAnnual} PRICING.featuredAnnual, {email} SITE.email.
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

/**
 * One section of a legal page: paragraphs, an optional bullet list, then more
 * paragraphs. Tokens such as {privacyEmail} or {corrections} become links on
 * the page (see `legal.links`).
 */
export type LegalBlock = { title: string; body: string[]; list?: string[]; after?: string[] };

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

  /**
   * Shared by terms, privacy, disclaimer, /corrections and /forum/rules.
   * In legal text, {privacyEmail} {email} {corrections} {forumRules}
   * {privacyLink} {termsLink} become links on the page (labels in `links`).
   */
  legal: {
    eyebrow: "Legal",
    lastUpdated: "Last updated: {date}",
    /** Shown at the top of translated legal pages only; empty in English. */
    translationNote: "",
    links: {
      corrections: "Corrections and removal policy",
      forumRules: "Forum rules",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
    },
  },

  terms: {
    meta: { title: "Terms of Service", description: "The terms governing your use of PMRFP." },
    title: "Terms of Service",
    intro: [
      "These Terms of Service (the “Terms”) are an agreement between you and Talkerstein Consulting Group, which operates PMRFP at pmrfp.com (“PMRFP”, “we”, “us”). Please read them with our {privacyLink}, which explains how we handle personal information.",
    ],
    acceptance: {
      title: "Acceptance of Terms",
      body: [
        "By accessing or using PMRFP (the “Service”), you agree to be bound by these Terms. If you do not agree to these Terms, you may not use the Service. These Terms apply to all users, including trade companies, suppliers, contractors, tradespeople, property managers, builders, realtors and building owners.",
        "If you use the Service on behalf of a company, you accept these Terms for that company and confirm that you are authorized to do so.",
      ],
    },
    description: {
      title: "Description of Service",
      body: [
        "PMRFP is a platform for posting RFPs and finding trades, serving the commercial property market in Canada and the United States. The Service allows trade companies to publish profiles and monitor opportunities, and allows property managers, builders and owners to post requests for proposals (RFPs) and discover vendors. It also republishes public tenders, contract awards and related project data from government sources, and offers paid plans and tools described below.",
        "We are not a broker, procurement agent or legal advisor, and we do not act on behalf of either party. We are not a party to any contract between users. A company marked verified has been reviewed by the PMRFP team; otherwise we don't check licences, insurance or qualifications, so confirm them directly for your project.",
      ],
    },
    accounts: {
      title: "Accounts & Eligibility",
      body: [
        "You must provide accurate, complete information when creating an account and keep it up to date. You are responsible for safeguarding your account credentials and for all activity that occurs under your account. You must be authorized to act on behalf of any company you represent on the Service.",
      ],
    },
    billing: {
      title: "Subscriptions & Billing",
      withMonthly:
        "Trade Pro is offered on two billing intervals: ${annual} {currency} per year (annual), or ${monthly} {currency} per month (monthly). Each renews automatically at the end of the current term unless cancelled. You may cancel at any time; cancellation takes effect at the end of your current billing period, and you retain access until then. Fees are non-refundable except where required by law. We may change pricing on a prospective basis with reasonable notice. You may switch between annual and monthly via your billing portal; switching takes effect at the end of your current billing period.",
      annualOnly:
        "Trade Pro is offered at ${annual} {currency} per year and renews automatically at the end of each annual term unless cancelled. You may cancel at any time; cancellation takes effect at the end of your current billing period, and you retain access until then. Fees are non-refundable except where required by law. We may change pricing on a prospective basis with reasonable notice.",
      body: [
        "Other paid plans (such as Featured, SEO Listing, Realtor Pro, Award Intelligence and sponsorships) are billed at the price, currency and interval shown on the plan's page and at checkout. Recurring plans renew automatically at the end of each billing period until you cancel. Prices and any applicable taxes are as shown at checkout.",
        "Payments are processed by Stripe. To cancel, use the billing portal in your dashboard (Billing) or email us at {email} before your renewal date. Cancelling stops future renewals; it does not refund the current period. Price changes apply from your next renewal, not to a period you have already paid for.",
        "Except as stated in the Founding 500 terms below, or where the law requires a refund, fees are non-refundable.",
      ],
      free: "Property managers, builders, and owners may post RFPs at no cost. Free directory listings are available to trade companies without a paid subscription.",
    },
    trial: {
      title: "Free Trade Pro Trial",
      body: [
        "Trade companies may start one free 14-day Trade Pro trial per organization. No payment card is needed. During the trial the organization has Trade Pro features. When the 14 days end, the organization returns to the free plan automatically. Nothing is charged at the end of a trial, and nothing is billed unless you choose to subscribe. An organization that has already had a trial, or that already pays for Trade Pro, can't start another.",
      ],
    },
    founding: {
      title: "Founding 500 Lifetime Offer",
      body: [
        "The Founding 500 offer gives one organization Trade Pro for a single payment. It is subject to the plain-English terms below, which form part of these Terms.",
      ],
      after: [
        "In these Terms, “lifetime” refers to the life of the Trade Pro service as PMRFP operates it, not the lifetime of any person or of your organization. Founding access belongs to the one organization that bought it and cannot be transferred, resold or moved to another organization or account.",
      ],
    },
    intel: {
      title: "Award Intelligence",
      body: [
        "Award Intelligence is a paid add-on that organizes public contract award records into company and buyer profiles, market share tables, renewal estimates and, where a source publishes them, lists of the bids received.",
        "It is built only from public records and is provided for information. Award values are as disclosed by the buyer. Contract end dates and likely re-tender windows are often estimates (for example, an award date plus a typical term) and are labelled as such. Bid lists are unofficial, are shown as published by the source with an as-of date, and never say why a bid was or wasn't chosen; the buyer's official record governs. We don't guarantee that any record is complete, current or accurate, or that a contract will be re-tendered.",
      ],
    },
    sponsored: {
      title: "Sponsored & Paid Placements",
      body: [
        "Some placements on PMRFP are paid. Sponsorships carry a “Sponsored” label in the reader's language and their links are marked as sponsored; Featured listings are ranked ahead of standard listings because the company pays for it. A paid placement is not an endorsement or a verification by PMRFP. Sponsors are responsible for their own content and offers.",
      ],
    },
    publicData: {
      title: "Public Records & Data Accuracy",
      body: [
        "Public tenders, contract awards, bid results, permits and major-project data on PMRFP come from government and other public sources, under the open-data licences or terms of use that apply to each source. We republish them largely as the source published them, sort them by trade and region, and link to the official notice where one exists.",
        "These records may be incomplete, out of date or contain errors made by the source or by us. Always check the official notice or the buyer's portal before you bid, sign or rely on any figure. You always bid through the buyer's own process, never through PMRFP. To report an error or ask for a removal, see our {corrections}.",
      ],
    },
    insights: {
      title: "Insights, Benchmarks & AI-Assisted Tools",
      body: [
        "Insights, price benchmarks, reports, renewal estimates, rankings and similar figures are computed from public records and other data on the Service. They are informational only. They are not financial, legal, accounting, engineering or other professional advice, and they are not a promise of any price, result or award. Some text may be drafted with automated tools, including AI.",
        "AI-assisted tools (such as the RFP Writer and bid checklists) can produce incomplete or wrong output. Review everything they produce, and get professional advice where you need it, before you use it.",
      ],
    },
    noGuarantee: {
      title: "No Guarantee of Work",
      body: [],
    },
    use: {
      title: "Acceptable Use",
      body: [
        "You agree not to misuse the Service, including by posting false, misleading, defamatory, spam, infringing, or unlawful content; posting other people's personal information without a right to do so; scraping or harvesting data; attempting to gain unauthorized access; or using the Service to harass other users. We may edit, reject, or remove content that violates these Terms.",
      ],
    },
    content: {
      title: "Content & Listings",
      body: [
        "You retain ownership of the content you submit, and you grant PMRFP a non-exclusive licence to host, display, and distribute that content as needed to operate the Service. You are solely responsible for the accuracy and legality of your listings, profiles, RFPs, reviews, forum posts and photos, and you confirm you have the rights to post them. We may moderate, edit, or remove listings that are incomplete, misleading, spam, or inappropriate.",
        "Content posted by users reflects the views of its authors, not PMRFP. We don't review all content before it appears.",
      ],
    },
    takedown: {
      title: "Reporting Content & Takedown Requests",
      body: [
        "If you believe content on PMRFP is inaccurate, infringes your rights (including copyright), is defamatory, or exposes personal information, tell us. Use the report link where one is shown, or email {privacyEmail} with:",
      ],
      list: [
        "the page address (URL) and the specific content;",
        "why you believe it is wrong, unlawful or infringing, and any supporting evidence;",
        "for a copyright or other rights claim, the work or right concerned and confirmation that you own it or are authorized to act for the owner;",
        "your name and how to reach you.",
      ],
      after: [
        "We review notices in good faith and may remove, hide, correct or annotate content, or leave it up where we conclude it is accurate and lawful. Where appropriate we tell the person who posted it. How we handle errors and removals in public-record data is set out in our {corrections}.",
      ],
    },
    forum: {
      title: "Forum",
      body: [
        "Posting in the PMRFP forum is subject to our {forumRules}, which form part of these Terms. Moderators may hide posts, lock threads and stop an account from posting when the rules are broken.",
      ],
    },
    liability: {
      title: "Limitation of Liability",
      body: [
        "To the maximum extent permitted by law, PMRFP and its affiliates are not liable for any indirect, incidental, consequential, or punitive damages, or for lost profits, revenue, data, or business opportunities, arising from your use of the Service. The Service is provided “as is” and “as available” without warranties of any kind.",
        "This includes decisions you make based on public-record data, insights, benchmarks or AI-assisted output, and dealings between users. Nothing in these Terms excludes liability that cannot be excluded by law.",
      ],
    },
    indemnity: {
      title: "Your Responsibility for Your Content",
      body: [
        "To the extent permitted by law, you agree to be responsible for, and to compensate us for, claims made by others that arise from content you post or from your breach of these Terms. This does not apply to the extent a claim is caused by our own fault.",
      ],
    },
    termination: {
      title: "Termination",
      body: [
        "We may suspend or terminate your access to the Service at any time if you violate these Terms or if we discontinue the Service. You may stop using the Service and close your account at any time.",
      ],
    },
    law: {
      title: "Governing Law & Courts",
      body: [
        "These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there. Subject to the next section, any dispute about these Terms or the Service will be heard by the courts of Ontario sitting in Toronto, and you and we agree to their jurisdiction.",
      ],
    },
    consumer: {
      title: "Your Rights as a Consumer",
      body: [
        "Nothing in these Terms limits any right you have under consumer protection law that cannot be waived or limited by contract. If you are a consumer in Québec, the Consumer Protection Act (Québec) applies to you, and any clause of these Terms that it prohibits does not apply to you; this includes your right to bring proceedings before the courts of Québec. Consumers in other provinces, states or countries keep the mandatory protections of the law where they live.",
      ],
    },
    language: {
      title: "Language",
      body: [
        "These Terms, the Privacy Policy and related documents are available in English and in French (pmrfp.com/fr/terms). The parties have expressly wished that these Terms and all related documents be available in English and in French. Les parties ont expressément souhaité que les présentes conditions et tous les documents qui s'y rattachent soient offerts en anglais et en français. The English and French versions are equally authoritative. The Spanish version is a translation for information only; if it differs from the English version, the English version prevails.",
      ],
    },
    changes: {
      title: "Changes to These Terms",
      body: [
        "We may update these Terms from time to time. When we make material changes, we will update the “last updated” date above and, where appropriate, provide additional notice. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms. A change to a price or plan you have already paid for applies only from your next renewal.",
      ],
    },
    contact: { title: "Contact", body: "Questions about these Terms? Reach us at {email}." },
  },

  privacy: {
    meta: { title: "Privacy Policy", description: "How PMRFP collects, uses, and protects your information." },
    title: "Privacy Policy",
    intro: [
      "PMRFP respects your privacy. This policy explains what information we collect, how we use it, who we share it with, and the choices and rights you have. It is written to meet Canada's Personal Information Protection and Electronic Documents Act (PIPEDA) and Québec's Act respecting the protection of personal information in the private sector (as amended by Law 25).",
    ],
    officer: {
      title: "Who Is Responsible",
      body: [
        "PMRFP is operated by Talkerstein Consulting Group, which is responsible for the personal information described in this policy. Our Privacy Officer oversees how we protect it and handles privacy requests and complaints:",
      ],
      lines: [
        "Privacy Officer, Talkerstein Consulting Group",
        "{privacyEmail}",
        "c/o Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5",
      ],
    },
    sections: [
      {
        title: "Who This Policy Covers",
        body: [
          "This policy covers members (trade companies, suppliers, property managers, realtors, tradespeople and other account holders), visitors to pmrfp.com, people who sign up for our emails, job applicants who apply through PMRFP, people who contact us, and people whose information appears in the public records we republish.",
        ],
      },
      {
        title: "Information You Give Us",
        body: ["We collect the information you provide directly, including:"],
        list: [
          "Account details: your name, email address, phone number, role and password (or your Google account name and email if you sign in with Google).",
          "Company details: company name, contact details, trades, service regions, profile text, photos, projects and case studies.",
          "Activity on the Service: RFPs you post, interest you express in an RFP, saved RFPs, reviews, forum posts, photos and votes, marketplace and job listings.",
          "Job applications: the name, contact details and message you send, which go to the employer you apply to.",
          "Tradesperson profiles: your display name, trade, region, city, experience, tickets (certifications), availability, pay expectations, bio and phone number. You choose whether the profile is published and whether your contact details are visible.",
          "Messages to us: contact-form messages, bid-support requests and emails.",
          "Text you enter into our AI-assisted tools (such as the RFP Writer).",
          "Billing: payments are handled by Stripe. We receive your billing contact, plan, amounts and payment status, not your full card number.",
        ],
      },
      {
        title: "Information From Public Records",
        body: [
          "PMRFP republishes public tender notices, contract award records, bid results, building permits and major-project data from government open-data portals and other public sources, under the open-data licences or terms of use that apply to each source. These records can include business names, the buyer's contact details as the buyer published them (sometimes the name, work email and work phone of a procurement contact), contract and bid amounts, and project locations.",
          "We publish business names only. When a winner or bidder name looks like a private individual's name (a person's name with no business word or legal suffix), we don't publish the name: the record is counted and shown as “Individual (not named)” or “Individual bidder (not named)”. A trading name that includes a person's name together with a business word (for example “Jean Tremblay Excavation”) is a business name and is shown as published. This is an automated rule; if it gets something wrong, or you want a record about you corrected or removed, see our {corrections}.",
        ],
      },
      {
        title: "Information Collected Automatically",
        body: ["When you use the Service, we and our providers collect limited technical information:"],
        list: [
          "Technical and log data our hosting provider records when pages are served, such as IP address, browser and device type, pages requested and time.",
          "The country and province or state our host estimates from your IP address, used to show the right market (Canada or the U.S.) and prefill your region. Never for access or billing.",
          "A one-way hash of your IP address, used for rate limiting and spam protection, and to count profile views.",
          "Our own visit statistics, kept in our database without cookies or third parties: the pages you view, the listings you open, the referring website's domain (never the full address) and steps such as opening the sign-up page, signing up, finishing onboarding, starting or completing a checkout, or posting an RFP. You are counted as a one-way code that changes every day, made from your account if you're signed in, or else from your browser's details and first-visit cookie. Never your IP address, and nothing that links one day to the next.",
          "If your browser sends Do-Not-Track or Global Privacy Control, we record none of these statistics and set no first-visit cookie.",
        ],
      },
      {
        title: "Cookies & Similar Technologies",
        body: ["We use these first-party cookies:"],
        list: [
          "Sign-in cookies set by our authentication provider (Supabase) to keep you signed in. Essential.",
          "NEXT_LOCALE (1 year): the language you picked.",
          "pmrfp_lang_hint (1 year): remembers that you closed the language suggestion.",
          "pmrfp_geo (30 days): your country and province or state as estimated by our host (for example “CA-ON”). Never your IP address.",
          "pmrfp_market (1 year): whether you chose to see Canada or the U.S.",
          "pmrfp_acct (1 year): your company's country and province or state, so pages match your account.",
          "pmrfp_ft (90 days): how you first found PMRFP (see below).",
        ],
        after: [
          "Your browser's local storage also keeps your analytics choice, unsent drafts (for example an RFP you are writing) and similar conveniences on your own device. You can control cookies and local storage in your browser settings; blocking sign-in cookies will stop you from signing in.",
        ],
      },
      {
        title: "How People Find PMRFP",
        body: [
          "To understand how people find PMRFP, we record the page you first landed on and the referring site or campaign. One first-party cookie (pmrfp_ft, kept for 90 days from your first visit) holds the first page's address without its query string, the referring website's domain only (never the full address), any campaign tags in the link (utm_source, utm_medium, utm_campaign, utm_content), the campaign tags of a later tagged visit if they differ, the date, the page language and your country as estimated by our host. It never holds your IP address, and anything that looks like an email address is dropped.",
          "If you create an account, we save these values with it, along with the channel we classify them into (for example search, email or social), how you signed up (password, emailed link or Google) and your account type, so we can see which channels bring members. If your browser sends Do-Not-Track or Global Privacy Control, the record keeps only how you signed up and your account type. This record is visible only to PMRFP administrators and is deleted with your account. We also count first visits per page and channel as daily totals that identify no one. Blocking or clearing the cookie doesn't affect the Service.",
        ],
      },
      {
        title: "Analytics",
        body: [
          "We count visits and sign-ups ourselves, without cookies or third parties (see “Information Collected Automatically”). We also use Vercel Web Analytics and Speed Insights, which don't use cookies, to count page views and measure site performance.",
          "Google Analytics 4 and Microsoft Clarity use cookies, so we ask first: they load only if you click “Accept analytics” in the banner, and never if you decline. Google Analytics sends usage data (such as pages viewed, device type and approximate location) to Google, with Google signals and ad personalization turned off. Clarity, when it's turned on, records how visitors use pages (heatmaps and session recordings). If your browser sends Do-Not-Track or Global Privacy Control, we treat it as declining: no banner, and neither one loads. We don't use advertising or retargeting pixels.",
        ],
      },
      {
        title: "How We Use Information",
        body: ["We use personal information to:"],
        list: [
          "operate the Service: accounts, profiles, the directory, RFPs, the forum, jobs and the marketplace;",
          "match trades with relevant opportunities and send the alerts and emails described below;",
          "process subscriptions, trials and payments;",
          "provide support and answer messages;",
          "keep the Service secure and prevent spam, fraud and abuse;",
          "understand and improve how the Service is used, mostly with aggregate data;",
          "comply with the law.",
        ],
        after: ["We don't sell personal information."],
      },
      {
        title: "Email & Anti-Spam (CASL)",
        body: ["We send these kinds of email:"],
        list: [
          "Service and transactional messages: sign-in, account and billing emails, trial status, replies to your RFP or interest, and other messages needed to run your account.",
          "Alerts and digests you turn on: RFP and lead alerts, saved-RFP and tender alerts, forum reply notifications, the weekly brief for Trade Pro and trial members, and the free weekly email (sent only after you confirm your address).",
          "Onboarding emails: after a trade company joins, a short series (at most one a day) about getting started, the free trial, Trade Pro and the Founding 500 offer. It stops when you upgrade, unsubscribe or reach the end of the series. We send these only where Canada's Anti-Spam Legislation (CASL) allows.",
          "Business outreach: we may email businesses at business addresses they publish conspicuously (for example on their website or in public tender records), about PMRFP as it relates to the recipient's business or role, where they haven't said they don't want unsolicited email.",
        ],
        after: [
          "Every commercial email identifies PMRFP and Talkerstein Consulting Group, includes our mailing address, and has an unsubscribe link. Unsubscribe links take effect right away; if you ask by email, we act within 10 business days. You can also change most email settings in your account. Unsubscribing doesn't stop essential service messages about your account.",
        ],
      },
      {
        title: "How We Share Information",
        body: [
          "Information you choose to publish, such as your company profile, an RFP, a review, a forum post or a published tradesperson profile, is visible to others as part of the Service. When you express interest in an RFP or apply for a job, we share what you submit with the person who posted it.",
          "We share personal information with service providers that help us run PMRFP (listed below), only as needed for the services they provide. We may also disclose information where required by law, to protect rights and safety, or as part of a sale or reorganization of the business, subject to this policy. We do not sell your personal information.",
        ],
      },
      {
        title: "Service Providers & Where Data Is Stored",
        body: ["We use these providers to operate the Service:"],
        list: [
          "Supabase: database, sign-in and file storage.",
          "Vercel: website hosting, analytics and performance measurement.",
          "Stripe: payments and billing.",
          "Resend: sending email.",
          "HighLevel: our customer-relationship (CRM) system, for member and enquiry contact details.",
          "Google: Google Analytics (only if you accept it in the banner), Google sign-in if you use it, and the Gemini AI service for AI-assisted features.",
          "Upstash: rate limiting (hashed IP addresses only).",
          "Cloudflare Turnstile: spam checks on forum posts, when turned on.",
          "Microsoft Clarity: only if you accept it in the banner.",
        ],
        after: [
          "Some of these providers store or process personal information outside Québec and Canada, including in the United States. There, it is subject to the laws of that country and may be accessible to its authorities. We rely on our providers' contractual commitments to protect personal information they handle for us.",
        ],
      },
      {
        title: "How Long We Keep Information",
        list: [
          "Account and profile information: while your account is open. When you ask us to close your account, we delete or anonymize it, except what we must keep by law (for example billing and tax records).",
          "Sign-up attribution: the pmrfp_ft cookie lasts up to 90 days; the copy saved with an account is deleted with that account.",
          "Visit statistics (daily visitor codes, page and listing views, referring sites, sign-up and checkout steps): deleted after 13 months.",
          "Rate-limiting data: hashed IP addresses, kept for a short time (usually less than a day).",
          "Trial records: kept while the organization exists, as the record that it used its one trial.",
          "Unsubscribe records: kept so we keep honouring your choice.",
          "Public-record data: kept while it remains relevant and the source publishes it, or until we correct or remove it under our {corrections}.",
        ],
        body: [],
        after: ["Everything else is kept only as long as needed for the purposes above, then deleted or anonymized."],
      },
      {
        title: "Security",
        body: [
          "We use administrative, technical, and physical safeguards designed to protect your information, including access controls that limit who can see it. No method of transmission or storage is completely secure, so we cannot guarantee absolute security, but we work to protect your data and respond promptly to any incident, including notifying you and the authorities where the law requires.",
        ],
      },
      {
        title: "Your Rights",
        body: ["Under PIPEDA and Québec's private-sector privacy law, you may, subject to the limits the law allows:"],
        list: [
          "ask whether we hold personal information about you and get access to it;",
          "ask us to correct (rectify) information that is inaccurate, incomplete or out of date;",
          "ask us to delete information we no longer need, or, where the law provides, to stop disseminating it or de-index a link to it;",
          "withdraw your consent to a use of your information (this may mean we can't provide part of the Service);",
          "where the law provides, receive information you gave us in a structured, commonly used technological format.",
        ],
        after: [
          "To make a request, email our Privacy Officer at {privacyEmail}. We may need to confirm your identity. We will respond within 30 days. If we can't do what you ask, we will explain why and tell you how to challenge our decision.",
          "If you are not satisfied with our answer, you can complain to the Office of the Privacy Commissioner of Canada or, in Québec, to the Commission d'accès à l'information du Québec.",
        ],
      },
      {
        title: "Corrections & Removal Requests",
        body: [
          "To report an error in a listing, a public record or a profile, or to ask us to remove personal information, use the “Report an error or request removal” link where it appears or email {privacyEmail}. Our {corrections} explains what we check and how long it takes.",
        ],
      },
      {
        title: "Children",
        body: ["PMRFP is meant for businesses and working professionals. It is not directed at children, and we don't knowingly collect personal information from children."],
      },
      {
        title: "Changes to This Policy",
        body: [
          "We may update this policy from time to time. We will change the “last updated” date above and, for significant changes, give additional notice where appropriate.",
        ],
      },
    ] as LegalBlock[],
    contact: { title: "Contact", body: "Questions or privacy requests? Email our Privacy Officer at {privacyEmail}. For anything else, reach us at {email}." },
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
      { title: "Insurance brokers", body: "Claims-related repair work where a fast trade response matters." },
      { title: "Property managers", body: "Peer PM referrals when scope is outside your bench, or you're booked." },
      { title: "Anyone with a project", body: "Owners, neighbours, family — if you know about work that needs doing, refer it." },
    ],
    whyEyebrow: "Why refer",
    whyTitle: "Help your client. Get credited. Stay informed.",
    /** Each point renders as <strong>{strong}</strong>{rest}; `rest` starts with its space. */
    why: [
      {
        strong: "Help your client first.",
        rest: " Their project reaches matching trades fast — better outcome, stronger relationship.",
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
        q: "What does a free listing actually get me?",
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
        a: "A free listing is visibility only. Trade Pro (${annual}/yr) adds the RFP board: see posted projects, get matching alerts, and express interest. Featured (${featuredAnnual}/yr) adds featured placement in your categories and regions. You can start free and upgrade any time.",
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
          "Listed on your trade + city pages — the ones Google indexes",
          "Submit project case studies",
        ],
      },
      pro: {
        name: "Trade Pro — ${annual}/yr",
        lines: [
          "Everything in the free listing",
          "Full RFP board access + matching alerts",
          "Express interest on posted projects",
          "Profile photo gallery, up to 12 photos",
        ],
      },
      featured: {
        name: "Featured — ${featuredAnnual}/yr",
        lines: [
          "Everything in Trade Pro",
          "Featured placement in your categories and service regions",
          "Featured badge on your profile",
          "Ranked ahead of standard listings in directory results",
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
      "Ce document est offert en français et en anglais. Les deux versions ont la même valeur.",
    links: {
      corrections: "Politique de correction et de retrait",
      forumRules: "Règles du forum",
      privacy: "Politique de confidentialité",
      terms: "Conditions d'utilisation",
    },
  },

  terms: {
    meta: { title: "Conditions d'utilisation", description: "Les conditions qui régissent votre utilisation de PMRFP." },
    title: "Conditions d'utilisation",
    intro: [
      "Les présentes conditions d'utilisation (les « Conditions ») constituent une entente entre vous et Talkerstein Consulting Group, qui exploite PMRFP à l'adresse pmrfp.com (« PMRFP », « nous »). Veuillez les lire avec notre {privacyLink}, qui explique comment nous traitons les renseignements personnels.",
    ],
    acceptance: {
      title: "Acceptation des conditions",
      body: [
        "En accédant à PMRFP (le « Service ») ou en l'utilisant, vous acceptez d'être lié par les présentes Conditions. Si vous n'acceptez pas ces Conditions, vous ne pouvez pas utiliser le Service. Ces Conditions s'appliquent à tous les utilisateurs, y compris les entreprises de métiers, les fournisseurs, les entrepreneurs, les gens de métier, les gestionnaires immobiliers, les constructeurs, les courtiers immobiliers et les propriétaires d'immeubles.",
        "Si vous utilisez le Service au nom d'une entreprise, vous acceptez les présentes Conditions pour cette entreprise et confirmez que vous êtes autorisé à le faire.",
      ],
    },
    description: {
      title: "Description du Service",
      body: [
        "PMRFP est une plateforme pour publier des appels d'offres et trouver des entrepreneurs, au service du marché de l'immobilier commercial au Canada et aux États-Unis. Le Service permet aux entreprises de métiers de publier des profils et de suivre des occasions d'affaires, et permet aux gestionnaires immobiliers, aux constructeurs et aux propriétaires de publier des demandes de propositions (appels d'offres) et de découvrir des fournisseurs. Il republie aussi des appels d'offres publics, des contrats octroyés et des données de projets connexes provenant de sources gouvernementales, et offre les forfaits payants et les outils décrits ci-dessous.",
        "Nous ne sommes ni courtier, ni agent d'approvisionnement, ni conseiller juridique, et nous n'agissons au nom d'aucune des parties. Nous ne sommes partie à aucun contrat entre utilisateurs. Une entreprise identifiée comme vérifiée a été examinée par l'équipe de PMRFP; sinon, nous ne vérifions pas les licences, les assurances ni les qualifications : confirmez-les directement pour votre projet.",
      ],
    },
    accounts: {
      title: "Comptes et admissibilité",
      body: [
        "Vous devez fournir des renseignements exacts et complets lors de la création d'un compte et les tenir à jour. Vous êtes responsable de la protection de vos identifiants de connexion et de toute activité effectuée dans votre compte. Vous devez être autorisé à agir au nom de toute entreprise que vous représentez sur le Service.",
      ],
    },
    billing: {
      title: "Abonnements et facturation",
      withMonthly:
        "Trade Pro est offert selon deux fréquences de facturation : {annual} $ {currency} par année (annuelle) ou {monthly} $ {currency} par mois (mensuelle). Chaque abonnement se renouvelle automatiquement à la fin de la période en cours, sauf s'il est annulé. Vous pouvez annuler en tout temps; l'annulation prend effet à la fin de votre période de facturation en cours, et vous conservez votre accès jusque-là. Les frais ne sont pas remboursables, sauf si la loi l'exige. Nous pouvons modifier nos prix pour l'avenir moyennant un préavis raisonnable. Vous pouvez passer de la facturation annuelle à la facturation mensuelle, et inversement, dans votre portail de facturation; le changement prend effet à la fin de votre période de facturation en cours.",
      annualOnly:
        "Trade Pro est offert au prix de {annual} $ {currency} par année et se renouvelle automatiquement à la fin de chaque période annuelle, sauf s'il est annulé. Vous pouvez annuler en tout temps; l'annulation prend effet à la fin de votre période de facturation en cours, et vous conservez votre accès jusque-là. Les frais ne sont pas remboursables, sauf si la loi l'exige. Nous pouvons modifier nos prix pour l'avenir moyennant un préavis raisonnable.",
      body: [
        "Les autres forfaits payants (comme En vedette, Fiche SEO, Realtor Pro, Award Intelligence et les commandites) sont facturés au prix, dans la devise et selon la fréquence indiqués sur la page du forfait et au moment du paiement. Les forfaits récurrents se renouvellent automatiquement à la fin de chaque période de facturation jusqu'à ce que vous les annuliez. Les prix et les taxes applicables, le cas échéant, sont ceux indiqués au moment du paiement.",
        "Les paiements sont traités par Stripe. Pour annuler, utilisez le portail de facturation de votre tableau de bord (Facturation) ou écrivez-nous à {email} avant la date de renouvellement. L'annulation met fin aux renouvellements futurs; elle ne rembourse pas la période en cours. Un changement de prix s'applique à partir de votre prochain renouvellement, et non à une période déjà payée.",
        "Sauf indication contraire dans les conditions Fondateurs 500 ci-dessous, ou si la loi exige un remboursement, les frais ne sont pas remboursables.",
      ],
      free: "Les gestionnaires immobiliers, les constructeurs et les propriétaires peuvent publier des appels d'offres sans frais. Les entreprises de métiers peuvent obtenir une inscription gratuite au répertoire sans abonnement payant.",
    },
    trial: {
      title: "Essai gratuit de Trade Pro",
      body: [
        "Les entreprises de métiers peuvent commencer un seul essai gratuit de Trade Pro de 14 jours par organisation. Aucune carte de paiement n'est requise. Pendant l'essai, l'organisation a accès aux fonctionnalités de Trade Pro. À la fin des 14 jours, l'organisation revient automatiquement au forfait gratuit. Rien n'est facturé à la fin d'un essai, et rien n'est facturé à moins que vous choisissiez de vous abonner. Une organisation qui a déjà eu un essai, ou qui paie déjà Trade Pro, ne peut pas en commencer un autre.",
      ],
    },
    founding: {
      title: "Offre à vie Fondateurs 500",
      body: [
        "L'offre Fondateurs 500 donne à une organisation l'accès à Trade Pro moyennant un paiement unique. Elle est soumise aux conditions en langage clair ci-dessous, qui font partie des présentes Conditions.",
      ],
      after: [
        "Dans les présentes Conditions, « à vie » désigne la durée de vie du service Trade Pro tel que PMRFP l'exploite, et non la durée de vie d'une personne ou de votre organisation. L'accès Fondateurs appartient à l'organisation qui l'a acheté et ne peut être ni cédé, ni revendu, ni transféré à une autre organisation ou à un autre compte.",
      ],
    },
    intel: {
      title: "Award Intelligence",
      body: [
        "Award Intelligence est un module payant qui organise les dossiers publics de contrats octroyés en profils d'entreprises et d'acheteurs, en tableaux de parts de marché, en estimations de renouvellement et, lorsqu'une source les publie, en listes des soumissions reçues.",
        "Il est bâti uniquement à partir de dossiers publics et est fourni à titre informatif. Les valeurs des contrats sont celles divulguées par l'acheteur. Les dates de fin de contrat et les périodes probables de nouvel appel d'offres sont souvent des estimations (par exemple, la date d'octroi plus une durée habituelle) et sont identifiées comme telles. Les listes de soumissions sont non officielles, sont présentées telles que publiées par la source avec leur date de consultation, et n'indiquent jamais pourquoi une soumission a été retenue ou non; le dossier officiel de l'acheteur fait foi. Nous ne garantissons pas qu'un dossier soit complet, à jour ou exact, ni qu'un contrat fera l'objet d'un nouvel appel d'offres.",
      ],
    },
    sponsored: {
      title: "Commandites et placements payants",
      body: [
        "Certains placements sur PMRFP sont payants. Les commandites portent la mention « Commandité » dans la langue du lecteur et leurs liens sont identifiés comme commandités; les fiches En vedette sont classées devant les fiches standard parce que l'entreprise le paie. Un placement payant n'est ni une recommandation ni une vérification de la part de PMRFP. Les commanditaires sont responsables de leur propre contenu et de leurs offres.",
      ],
    },
    publicData: {
      title: "Dossiers publics et exactitude des données",
      body: [
        "Les appels d'offres publics, les contrats octroyés, les résultats de soumissions, les permis et les données sur les grands projets présentés sur PMRFP proviennent de sources gouvernementales et d'autres sources publiques, selon les licences de données ouvertes ou les conditions d'utilisation propres à chaque source. Nous les republions en grande partie tels que la source les a publiés, les classons par corps de métier et par région, et ajoutons un lien vers l'avis officiel lorsqu'il en existe un.",
        "Ces dossiers peuvent être incomplets, périmés ou contenir des erreurs commises par la source ou par nous. Vérifiez toujours l'avis officiel ou le portail de l'acheteur avant de soumissionner, de signer ou de vous fier à un chiffre. Vous soumissionnez toujours selon le processus de l'acheteur, jamais par l'entremise de PMRFP. Pour signaler une erreur ou demander un retrait, consultez notre {corrections}.",
      ],
    },
    insights: {
      title: "Analyses, comparatifs et outils assistés par l'IA",
      body: [
        "Les analyses, les prix de référence, les rapports, les estimations de renouvellement, les classements et les chiffres semblables sont calculés à partir de dossiers publics et d'autres données du Service. Ils sont fournis à titre informatif seulement. Ils ne constituent pas des conseils financiers, juridiques, comptables, d'ingénierie ni d'autres conseils professionnels, ni une promesse de prix, de résultat ou d'octroi. Certains textes peuvent être rédigés à l'aide d'outils automatisés, y compris l'intelligence artificielle.",
        "Les outils assistés par l'IA (comme le rédacteur d'appels d'offres et les listes de vérification de soumission) peuvent produire des résultats incomplets ou erronés. Révisez tout ce qu'ils produisent, et obtenez des conseils professionnels au besoin, avant de l'utiliser.",
      ],
    },
    noGuarantee: {
      title: "Aucune garantie de travail",
      body: [],
    },
    use: {
      title: "Utilisation acceptable",
      body: [
        "Vous acceptez de ne pas faire un usage abusif du Service, notamment en publiant du contenu faux, trompeur, diffamatoire, indésirable, contrefaisant ou illégal; en publiant les renseignements personnels d'autrui sans en avoir le droit; en extrayant ou en moissonnant des données; en tentant d'obtenir un accès non autorisé; ou en utilisant le Service pour harceler d'autres utilisateurs. Nous pouvons modifier, refuser ou retirer tout contenu qui enfreint ces Conditions.",
      ],
    },
    content: {
      title: "Contenu et annonces",
      body: [
        "Vous demeurez propriétaire du contenu que vous soumettez, et vous accordez à PMRFP une licence non exclusive pour héberger, afficher et diffuser ce contenu dans la mesure nécessaire à l'exploitation du Service. Vous êtes seul responsable de l'exactitude et de la légalité de vos annonces, profils, appels d'offres, avis, messages du forum et photos, et vous confirmez avoir le droit de les publier. Nous pouvons modérer, modifier ou retirer les annonces incomplètes, trompeuses, indésirables ou inappropriées.",
        "Le contenu publié par les utilisateurs reflète l'opinion de ses auteurs, et non celle de PMRFP. Nous n'examinons pas tout le contenu avant sa publication.",
      ],
    },
    takedown: {
      title: "Signalement de contenu et demandes de retrait",
      body: [
        "Si vous croyez qu'un contenu sur PMRFP est inexact, porte atteinte à vos droits (y compris le droit d'auteur), est diffamatoire ou expose des renseignements personnels, dites-le-nous. Utilisez le lien de signalement lorsqu'il est affiché, ou écrivez à {privacyEmail} en indiquant :",
      ],
      list: [
        "l'adresse (URL) de la page et le contenu visé;",
        "pourquoi vous croyez qu'il est erroné, illégal ou contrefaisant, avec toute preuve à l'appui;",
        "pour une plainte relative au droit d'auteur ou à un autre droit, l'œuvre ou le droit visé et la confirmation que vous en êtes titulaire ou que vous êtes autorisé à agir pour le titulaire;",
        "votre nom et la façon de vous joindre.",
      ],
      after: [
        "Nous examinons les avis de bonne foi et pouvons retirer, masquer, corriger ou annoter le contenu, ou le laisser en ligne si nous concluons qu'il est exact et licite. Au besoin, nous en informons la personne qui l'a publié. Notre façon de traiter les erreurs et les retraits dans les données issues de dossiers publics est décrite dans notre {corrections}.",
      ],
    },
    forum: {
      title: "Forum",
      body: [
        "La publication sur le forum de PMRFP est soumise à nos {forumRules}, qui font partie des présentes Conditions. Les modérateurs peuvent masquer des messages, verrouiller des fils et empêcher un compte de publier lorsque les règles ne sont pas respectées.",
      ],
    },
    liability: {
      title: "Limitation de responsabilité",
      body: [
        "Dans toute la mesure permise par la loi, PMRFP et ses sociétés affiliées ne sont pas responsables des dommages indirects, accessoires, consécutifs ou punitifs, ni de la perte de profits, de revenus, de données ou d'occasions d'affaires, découlant de votre utilisation du Service. Le Service est fourni « tel quel » et « selon sa disponibilité », sans garantie d'aucune sorte.",
        "Cela comprend les décisions que vous prenez en vous fondant sur des données issues de dossiers publics, des analyses, des comparatifs ou des résultats produits par l'IA, ainsi que les rapports entre utilisateurs. Rien dans les présentes Conditions n'exclut une responsabilité qui ne peut être exclue par la loi.",
      ],
    },
    indemnity: {
      title: "Votre responsabilité à l'égard de votre contenu",
      body: [
        "Dans la mesure permise par la loi, vous acceptez d'être responsable des réclamations présentées par des tiers qui découlent du contenu que vous publiez ou de votre manquement aux présentes Conditions, et de nous indemniser à cet égard. Cela ne s'applique pas dans la mesure où une réclamation résulte de notre propre faute.",
      ],
    },
    termination: {
      title: "Résiliation",
      body: [
        "Nous pouvons suspendre ou résilier votre accès au Service en tout temps si vous enfreignez ces Conditions ou si nous cessons d'offrir le Service. Vous pouvez cesser d'utiliser le Service et fermer votre compte en tout temps.",
      ],
    },
    law: {
      title: "Droit applicable et tribunaux",
      body: [
        "Les présentes Conditions sont régies par les lois de la province d'Ontario et les lois fédérales du Canada qui s'y appliquent. Sous réserve de la section suivante, tout différend relatif aux présentes Conditions ou au Service sera soumis aux tribunaux de l'Ontario siégeant à Toronto, dont vous et nous reconnaissons la compétence.",
      ],
    },
    consumer: {
      title: "Vos droits à titre de consommateur",
      body: [
        "Rien dans les présentes Conditions ne limite un droit que vous confère une loi sur la protection du consommateur et auquel on ne peut renoncer ni déroger par contrat. Si vous êtes un consommateur au Québec, la Loi sur la protection du consommateur (Québec) s'applique à vous, et toute clause des présentes Conditions qu'elle interdit ne s'applique pas à vous; cela comprend votre droit d'intenter une poursuite devant les tribunaux du Québec. Les consommateurs d'autres provinces, États ou pays conservent les protections impératives de la loi de l'endroit où ils résident.",
      ],
    },
    language: {
      title: "Langue",
      body: [
        "Les présentes Conditions, la Politique de confidentialité et les documents connexes sont offerts en français (pmrfp.com/fr/terms) et en anglais. Les parties ont expressément souhaité que les présentes conditions et tous les documents qui s'y rattachent soient offerts en anglais et en français. The parties have expressly wished that these Terms and all related documents be available in English and in French. Les versions française et anglaise ont la même valeur. La version espagnole est une traduction fournie à titre informatif; en cas de divergence avec la version anglaise, la version anglaise prévaut.",
      ],
    },
    changes: {
      title: "Modifications des présentes conditions",
      body: [
        "Nous pouvons mettre à jour ces Conditions à l'occasion. Lorsque nous apporterons des modifications importantes, nous mettrons à jour la date de « dernière mise à jour » ci-dessus et, s'il y a lieu, fournirons un avis supplémentaire. L'utilisation continue du Service après l'entrée en vigueur des modifications constitue une acceptation des Conditions révisées. Un changement de prix ou de forfait que vous avez déjà payé ne s'applique qu'à partir de votre prochain renouvellement.",
      ],
    },
    contact: { title: "Nous joindre", body: "Des questions sur ces Conditions? Écrivez-nous à {email}." },
  },

  privacy: {
    meta: {
      title: "Politique de confidentialité",
      description: "Comment PMRFP recueille, utilise et protège vos renseignements.",
    },
    title: "Politique de confidentialité",
    intro: [
      "PMRFP respecte votre vie privée. La présente politique explique quels renseignements nous recueillons, comment nous les utilisons, avec qui nous les communiquons, ainsi que les choix et les droits qui s'offrent à vous. Elle est rédigée pour respecter la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE) du Canada et la Loi sur la protection des renseignements personnels dans le secteur privé du Québec (telle que modifiée par la Loi 25).",
    ],
    officer: {
      title: "Qui est responsable",
      body: [
        "PMRFP est exploité par Talkerstein Consulting Group, qui est responsable des renseignements personnels décrits dans la présente politique. Notre responsable de la protection des renseignements personnels veille à leur protection et traite les demandes et les plaintes relatives à la vie privée :",
      ],
      lines: [
        "Responsable de la protection des renseignements personnels, Talkerstein Consulting Group",
        "{privacyEmail}",
        "a/s Talkerstein Consulting Group, 5050, rue Dufferin, Toronto (Ontario) M3H 5T5",
      ],
    },
    sections: [
      {
        title: "À qui s'applique la présente politique",
        body: [
          "La présente politique s'applique aux membres (entreprises de métiers, fournisseurs, gestionnaires immobiliers, courtiers immobiliers, gens de métier et autres titulaires de compte), aux visiteurs de pmrfp.com, aux personnes qui s'inscrivent à nos courriels, aux candidats qui postulent à un emploi par l'entremise de PMRFP, aux personnes qui communiquent avec nous et aux personnes dont les renseignements figurent dans les dossiers publics que nous republions.",
        ],
      },
      {
        title: "Renseignements que vous nous fournissez",
        body: ["Nous recueillons les renseignements que vous nous fournissez directement, notamment :"],
        list: [
          "Renseignements de compte : votre nom, votre adresse courriel, votre numéro de téléphone, votre rôle et votre mot de passe (ou le nom et l'adresse courriel de votre compte Google si vous vous connectez avec Google).",
          "Renseignements sur l'entreprise : nom de l'entreprise, coordonnées, corps de métier, régions desservies, texte du profil, photos, projets et études de cas.",
          "Activité sur le Service : appels d'offres que vous publiez, intérêt que vous manifestez pour un appel d'offres, appels d'offres sauvegardés, avis, messages, photos et votes sur le forum, annonces du marché et offres d'emploi.",
          "Candidatures : le nom, les coordonnées et le message que vous envoyez, qui sont transmis à l'employeur auquel vous postulez.",
          "Profils de gens de métier : votre nom affiché, votre corps de métier, votre région, votre ville, votre expérience, vos cartes de compétence, vos disponibilités, vos attentes salariales, votre présentation et votre numéro de téléphone. Vous choisissez si le profil est publié et si vos coordonnées sont visibles.",
          "Messages qui nous sont adressés : messages du formulaire de contact, demandes de soutien aux soumissions et courriels.",
          "Le texte que vous entrez dans nos outils assistés par l'IA (comme le rédacteur d'appels d'offres).",
          "Facturation : les paiements sont traités par Stripe. Nous recevons vos coordonnées de facturation, votre forfait, les montants et l'état du paiement, mais pas votre numéro de carte complet.",
        ],
      },
      {
        title: "Renseignements provenant de dossiers publics",
        body: [
          "PMRFP republie des avis d'appels d'offres publics, des dossiers de contrats octroyés, des résultats de soumissions, des permis de construire et des données sur les grands projets provenant de portails gouvernementaux de données ouvertes et d'autres sources publiques, selon les licences de données ouvertes ou les conditions d'utilisation propres à chaque source. Ces dossiers peuvent comprendre des noms d'entreprises, les coordonnées de l'acheteur telles qu'il les a publiées (parfois le nom, le courriel et le téléphone professionnels d'un responsable de l'approvisionnement), les montants des contrats et des soumissions, et l'emplacement des projets.",
          "Nous publions uniquement des noms d'entreprises. Lorsque le nom d'un adjudicataire ou d'un soumissionnaire ressemble à celui d'un particulier (un nom de personne sans mot d'affaires ni forme juridique), nous ne publions pas le nom : le dossier est compté et présenté comme « Particulier (non nommé) » ou « Soumissionnaire particulier (non nommé) ». Un nom commercial qui comprend un nom de personne accompagné d'un mot d'affaires (par exemple « Jean Tremblay Excavation ») est un nom d'entreprise et est présenté tel que publié. Il s'agit d'une règle automatisée; si elle se trompe, ou si vous voulez faire corriger ou retirer un dossier qui vous concerne, consultez notre {corrections}.",
        ],
      },
      {
        title: "Renseignements recueillis automatiquement",
        body: ["Lorsque vous utilisez le Service, nous et nos fournisseurs recueillons des renseignements techniques limités :"],
        list: [
          "Les données techniques et de journalisation que notre hébergeur enregistre lorsque des pages sont servies, comme l'adresse IP, le type de navigateur et d'appareil, les pages demandées et l'heure.",
          "Le pays et la province ou l'État que notre hébergeur estime à partir de votre adresse IP, utilisés pour afficher le bon marché (Canada ou États-Unis) et préremplir votre région. Jamais pour l'accès ni pour la facturation.",
          "Un hachage à sens unique de votre adresse IP, utilisé pour limiter le débit des requêtes, protéger contre le pollupostage et compter les consultations de profils.",
          "Nos propres statistiques de visites, conservées dans notre base de données sans témoins ni tiers : les pages que vous consultez, les annonces que vous ouvrez, le domaine du site de provenance (jamais l'adresse complète) et des étapes comme l'ouverture de la page d'inscription, l'inscription, la fin de l'accueil, le début ou la fin d'un paiement, ou la publication d'un appel d'offres. Vous êtes compté au moyen d'un code à sens unique qui change chaque jour, établi à partir de votre compte si vous êtes connecté, sinon à partir des caractéristiques de votre navigateur et du témoin de première visite. Jamais votre adresse IP, et rien qui relie un jour au suivant.",
          "Si votre navigateur envoie le signal Do-Not-Track ou Global Privacy Control, nous n'enregistrons aucune de ces statistiques et ne déposons aucun témoin de première visite.",
        ],
      },
      {
        title: "Témoins et technologies semblables",
        body: ["Nous utilisons les témoins internes suivants :"],
        list: [
          "Les témoins de connexion déposés par notre fournisseur d'authentification (Supabase) pour maintenir votre session ouverte. Essentiels.",
          "NEXT_LOCALE (1 an) : la langue que vous avez choisie.",
          "pmrfp_lang_hint (1 an) : mémorise que vous avez fermé la suggestion de langue.",
          "pmrfp_geo (30 jours) : votre pays et votre province ou État tels qu'estimés par notre hébergeur (par exemple « CA-QC »). Jamais votre adresse IP.",
          "pmrfp_market (1 an) : si vous avez choisi d'afficher le Canada ou les États-Unis.",
          "pmrfp_acct (1 an) : le pays et la province ou l'État de votre entreprise, pour que les pages correspondent à votre compte.",
          "pmrfp_ft (90 jours) : comment vous avez trouvé PMRFP la première fois (voir ci-dessous).",
        ],
        after: [
          "Le stockage local de votre navigateur conserve aussi, sur votre propre appareil, votre choix en matière d'analytique, vos brouillons non envoyés (par exemple un appel d'offres en cours de rédaction) et d'autres commodités semblables. Vous pouvez gérer les témoins et le stockage local dans les paramètres de votre navigateur; bloquer les témoins de connexion vous empêchera de vous connecter.",
        ],
      },
      {
        title: "Comment les gens trouvent PMRFP",
        body: [
          "Pour comprendre comment les gens trouvent PMRFP, nous enregistrons la première page que vous avez visitée et le site ou la campagne qui vous y a dirigé. Un seul témoin interne (pmrfp_ft, conservé 90 jours à compter de votre première visite) contient l'adresse de cette première page sans ses paramètres, le domaine du site référent seulement (jamais l'adresse complète), les balises de campagne du lien, le cas échéant (utm_source, utm_medium, utm_campaign, utm_content), les balises de campagne d'une visite ultérieure si elles diffèrent, la date, la langue de la page et votre pays tel qu'estimé par notre hébergeur. Il ne contient jamais votre adresse IP, et tout ce qui ressemble à une adresse courriel est supprimé.",
          "Si vous créez un compte, nous conservons ces valeurs avec celui-ci, ainsi que le canal dans lequel nous les classons (par exemple recherche, courriel ou réseaux sociaux), votre mode d'inscription (mot de passe, lien par courriel ou Google) et votre type de compte, pour savoir quels canaux nous amènent des membres. Si votre navigateur envoie le signal Do-Not-Track ou Global Privacy Control, le dossier ne conserve que votre mode d'inscription et votre type de compte. Ce dossier n'est visible que par les administrateurs de PMRFP et est supprimé avec votre compte. Nous comptons aussi les premières visites par page et par canal sous forme de totaux quotidiens qui n'identifient personne. Bloquer ou effacer ce témoin n'a aucun effet sur le Service.",
        ],
      },
      {
        title: "Analytique",
        body: [
          "Nous comptons nous-mêmes les visites et les inscriptions, sans témoins ni tiers (voir « Renseignements recueillis automatiquement »). Nous utilisons aussi Vercel Web Analytics et Speed Insights, qui n'utilisent pas de témoins, pour compter les pages vues et mesurer la performance du site.",
          "Google Analytics 4 et Microsoft Clarity utilisent des témoins, alors nous vous le demandons d'abord : ils ne se chargent que si vous cliquez sur « Accepter l'analyse » dans le bandeau, et jamais si vous refusez. Google Analytics transmet à Google des données d'utilisation (comme les pages consultées, le type d'appareil et l'emplacement approximatif), avec les signaux Google et la personnalisation des annonces désactivés. Clarity, lorsqu'il est activé, enregistre la façon dont les visiteurs utilisent les pages (cartes de chaleur et enregistrements de sessions). Si votre navigateur envoie le signal Do-Not-Track ou Global Privacy Control, nous le traitons comme un refus : aucun bandeau, et aucun des deux ne se charge. Nous n'utilisons aucun pixel publicitaire ni de reciblage.",
        ],
      },
      {
        title: "Comment nous utilisons les renseignements",
        body: ["Nous utilisons les renseignements personnels pour :"],
        list: [
          "exploiter le Service : comptes, profils, répertoire, appels d'offres, forum, emplois et marché;",
          "jumeler les entrepreneurs avec des occasions pertinentes et envoyer les alertes et courriels décrits ci-dessous;",
          "traiter les abonnements, les essais et les paiements;",
          "offrir du soutien et répondre aux messages;",
          "assurer la sécurité du Service et prévenir le pollupostage, la fraude et les abus;",
          "comprendre et améliorer l'utilisation du Service, surtout à l'aide de données agrégées;",
          "respecter la loi.",
        ],
        after: ["Nous ne vendons pas de renseignements personnels."],
      },
      {
        title: "Courriel et loi antipourriel (LCAP)",
        body: ["Nous envoyons les types de courriels suivants :"],
        list: [
          "Messages de service et transactionnels : courriels de connexion, de compte et de facturation, état de l'essai, réponses à votre appel d'offres ou à votre intérêt, et autres messages nécessaires au fonctionnement de votre compte.",
          "Alertes et résumés que vous activez : alertes d'appels d'offres et d'occasions, alertes sur les appels d'offres sauvegardés et les marchés publics, avis de réponse sur le forum, le bulletin hebdomadaire des membres Trade Pro et en essai, et le courriel hebdomadaire gratuit (envoyé seulement après la confirmation de votre adresse).",
          "Courriels d'accueil : après l'inscription d'une entreprise de métiers, une courte série (au plus un par jour) sur les premiers pas, l'essai gratuit, Trade Pro et l'offre Fondateurs 500. Elle prend fin lorsque vous passez à un forfait payant, vous désabonnez ou atteignez la fin de la série. Nous ne les envoyons que dans la mesure permise par la Loi canadienne anti-pourriel (LCAP).",
          "Prospection d'affaires : nous pouvons écrire à des entreprises à des adresses professionnelles qu'elles publient bien en évidence (par exemple sur leur site Web ou dans des dossiers publics d'appels d'offres), au sujet de PMRFP en lien avec les activités ou le rôle du destinataire, lorsqu'elles n'ont pas indiqué refuser les messages non sollicités.",
        ],
        after: [
          "Chaque courriel commercial identifie PMRFP et Talkerstein Consulting Group, indique notre adresse postale et comporte un lien de désabonnement. Les liens de désabonnement prennent effet immédiatement; si vous en faites la demande par courriel, nous y donnons suite dans un délai de 10 jours ouvrables. Vous pouvez aussi modifier la plupart des paramètres de courriel dans votre compte. Le désabonnement n'arrête pas les messages de service essentiels concernant votre compte.",
        ],
      },
      {
        title: "Comment nous communiquons les renseignements",
        body: [
          "Les renseignements que vous choisissez de publier, comme le profil de votre entreprise, un appel d'offres, un avis, un message sur le forum ou un profil de gens de métier publié, sont visibles par d'autres personnes dans le cadre du Service. Lorsque vous manifestez votre intérêt pour un appel d'offres ou postulez à un emploi, nous transmettons ce que vous soumettez à la personne qui l'a publié.",
          "Nous communiquons des renseignements personnels aux fournisseurs de services qui nous aident à exploiter PMRFP (énumérés ci-dessous), uniquement dans la mesure nécessaire aux services qu'ils fournissent. Nous pouvons aussi communiquer des renseignements lorsque la loi l'exige, pour protéger des droits et la sécurité, ou dans le cadre d'une vente ou d'une réorganisation de l'entreprise, sous réserve de la présente politique. Nous ne vendons pas vos renseignements personnels.",
        ],
      },
      {
        title: "Fournisseurs de services et lieu de conservation des données",
        body: ["Nous faisons appel aux fournisseurs suivants pour exploiter le Service :"],
        list: [
          "Supabase : base de données, connexion et stockage de fichiers.",
          "Vercel : hébergement du site, analytique et mesure de la performance.",
          "Stripe : paiements et facturation.",
          "Resend : envoi de courriels.",
          "HighLevel : notre système de gestion de la relation client (CRM), pour les coordonnées des membres et des demandes.",
          "Google : Google Analytics (seulement si vous l'acceptez dans le bandeau), la connexion Google si vous l'utilisez, et le service d'IA Gemini pour les fonctionnalités assistées par l'IA.",
          "Upstash : limitation du débit des requêtes (adresses IP hachées seulement).",
          "Cloudflare Turnstile : vérification antipourriel des messages du forum, lorsqu'elle est activée.",
          "Microsoft Clarity : seulement si vous l'acceptez dans le bandeau.",
        ],
        after: [
          "Certains de ces fournisseurs conservent ou traitent des renseignements personnels à l'extérieur du Québec et du Canada, notamment aux États-Unis. Ces renseignements sont alors assujettis aux lois de ce pays et peuvent être accessibles à ses autorités. Nous nous fions aux engagements contractuels de nos fournisseurs pour protéger les renseignements personnels qu'ils traitent pour nous.",
        ],
      },
      {
        title: "Durée de conservation",
        list: [
          "Renseignements de compte et de profil : tant que votre compte est ouvert. Lorsque vous nous demandez de fermer votre compte, nous les supprimons ou les anonymisons, sauf ce que la loi nous oblige à conserver (par exemple les dossiers de facturation et fiscaux).",
          "Provenance des inscriptions : le témoin pmrfp_ft dure au plus 90 jours; la copie conservée avec un compte est supprimée avec ce compte.",
          "Statistiques de visites (codes de visiteur quotidiens, pages et annonces consultées, sites de provenance, étapes d'inscription et de paiement) : supprimées après 13 mois.",
          "Données de limitation du débit : adresses IP hachées, conservées peu de temps (généralement moins d'un jour).",
          "Dossiers d'essai : conservés tant que l'organisation existe, comme preuve qu'elle a utilisé son unique essai.",
          "Dossiers de désabonnement : conservés pour que nous continuions à respecter votre choix.",
          "Données issues de dossiers publics : conservées tant qu'elles demeurent pertinentes et que la source les publie, ou jusqu'à ce que nous les corrigions ou les retirions en vertu de notre {corrections}.",
        ],
        body: [],
        after: ["Tout le reste n'est conservé que le temps nécessaire aux fins décrites ci-dessus, puis est supprimé ou anonymisé."],
      },
      {
        title: "Sécurité",
        body: [
          "Nous utilisons des mesures de protection administratives, techniques et physiques conçues pour protéger vos renseignements, y compris des contrôles d'accès qui limitent qui peut les consulter. Aucune méthode de transmission ou de stockage n'est entièrement sûre; nous ne pouvons donc pas garantir une sécurité absolue, mais nous travaillons à protéger vos données et réagissons rapidement à tout incident, notamment en avisant les personnes concernées et les autorités lorsque la loi l'exige.",
        ],
      },
      {
        title: "Vos droits",
        body: ["En vertu de la LPRPDE et de la loi québécoise sur la protection des renseignements personnels dans le secteur privé, vous pouvez, dans les limites prévues par la loi :"],
        list: [
          "demander si nous détenons des renseignements personnels à votre sujet et y avoir accès;",
          "nous demander de rectifier des renseignements inexacts, incomplets ou périmés;",
          "nous demander de supprimer des renseignements dont nous n'avons plus besoin ou, lorsque la loi le prévoit, de cesser de les diffuser ou de désindexer un lien qui y mène;",
          "retirer votre consentement à une utilisation de vos renseignements (ce qui peut nous empêcher de vous offrir une partie du Service);",
          "lorsque la loi le prévoit, recevoir les renseignements que vous nous avez fournis dans un format technologique structuré et couramment utilisé.",
        ],
        after: [
          "Pour présenter une demande, écrivez à notre responsable de la protection des renseignements personnels à {privacyEmail}. Nous pourrions devoir confirmer votre identité. Nous répondrons dans un délai de 30 jours. Si nous ne pouvons pas donner suite à votre demande, nous vous en expliquerons les raisons et vous indiquerons comment contester notre décision.",
          "Si notre réponse ne vous satisfait pas, vous pouvez porter plainte auprès du Commissariat à la protection de la vie privée du Canada ou, au Québec, de la Commission d'accès à l'information du Québec.",
        ],
      },
      {
        title: "Corrections et demandes de retrait",
        body: [
          "Pour signaler une erreur dans une fiche, un dossier public ou un profil, ou pour nous demander de retirer des renseignements personnels, utilisez le lien « Signaler une erreur ou demander un retrait » lorsqu'il est affiché, ou écrivez à {privacyEmail}. Notre {corrections} explique ce que nous vérifions et les délais applicables.",
        ],
      },
      {
        title: "Enfants",
        body: ["PMRFP s'adresse aux entreprises et aux professionnels. Il ne s'adresse pas aux enfants, et nous ne recueillons pas sciemment de renseignements personnels auprès d'enfants."],
      },
      {
        title: "Modifications de la présente politique",
        body: [
          "Nous pouvons mettre à jour la présente politique à l'occasion. Nous modifierons la date de « dernière mise à jour » ci-dessus et, pour les changements importants, fournirons un avis supplémentaire s'il y a lieu.",
        ],
      },
    ] as LegalBlock[],
    contact: {
      title: "Nous joindre",
      body: "Des questions ou une demande relative à la vie privée? Écrivez à notre responsable de la protection des renseignements personnels à {privacyEmail}. Pour toute autre question, écrivez-nous à {email}.",
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
        body: "Réparations liées à des réclamations, où la rapidité d'intervention compte.",
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
        rest: " Son projet est vu rapidement par des entrepreneurs du métier — meilleur résultat, relation plus solide.",
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
        q: "Qu'est-ce que l'inscription gratuite m'apporte concrètement?",
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
        a: "L'inscription gratuite, c'est de la visibilité seulement. Trade Pro ({annual} $/an) ajoute le tableau des appels d'offres : voyez les projets publiés, recevez des alertes correspondantes et manifestez votre intérêt. En vedette ({featuredAnnual} $/an) ajoute une place en vedette dans vos catégories et régions. Vous pouvez commencer gratuitement et passer à un forfait supérieur en tout temps.",
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
          "Présence sur les pages de votre corps de métier et de votre ville — celles que Google indexe",
          "Soumission d'études de cas de projets",
        ],
      },
      pro: {
        name: "Trade Pro — {annual} $/an",
        lines: [
          "Tout ce qu'offre l'inscription gratuite",
          "Accès complet au tableau des appels d'offres + alertes correspondantes",
          "Manifestation d'intérêt pour les projets publiés",
          "Galerie de photos du profil, jusqu'à 12 photos",
        ],
      },
      featured: {
        name: "En vedette — {featuredAnnual} $/an",
        lines: [
          "Tout ce qu'offre Trade Pro",
          "Placement en vedette dans vos catégories et vos régions de service",
          "Badge En vedette sur votre profil",
          "Classé devant les fiches standard dans le répertoire",
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
    links: {
      corrections: "Política de correcciones y retiros",
      forumRules: "Reglas del foro",
      privacy: "Política de privacidad",
      terms: "Términos del servicio",
    },
  },

  terms: {
    meta: { title: "Términos del servicio", description: "Los términos que rigen su uso de PMRFP." },
    title: "Términos del servicio",
    intro: [
      "Estos Términos del servicio (los “Términos”) son un acuerdo entre usted y Talkerstein Consulting Group, que opera PMRFP en pmrfp.com (“PMRFP”, “nosotros”). Léalos junto con nuestra {privacyLink}, que explica cómo tratamos la información personal.",
    ],
    acceptance: {
      title: "Aceptación de los términos",
      body: [
        "Al acceder a PMRFP (el “Servicio”) o utilizarlo, usted acepta quedar obligado por estos Términos. Si no está de acuerdo con estos Términos, no puede utilizar el Servicio. Estos Términos se aplican a todos los usuarios, incluidas las empresas de oficios, los proveedores, los contratistas, los trabajadores de oficios, los administradores de propiedades, los constructores, los agentes inmobiliarios y los propietarios de edificios.",
        "Si usa el Servicio en nombre de una empresa, acepta estos Términos en nombre de esa empresa y confirma que está autorizado para hacerlo.",
      ],
    },
    description: {
      title: "Descripción del Servicio",
      body: [
        "PMRFP es una plataforma para publicar solicitudes de propuestas y encontrar contratistas, al servicio del mercado de propiedades comerciales en Canadá y los Estados Unidos. El Servicio permite a las empresas de oficios publicar perfiles y seguir oportunidades, y permite a los administradores de propiedades, constructores y propietarios publicar solicitudes de propuestas (RFP) y encontrar proveedores. También republica licitaciones públicas, contratos adjudicados y datos de proyectos relacionados de fuentes gubernamentales, y ofrece los planes de pago y las herramientas que se describen a continuación.",
        "No somos corredores, agentes de adquisiciones ni asesores legales, y no actuamos en nombre de ninguna de las partes. No somos parte de ningún contrato entre usuarios. Una empresa marcada como verificada fue revisada por el equipo de PMRFP; de lo contrario, no verificamos licencias, seguros ni calificaciones, así que confírmelos directamente para su proyecto.",
      ],
    },
    accounts: {
      title: "Cuentas y elegibilidad",
      body: [
        "Debe proporcionar información exacta y completa al crear una cuenta y mantenerla actualizada. Usted es responsable de proteger las credenciales de su cuenta y de toda la actividad que se realice en ella. Debe estar autorizado para actuar en nombre de cualquier empresa que represente en el Servicio.",
      ],
    },
    billing: {
      title: "Suscripciones y facturación",
      withMonthly:
        "Trade Pro se ofrece con dos intervalos de facturación: ${annual} {currency} al año (anual) o ${monthly} {currency} al mes (mensual). Cada uno se renueva automáticamente al final del período vigente, salvo que se cancele. Puede cancelar en cualquier momento; la cancelación entra en vigor al final de su período de facturación vigente, y usted conserva el acceso hasta entonces. Las tarifas no son reembolsables, salvo cuando la ley lo exija. Podemos cambiar los precios a futuro con un aviso razonable. Puede cambiar entre la facturación anual y la mensual desde su portal de facturación; el cambio entra en vigor al final de su período de facturación vigente.",
      annualOnly:
        "Trade Pro se ofrece a ${annual} {currency} al año y se renueva automáticamente al final de cada período anual, salvo que se cancele. Puede cancelar en cualquier momento; la cancelación entra en vigor al final de su período de facturación vigente, y usted conserva el acceso hasta entonces. Las tarifas no son reembolsables, salvo cuando la ley lo exija. Podemos cambiar los precios a futuro con un aviso razonable.",
      body: [
        "Los demás planes de pago (como Destacado, Ficha SEO, Realtor Pro, Award Intelligence y los patrocinios) se facturan al precio, en la moneda y con el intervalo que se muestran en la página del plan y al pagar. Los planes recurrentes se renuevan automáticamente al final de cada período de facturación hasta que usted los cancele. Los precios y los impuestos aplicables, si los hay, son los que se muestran al pagar.",
        "Los pagos los procesa Stripe. Para cancelar, use el portal de facturación de su panel (Facturación) o escríbanos a {email} antes de la fecha de renovación. Cancelar detiene las renovaciones futuras; no reembolsa el período en curso. Los cambios de precio se aplican a partir de su próxima renovación, no a un período que ya pagó.",
        "Salvo lo indicado en los términos de Fundadores 500 a continuación, o cuando la ley exija un reembolso, las tarifas no son reembolsables.",
      ],
      free: "Los administradores de propiedades, constructores y propietarios pueden publicar solicitudes de propuestas sin costo. Las empresas de oficios pueden tener fichas gratuitas en el directorio sin una suscripción de pago.",
    },
    trial: {
      title: "Prueba gratuita de Trade Pro",
      body: [
        "Las empresas de oficios pueden iniciar una sola prueba gratuita de Trade Pro de 14 días por organización. No se necesita tarjeta de pago. Durante la prueba, la organización tiene las funciones de Trade Pro. Al terminar los 14 días, la organización vuelve automáticamente al plan gratuito. No se cobra nada al final de una prueba, y no se factura nada a menos que usted decida suscribirse. Una organización que ya tuvo una prueba, o que ya paga Trade Pro, no puede iniciar otra.",
      ],
    },
    founding: {
      title: "Oferta de por vida Fundadores 500",
      body: [
        "La oferta Fundadores 500 da a una organización Trade Pro por un solo pago. Está sujeta a los términos en lenguaje claro que siguen, que forman parte de estos Términos.",
      ],
      after: [
        "En estos Términos, “de por vida” se refiere a la vida del servicio Trade Pro tal como PMRFP lo opera, no a la vida de ninguna persona ni de su organización. El acceso de Fundador pertenece a la organización que lo compró y no se puede ceder, revender ni trasladar a otra organización o cuenta.",
      ],
    },
    intel: {
      title: "Award Intelligence",
      body: [
        "Award Intelligence es un complemento de pago que organiza los registros públicos de contratos adjudicados en perfiles de empresas y compradores, tablas de participación de mercado, estimaciones de renovación y, cuando una fuente las publica, listas de las ofertas recibidas.",
        "Se basa únicamente en registros públicos y se ofrece a título informativo. Los valores de los contratos son los que divulga el comprador. Las fechas de fin de contrato y los períodos probables de nueva licitación suelen ser estimaciones (por ejemplo, la fecha de adjudicación más un plazo típico) y se identifican como tales. Las listas de ofertas no son oficiales, se muestran tal como las publica la fuente con su fecha de consulta y nunca indican por qué una oferta fue elegida o no; prevalece el registro oficial del comprador. No garantizamos que ningún registro esté completo, actualizado o sea exacto, ni que un contrato vuelva a licitarse.",
      ],
    },
    sponsored: {
      title: "Patrocinios y ubicaciones pagadas",
      body: [
        "Algunas ubicaciones en PMRFP son pagadas. Los patrocinios llevan la etiqueta “Patrocinado” en el idioma del lector y sus enlaces se marcan como patrocinados; las fichas Destacadas aparecen antes que las fichas estándar porque la empresa paga por ella. Una ubicación pagada no es una recomendación ni una verificación de PMRFP. Los patrocinadores son responsables de su propio contenido y de sus ofertas.",
      ],
    },
    publicData: {
      title: "Registros públicos y exactitud de los datos",
      body: [
        "Las licitaciones públicas, los contratos adjudicados, los resultados de ofertas, los permisos y los datos de grandes proyectos que aparecen en PMRFP provienen de fuentes gubernamentales y otras fuentes públicas, según las licencias de datos abiertos o las condiciones de uso de cada fuente. Los republicamos en gran medida tal como la fuente los publicó, los clasificamos por oficio y región, y enlazamos al aviso oficial cuando existe.",
        "Estos registros pueden estar incompletos o desactualizados, o contener errores de la fuente o nuestros. Verifique siempre el aviso oficial o el portal del comprador antes de presentar una oferta, firmar o basarse en cualquier cifra. Usted siempre presenta sus ofertas mediante el proceso del comprador, nunca a través de PMRFP. Para reportar un error o pedir un retiro, consulte nuestra {corrections}.",
      ],
    },
    insights: {
      title: "Análisis, referencias y herramientas asistidas por IA",
      body: [
        "Los análisis, los precios de referencia, los informes, las estimaciones de renovación, las clasificaciones y cifras similares se calculan a partir de registros públicos y otros datos del Servicio. Son solo informativos. No constituyen asesoramiento financiero, legal, contable, de ingeniería ni otro asesoramiento profesional, ni una promesa de precio, resultado o adjudicación. Algunos textos pueden redactarse con herramientas automatizadas, incluida la inteligencia artificial.",
        "Las herramientas asistidas por IA (como el RFP Writer y las listas de verificación de ofertas) pueden producir resultados incompletos o erróneos. Revise todo lo que produzcan, y busque asesoramiento profesional cuando lo necesite, antes de usarlo.",
      ],
    },
    noGuarantee: {
      title: "Sin garantía de trabajo",
      body: [],
    },
    use: {
      title: "Uso aceptable",
      body: [
        "Usted se compromete a no hacer un uso indebido del Servicio, lo que incluye publicar contenido falso, engañoso, difamatorio, no deseado (spam), infractor o ilícito; publicar información personal de otras personas sin derecho a hacerlo; extraer o recolectar datos; intentar obtener acceso no autorizado; o usar el Servicio para acosar a otros usuarios. Podemos editar, rechazar o eliminar el contenido que infrinja estos Términos.",
      ],
    },
    content: {
      title: "Contenido y anuncios",
      body: [
        "Usted conserva la propiedad del contenido que envía y otorga a PMRFP una licencia no exclusiva para alojar, mostrar y distribuir ese contenido según sea necesario para operar el Servicio. Usted es el único responsable de la exactitud y la legalidad de sus anuncios, perfiles, solicitudes de propuestas, reseñas, mensajes del foro y fotos, y confirma que tiene derecho a publicarlos. Podemos moderar, editar o eliminar los anuncios que estén incompletos o que sean engañosos, no deseados (spam) o inapropiados.",
        "El contenido publicado por los usuarios refleja la opinión de sus autores, no la de PMRFP. No revisamos todo el contenido antes de que aparezca.",
      ],
    },
    takedown: {
      title: "Reporte de contenido y solicitudes de retiro",
      body: [
        "Si cree que un contenido en PMRFP es inexacto, infringe sus derechos (incluidos los derechos de autor), es difamatorio o expone información personal, avísenos. Use el enlace de reporte cuando aparezca, o escriba a {privacyEmail} indicando:",
      ],
      list: [
        "la dirección (URL) de la página y el contenido específico;",
        "por qué cree que es erróneo, ilícito o infractor, con cualquier prueba que lo respalde;",
        "en un reclamo de derechos de autor u otro derecho, la obra o el derecho de que se trata y la confirmación de que usted es su titular o está autorizado para actuar en nombre del titular;",
        "su nombre y cómo contactarlo.",
      ],
      after: [
        "Revisamos los avisos de buena fe y podemos eliminar, ocultar, corregir o anotar el contenido, o mantenerlo publicado si concluimos que es exacto y lícito. Cuando corresponde, se lo informamos a quien lo publicó. La forma en que tratamos los errores y retiros en los datos de registros públicos se explica en nuestra {corrections}.",
      ],
    },
    forum: {
      title: "Foro",
      body: [
        "Publicar en el foro de PMRFP está sujeto a nuestras {forumRules}, que forman parte de estos Términos. Los moderadores pueden ocultar mensajes, bloquear hilos e impedir que una cuenta publique cuando se infringen las reglas.",
      ],
    },
    liability: {
      title: "Limitación de responsabilidad",
      body: [
        "En la máxima medida permitida por la ley, PMRFP y sus afiliadas no son responsables de ningún daño indirecto, incidental, consecuente o punitivo, ni de la pérdida de ganancias, ingresos, datos u oportunidades de negocio, que se derive de su uso del Servicio. El Servicio se proporciona “tal cual” y “según disponibilidad”, sin garantías de ningún tipo.",
        "Esto incluye las decisiones que usted tome con base en datos de registros públicos, análisis, referencias o resultados de IA, y las relaciones entre usuarios. Nada en estos Términos excluye una responsabilidad que la ley no permita excluir.",
      ],
    },
    indemnity: {
      title: "Su responsabilidad por su contenido",
      body: [
        "En la medida en que la ley lo permita, usted acepta responder por los reclamos de terceros que se deriven del contenido que publique o del incumplimiento de estos Términos, y compensarnos por ellos. Esto no se aplica en la medida en que un reclamo sea causado por nuestra propia culpa.",
      ],
    },
    termination: {
      title: "Terminación",
      body: [
        "Podemos suspender o terminar su acceso al Servicio en cualquier momento si usted infringe estos Términos o si dejamos de ofrecer el Servicio. Usted puede dejar de usar el Servicio y cerrar su cuenta en cualquier momento.",
      ],
    },
    law: {
      title: "Ley aplicable y tribunales",
      body: [
        "Estos Términos se rigen por las leyes de la provincia de Ontario y las leyes federales de Canadá aplicables en ella. Con sujeción a la sección siguiente, cualquier controversia sobre estos Términos o el Servicio será conocida por los tribunales de Ontario con sede en Toronto, y usted y nosotros aceptamos su jurisdicción.",
      ],
    },
    consumer: {
      title: "Sus derechos como consumidor",
      body: [
        "Nada en estos Términos limita ningún derecho que usted tenga en virtud de la legislación de protección del consumidor y que no pueda renunciarse ni limitarse por contrato. Si usted es un consumidor en Quebec, se le aplica la Ley de protección del consumidor de Quebec (Loi sur la protection du consommateur), y cualquier cláusula de estos Términos que esa ley prohíba no se le aplica; esto incluye su derecho a presentar una demanda ante los tribunales de Quebec. Los consumidores de otras provincias, estados o países conservan las protecciones obligatorias de la ley del lugar donde residen.",
      ],
    },
    language: {
      title: "Idioma",
      body: [
        "Estos Términos, la Política de privacidad y los documentos relacionados están disponibles en inglés y en francés (pmrfp.com/fr/terms). Las partes han manifestado expresamente su deseo de que estos Términos y todos los documentos relacionados estén disponibles en inglés y en francés. Las versiones en inglés y en francés tienen el mismo valor. Esta versión en español es una traducción a título informativo; si difiere de la versión en inglés, prevalece la versión en inglés.",
      ],
    },
    changes: {
      title: "Cambios en estos términos",
      body: [
        "Podemos actualizar estos Términos periódicamente. Cuando hagamos cambios importantes, actualizaremos la fecha de “última actualización” indicada arriba y, cuando corresponda, daremos un aviso adicional. El uso continuado del Servicio después de que los cambios entren en vigor constituye la aceptación de los Términos revisados. Un cambio en un precio o plan que ya pagó solo se aplica a partir de su próxima renovación.",
      ],
    },
    contact: { title: "Contacto", body: "¿Preguntas sobre estos Términos? Escríbanos a {email}." },
  },

  privacy: {
    meta: { title: "Política de privacidad", description: "Cómo PMRFP recopila, usa y protege su información." },
    title: "Política de privacidad",
    intro: [
      "PMRFP respeta su privacidad. Esta política explica qué información recopilamos, cómo la usamos, con quién la compartimos y qué opciones y derechos tiene usted. Está redactada para cumplir con la Ley de Protección de la Información Personal y los Documentos Electrónicos de Canadá (PIPEDA) y con la Ley sobre la protección de la información personal en el sector privado de Quebec (modificada por la Ley 25).",
    ],
    officer: {
      title: "Quién es responsable",
      body: [
        "PMRFP es operado por Talkerstein Consulting Group, que es responsable de la información personal descrita en esta política. Nuestro Responsable de Privacidad supervisa cómo la protegemos y atiende las solicitudes y quejas sobre privacidad:",
      ],
      lines: [
        "Responsable de Privacidad, Talkerstein Consulting Group",
        "{privacyEmail}",
        "a/c Talkerstein Consulting Group, 5050 Dufferin St., Toronto, ON M3H 5T5, Canadá",
      ],
    },
    sections: [
      {
        title: "A quién se aplica esta política",
        body: [
          "Esta política se aplica a los miembros (empresas de oficios, proveedores, administradores de propiedades, agentes inmobiliarios, trabajadores de oficios y otros titulares de cuentas), a los visitantes de pmrfp.com, a las personas que se suscriben a nuestros correos, a los candidatos que postulan a un empleo a través de PMRFP, a las personas que se comunican con nosotros y a las personas cuya información aparece en los registros públicos que republicamos.",
        ],
      },
      {
        title: "Información que usted nos proporciona",
        body: ["Recopilamos la información que usted nos proporciona directamente, por ejemplo:"],
        list: [
          "Datos de la cuenta: su nombre, dirección de correo electrónico, número de teléfono, rol y contraseña (o el nombre y el correo de su cuenta de Google si inicia sesión con Google).",
          "Datos de la empresa: nombre de la empresa, datos de contacto, oficios, regiones de servicio, texto del perfil, fotos, proyectos y casos de estudio.",
          "Actividad en el Servicio: solicitudes de propuestas que publica, interés que manifiesta en una solicitud, solicitudes guardadas, reseñas, mensajes, fotos y votos en el foro, anuncios del mercado y ofertas de empleo.",
          "Postulaciones a empleos: el nombre, los datos de contacto y el mensaje que envía, que se transmiten al empleador al que postula.",
          "Perfiles de trabajadores de oficios: su nombre visible, oficio, región, ciudad, experiencia, certificaciones, disponibilidad, expectativa salarial, presentación y número de teléfono. Usted decide si el perfil se publica y si sus datos de contacto son visibles.",
          "Mensajes que nos envía: mensajes del formulario de contacto, solicitudes de apoyo para ofertas y correos electrónicos.",
          "El texto que ingresa en nuestras herramientas asistidas por IA (como el RFP Writer).",
          "Facturación: los pagos los procesa Stripe. Recibimos su contacto de facturación, su plan, los montos y el estado del pago, no el número completo de su tarjeta.",
        ],
      },
      {
        title: "Información de registros públicos",
        body: [
          "PMRFP republica avisos de licitaciones públicas, registros de contratos adjudicados, resultados de ofertas, permisos de construcción y datos de grandes proyectos de portales gubernamentales de datos abiertos y otras fuentes públicas, según las licencias de datos abiertos o las condiciones de uso de cada fuente. Estos registros pueden incluir nombres de empresas, los datos de contacto del comprador tal como este los publicó (a veces el nombre, el correo y el teléfono laborales de un responsable de compras), los montos de contratos y ofertas, y la ubicación de los proyectos.",
          "Solo publicamos nombres de empresas. Cuando el nombre de un adjudicatario o licitante parece el de un particular (un nombre de persona sin palabra comercial ni forma jurídica), no publicamos el nombre: el registro se cuenta y se muestra como “Persona física (sin nombre)” o “Licitante particular (sin nombre)”. Un nombre comercial que incluye un nombre de persona junto con una palabra comercial (por ejemplo “Jean Tremblay Excavation”) es un nombre de empresa y se muestra tal como se publicó. Es una regla automatizada; si se equivoca, o si quiere que se corrija o retire un registro sobre usted, consulte nuestra {corrections}.",
        ],
      },
      {
        title: "Información que se recopila automáticamente",
        body: ["Cuando usa el Servicio, nosotros y nuestros proveedores recopilamos información técnica limitada:"],
        list: [
          "Datos técnicos y de registro que nuestro proveedor de alojamiento guarda al servir las páginas, como la dirección IP, el tipo de navegador y de dispositivo, las páginas solicitadas y la hora.",
          "El país y la provincia o el estado que nuestro proveedor de alojamiento estima a partir de su dirección IP, que usamos para mostrar el mercado correcto (Canadá o EE. UU.) y prellenar su región. Nunca para el acceso ni la facturación.",
          "Un hash unidireccional de su dirección IP, que usamos para limitar la frecuencia de solicitudes, proteger contra el spam y contar las visitas a los perfiles.",
          "Nuestras propias estadísticas de visitas, guardadas en nuestra base de datos sin cookies ni terceros: las páginas que ve, los anuncios que abre, el dominio del sitio de referencia (nunca la dirección completa) y pasos como abrir la página de registro, registrarse, terminar la configuración inicial, iniciar o completar un pago, o publicar una solicitud de propuestas. Se le cuenta mediante un código de un solo sentido que cambia cada día, creado a partir de su cuenta si ha iniciado sesión o, si no, de los datos de su navegador y de la cookie de primera visita. Nunca su dirección IP, y nada que relacione un día con el siguiente.",
          "Si su navegador envía la señal Do-Not-Track o Global Privacy Control, no registramos ninguna de estas estadísticas ni instalamos la cookie de primera visita.",
        ],
      },
      {
        title: "Cookies y tecnologías similares",
        body: ["Usamos estas cookies propias:"],
        list: [
          "Cookies de inicio de sesión que establece nuestro proveedor de autenticación (Supabase) para mantener su sesión iniciada. Esenciales.",
          "NEXT_LOCALE (1 año): el idioma que eligió.",
          "pmrfp_lang_hint (1 año): recuerda que cerró la sugerencia de idioma.",
          "pmrfp_geo (30 días): su país y su provincia o estado según lo estima nuestro proveedor de alojamiento (por ejemplo “US-TX”). Nunca su dirección IP.",
          "pmrfp_market (1 año): si eligió ver Canadá o EE. UU.",
          "pmrfp_acct (1 año): el país y la provincia o el estado de su empresa, para que las páginas coincidan con su cuenta.",
          "pmrfp_ft (90 días): cómo encontró PMRFP por primera vez (vea abajo).",
        ],
        after: [
          "El almacenamiento local de su navegador también guarda en su propio dispositivo su elección sobre analítica, borradores no enviados (por ejemplo, una solicitud de propuestas que está redactando) y otras comodidades similares. Puede controlar las cookies y el almacenamiento local desde la configuración de su navegador; bloquear las cookies de inicio de sesión le impedirá iniciar sesión.",
        ],
      },
      {
        title: "Cómo nos encuentra la gente",
        body: [
          "Para entender cómo la gente encuentra PMRFP, registramos la primera página que visitó y el sitio o la campaña que lo trajo. Una sola cookie propia (pmrfp_ft, guardada 90 días desde su primera visita) contiene la dirección de esa primera página sin sus parámetros, solo el dominio del sitio de referencia (nunca la dirección completa), las etiquetas de campaña del enlace, si las hay (utm_source, utm_medium, utm_campaign, utm_content), las etiquetas de campaña de una visita posterior si son diferentes, la fecha, el idioma de la página y su país según lo estima nuestro proveedor de alojamiento. Nunca contiene su dirección IP, y se descarta cualquier cosa que parezca una dirección de correo electrónico.",
          "Si crea una cuenta, guardamos estos valores con ella, junto con el canal en el que los clasificamos (por ejemplo búsqueda, correo o redes sociales), la forma en que se registró (contraseña, enlace por correo o Google) y su tipo de cuenta, para saber qué canales nos traen miembros. Si su navegador envía la señal Do-Not-Track o Global Privacy Control, el registro solo conserva la forma en que se registró y su tipo de cuenta. Este registro solo lo ven los administradores de PMRFP y se elimina junto con su cuenta. También contamos las primeras visitas por página y canal como totales diarios que no identifican a nadie. Bloquear o borrar la cookie no afecta al Servicio.",
        ],
      },
      {
        title: "Analítica",
        body: [
          "Contamos nosotros mismos las visitas y los registros, sin cookies ni terceros (vea “Información que se recopila automáticamente”). También usamos Vercel Web Analytics y Speed Insights, que no usan cookies, para contar las páginas vistas y medir el rendimiento del sitio.",
          "Google Analytics 4 y Microsoft Clarity usan cookies, así que se lo preguntamos primero: solo se cargan si hace clic en “Aceptar analítica” en el aviso, y nunca si lo rechaza. Google Analytics envía a Google datos de uso (como las páginas vistas, el tipo de dispositivo y la ubicación aproximada), con las señales de Google y la personalización de anuncios desactivadas. Clarity, cuando está activado, registra cómo los visitantes usan las páginas (mapas de calor y grabaciones de sesiones). Si su navegador envía la señal Do-Not-Track o Global Privacy Control, lo tratamos como un rechazo: no hay aviso y no se carga ninguno de los dos. No usamos píxeles de publicidad ni de remarketing.",
        ],
      },
      {
        title: "Cómo usamos la información",
        body: ["Usamos la información personal para:"],
        list: [
          "operar el Servicio: cuentas, perfiles, el directorio, las solicitudes de propuestas, el foro, los empleos y el mercado;",
          "relacionar a los contratistas con oportunidades pertinentes y enviar las alertas y los correos que se describen abajo;",
          "procesar suscripciones, pruebas y pagos;",
          "brindar soporte y responder mensajes;",
          "mantener la seguridad del Servicio y prevenir el spam, el fraude y el abuso;",
          "entender y mejorar el uso del Servicio, principalmente con datos agregados;",
          "cumplir con la ley.",
        ],
        after: ["No vendemos información personal."],
      },
      {
        title: "Correo electrónico y ley antispam (CASL)",
        body: ["Enviamos estos tipos de correo:"],
        list: [
          "Mensajes del servicio y transaccionales: correos de inicio de sesión, de la cuenta y de facturación, estado de la prueba, respuestas a su solicitud de propuestas o a su interés, y otros mensajes necesarios para operar su cuenta.",
          "Alertas y resúmenes que usted activa: alertas de solicitudes de propuestas y de oportunidades, alertas de solicitudes guardadas y de licitaciones, avisos de respuestas en el foro, el informe semanal para miembros de Trade Pro y en prueba, y el correo semanal gratuito (que solo se envía después de que confirme su dirección).",
          "Correos de bienvenida: después de que una empresa de oficios se registra, una serie breve (como máximo uno al día) sobre cómo empezar, la prueba gratuita, Trade Pro y la oferta Fundadores 500. Se detiene cuando usted contrata un plan de pago, se da de baja o llega al final de la serie. Solo los enviamos cuando lo permite la ley antispam de Canadá (CASL).",
          "Contacto comercial: podemos escribir a empresas en direcciones comerciales que publican de forma visible (por ejemplo en su sitio web o en registros públicos de licitaciones), sobre PMRFP en relación con la actividad o el cargo del destinatario, cuando no han indicado que no desean recibir mensajes no solicitados.",
        ],
        after: [
          "Cada correo comercial identifica a PMRFP y a Talkerstein Consulting Group, incluye nuestra dirección postal y tiene un enlace para darse de baja. Los enlaces para darse de baja surten efecto de inmediato; si lo pide por correo, lo atendemos en un plazo de 10 días hábiles. También puede cambiar la mayoría de las preferencias de correo en su cuenta. Darse de baja no detiene los mensajes esenciales del servicio sobre su cuenta.",
        ],
      },
      {
        title: "Cómo compartimos la información",
        body: [
          "La información que usted decide publicar, como el perfil de su empresa, una solicitud de propuestas, una reseña, un mensaje en el foro o un perfil de trabajador publicado, es visible para otras personas como parte del Servicio. Cuando manifiesta interés en una solicitud de propuestas o postula a un empleo, compartimos lo que envía con la persona que lo publicó.",
          "Compartimos información personal con los proveedores de servicios que nos ayudan a operar PMRFP (indicados abajo), solo en la medida necesaria para los servicios que prestan. También podemos divulgar información cuando la ley lo exija, para proteger derechos y la seguridad, o como parte de una venta o reorganización del negocio, con sujeción a esta política. No vendemos su información personal.",
        ],
      },
      {
        title: "Proveedores de servicios y dónde se almacenan los datos",
        body: ["Usamos estos proveedores para operar el Servicio:"],
        list: [
          "Supabase: base de datos, inicio de sesión y almacenamiento de archivos.",
          "Vercel: alojamiento del sitio, analítica y medición del rendimiento.",
          "Stripe: pagos y facturación.",
          "Resend: envío de correos electrónicos.",
          "HighLevel: nuestro sistema de gestión de relaciones con clientes (CRM), para los datos de contacto de miembros y consultas.",
          "Google: Google Analytics (solo si lo acepta en el aviso), el inicio de sesión con Google si lo usa, y el servicio de IA Gemini para las funciones asistidas por IA.",
          "Upstash: limitación de la frecuencia de solicitudes (solo direcciones IP con hash).",
          "Cloudflare Turnstile: verificación antispam de los mensajes del foro, cuando está activada.",
          "Microsoft Clarity: solo si lo acepta en el aviso.",
        ],
        after: [
          "Algunos de estos proveedores almacenan o procesan información personal fuera de Quebec y de Canadá, incluso en los Estados Unidos. Allí, la información está sujeta a las leyes de ese país y puede ser accesible para sus autoridades. Nos basamos en los compromisos contractuales de nuestros proveedores para proteger la información personal que tratan por cuenta nuestra.",
        ],
      },
      {
        title: "Cuánto tiempo conservamos la información",
        list: [
          "Información de la cuenta y del perfil: mientras su cuenta esté abierta. Cuando nos pide cerrar su cuenta, la eliminamos o anonimizamos, salvo lo que la ley nos obliga a conservar (por ejemplo, registros de facturación e impuestos).",
          "Origen del registro: la cookie pmrfp_ft dura como máximo 90 días; la copia guardada con una cuenta se elimina junto con esa cuenta.",
          "Estadísticas de visitas (códigos diarios de visitante, páginas y anuncios vistos, sitios de referencia, pasos de registro y de pago): se eliminan después de 13 meses.",
          "Datos de limitación de frecuencia: direcciones IP con hash, conservadas por poco tiempo (normalmente menos de un día).",
          "Registros de pruebas: se conservan mientras exista la organización, como constancia de que usó su única prueba.",
          "Registros de bajas: se conservan para seguir respetando su decisión.",
          "Datos de registros públicos: se conservan mientras sigan siendo pertinentes y la fuente los publique, o hasta que los corrijamos o retiremos según nuestra {corrections}.",
        ],
        body: [],
        after: ["Todo lo demás se conserva solo el tiempo necesario para los fines indicados arriba y luego se elimina o anonimiza."],
      },
      {
        title: "Seguridad",
        body: [
          "Usamos medidas de protección administrativas, técnicas y físicas diseñadas para proteger su información, incluidos controles de acceso que limitan quién puede verla. Ningún método de transmisión o almacenamiento es completamente seguro, por lo que no podemos garantizar una seguridad absoluta, pero trabajamos para proteger sus datos y responder con prontitud ante cualquier incidente, lo que incluye avisarle a usted y a las autoridades cuando la ley lo exija.",
        ],
      },
      {
        title: "Sus derechos",
        body: ["En virtud de la PIPEDA y de la ley de privacidad del sector privado de Quebec, usted puede, dentro de los límites que permite la ley:"],
        list: [
          "preguntar si tenemos información personal sobre usted y acceder a ella;",
          "pedirnos que corrijamos (rectifiquemos) información inexacta, incompleta o desactualizada;",
          "pedirnos que eliminemos información que ya no necesitamos o, cuando la ley lo prevea, que dejemos de difundirla o desindexemos un enlace a ella;",
          "retirar su consentimiento para un uso de su información (lo que puede impedirnos ofrecerle parte del Servicio);",
          "cuando la ley lo prevea, recibir la información que nos proporcionó en un formato tecnológico estructurado y de uso común.",
        ],
        after: [
          "Para hacer una solicitud, escriba a nuestro Responsable de Privacidad a {privacyEmail}. Es posible que necesitemos confirmar su identidad. Responderemos en un plazo de 30 días. Si no podemos atender su solicitud, le explicaremos por qué y le indicaremos cómo impugnar nuestra decisión.",
          "Si no está satisfecho con nuestra respuesta, puede presentar una queja ante la Oficina del Comisionado de Privacidad de Canadá (Office of the Privacy Commissioner of Canada) o, en Quebec, ante la Commission d'accès à l'information du Québec.",
        ],
      },
      {
        title: "Correcciones y solicitudes de retiro",
        body: [
          "Para reportar un error en una ficha, un registro público o un perfil, o para pedirnos que retiremos información personal, use el enlace “Reportar un error o pedir un retiro” donde aparezca, o escriba a {privacyEmail}. Nuestra {corrections} explica qué verificamos y cuánto tarda.",
        ],
      },
      {
        title: "Menores",
        body: ["PMRFP está pensado para empresas y profesionales. No está dirigido a menores, y no recopilamos a sabiendas información personal de menores."],
      },
      {
        title: "Cambios en esta política",
        body: [
          "Podemos actualizar esta política periódicamente. Cambiaremos la fecha de “última actualización” indicada arriba y, en caso de cambios importantes, daremos un aviso adicional cuando corresponda.",
        ],
      },
    ] as LegalBlock[],
    contact: {
      title: "Contacto",
      body: "¿Preguntas o solicitudes relacionadas con la privacidad? Escriba a nuestro Responsable de Privacidad a {privacyEmail}. Para cualquier otro asunto, escríbanos a {email}.",
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
        body: "Reparaciones relacionadas con reclamos, donde importa la rapidez de un contratista.",
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
        rest: " Su proyecto llega rápido a contratistas del oficio: mejor resultado, relación más sólida.",
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
        q: "¿Qué obtengo realmente con una ficha gratuita?",
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
        a: "La ficha gratuita es solo visibilidad. Trade Pro (${annual} al año) agrega el tablero de solicitudes de propuestas: vea los proyectos publicados, reciba alertas de coincidencias y manifieste interés. Destacado (${featuredAnnual} al año) agrega una ubicación destacada en sus categorías y regiones. Puede empezar gratis y mejorar su plan en cualquier momento.",
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
          "Presencia en las páginas de su oficio y su ciudad, las que Google indexa",
          "Envíe casos de estudio de proyectos",
        ],
      },
      pro: {
        name: "Trade Pro — ${annual} al año",
        lines: [
          "Todo lo incluido en la ficha gratuita",
          "Acceso completo al tablero de solicitudes de propuestas + alertas de coincidencias",
          "Manifieste interés en los proyectos publicados",
          "Galería de fotos del perfil, hasta 12 fotos",
        ],
      },
      featured: {
        name: "Destacado — ${featuredAnnual} al año",
        lines: [
          "Todo lo de Trade Pro",
          "Ubicación destacada en sus categorías y regiones de servicio",
          "Insignia de destacado en su perfil",
          "Antes que las fichas estándar en el directorio",
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
