/**
 * Programmatic SEO pages: /trades, /trades/[category], /trades/[category]/[city],
 * /regions, /regions/[slug], /for, /for/[vertical], /vs, /vs/[competitor].
 *
 * Placeholders: {site} brand, {trade} trade name, {lower} English lowercase
 * trade, {of} trade phrase in the page language ("en toiture" / "de techado",
 * lib/seo/phrases.fr / phrases.es), {place} place name, {in} place phrase in
 * the page language ("à Toronto", "en Ontario" / "en Toronto").
 * Every placeholder is always passed, so each language uses the ones it needs.
 * Long per-page data (verticals, competitors) lives in lib/seo/*.fr.ts and *.es.ts.
 */
const en = {
  crumbs: {
    home: "Home",
    trades: "Trades",
    regions: "Regions",
    solutions: "Solutions",
    compare: "Compare",
  },
  faqTitle: "Frequently asked",
  viewAll: "View all →",
  browseAll: "Browse all →",
  joinTrade: "Join as a Trade Company",
  seePricing: "See pricing",
  browseByRegion: "Browse by region",
  browseByTrade: "Browse by trade",
  browseDirectory: "Browse the directory",
  startPro: "Start Trade Pro",
  notFound: "Not found",

  tradesIndex: {
    meta: {
      title: "Trade Categories — Commercial Property Contractors in Canada",
      description:
        "Browse every trade category on {site} — from electrical and HVAC to snow removal and fire safety. Find commercial property contractors and RFP opportunities across Canada.",
    },
    eyebrow: "Trade categories",
    title: "Commercial property trades & service categories",
    lead: "Every category property managers source on {site}. Pick a trade to find contractors, see open RFP opportunities, and explore demand by region.",
    card: "Commercial {lower} contractors & RFPs",
    cta: {
      title: "Get listed in your trade category",
      description: "Become easy to find for property managers searching your category across Canada.",
    },
  },

  trade: {
    notFound: "Trade not found",
    meta: {
      title: "Commercial {trade} Contractors in Canada | Directory & RFPs",
      description:
        "Find commercial {lower} contractors across Canada and monitor {lower} RFP opportunities. Get your {lower} company listed on {site}.",
    },
    faqs: [
      {
        q: "How do I find commercial {lower} RFP opportunities in Canada?",
        a: "{site} aggregates commercial property {lower} RFPs from property managers, builders, and owners across Canada. Browse open opportunities and, with a Trade Pro membership, view full details and express interest.",
      },
      {
        q: "How do I get my {lower} company listed?",
        a: "Create a free company profile, choose {trade} as a service category and your service regions, and your company appears in the {site} vendor directory where property decision-makers search.",
      },
      {
        q: "Does {site} guarantee {lower} contracts?",
        a: "No. {site} is where property managers post RFPs and trades get found. We don't guarantee awards, responses, or revenue.",
      },
    ],
    listName: "{trade} companies",
    eyebrow: "Commercial {trade}",
    title: "Commercial {trade} Contractors & RFP Opportunities in Canada",
    lead: "Whether you run a {lower} company looking for commercial property work, or you manage properties and need a qualified {lower} contractor, {site} connects both sides — a focused directory plus a feed of {lower} RFP opportunities, matched by region.",
    costGuide: "Planning a {lower} project? See typical {lower} costs →",
    listCompany: "List your {lower} company",
    viewRfps: "View {lower} RFPs",
    openTitle: "Open {trade} opportunities",
    emptyRfps: {
      title: "No open {lower} RFPs right now",
      description: "New opportunities are added regularly — check back soon or get listed to be ready.",
    },
    companiesTitle: "{trade} companies in the directory",
    emptyVendors: {
      title: "Be the first {lower} company listed",
      description: "Create a profile and get discovered by property managers searching this category.",
    },
    templatesTitle: "Need to post a {lower} RFP? Start with a template",
    templatesLead:
      "Ready-to-use scope, requirements, and evaluation criteria for the most common {lower} jobs — customize and post in minutes.",
    allTemplates: "All templates →",
    useTemplate: "Use this template →",
    byRegionTitle: "{trade} by region",
    byRegionLead: "Open {lower} RFPs, past contracts and companies, place by place.",
    inPlace: "{trade} in {place}",
    cta: {
      title: "Win more commercial {lower} work",
      description: "Get listed and monitor {lower} RFPs across Canada — ${price} CAD/year for Trade Pro.",
    },
  },

  tradeCity: {
    meta: {
      vendorTitle: "Commercial {trade} Contractors in {place} | Directory & RFPs",
      vendorDescription: {
        one: "{n} commercial {lower} contractor serving {place} on {site} — compare companies, post an RFP free, and get quotes for {lower} work.",
        other: "{n} commercial {lower} contractors serving {place} on {site} — compare companies, post an RFP free, and get quotes for {lower} work.",
      },
      title: "{trade} RFPs & Tenders in {place}{open}",
      openSuffix: { one: " ({n} Open)", other: " ({n} Open)" },
      partOpen: {
        one: "{n} open {lower} RFPs and tenders in {place}",
        other: "{n} open {lower} RFPs and tenders in {place}",
      },
      partNoOpen: "{lower} RFPs and tenders in {place}",
      partPast: {
        one: "{n} past contracts with the winner{median}",
        other: "{n} past contracts with the winner{median}",
      },
      median: " (median {money})",
      join: ", plus ",
      description: "{parts}. Updated every morning on {site}.",
    },
    eyebrow: "{trade} · {place}",
    title: "{trade} RFPs & contracts in {place}",
    leadOpen: {
      one: "{n} {lower} tender is open for bids in {place} right now",
      other: "{n} {lower} tenders are open for bids in {place} right now",
    },
    leadNoOpen: "No {lower} tenders are open in {place} today",
    leadPast: {
      one: ", and {n} past contract shows who won the work and for how much",
      other: ", and {n} past contracts show who won the work and for how much",
    },
    leadTail: ". Updated every morning.",
    stats: {
      open: "Open now",
      past: "Past contracts",
      median: "Median award",
      companies: "Companies listed",
    },
    byEmail: "Get {lower} RFPs by email",
    hiring: "Hiring? Write an RFP free",
    vendorTitle: "Commercial {trade} Contractors in {place}",
    vendorLead: {
      one: "One {lower} company on {site} serves {place}. Managing property here? Post your {lower} project once, free, and interested contractors come to you.",
      other: "{n} {lower} companies on {site} serve {place}. Managing property here? Post your {lower} project once, free, and interested contractors come to you.",
    },
    postFree: "Post a {lower} RFP — free",
    openTitle: "Open {lower} RFPs in {place}",
    allRfps: "All {lower} RFPs →",
    more: { before: "+{n} more on the ", link: "RFP board", after: "." },
    pastTitle: "Past {lower} contracts in {place}",
    pastLead: "Awarded public contracts: what the work was, who won it and the published value.",
    table: { contract: "Contract", wonBy: "Won by", value: "Value", awarded: "Awarded" },
    topWinners: "Most frequent winners here:",
    companiesTitle: "{trade} companies serving {place}",
    companiesList: "{trade} companies in {place}",
    projectsTitle: "Recent {lower} projects in {place}",
    projectBy: "By {org} →",
    planningTitle: "Planning {lower} work in {place}?",
    costTitle: "What does it cost? →",
    costBody: "Planning ranges for {lower} work — before you collect real quotes.",
    templateTitle: "Start from an RFP template →",
    templateBody: "{name} — scope, requirements, and evaluation criteria, ready to customize.",
    otherPlaces: "{trade} in other places",
    otherTrades: "Other trades in {place}",
    faqs: {
      whereQ: "Where do {lower} RFPs and tenders in {place} come from?",
      wherePublic: "Public buyers publishing on {sources}",
      wherePm: "Property managers and owners",
      wherePlusPm: ", and property managers posting on {site}",
      whereTail:
        ". {site} checks the official open-data feeds every morning and lists the {lower} work, so you don't have to search each portal. Bids go directly to the buyer.",
      payQ: "How much do {lower} contracts in {place} pay?",
      payA: "Across the last {count} awarded {lower} contracts here with a published value, the median was {median} CAD, ranging from {min} to {max}. Each past contract below shows who won it and for how much.",
      firstQ: "How do I hear about new {lower} RFPs in {place} first?",
      firstA:
        "Trade Pro (${annual} CAD a year, or ${monthly} a month) emails you the morning a matching {lower} tender or RFP posts in your regions, with the full scope, documents and the buyer's contact.",
      hiringQ: "Hiring for {lower} work in {place}?",
      hiringA:
        "Write the RFP free with the {site} RFP Writer, then post it free. {trade} companies serving {place} see it and express interest.",
      quotesQ: "How do I get quotes from {lower} contractors in {place}?",
      quotesA:
        "Post your project as an RFP on {site} — free for property managers and owners. {trade} contractors serving {place} see it and express interest, and you compare respondents in one place instead of chasing quotes by email.",
      vettedQ: "Are these {lower} companies vetted?",
      vettedA:
        "Each company maintains its own profile, including insurance and licensing details where provided. Listings marked Verified have been reviewed by {site}. Always confirm credentials directly before awarding work.",
      listedQ: "I run a {lower} company serving {place} — how do I get listed?",
      listedA:
        "Create a free profile, select {trade} as a service category and {place} as a service region. Your company appears in this directory where local property managers search.",
    },
    ctaPro: {
      title: "Get {lower} RFPs in {place} the morning they post",
      description: "Trade Pro: daily email alerts, full scopes, documents and buyer contacts. ${annual} CAD a year.",
    },
    ctaHire: {
      title: "Need a {lower} contractor in {place}?",
      description: "Post your project free on {site} and compare interested {lower} companies side by side.",
      primary: "Post an RFP free",
    },
    allTrade: "All {trade}",
  },

  regionsIndex: {
    meta: {
      title: "Regions — Commercial Property Vendors & RFPs by Region",
      description:
        "Explore commercial property trades and RFP opportunities by region on {site} — from the Greater Toronto Area to Vancouver, Calgary, Montreal, and beyond.",
    },
    eyebrow: "Regions",
    title: "Commercial property vendors & RFPs by region",
    lead: "Pick a region to find local trades and property RFP opportunities. New regions open as demand grows — if yours is still building out, join the founding list and we'll alert you as trades come online.",
    cta: {
      title: "List your company across the regions you serve",
      description: "Choose your service regions and appear where property managers are searching.",
    },
  },

  region: {
    notFound: "Region not found",
    meta: {
      title: "Commercial Property Vendors & RFPs in {place}",
      description:
        "Find commercial property trades and service companies in {place}, and monitor local property RFP opportunities on {site}.",
    },
    faqs: [
      {
        q: "How do I find commercial property RFPs in {place}?",
        a: "{site} aggregates commercial property RFPs from property managers, builders, and owners in {place}. Browse opportunities and, with Trade Pro, view full details and express interest.",
      },
      {
        q: "How do I find vendors in {place}?",
        a: "Browse the {site} directory filtered to {place} to discover trades and service companies by category, then request an introduction or contact them directly.",
      },
    ],
    listName: "Vendors in {place}",
    title: "Commercial Property Vendors & RFP Opportunities in {place}",
    lead: "{site} connects property managers, builders, and owners in {place} with qualified local trades — and gives trade companies a focused feed of property RFP opportunities in the area.",
    findVendors: "Find vendors in {place}",
    viewRfps: "View {place} RFPs",
    openTitle: "Open opportunities in {place}",
    recentTitle: "Recent RFPs in {place}",
    emptyRfps: {
      title: "No RFPs in {place} right now",
      description: "Create a free profile and save your trade and region — we'll notify you when a match is posted.",
    },
    closedNote: "Nothing is open right now. These closed projects show the kind of work posted here.",
    vendorsTitle: "Vendors serving {place}",
    emptyVendors: {
      title: "Be the first vendor listed in {place}",
      description: "Create a profile and get discovered by property managers in your area.",
    },
    tradesTitle: "Trades in {place}",
    tradeRfps: "{trade} RFPs in {place}",
    tradeIn: "{trade} in {place}",
    cta: {
      title: "Get found in {place}",
      description: "List your trade company where property decision-makers in your region are searching.",
    },
  },

  forIndex: {
    meta: {
      title: "Solutions — PMRFP for Builders, Trades, Sales Teams & Investors",
      description:
        "How {site} works for every side of commercial property: builders, trade contractors, sales teams, and property investors.",
    },
    eyebrow: "Solutions",
    title: "Built for every side of commercial property",
    lead: "Whoever you are in the commercial property world, {site} has a place for you.",
    cardEyebrow: "{who}",
    learnMore: "Learn more",
    cta: {
      title: "Find your place in the network",
      description: "Property managers post building RFPs free. Vetted trades bid on the work.",
      primary: "Join {site}",
      secondary: "Compare alternatives",
    },
  },

  vertical: {
    eyebrow: "For {who}",
    badge: "open contracts on the board today",
    numbers: {
      open: "open contracts right now",
      closing: "close in the next 7 days",
      trades: "trades covered",
      regions: "regions in Canada and the U.S.",
    },
    changesTitle: "What changes when you use PMRFP",
    today: "Today",
    withUs: "With PMRFP",
    howTitle: "How it works",
    steps: {
      buyer: [
        { title: "Describe the job", desc: "Four questions in the free RFP writer, or post your own scope. Takes minutes." },
        { title: "Trades come to you", desc: "Vetted companies that cover your trade and area see it and respond with interest." },
        { title: "Compare and hire", desc: "Profiles, credentials and past work side by side. No obligation to hire anyone." },
      ],
      seller: [
        { title: "Get listed free", desc: "A company profile with your trades, service area, insurance and projects." },
        { title: "See the work", desc: "Public tenders and property-manager RFPs for your trade, every morning." },
        { title: "Bid and win", desc: "Trade Pro unlocks full scope, buyer contacts and what similar contracts sold for." },
      ],
    },
    proofBuyer: "Companies ready to quote",
    proofSeller: "Open on the board right now",
    seeAllOpen: "See all {n} open",
    questions: "Questions",
  },

  vsIndex: {
    meta: {
      title: "Compare PMRFP — Alternatives for Canadian Commercial Trades",
      description:
        "How {site} compares to MERX, Biddingo, ConstructConnect, HomeStars, VendorPM, and more — for Canadian trades and property managers.",
    },
    eyebrow: "Compare",
    title: "How {site} compares",
    lead: "Most platforms are for government tenders, new-build leads, or residential homeowners. {site} is purpose-built for Canadian private commercial property — here's how it stacks up.",
    card: "{site} vs {name}",
    compare: "Compare",
    cta: {
      title: "See why trades choose PMRFP",
      description: "Commercial & residential property focused, $249 CAD/year flat.",
    },
  },

  vs: {
    notFound: "Comparison not found",
    meta: {
      title: "{name} Alternative & Pricing (2026): {name} vs {site}",
      description: "{name} vs {site}, side by side: price, coverage and who each is built for. Browse open commercial property tenders free; {site} Trade Pro is ${annual} CAD/yr flat.",
    },
    crumb: "vs {name}",
    trail: "{site} vs {name}",
    eyebrow: "Comparison",
    title: "{name} vs {site}",
    titleTenders: ": price, coverage and a cheaper option",
    startPro: "Start Trade Pro — ${annual}/yr",
    seeOpen: "See {n} open tenders free",
    costsTitle: "What {name} costs",
    source: { before: "From ", link: "{name}'s pricing page", after: ", checked {date}." },
    priceHead: { plan: "Plan", covers: "Covers", price: "Price", perYear: "Per year" },
    proRow: {
      plan: "{site} Trade Pro",
      covers: "Building and property tenders and RFPs, daily email of matches",
      price: "${monthly}/month, or ${annual}/year",
      perYear: "${annual}",
    },
    glanceTitle: "At a glance",
    feature: "Feature",
    tendersTitle: {
      one: "{n} public building tenders open on {site} right now",
      other: "{n} public building tenders open on {site} right now",
    },
    tendersLead:
      "Imported every morning from CanadaBuys, the City of Toronto, Quebec's SEAO and Yukon. Titles and deadlines are free to browse; Trade Pro emails you the day a match posts.",
    whatTitle: "What {name} is — and where it fits",
    bestFor: "Best for:",
    pricing: "Pricing:",
    strengthsTitle: "{name} strengths",
    winsTitle: "Where {site} wins",
    faqTitle: "FAQ",
    disclaimer:
      "Comparison reflects publicly available information as of 2026 and PMRFP's own positioning. Competitor names and trademarks belong to their respective owners. {site} does not guarantee work or outcomes.",
    cta: {
      title: "Ready to try the commercial & residential property network?",
      description: "Free directory listing, or go Pro for ${annual} CAD/year.",
      secondary: "See all comparisons",
    },
  },

  solution: {
    eyebrow: "For {trade} companies",
    disclosure: "{name} is built by Talkerstein Consulting Group, an affiliate of PMRFP.",
  },
};

const fr: typeof en = {
  crumbs: {
    home: "Accueil",
    trades: "Corps de métier",
    regions: "Régions",
    solutions: "Solutions",
    compare: "Comparer",
  },
  faqTitle: "Questions fréquentes",
  viewAll: "Tout voir →",
  browseAll: "Tout parcourir →",
  joinTrade: "S'inscrire comme entrepreneur",
  seePricing: "Voir les tarifs",
  browseByRegion: "Parcourir par région",
  browseByTrade: "Parcourir par corps de métier",
  browseDirectory: "Parcourir le répertoire",
  startPro: "Commencer Trade Pro",
  notFound: "Page introuvable",

  tradesIndex: {
    meta: {
      title: "Corps de métier — Entrepreneurs en immobilier commercial au Canada",
      description:
        "Parcourez tous les corps de métier sur {site}, de l'électricité et du CVC au déneigement et à la sécurité incendie. Trouvez des entrepreneurs en immobilier commercial et des appels d'offres partout au Canada.",
    },
    eyebrow: "Corps de métier",
    title: "Corps de métier et catégories de services en immobilier commercial",
    lead: "Toutes les catégories que les gestionnaires immobiliers recherchent sur {site}. Choisissez un corps de métier pour trouver des entrepreneurs, voir les appels d'offres ouverts et explorer la demande par région.",
    card: "Entrepreneurs et appels d'offres commerciaux {of}",
    cta: {
      title: "Inscrivez-vous dans votre corps de métier",
      description: "Soyez facile à trouver pour les gestionnaires immobiliers qui cherchent votre catégorie partout au Canada.",
    },
  },

  trade: {
    notFound: "Corps de métier introuvable",
    meta: {
      title: "Entrepreneurs {of} pour immeubles commerciaux au Canada | Répertoire et appels d'offres",
      description:
        "Trouvez des entrepreneurs {of} pour immeubles commerciaux partout au Canada et suivez les appels d'offres {of}. Inscrivez votre entreprise {of} sur {site}.",
    },
    faqs: [
      {
        q: "Comment trouver des appels d'offres commerciaux {of} au Canada?",
        a: "{site} regroupe les appels d'offres immobiliers commerciaux {of} des gestionnaires immobiliers, constructeurs et propriétaires de partout au Canada. Parcourez les occasions ouvertes et, avec un abonnement Trade Pro, consultez tous les détails et manifestez votre intérêt.",
      },
      {
        q: "Comment inscrire mon entreprise {of}?",
        a: "Créez un profil d'entreprise gratuit, choisissez {trade} comme catégorie de service ainsi que vos régions desservies, et votre entreprise apparaît dans le répertoire des fournisseurs de {site}, là où les décideurs immobiliers cherchent.",
      },
      {
        q: "{site} garantit-il des contrats {of}?",
        a: "Non. {site} est l'endroit où les gestionnaires immobiliers publient leurs appels d'offres et où les entrepreneurs se font trouver. Nous ne garantissons ni l'octroi de contrats, ni les réponses, ni les revenus.",
      },
    ],
    listName: "Entreprises {of}",
    eyebrow: "{trade} · Immobilier commercial",
    title: "Entrepreneurs {of} et appels d'offres commerciaux au Canada",
    lead: "Que vous dirigiez une entreprise {of} à la recherche de travaux en immobilier commercial ou que vous gériez des immeubles et ayez besoin d'un entrepreneur {of} qualifié, {site} relie les deux : un répertoire ciblé et un fil d'appels d'offres {of}, jumelés par région.",
    costGuide: "Vous planifiez un projet {of}? Voyez les coûts habituels →",
    listCompany: "Inscrire votre entreprise {of}",
    viewRfps: "Voir les appels d'offres {of}",
    openTitle: "Occasions ouvertes {of}",
    emptyRfps: {
      title: "Aucun appel d'offres {of} ouvert pour le moment",
      description: "De nouvelles occasions s'ajoutent régulièrement. Revenez bientôt ou inscrivez-vous pour être prêt.",
    },
    companiesTitle: "Entreprises {of} dans le répertoire",
    emptyVendors: {
      title: "Soyez la première entreprise {of} inscrite",
      description: "Créez un profil et faites-vous découvrir par les gestionnaires immobiliers qui cherchent dans cette catégorie.",
    },
    templatesTitle: "Un appel d'offres {of} à publier? Partez d'un modèle",
    templatesLead:
      "Portée, exigences et critères d'évaluation prêts à l'emploi pour les travaux {of} les plus courants. Personnalisez et publiez en quelques minutes.",
    allTemplates: "Tous les modèles →",
    useTemplate: "Utiliser ce modèle →",
    byRegionTitle: "{trade} par région",
    byRegionLead: "Appels d'offres {of} ouverts, contrats passés et entreprises, lieu par lieu.",
    inPlace: "{trade} {in}",
    cta: {
      title: "Décrochez plus de contrats commerciaux {of}",
      description: "Inscrivez-vous et suivez les appels d'offres {of} partout au Canada : {price} $ CAD/an pour Trade Pro.",
    },
  },

  tradeCity: {
    meta: {
      vendorTitle: "Entrepreneurs {of} pour immeubles commerciaux {in} | Répertoire et appels d'offres",
      vendorDescription: {
        one: "{n} entrepreneur commercial {of} actif {in} sur {site}. Comparez les entreprises, publiez un appel d'offres gratuitement et obtenez des prix pour vos travaux {of}.",
        other: "{n} entrepreneurs commerciaux {of} actifs {in} sur {site}. Comparez les entreprises, publiez un appel d'offres gratuitement et obtenez des prix pour vos travaux {of}.",
      },
      title: "Appels d'offres {of} {in}{open}",
      openSuffix: { one: " ({n} ouvert)", other: " ({n} ouverts)" },
      partOpen: {
        one: "{n} appel d'offres {of} ouvert {in}",
        other: "{n} appels d'offres {of} ouverts {in}",
      },
      partNoOpen: "appels d'offres {of} {in}",
      partPast: {
        one: "{n} contrat passé avec son adjudicataire{median}",
        other: "{n} contrats passés avec leur adjudicataire{median}",
      },
      median: " (médiane : {money})",
      join: ", plus ",
      description: "{parts}. Mis à jour chaque matin sur {site}.",
    },
    eyebrow: "{trade} · {place}",
    title: "Appels d'offres et contrats {of} {in}",
    leadOpen: {
      one: "{n} appel d'offres {of} est ouvert aux soumissions {in} en ce moment",
      other: "{n} appels d'offres {of} sont ouverts aux soumissions {in} en ce moment",
    },
    leadNoOpen: "Aucun appel d'offres {of} n'est ouvert {in} aujourd'hui",
    leadPast: {
      one: ", et {n} contrat passé montre qui a remporté les travaux et pour combien",
      other: ", et {n} contrats passés montrent qui a remporté les travaux et pour combien",
    },
    leadTail: ". Mis à jour chaque matin.",
    stats: {
      open: "Ouverts",
      past: "Contrats passés",
      median: "Valeur médiane",
      companies: "Entreprises inscrites",
    },
    byEmail: "Recevoir les appels d'offres {of} par courriel",
    hiring: "Vous embauchez? Rédigez un appel d'offres gratuitement",
    vendorTitle: "Entrepreneurs {of} pour immeubles commerciaux {in}",
    vendorLead: {
      one: "Une entreprise {of} inscrite sur {site} est active {in}. Vous gérez des immeubles dans le coin? Publiez votre projet {of} une seule fois, gratuitement, et les entrepreneurs intéressés viennent à vous.",
      other: "{n} entreprises {of} inscrites sur {site} sont actives {in}. Vous gérez des immeubles dans le coin? Publiez votre projet {of} une seule fois, gratuitement, et les entrepreneurs intéressés viennent à vous.",
    },
    postFree: "Publier un appel d'offres {of} — gratuit",
    openTitle: "Appels d'offres {of} ouverts {in}",
    allRfps: "Tous les appels d'offres {of} →",
    more: { before: "+{n} autres sur le ", link: "tableau des appels d'offres", after: "." },
    pastTitle: "Contrats passés {of} {in}",
    pastLead: "Contrats publics octroyés : la nature des travaux, l'adjudicataire et la valeur publiée.",
    table: { contract: "Contrat", wonBy: "Adjudicataire", value: "Valeur", awarded: "Octroyé" },
    topWinners: "Adjudicataires les plus fréquents ici :",
    companiesTitle: "Entreprises {of} actives {in}",
    companiesList: "Entreprises {of} {in}",
    projectsTitle: "Projets {of} récents {in}",
    projectBy: "Par {org} →",
    planningTitle: "Vous planifiez des travaux {of} {in}?",
    costTitle: "Combien ça coûte? →",
    costBody: "Des fourchettes de prix pour les travaux {of}, avant de recueillir de vraies soumissions.",
    templateTitle: "Partir d'un modèle d'appel d'offres →",
    templateBody: "{name} : portée, exigences et critères d'évaluation, prêts à personnaliser.",
    otherPlaces: "{trade} ailleurs",
    otherTrades: "Autres corps de métier {in}",
    faqs: {
      whereQ: "D'où viennent les appels d'offres {of} {in}?",
      wherePublic: "Des acheteurs publics qui publient sur {sources}",
      wherePm: "Des gestionnaires immobiliers et des propriétaires",
      wherePlusPm: ", ainsi que des gestionnaires immobiliers qui publient sur {site}",
      whereTail:
        ". Chaque matin, {site} vérifie les sources officielles de données ouvertes et affiche les travaux {of}, pour que vous n'ayez pas à fouiller chaque portail. Les soumissions sont envoyées directement à l'acheteur.",
      payQ: "Combien rapportent les contrats {of} {in}?",
      payA: "Sur les {count} derniers contrats {of} octroyés ici dont la valeur a été publiée, la médiane était de {median} CAD, pour une fourchette allant de {min} à {max}. Chaque contrat passé ci-dessous indique qui l'a remporté et pour combien.",
      firstQ: "Comment être informé en premier des nouveaux appels d'offres {of} {in}?",
      firstA:
        "Trade Pro ({annual} $ CAD par année, ou {monthly} $ par mois) vous envoie un courriel le matin même où un appel d'offres {of} correspondant est publié dans vos régions, avec la portée complète, les documents et les coordonnées de l'acheteur.",
      hiringQ: "Vous embauchez pour des travaux {of} {in}?",
      hiringA:
        "Rédigez votre appel d'offres gratuitement avec le Rédacteur d'appels d'offres de {site}, puis publiez-le gratuitement. Les entreprises {of} actives {in} le voient et manifestent leur intérêt.",
      quotesQ: "Comment obtenir des prix d'entrepreneurs {of} {in}?",
      quotesA:
        "Publiez votre projet sous forme d'appel d'offres sur {site}, gratuitement pour les gestionnaires immobiliers et les propriétaires. Les entrepreneurs {of} actifs {in} le voient et manifestent leur intérêt, et vous comparez les répondants au même endroit au lieu de courir après les prix par courriel.",
      vettedQ: "Ces entreprises {of} sont-elles vérifiées?",
      vettedA:
        "Chaque entreprise tient à jour son propre profil, y compris ses assurances et ses permis lorsqu'elle les fournit. Les fiches marquées Vérifié ont été examinées par {site}. Confirmez toujours les qualifications directement avant d'octroyer des travaux.",
      listedQ: "J'ai une entreprise {of} active {in}. Comment m'inscrire?",
      listedA:
        "Créez un profil gratuit, choisissez {trade} comme catégorie de service et {place} comme région desservie. Votre entreprise apparaît dans ce répertoire, là où les gestionnaires immobiliers de la région cherchent.",
    },
    ctaPro: {
      title: "Recevez les appels d'offres {of} {in} le matin même de leur publication",
      description: "Trade Pro : alertes quotidiennes par courriel, portées complètes, documents et coordonnées des acheteurs. {annual} $ CAD par année.",
    },
    ctaHire: {
      title: "Besoin d'un entrepreneur {of} {in}?",
      description: "Publiez votre projet gratuitement sur {site} et comparez côte à côte les entreprises {of} intéressées.",
      primary: "Publier un appel d'offres gratuitement",
    },
    allTrade: "Toute la catégorie {trade}",
  },

  regionsIndex: {
    meta: {
      title: "Régions — Fournisseurs et appels d'offres immobiliers commerciaux par région",
      description:
        "Explorez les entrepreneurs et les appels d'offres en immobilier commercial par région sur {site}, du Grand Toronto à Vancouver, Calgary, Montréal et au-delà.",
    },
    eyebrow: "Régions",
    title: "Fournisseurs et appels d'offres immobiliers commerciaux par région",
    lead: "Choisissez une région pour trouver des entrepreneurs locaux et des appels d'offres immobiliers. De nouvelles régions s'ouvrent au rythme de la demande. Si la vôtre est encore en développement, inscrivez-vous à la liste des membres fondateurs et nous vous avertirons à mesure que des entrepreneurs s'y ajoutent.",
    cta: {
      title: "Inscrivez votre entreprise dans toutes les régions que vous desservez",
      description: "Choisissez vos régions desservies et apparaissez là où les gestionnaires immobiliers cherchent.",
    },
  },

  region: {
    notFound: "Région introuvable",
    meta: {
      title: "Fournisseurs et appels d'offres immobiliers commerciaux {in}",
      description:
        "Trouvez des entrepreneurs et des entreprises de services en immobilier commercial {in}, et suivez les appels d'offres immobiliers locaux sur {site}.",
    },
    faqs: [
      {
        q: "Comment trouver des appels d'offres immobiliers commerciaux {in}?",
        a: "{site} regroupe les appels d'offres immobiliers commerciaux des gestionnaires immobiliers, constructeurs et propriétaires {in}. Parcourez les occasions et, avec Trade Pro, consultez tous les détails et manifestez votre intérêt.",
      },
      {
        q: "Comment trouver des fournisseurs {in}?",
        a: "Parcourez le répertoire de {site} filtré pour la région {place} afin de découvrir des entrepreneurs et des entreprises de services par catégorie, puis demandez une présentation ou communiquez directement avec eux.",
      },
    ],
    listName: "Fournisseurs {in}",
    title: "Fournisseurs et appels d'offres immobiliers commerciaux {in}",
    lead: "{site} met en relation les gestionnaires immobiliers, constructeurs et propriétaires {in} avec des entrepreneurs locaux qualifiés, et offre aux entrepreneurs un fil ciblé d'appels d'offres immobiliers dans la région.",
    findVendors: "Trouver des fournisseurs {in}",
    viewRfps: "Voir les appels d'offres {in}",
    openTitle: "Occasions ouvertes {in}",
    recentTitle: "Appels d'offres récents {in}",
    emptyRfps: {
      title: "Aucun appel d'offres {in} pour le moment",
      description:
        "Créez un profil gratuit et enregistrez votre corps de métier et votre région. Nous vous avertirons dès qu'une occasion correspondante est publiée.",
    },
    closedNote: "Rien n'est ouvert en ce moment. Ces projets fermés montrent le genre de travaux publiés ici.",
    vendorsTitle: "Fournisseurs actifs {in}",
    emptyVendors: {
      title: "Soyez le premier fournisseur inscrit {in}",
      description: "Créez un profil et faites-vous découvrir par les gestionnaires immobiliers de votre région.",
    },
    tradesTitle: "Corps de métier {in}",
    tradeRfps: "Appels d'offres {of} {in}",
    tradeIn: "{trade} {in}",
    cta: {
      title: "Faites-vous trouver {in}",
      description: "Inscrivez votre entreprise là où les décideurs immobiliers de votre région cherchent.",
    },
  },

  forIndex: {
    meta: {
      title: "Solutions — PMRFP pour les constructeurs, entrepreneurs, équipes de vente et investisseurs",
      description:
        "Comment {site} fonctionne pour tous les acteurs de l'immobilier commercial : constructeurs, entrepreneurs spécialisés, équipes de vente et investisseurs immobiliers.",
    },
    eyebrow: "Solutions",
    title: "Conçu pour tous les acteurs de l'immobilier commercial",
    lead: "Peu importe votre rôle dans le monde de l'immobilier commercial, {site} a une place pour vous.",
    cardEyebrow: "Pour {who}",
    learnMore: "En savoir plus",
    cta: {
      title: "Trouvez votre place dans le réseau",
      description: "Les gestionnaires immobiliers publient gratuitement leurs appels d'offres. Des entrepreneurs vérifiés soumissionnent.",
      primary: "Joignez-vous à {site}",
      secondary: "Comparer les solutions",
    },
  },

  vertical: {
    eyebrow: "Pour {who}",
    badge: "contrats ouverts sur le tableau aujourd'hui",
    numbers: {
      open: "contrats ouverts en ce moment",
      closing: "se clôturent dans les 7 prochains jours",
      trades: "corps de métier couverts",
      regions: "régions au Canada et aux États-Unis",
    },
    changesTitle: "Ce qui change avec PMRFP",
    today: "Aujourd'hui",
    withUs: "Avec PMRFP",
    howTitle: "Comment ça marche",
    steps: {
      buyer: [
        { title: "Décrivez les travaux", desc: "Quatre questions dans le rédacteur d'appels d'offres gratuit, ou publiez votre propre portée. Quelques minutes suffisent." },
        { title: "Les entrepreneurs viennent à vous", desc: "Des entreprises vérifiées qui couvrent ce corps de métier et votre secteur le voient et manifestent leur intérêt." },
        { title: "Comparez et embauchez", desc: "Profils, qualifications et réalisations côte à côte. Aucune obligation d'embaucher qui que ce soit." },
      ],
      seller: [
        { title: "Inscrivez-vous gratuitement", desc: "Un profil d'entreprise avec vos corps de métier, votre territoire, vos assurances et vos projets." },
        { title: "Voyez les travaux", desc: "Les appels d'offres publics et ceux des gestionnaires immobiliers pour votre corps de métier, chaque matin." },
        { title: "Soumissionnez et gagnez", desc: "Trade Pro débloque la portée complète, les coordonnées des acheteurs et le prix obtenu pour des contrats semblables." },
      ],
    },
    proofBuyer: "Des entreprises prêtes à soumissionner",
    proofSeller: "Ouvert sur le tableau en ce moment",
    seeAllOpen: "Voir les {n} ouverts",
    questions: "Questions",
  },

  vsIndex: {
    meta: {
      title: "Comparer PMRFP — Solutions de rechange pour les entrepreneurs commerciaux canadiens",
      description:
        "Comment {site} se compare à MERX, Biddingo, ConstructConnect, HomeStars, VendorPM et d'autres, pour les entrepreneurs et les gestionnaires immobiliers canadiens.",
    },
    eyebrow: "Comparer",
    title: "Comment {site} se compare",
    lead: "La plupart des plateformes visent les appels d'offres gouvernementaux, les pistes de construction neuve ou les propriétaires de maisons. {site} est conçu spécialement pour l'immobilier commercial privé au Canada. Voici comment il se compare.",
    card: "{site} vs {name}",
    compare: "Comparer",
    cta: {
      title: "Découvrez pourquoi les entrepreneurs choisissent PMRFP",
      description: "Axé sur l'immobilier commercial et résidentiel, 249 $ CAD/an, prix fixe.",
    },
  },

  vs: {
    notFound: "Comparaison introuvable",
    meta: {
      title: "Alternative à {name} et tarifs (2026) : {name} vs {site}",
      description:
        "{name} vs {site} : prix, couverture et à qui chacun s'adresse. Consultez gratuitement les appels d'offres ouverts; Trade Pro de {site} coûte {annual} $ CAD/an, prix fixe.",
    },
    crumb: "vs {name}",
    trail: "{site} vs {name}",
    eyebrow: "Comparaison",
    title: "{name} vs {site}",
    titleTenders: " : prix, couverture et une option moins chère",
    startPro: "Commencer Trade Pro — {annual} $/an",
    seeOpen: "Voir gratuitement les {n} appels d'offres ouverts",
    costsTitle: "Ce que coûte {name}",
    source: { before: "Selon ", link: "la page de tarifs {nameOf}", after: ", vérifiée le {date}." },
    priceHead: { plan: "Forfait", covers: "Couverture", price: "Prix", perYear: "Par année" },
    proRow: {
      plan: "{site} Trade Pro",
      covers: "Appels d'offres publics et privés en bâtiment et en immobilier, courriel quotidien des occasions correspondantes",
      price: "{monthly} $/mois ou {annual} $/an",
      perYear: "{annual} $",
    },
    glanceTitle: "En un coup d'œil",
    feature: "Critère",
    tendersTitle: {
      one: "{n} appel d'offres public en bâtiment ouvert sur {site} en ce moment",
      other: "{n} appels d'offres publics en bâtiment ouverts sur {site} en ce moment",
    },
    tendersLead:
      "Importés chaque matin d'AchatsCanada, de la Ville de Toronto, du SEAO du Québec et du Yukon. Les titres et les dates de clôture sont consultables gratuitement; Trade Pro vous envoie un courriel le jour même où une occasion correspondante est publiée.",
    whatTitle: "Ce qu'est {name}, et à qui il s'adresse",
    bestFor: "Idéal pour :",
    pricing: "Tarifs :",
    strengthsTitle: "Points forts {nameOf}",
    winsTitle: "Là où {site} l'emporte",
    faqTitle: "Questions fréquentes",
    disclaimer:
      "Cette comparaison reflète l'information publique disponible en 2026 et le positionnement propre à PMRFP. Les noms et marques de commerce des concurrents appartiennent à leurs propriétaires respectifs. {site} ne garantit ni travaux ni résultats.",
    cta: {
      title: "Prêt à essayer le réseau de l'immobilier commercial et résidentiel?",
      description: "Inscription gratuite au répertoire, ou passez à Pro pour {annual} $ CAD/an.",
      secondary: "Voir toutes les comparaisons",
    },
  },

  solution: {
    eyebrow: "Pour les entreprises {of}",
    disclosure: "{name} est conçu par Talkerstein Consulting Group, une société affiliée à PMRFP.",
  },
};

/**
 * Spanish uses {of} for the Spanish trade phrase ("de techado",
 * lib/seo/phrases.es) and {in} for the Spanish place phrase ("en Toronto").
 */
const es: typeof en = {
  crumbs: {
    home: "Inicio",
    trades: "Oficios",
    regions: "Regiones",
    solutions: "Soluciones",
    compare: "Comparar",
  },
  faqTitle: "Preguntas frecuentes",
  viewAll: "Ver todo →",
  browseAll: "Explorar todo →",
  joinTrade: "Registrarse como contratista",
  seePricing: "Ver precios",
  browseByRegion: "Explorar por región",
  browseByTrade: "Explorar por oficio",
  browseDirectory: "Explorar el directorio",
  startPro: "Empezar con Trade Pro",
  notFound: "Página no encontrada",

  tradesIndex: {
    meta: {
      title: "Oficios — Contratistas para propiedades comerciales en Canadá",
      description:
        "Explore todos los oficios en {site}, desde electricidad y HVAC hasta remoción de nieve y seguridad contra incendios. Encuentre contratistas para propiedades comerciales y oportunidades de RFP en todo Canadá.",
    },
    eyebrow: "Oficios",
    title: "Oficios y categorías de servicios para propiedades comerciales",
    lead: "Todas las categorías que buscan los administradores de propiedades en {site}. Elija un oficio para encontrar contratistas, ver las licitaciones abiertas y explorar la demanda por región.",
    card: "Contratistas y licitaciones comerciales {of}",
    cta: {
      title: "Registre su empresa en su oficio",
      description: "Haga que lo encuentren fácilmente los administradores de propiedades que buscan su categoría en todo Canadá.",
    },
  },

  trade: {
    notFound: "Oficio no encontrado",
    meta: {
      title: "Contratistas {of} para edificios comerciales en Canadá | Directorio y licitaciones",
      description:
        "Encuentre contratistas {of} para edificios comerciales en todo Canadá y siga las licitaciones {of}. Registre su empresa {of} en {site}.",
    },
    faqs: [
      {
        q: "¿Cómo encuentro licitaciones comerciales {of} en Canadá?",
        a: "{site} reúne las solicitudes de propuestas (RFP) {of} para propiedades comerciales de administradores de propiedades, constructores y propietarios de todo Canadá. Explore las oportunidades abiertas y, con una membresía Trade Pro, vea todos los detalles y exprese su interés.",
      },
      {
        q: "¿Cómo registro mi empresa {of}?",
        a: "Cree gratis un perfil de empresa, elija {trade} como categoría de servicio junto con sus regiones de servicio, y su empresa aparecerá en el directorio de proveedores de {site}, donde buscan quienes toman las decisiones sobre las propiedades.",
      },
      {
        q: "¿{site} garantiza contratos {of}?",
        a: "No. {site} es donde los administradores de propiedades publican RFP y donde los contratistas se hacen visibles. No garantizamos adjudicaciones, respuestas ni ingresos.",
      },
    ],
    listName: "Empresas {of}",
    eyebrow: "{trade} · Propiedades comerciales",
    title: "Contratistas {of} y licitaciones comerciales en Canadá",
    lead: "Ya sea que dirija una empresa {of} en busca de trabajo en propiedades comerciales, o que administre propiedades y necesite un contratista {of} calificado, {site} conecta a ambas partes: un directorio especializado más un flujo de licitaciones {of}, según la región.",
    costGuide: "¿Planea un proyecto {of}? Vea los costos habituales →",
    listCompany: "Registre su empresa {of}",
    viewRfps: "Ver licitaciones {of}",
    openTitle: "Oportunidades abiertas {of}",
    emptyRfps: {
      title: "No hay licitaciones {of} abiertas en este momento",
      description: "Se agregan nuevas oportunidades con regularidad. Vuelva pronto o regístrese para estar listo.",
    },
    companiesTitle: "Empresas {of} en el directorio",
    emptyVendors: {
      title: "Sea la primera empresa {of} en el directorio",
      description: "Cree un perfil y deje que lo descubran los administradores de propiedades que buscan en esta categoría.",
    },
    templatesTitle: "¿Necesita publicar una RFP {of}? Empiece con una plantilla",
    templatesLead:
      "Alcance, requisitos y criterios de evaluación listos para usar en los trabajos {of} más comunes. Personalícela y publíquela en minutos.",
    allTemplates: "Todas las plantillas →",
    useTemplate: "Usar esta plantilla →",
    byRegionTitle: "{trade} por región",
    byRegionLead: "Licitaciones {of} abiertas, contratos anteriores y empresas, lugar por lugar.",
    inPlace: "{trade} {in}",
    cta: {
      title: "Gane más trabajos comerciales {of}",
      description: "Regístrese y siga las licitaciones {of} en todo Canadá: ${price} CAD al año con Trade Pro.",
    },
  },

  tradeCity: {
    meta: {
      vendorTitle: "Contratistas {of} para edificios comerciales {in} | Directorio y licitaciones",
      vendorDescription: {
        one: "En {site}, {n} contratista comercial {of} da servicio {in}: compare empresas, publique una RFP gratis y obtenga cotizaciones para sus trabajos {of}.",
        other: "En {site}, {n} contratistas comerciales {of} dan servicio {in}: compare empresas, publique una RFP gratis y obtenga cotizaciones para sus trabajos {of}.",
      },
      title: "Licitaciones {of} {in}{open}",
      openSuffix: { one: " ({n} abierta)", other: " ({n} abiertas)" },
      partOpen: {
        one: "{n} licitación {of} abierta {in}",
        other: "{n} licitaciones {of} abiertas {in}",
      },
      partNoOpen: "licitaciones {of} {in}",
      partPast: {
        one: "{n} contrato anterior con su adjudicatario{median}",
        other: "{n} contratos anteriores con sus adjudicatarios{median}",
      },
      median: " (mediana: {money})",
      join: ", además de ",
      description: "{parts}. Actualizado cada mañana en {site}.",
    },
    eyebrow: "{trade} · {place}",
    title: "Licitaciones y contratos {of} {in}",
    leadOpen: {
      one: "{n} licitación {of} está abierta a ofertas {in} en este momento",
      other: "{n} licitaciones {of} están abiertas a ofertas {in} en este momento",
    },
    leadNoOpen: "Hoy no hay licitaciones {of} abiertas {in}",
    leadPast: {
      one: ", y {n} contrato anterior muestra quién ganó el trabajo y por cuánto",
      other: ", y {n} contratos anteriores muestran quién ganó el trabajo y por cuánto",
    },
    leadTail: ". Se actualiza cada mañana.",
    stats: {
      open: "Abiertas ahora",
      past: "Contratos anteriores",
      median: "Valor mediano",
      companies: "Empresas registradas",
    },
    byEmail: "Reciba por correo las licitaciones {of}",
    hiring: "¿Va a contratar? Redacte una RFP gratis",
    vendorTitle: "Contratistas {of} para edificios comerciales {in}",
    vendorLead: {
      one: "Una empresa {of} de {site} da servicio {in}. ¿Administra propiedades aquí? Publique su proyecto {of} una sola vez, gratis, y los contratistas interesados vendrán a usted.",
      other: "{n} empresas {of} de {site} dan servicio {in}. ¿Administra propiedades aquí? Publique su proyecto {of} una sola vez, gratis, y los contratistas interesados vendrán a usted.",
    },
    postFree: "Publicar una RFP {of} — gratis",
    openTitle: "Licitaciones {of} abiertas {in}",
    allRfps: "Todas las licitaciones {of} →",
    more: { before: "+{n} más en el ", link: "tablero de licitaciones", after: "." },
    pastTitle: "Contratos anteriores {of} {in}",
    pastLead: "Contratos públicos adjudicados: en qué consistió el trabajo, quién lo ganó y el valor publicado.",
    table: { contract: "Contrato", wonBy: "Adjudicatario", value: "Valor", awarded: "Adjudicado" },
    topWinners: "Adjudicatarios más frecuentes aquí:",
    companiesTitle: "Empresas {of} que dan servicio {in}",
    companiesList: "Empresas {of} {in}",
    projectsTitle: "Proyectos {of} recientes {in}",
    projectBy: "Por {org} →",
    planningTitle: "¿Planea trabajos {of} {in}?",
    costTitle: "¿Cuánto cuesta? →",
    costBody: "Rangos de costos para trabajos {of}, antes de reunir cotizaciones reales.",
    templateTitle: "Empiece con una plantilla de RFP →",
    templateBody: "{name}: alcance, requisitos y criterios de evaluación, listos para personalizar.",
    otherPlaces: "{trade} en otros lugares",
    otherTrades: "Otros oficios {in}",
    faqs: {
      whereQ: "¿De dónde vienen las licitaciones {of} {in}?",
      wherePublic: "De compradores públicos que publican en {sources}",
      wherePm: "De administradores de propiedades y propietarios",
      wherePlusPm: ", y de administradores de propiedades que publican en {site}",
      whereTail:
        ". Cada mañana, {site} revisa las fuentes oficiales de datos abiertos y publica los trabajos {of}, para que usted no tenga que buscar en cada portal. Las ofertas se presentan directamente al comprador.",
      payQ: "¿Cuánto pagan los contratos {of} {in}?",
      payA: "En los últimos {count} contratos {of} adjudicados aquí con valor publicado, la mediana fue de {median} CAD, con un rango de {min} a {max}. Cada contrato anterior de abajo muestra quién lo ganó y por cuánto.",
      firstQ: "¿Cómo me entero primero de las nuevas licitaciones {of} {in}?",
      firstA:
        "Trade Pro (${annual} CAD al año, o ${monthly} al mes) le envía un correo la misma mañana en que se publica una licitación o RFP {of} que le corresponde en sus regiones, con el alcance completo, los documentos y el contacto del comprador.",
      hiringQ: "¿Va a contratar trabajos {of} {in}?",
      hiringA:
        "Redacte la RFP gratis con el Redactor de RFP de {site} y luego publíquela gratis. Las empresas {of} que dan servicio {in} la verán y expresarán su interés.",
      quotesQ: "¿Cómo obtengo cotizaciones de contratistas {of} {in}?",
      quotesA:
        "Publique su proyecto como RFP en {site}, gratis para administradores de propiedades y propietarios. Los contratistas {of} que dan servicio {in} lo verán y expresarán su interés, y usted comparará a quienes respondan en un solo lugar en vez de perseguir cotizaciones por correo.",
      vettedQ: "¿Estas empresas {of} están verificadas?",
      vettedA:
        "Cada empresa mantiene su propio perfil, incluidos los datos de seguros y licencias cuando los proporciona. Los perfiles marcados como Verificado fueron revisados por {site}. Confirme siempre las credenciales directamente antes de adjudicar un trabajo.",
      listedQ: "Tengo una empresa {of} que da servicio {in}. ¿Cómo me registro?",
      listedA:
        "Cree un perfil gratis y seleccione {trade} como categoría de servicio y {place} como región de servicio. Su empresa aparecerá en este directorio, donde buscan los administradores de propiedades de la zona.",
    },
    ctaPro: {
      title: "Reciba las licitaciones {of} {in} la misma mañana en que se publican",
      description: "Trade Pro: alertas diarias por correo, alcances completos, documentos y contactos de los compradores. ${annual} CAD al año.",
    },
    ctaHire: {
      title: "¿Necesita un contratista {of} {in}?",
      description: "Publique su proyecto gratis en {site} y compare lado a lado las empresas {of} interesadas.",
      primary: "Publicar una RFP gratis",
    },
    allTrade: "Toda la categoría {trade}",
  },

  regionsIndex: {
    meta: {
      title: "Regiones — Proveedores y licitaciones de propiedades comerciales por región",
      description:
        "Explore oficios y oportunidades de RFP para propiedades comerciales por región en {site}, desde el Área Metropolitana de Toronto hasta Vancouver, Calgary, Montreal y más allá.",
    },
    eyebrow: "Regiones",
    title: "Proveedores y licitaciones de propiedades comerciales por región",
    lead: "Elija una región para encontrar contratistas locales y licitaciones de propiedades. Se abren nuevas regiones a medida que crece la demanda; si la suya todavía se está desarrollando, únase a la lista de fundadores y le avisaremos a medida que se sumen contratistas.",
    cta: {
      title: "Registre su empresa en todas las regiones donde trabaja",
      description: "Elija sus regiones de servicio y aparezca donde buscan los administradores de propiedades.",
    },
  },

  region: {
    notFound: "Región no encontrada",
    meta: {
      title: "Proveedores y licitaciones de propiedades comerciales {in}",
      description:
        "Encuentre contratistas y empresas de servicios para propiedades comerciales {in}, y siga las licitaciones de propiedades locales en {site}.",
    },
    faqs: [
      {
        q: "¿Cómo encuentro licitaciones de propiedades comerciales {in}?",
        a: "{site} reúne las RFP de propiedades comerciales de administradores de propiedades, constructores y propietarios {in}. Explore las oportunidades y, con Trade Pro, vea todos los detalles y exprese su interés.",
      },
      {
        q: "¿Cómo encuentro proveedores {in}?",
        a: "Explore el directorio de {site} filtrado por {place} para descubrir contratistas y empresas de servicios por categoría; luego pida una presentación o contáctelos directamente.",
      },
    ],
    listName: "Proveedores {in}",
    title: "Proveedores y oportunidades de licitación de propiedades comerciales {in}",
    lead: "{site} conecta a administradores de propiedades, constructores y propietarios {in} con contratistas locales calificados, y ofrece a las empresas de oficios un flujo especializado de licitaciones de propiedades en la zona.",
    findVendors: "Encontrar proveedores {in}",
    viewRfps: "Ver licitaciones {in}",
    openTitle: "Oportunidades abiertas {in}",
    recentTitle: "Licitaciones recientes {in}",
    emptyRfps: {
      title: "No hay licitaciones {in} en este momento",
      description: "Cree un perfil gratis y guarde su oficio y su región: le avisaremos cuando se publique una oportunidad que le corresponda.",
    },
    closedNote: "No hay nada abierto en este momento. Estos proyectos cerrados muestran el tipo de trabajo que se publica aquí.",
    vendorsTitle: "Proveedores que dan servicio {in}",
    emptyVendors: {
      title: "Sea el primer proveedor registrado {in}",
      description: "Cree un perfil y deje que lo descubran los administradores de propiedades de su zona.",
    },
    tradesTitle: "Oficios {in}",
    tradeRfps: "Licitaciones {of} {in}",
    tradeIn: "{trade} {in}",
    cta: {
      title: "Haga que lo encuentren {in}",
      description: "Registre su empresa donde buscan quienes toman las decisiones sobre las propiedades de su región.",
    },
  },

  forIndex: {
    meta: {
      title: "Soluciones — PMRFP para constructores, contratistas, equipos de ventas e inversionistas",
      description:
        "Cómo funciona {site} para cada parte del sector de propiedades comerciales: constructores, contratistas de oficios, equipos de ventas e inversionistas inmobiliarios.",
    },
    eyebrow: "Soluciones",
    title: "Hecho para cada parte del sector de propiedades comerciales",
    lead: "Sea cual sea su papel en el mundo de las propiedades comerciales, {site} tiene un lugar para usted.",
    cardEyebrow: "Para {who}",
    learnMore: "Más información",
    cta: {
      title: "Encuentre su lugar en la red",
      description: "Los administradores de propiedades publican gratis las RFP de sus edificios. Contratistas verificados presentan ofertas.",
      primary: "Únase a {site}",
      secondary: "Comparar alternativas",
    },
  },

  vertical: {
    eyebrow: "Para {who}",
    badge: "contratos abiertos hoy en el tablero",
    numbers: {
      open: "contratos abiertos ahora mismo",
      closing: "cierran en los próximos 7 días",
      trades: "oficios cubiertos",
      regions: "regiones en Canadá y Estados Unidos",
    },
    changesTitle: "Lo que cambia cuando usa PMRFP",
    today: "Hoy",
    withUs: "Con PMRFP",
    howTitle: "Cómo funciona",
    steps: {
      buyer: [
        { title: "Describa el trabajo", desc: "Cuatro preguntas en el Redactor de RFP gratuito, o publique su propio alcance. Toma minutos." },
        { title: "Los contratistas vienen a usted", desc: "Empresas verificadas que cubren ese oficio y su zona la ven y le expresan su interés." },
        { title: "Compare y contrate", desc: "Perfiles, credenciales y trabajos anteriores lado a lado. Sin obligación de contratar a nadie." },
      ],
      seller: [
        { title: "Regístrese gratis", desc: "Un perfil de empresa con sus oficios, zona de servicio, seguros y proyectos." },
        { title: "Vea el trabajo", desc: "Licitaciones públicas y RFP de administradores de propiedades para su oficio, cada mañana." },
        { title: "Presente ofertas y gane", desc: "Trade Pro desbloquea el alcance completo, los contactos de los compradores y por cuánto se adjudicaron contratos similares." },
      ],
    },
    proofBuyer: "Empresas listas para cotizar",
    proofSeller: "Abiertas en el tablero ahora mismo",
    seeAllOpen: "Ver las {n} abiertas",
    questions: "Preguntas",
  },

  vsIndex: {
    meta: {
      title: "Comparar PMRFP — Alternativas para contratistas comerciales en Canadá",
      description:
        "Cómo se compara {site} con MERX, Biddingo, ConstructConnect, HomeStars, VendorPM y otros, para contratistas y administradores de propiedades en Canadá.",
    },
    eyebrow: "Comparar",
    title: "Cómo se compara {site}",
    lead: "La mayoría de las plataformas están pensadas para licitaciones gubernamentales, oportunidades de obra nueva o dueños de viviendas. {site} está hecho específicamente para las propiedades comerciales privadas de Canadá. Así se compara.",
    card: "{site} vs {name}",
    compare: "Comparar",
    cta: {
      title: "Vea por qué los contratistas eligen PMRFP",
      description: "Enfocado en propiedades comerciales y residenciales, $249 CAD al año, tarifa fija.",
    },
  },

  vs: {
    notFound: "Comparación no encontrada",
    meta: {
      title: "Alternativa a {name} y precios (2026): {name} vs {site}",
      description:
        "{name} vs {site}: precio, cobertura y para quién es cada uno. Vea gratis las licitaciones abiertas; Trade Pro de {site} cuesta ${annual} CAD al año, tarifa fija.",
    },
    crumb: "vs {name}",
    trail: "{site} vs {name}",
    eyebrow: "Comparación",
    title: "{name} vs {site}",
    titleTenders: ": precio, cobertura y una opción más económica",
    startPro: "Empezar con Trade Pro — ${annual} al año",
    seeOpen: "Ver gratis las {n} licitaciones abiertas",
    costsTitle: "Cuánto cuesta {name}",
    source: { before: "Según ", link: "la página de precios {nameOf}", after: ", consultada el {date}." },
    priceHead: { plan: "Plan", covers: "Cobertura", price: "Precio", perYear: "Por año" },
    proRow: {
      plan: "{site} Trade Pro",
      covers: "Licitaciones y RFP de edificios y propiedades, correo diario con las que le corresponden",
      price: "${monthly} al mes o ${annual} al año",
      perYear: "${annual}",
    },
    glanceTitle: "De un vistazo",
    feature: "Característica",
    tendersTitle: {
      one: "{n} licitación pública de edificios abierta en {site} ahora mismo",
      other: "{n} licitaciones públicas de edificios abiertas en {site} ahora mismo",
    },
    tendersLead:
      "Importadas cada mañana de CanadaBuys, la Ciudad de Toronto, el SEAO de Quebec y Yukon. Los títulos y las fechas de cierre se pueden consultar gratis; Trade Pro le envía un correo el mismo día en que se publica una que le corresponde.",
    whatTitle: "Qué es {name} y dónde encaja",
    bestFor: "Ideal para:",
    pricing: "Precios:",
    strengthsTitle: "Fortalezas {nameOf}",
    winsTitle: "Dónde gana {site}",
    faqTitle: "Preguntas frecuentes",
    disclaimer:
      "La comparación refleja la información pública disponible en 2026 y el posicionamiento propio de PMRFP. Los nombres y marcas comerciales de los competidores pertenecen a sus respectivos propietarios. {site} no garantiza trabajo ni resultados.",
    cta: {
      title: "¿Listo para probar la red de propiedades comerciales y residenciales?",
      description: "Ficha gratis en el directorio, o pase a Pro por ${annual} CAD al año.",
      secondary: "Ver todas las comparaciones",
    },
  },

  solution: {
    eyebrow: "Para empresas {of}",
    disclosure: "{name} fue creado por Talkerstein Consulting Group, una empresa afiliada a PMRFP.",
  },
};

export default { en, fr, es };
