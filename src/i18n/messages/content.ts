/**
 * Content pages: /rfp-templates, /cost-guides, /resources (index, grow, the two
 * static guides' chrome) and /case-studies. Server only (getT("content")).
 * `fr` and `es` are typed against `en`, so every key must exist in all three.
 *
 * Long content lives next to its English source: lib/seo/rfp-templates.{fr,es}.ts,
 * lib/seo/cost-guides.{fr,es}.ts and app/[lang]/(marketing)/resources/guides.{fr,es}.ts.
 */
const en = {
  crumbs: {
    home: "Home",
    templates: "RFP Templates",
    costGuides: "Cost Guides",
    resources: "Resources",
    caseStudies: "Case Studies",
  },

  templatesIndex: {
    meta: {
      title: "Free Property Management & Commercial Real Estate RFP Templates (Canada & US)",
      description:
        "20 ready-to-use RFP templates for property managers and commercial real estate owners — roofing, HVAC, snow, paving, painting, elevator service, mold and more. Customize and post in 60 seconds.",
    },
    listName: "Commercial & Residential RFP Templates",
    eyebrow: "RFP Templates",
    h1: "Free RFP templates — go from zero to posted in 60 seconds",
    lead: "Stop writing RFPs from scratch. These 20 templates cover the most common commercial and residential property jobs Canadian PMs put out to bid — pre-filled scope, requirements, timeline, and evaluation criteria. Click any template, customize in seconds, and post for free.",
    chipCount: "20 templates",
    chipPrefilled: "Pre-filled scope + requirements",
    chipPdf: "Free PDF download",
    writerBefore: "Want it written for your exact job?",
    writerLink: "Use the free RFP Writer →",
    writerAfter: "Four questions, two minutes.",
    useTemplate: "Use this template",
    byTradeTitle: "Browse by trade",
    byTradeLead: "Looking for a specific kind of work? Jump straight to the templates for that trade.",
    howEyebrow: "How it works",
    howTitle: "From template to posted RFP in 60 seconds",
    /** {brand} in the third step. */
    steps: [
      {
        label: "Step 1",
        title: "Pick a template",
        body: "Browse the 20 most common commercial and residential property jobs. Each is a real, ready-to-use scope of work — not a fill-in-the-blank stub.",
      },
      {
        label: "Step 2",
        title: "Customize in seconds",
        body: "Click “Use this template” — the title, scope, and requirements get pre-filled into the post-an-RFP form. Edit anything that doesn’t fit and save.",
      },
      {
        label: "Step 3",
        title: "Get bids from real trades",
        body: "Your RFP goes live on {brand}. Canadian trades in that trade can see it and express interest — you pick who to talk to. Posting is free.",
      },
    ],
    cta: {
      title: "Got a project? There's a template for that.",
      description:
        "Pick a template above, or post your own RFP from scratch on {brand}. Either way, Canadian trades can respond — free to post.",
      primary: "Post an RFP",
      secondary: "Browse the directory",
    },
  },

  /** Template detail. {trade} = trade name, {tradeLower} = lower-cased for mid-sentence. */
  template: {
    notFound: "Not found",
    eyebrow: "{trade} · RFP template",
    useTemplate: "Use this template",
    downloadPdf: "Download PDF",
    noAccount: "Don’t have an account? Sign up free →",
    factPrefilled: "Pre-filled scope + requirements",
    factTagged: "Tagged to /trades/{slug}",
    factPhases: "{n}-phase timeline",
    whenToUse: "When to use this template",
    sampleTitle: "Sample RFP title & summary",
    sampleLead: "What auto-fills when you click “Use this template” — you can edit anything.",
    titleLabel: "Title",
    summaryLabel: "Summary",
    scope: "Scope of work",
    requirements: "Standard requirements",
    timeline: "Suggested timeline",
    siteAccess: "Site access & logistics",
    questionsTitle: "Questions every bidder should answer",
    questionsLead: "Ask all bidders the same questions so you get apples-to-apples responses.",
    evaluationTitle: "Evaluation criteria",
    evaluationLead: "How you’ll weigh bids when you receive them.",
    costEyebrow: "Pair with the cost guide",
    costLead: "Read what a typical {tradeLower} job runs in Canada before you post — so you know the budget range to expect.",
    costCta: "See the cost guide",
    matchingTitle: "Trades who match this work",
    matchingLead: "Once you post, these are the kind of vendors who’ll see your RFP and express interest.",
    browseCompanies: "Browse {trade} companies",
    fullDirectory: "Full directory",
    faqTitle: "Common questions",
    moreTemplates: "More {trade} RFP templates",
    seeTemplate: "See template",
    cta: {
      title: "Ready to post your {tradeLower} RFP?",
      description:
        "Click below to start with the {name} template pre-filled. Customize anything that doesn't fit your project and post free.",
      primary: "Use this template",
      secondary: "See all templates",
    },
  },

  print: {
    metaTitle: "{name} — Print View",
    pressBefore: "Press",
    pressKeys: "Ctrl/Cmd + P",
    /** Follows the key box directly (no space in English, as before). */
    pressAfter: "and choose “Save as PDF” if the print dialog didn’t open automatically.",
    back: "← Back to template",
    headerEyebrow: "RFP Template — {brand}",
    whenToUse: "When to use this template",
    sampleTitle: "Sample title",
    summary: "Summary",
    scope: "Scope of work",
    requirements: "Standard requirements",
    timeline: "Suggested timeline",
    labelColon: "{label}:",
    siteAccess: "Site access & logistics",
    questions: "Questions every bidder should answer",
    evaluation: "Evaluation criteria",
    footerTitle: "{brand} — Free RFP template",
    footerBefore:
      "This is a scoping template, not a contract. Have your lawyer review the final RFP and procurement contract. For real, scope-specific pricing, post your RFP on",
    footerAfter: " — Canadian trades respond free.",
    printedFrom: "Printed from {url}",
  },

  templateOg: {
    eyebrowFallback: "RFP template",
    notFound: "Template not found",
    eyebrow: "RFP template · {trade}",
    caption: "Free · ready-to-post",
  },

  costIndex: {
    meta: {
      title: "Commercial Property Cost Guides (Canada) — What Trade Work Costs",
      description:
        "Plain-English cost guides for Canadian commercial property work — roofing, HVAC, renovations, paving, snow, cleaning, and more. See typical ranges, then post an RFP for real quotes.",
    },
    listName: "Commercial Property Cost Guides",
    eyebrow: "Cost Guides",
    h1: "What does commercial property work cost in Canada?",
    lead: "Budgeting a project? These guides give you honest, plain-English planning ranges for the most common commercial property work — so you walk into an RFP knowing roughly what to expect. They’re estimates, not quotes: the real number comes from interested trades once you post your scope.",
    typical: "Typical:",
    seeGuide: "See the guide",
    cta: {
      title: "Skip the guesswork — get real numbers",
      description:
        "Post your project on {brand} and Canadian trades can respond with real, scope-specific pricing. Free to post.",
      primary: "Post an RFP",
      secondary: "Browse the directory",
    },
  },

  /** Cost guide detail. {trade}, {tradeLower}, {name}, {nameLower}, {brand}. */
  costGuide: {
    notFound: "Not found",
    eyebrow: "{trade} cost guide",
    rangeLabel: "Typical Canadian range",
    getQuotes: "Get real quotes — post an RFP",
    browseCompanies: "Browse {trade} companies",
    breakdownTitle: "Typical price breakdown",
    breakdownLead:
      "General planning ranges for Canadian commercial work. Your actual price depends on scope, region, building condition, and access.",
    thItem: "Item",
    thRange: "Typical range",
    factorsTitle: "What moves the price",
    accurateTitle: "How to get an accurate price",
    accurateBody:
      "The numbers above are for budgeting. To get a real, scope-specific price, post your project as an RFP on {brand} — describe the building, the work, and your region, and {tradeLower} companies can respond with their own pricing. Posting is free, and getting two or three competitive responses is the simplest way to know the true market rate.",
    postRfp: "Post an RFP",
    howWorks: "How PMRFP works",
    templateEyebrow: "Skip the blank page",
    templateTitle: "Use the {name} template",
    templateBody:
      "We’ve already built the scope, requirements, and evaluation criteria for this kind of project. Customize in seconds and post — go from cost guide to live RFP without writing from scratch.",
    seeTemplate: "See the template",
    useTemplate: "Use this template",
    faqTitle: "Questions",
    cta: {
      title: "Budgeting {nameLower}? Get real numbers.",
      description:
        "Post your project on {brand} and Canadian trades can respond with real, scope-specific pricing. Free to post.",
      primary: "Post an RFP",
      secondary: "Browse {trade}",
    },
  },

  costOg: {
    eyebrowFallback: "Cost guide",
    notFound: "Cost guide not found",
    eyebrow: "Cost guide · {trade}",
    subline: "Typical range: {range}",
  },

  resourcesIndex: {
    meta: {
      title: "Resources — Commercial Property RFP & Vendor Guides",
      description:
        "Guides and checklists for Canadian trades and property managers: how RFPs work, prequalification, capability statements, and more.",
    },
    eyebrow: "Resources",
    h1: "Guides for trades and property managers",
    lead: "Practical guidance on winning and running commercial property work in Canada.",
    growEyebrow: "Done for you",
    growTitle: "Opening a business — or ready to look the part?",
    growBody:
      "Get your trade business online — branding, a website, your Google profile, and a standout listing, handled for you.",
    learnMore: "Learn more",
    costEyebrow: "Cost guides",
    costTitle: "What does commercial property work cost in Canada?",
    costBody:
      "Honest planning ranges for roofing, HVAC, renovations, paving, snow, cleaning, and more — so you walk into an RFP knowing what to expect.",
    seeGuides: "See guides",
    emptyTitle: "No resources yet",
    emptyDescription: "Check back soon — we're publishing guides regularly.",
    read: "Read",
  },

  resource: {
    notFound: "Resource not found",
    back: "← All resources",
    cta: {
      title: "Ready to find commercial property work?",
      description: "Get listed and monitor RFP opportunities across Canada.",
      primary: "Join as a Trade Company",
      secondary: "Browse opportunities",
    },
  },

  grow: {
    meta: {
      title: "Opening or Growing a Business? Done-For-You Setup",
      description:
        "Just starting out or ready to grow? Get your trade business online — professional branding, a website, your Google profile, and a polished PMRFP listing, done for you.",
    },
    eyebrow: "Grow your business",
    h1: "Opening a business — or ready to look the part?",
    lead: "The trades that win commercial work look credible online. If your business is new — or still running on a logo from 2009 and no real website — we'll get you set up, done for you, so you show up like the professional you are.",
    ctaHelp: "Get help getting online",
    ctaList: "List your company first",
    includedEyebrow: "Done for you",
    includedTitle: "Everything you need to look established.",
    includedLead:
      "One team handles the whole setup so you can stay on the tools. Pick the pieces you need — or the full package.",
    /** Same order as the icons on the page. */
    items: [
      { t: "Brand & logo", d: "A clean, professional identity that makes property managers take you seriously." },
      { t: "Website", d: "A fast, modern site that shows your work, services, and credentials — and turns visitors into calls." },
      { t: "Google Business Profile", d: "Set up and optimized so you show up when local buyers search for your trade." },
      { t: "Polished PMRFP listing", d: "A complete, credible directory profile that gives buyers a reason to click." },
      { t: "Marketing to get going", d: "The essentials to start getting found — so the work comes to you." },
    ],
    fullTitle: "The full package",
    fullBody:
      "Brand + website + Google profile + a standout {brand} listing — handled end to end, with member-friendly pricing.",
    cta: {
      title: "Tell us where your business is at.",
      description:
        "New, growing, or rebranding — share a few details and we'll come back with a simple plan to get you looking established and easy to find.",
      primary: "Request your setup plan",
      secondary: "Back to resources",
    },
  },

  caseStudiesIndex: {
    meta: {
      title: "Commercial Property Project Case Studies",
      description:
        "Real completed projects from {brand} member trades — the challenge, the approach, and the outcome, by trade and region across Canada.",
    },
    listName: "Commercial property project case studies",
    eyebrow: "Real projects",
    h1: "Commercial property project case studies",
    lead: "Completed work from {brand} member trades — what the building needed, how the contractor approached it, and how it turned out. Written by the companies that did the work, reviewed before publishing.",
    emptyTitle: "First case studies are in review",
    emptyDescription:
      "Member trades are writing up their recent projects now. Check back shortly — or if you're a member, submit yours from your dashboard.",
    by: "By {org} →",
    cta: {
      title: "Done work like this?",
      description:
        "Member trades publish case studies free — each one strengthens your profile and your visibility on {brand}'s trade and city pages.",
      primary: "Add a project",
      secondary: "How membership works",
    },
  },

  caseStudy: {
    notFound: "Case study not found",
    metaTitle: "{title} — Case Study",
    by: "A completed project by",
    challenge: "The challenge",
    approach: "The approach",
    outcome: "The outcome",
    reviewsHeading: "What the client said",
    viewOrg: "View {org}",
    more: "More {trade} in {region}",
    cta: {
      title: "Have a project like this coming up?",
      description:
        "Post it free on {brand} — trades can express interest and you compare them in one place.",
      primary: "Post an RFP free",
      secondary: "More case studies",
    },
  },
};

const fr: typeof en = {
  crumbs: {
    home: "Accueil",
    templates: "Modèles d'appels d'offres",
    costGuides: "Guides de coûts",
    resources: "Ressources",
    caseStudies: "Études de cas",
  },

  templatesIndex: {
    meta: {
      title: "Modèles d'appels d'offres gratuits pour la gestion immobilière et l'immobilier commercial (Canada et É.-U.)",
      description:
        "20 modèles d'appels d'offres prêts à l'emploi pour les gestionnaires immobiliers et les propriétaires d'immeubles commerciaux — toiture, CVC, déneigement, pavage, peinture, entretien d'ascenseurs, moisissures et plus. Personnalisez et publiez en 60 secondes.",
    },
    listName: "Modèles d'appels d'offres commerciaux et résidentiels",
    eyebrow: "Modèles d'appels d'offres",
    h1: "Modèles d'appels d'offres gratuits : de zéro à publié en 60 secondes",
    lead: "Arrêtez de rédiger vos appels d'offres à partir de rien. Ces 20 modèles couvrent les travaux que les gestionnaires immobiliers canadiens mettent le plus souvent en appel d'offres, dans les immeubles commerciaux et résidentiels : portée des travaux, exigences, échéancier et critères d'évaluation préremplis. Choisissez un modèle, personnalisez-le en quelques secondes et publiez gratuitement.",
    chipCount: "20 modèles",
    chipPrefilled: "Portée et exigences préremplies",
    chipPdf: "PDF gratuit à télécharger",
    writerBefore: "Vous voulez un appel d'offres rédigé pour vos travaux précis?",
    writerLink: "Utilisez le rédacteur d'appels d'offres gratuit →",
    writerAfter: "Quatre questions, deux minutes.",
    useTemplate: "Utiliser ce modèle",
    byTradeTitle: "Parcourir par corps de métier",
    byTradeLead: "Vous cherchez un type de travaux précis? Allez directement aux modèles de ce corps de métier.",
    howEyebrow: "Comment ça fonctionne",
    howTitle: "Du modèle à l'appel d'offres publié en 60 secondes",
    steps: [
      {
        label: "Étape 1",
        title: "Choisissez un modèle",
        body: "Parcourez les 20 types de travaux les plus courants dans les immeubles commerciaux et résidentiels. Chacun est une véritable portée des travaux, prête à l'emploi — pas un simple canevas à remplir.",
      },
      {
        label: "Étape 2",
        title: "Personnalisez en quelques secondes",
        body: "Cliquez sur « Utiliser ce modèle » : le titre, la portée et les exigences sont préremplis dans le formulaire de publication. Modifiez ce qui ne convient pas et enregistrez.",
      },
      {
        label: "Étape 3",
        title: "Recevez des soumissions de vrais entrepreneurs",
        body: "Votre appel d'offres est publié sur {brand}. Des entrepreneurs canadiens du métier peuvent le voir et manifester leur intérêt — vous choisissez avec qui discuter. La publication est gratuite.",
      },
    ],
    cta: {
      title: "Un projet en vue? Il y a un modèle pour ça.",
      description:
        "Choisissez un modèle ci-dessus, ou publiez votre propre appel d'offres à partir de zéro sur {brand}. Dans les deux cas, des entrepreneurs canadiens peuvent vous répondre — la publication est gratuite.",
      primary: "Publier un appel d'offres",
      secondary: "Parcourir le répertoire",
    },
  },

  template: {
    notFound: "Introuvable",
    eyebrow: "{trade} · Modèle d'appel d'offres",
    useTemplate: "Utiliser ce modèle",
    downloadPdf: "Télécharger le PDF",
    noAccount: "Pas encore de compte? Inscrivez-vous gratuitement →",
    factPrefilled: "Portée et exigences préremplies",
    factTagged: "Corps de métier : {trade}",
    factPhases: "Échéancier en {n} étapes",
    whenToUse: "Quand utiliser ce modèle",
    sampleTitle: "Exemple de titre et de résumé",
    sampleLead: "Ce qui se remplit automatiquement quand vous cliquez sur « Utiliser ce modèle » — vous pouvez tout modifier.",
    titleLabel: "Titre",
    summaryLabel: "Résumé",
    scope: "Portée des travaux",
    requirements: "Exigences standard",
    timeline: "Échéancier suggéré",
    siteAccess: "Accès au site et logistique",
    questionsTitle: "Questions auxquelles chaque soumissionnaire doit répondre",
    questionsLead: "Posez les mêmes questions à tous les soumissionnaires pour obtenir des réponses comparables.",
    evaluationTitle: "Critères d'évaluation",
    evaluationLead: "Comment vous évaluerez les soumissions à leur réception.",
    costEyebrow: "À consulter avec le guide des coûts",
    costLead: "Voyez ce que coûtent habituellement ces travaux au Canada avant de publier, pour connaître la fourchette budgétaire à prévoir.",
    costCta: "Voir le guide des coûts",
    matchingTitle: "Les entrepreneurs qui font ce type de travaux",
    matchingLead: "Une fois votre appel d'offres publié, voici le genre de fournisseurs qui le verront et manifesteront leur intérêt.",
    browseCompanies: "Voir les entreprises : {trade}",
    fullDirectory: "Répertoire complet",
    faqTitle: "Questions fréquentes",
    moreTemplates: "Autres modèles d'appels d'offres : {trade}",
    seeTemplate: "Voir le modèle",
    cta: {
      title: "Prêt à publier votre appel d'offres?",
      description:
        "Cliquez ci-dessous pour partir du modèle « {name} » prérempli. Modifiez ce qui ne convient pas à votre projet et publiez gratuitement.",
      primary: "Utiliser ce modèle",
      secondary: "Voir tous les modèles",
    },
  },

  print: {
    metaTitle: "{name} — version imprimable",
    pressBefore: "Appuyez sur",
    pressKeys: "Ctrl/Cmd + P",
    pressAfter: " et choisissez « Enregistrer au format PDF » si la boîte de dialogue d'impression ne s'est pas ouverte automatiquement.",
    back: "← Retour au modèle",
    headerEyebrow: "Modèle d'appel d'offres — {brand}",
    whenToUse: "Quand utiliser ce modèle",
    sampleTitle: "Exemple de titre",
    summary: "Résumé",
    scope: "Portée des travaux",
    requirements: "Exigences standard",
    timeline: "Échéancier suggéré",
    labelColon: "{label} :",
    siteAccess: "Accès au site et logistique",
    questions: "Questions auxquelles chaque soumissionnaire doit répondre",
    evaluation: "Critères d'évaluation",
    footerTitle: "{brand} — Modèle d'appel d'offres gratuit",
    footerBefore:
      "Ce modèle sert à définir la portée des travaux; ce n'est pas un contrat. Faites réviser l'appel d'offres final et le contrat d'approvisionnement par votre avocat. Pour obtenir de vrais prix adaptés à vos travaux, publiez votre appel d'offres sur",
    footerAfter: " — les entrepreneurs canadiens répondent gratuitement.",
    printedFrom: "Imprimé à partir de {url}",
  },

  templateOg: {
    eyebrowFallback: "Modèle d'appel d'offres",
    notFound: "Modèle introuvable",
    eyebrow: "Modèle d'appel d'offres · {trade}",
    caption: "Gratuit · prêt à publier",
  },

  costIndex: {
    meta: {
      title: "Guides de coûts en immobilier commercial (Canada) — ce que coûtent les travaux",
      description:
        "Des guides de coûts clairs pour les travaux dans les immeubles commerciaux au Canada — toiture, CVC, rénovations, pavage, déneigement, nettoyage et plus. Consultez les fourchettes typiques, puis publiez un appel d'offres pour obtenir de vrais prix.",
    },
    listName: "Guides de coûts en immobilier commercial",
    eyebrow: "Guides de coûts",
    h1: "Combien coûtent les travaux dans un immeuble commercial au Canada?",
    lead: "Vous préparez le budget d'un projet? Ces guides vous donnent des fourchettes de planification honnêtes et claires pour les travaux les plus courants dans les immeubles commerciaux — pour aborder votre appel d'offres en sachant à peu près à quoi vous attendre. Ce sont des estimations, pas des soumissions : le vrai prix vient des entrepreneurs intéressés, une fois votre portée des travaux publiée.",
    typical: "Coût typique :",
    seeGuide: "Voir le guide",
    cta: {
      title: "Fini les suppositions : obtenez de vrais prix",
      description:
        "Publiez votre projet sur {brand} et des entrepreneurs canadiens peuvent vous répondre avec de vrais prix adaptés à vos travaux. La publication est gratuite.",
      primary: "Publier un appel d'offres",
      secondary: "Parcourir le répertoire",
    },
  },

  costGuide: {
    notFound: "Introuvable",
    eyebrow: "Guide des coûts · {trade}",
    rangeLabel: "Fourchette typique au Canada",
    getQuotes: "Obtenez de vrais prix — publiez un appel d'offres",
    browseCompanies: "Voir les entreprises : {trade}",
    breakdownTitle: "Ventilation typique des prix",
    breakdownLead:
      "Fourchettes de planification générales pour des travaux commerciaux au Canada. Votre prix réel dépend de la portée, de la région, de l'état de l'immeuble et de l'accès.",
    thItem: "Élément",
    thRange: "Fourchette typique",
    factorsTitle: "Ce qui fait varier le prix",
    accurateTitle: "Comment obtenir un prix précis",
    accurateBody:
      "Les chiffres ci-dessus servent à établir un budget. Pour obtenir un vrai prix adapté à vos travaux, publiez votre projet sous forme d'appel d'offres sur {brand} : décrivez l'immeuble, les travaux et votre région, et des entreprises de ce corps de métier peuvent vous répondre avec leurs propres prix. La publication est gratuite, et recevoir deux ou trois réponses concurrentes est la façon la plus simple de connaître le vrai prix du marché.",
    postRfp: "Publier un appel d'offres",
    howWorks: "Comment fonctionne PMRFP",
    templateEyebrow: "Évitez la page blanche",
    templateTitle: "Utilisez le modèle « {name} »",
    templateBody:
      "Nous avons déjà préparé la portée, les exigences et les critères d'évaluation pour ce type de projet. Personnalisez en quelques secondes et publiez : passez du guide des coûts à un appel d'offres en ligne sans rien rédiger à partir de zéro.",
    seeTemplate: "Voir le modèle",
    useTemplate: "Utiliser ce modèle",
    faqTitle: "Questions",
    cta: {
      title: "Vous préparez votre budget? Obtenez de vrais prix.",
      description:
        "Publiez votre projet sur {brand} et des entrepreneurs canadiens peuvent vous répondre avec de vrais prix adaptés à vos travaux. La publication est gratuite.",
      primary: "Publier un appel d'offres",
      secondary: "Voir les entreprises : {trade}",
    },
  },

  costOg: {
    eyebrowFallback: "Guide des coûts",
    notFound: "Guide des coûts introuvable",
    eyebrow: "Guide des coûts · {trade}",
    subline: "Fourchette typique : {range}",
  },

  resourcesIndex: {
    meta: {
      title: "Ressources — guides sur les appels d'offres et les fournisseurs en immobilier commercial",
      description:
        "Guides et listes de vérification pour les entrepreneurs et les gestionnaires immobiliers au Canada : le fonctionnement des appels d'offres, la préqualification, les énoncés de capacités et plus encore.",
    },
    eyebrow: "Ressources",
    h1: "Guides pour les entrepreneurs et les gestionnaires immobiliers",
    lead: "Des conseils pratiques pour décrocher et gérer des travaux dans les immeubles commerciaux au Canada.",
    growEyebrow: "Clé en main",
    growTitle: "Vous lancez une entreprise — ou voulez avoir l'air d'un pro?",
    growBody:
      "Mettez votre entreprise en ligne : image de marque, site Web, profil Google et une fiche qui se démarque, le tout pris en charge pour vous.",
    learnMore: "En savoir plus",
    costEyebrow: "Guides de coûts",
    costTitle: "Combien coûtent les travaux dans un immeuble commercial au Canada?",
    costBody:
      "Des fourchettes de planification honnêtes pour la toiture, le CVC, les rénovations, le pavage, le déneigement, le nettoyage et plus — pour aborder votre appel d'offres en sachant à quoi vous attendre.",
    seeGuides: "Voir les guides",
    emptyTitle: "Aucune ressource pour le moment",
    emptyDescription: "Revenez bientôt : nous publions régulièrement de nouveaux guides.",
    read: "Lire",
  },

  resource: {
    notFound: "Ressource introuvable",
    back: "← Toutes les ressources",
    cta: {
      title: "Prêt à trouver des contrats en immobilier commercial?",
      description: "Inscrivez votre entreprise et suivez les appels d'offres partout au Canada.",
      primary: "S'inscrire comme entrepreneur",
      secondary: "Parcourir les appels d'offres",
    },
  },

  grow: {
    meta: {
      title: "Vous lancez ou faites grandir votre entreprise? Démarrage clé en main",
      description:
        "Vous démarrez ou êtes prêt à grandir? Mettez votre entreprise en ligne : image de marque professionnelle, site Web, profil Google et une fiche PMRFP soignée, le tout clé en main.",
    },
    eyebrow: "Faites grandir votre entreprise",
    h1: "Vous lancez une entreprise — ou voulez avoir l'air d'un pro?",
    lead: "Les entrepreneurs qui décrochent des contrats commerciaux ont l'air crédibles en ligne. Si votre entreprise est nouvelle — ou roule encore avec un logo de 2009 et sans vrai site Web — nous vous installons, clé en main, pour que vous vous présentiez comme le professionnel que vous êtes.",
    ctaHelp: "Obtenir de l'aide pour être en ligne",
    ctaList: "Inscrire d'abord votre entreprise",
    includedEyebrow: "Clé en main",
    includedTitle: "Tout ce qu'il faut pour avoir l'air d'une entreprise établie.",
    includedLead:
      "Une seule équipe s'occupe de tout, pour que vous puissiez rester sur vos chantiers. Choisissez les éléments dont vous avez besoin — ou la formule complète.",
    items: [
      { t: "Image de marque et logo", d: "Une identité nette et professionnelle qui incite les gestionnaires immobiliers à vous prendre au sérieux." },
      { t: "Site Web", d: "Un site rapide et moderne qui présente vos réalisations, vos services et vos qualifications — et qui transforme les visiteurs en appels." },
      { t: "Profil d'entreprise Google", d: "Créé et optimisé pour que vous apparaissiez quand des acheteurs de votre région cherchent votre corps de métier." },
      { t: "Fiche PMRFP soignée", d: "Un profil complet et crédible dans le répertoire, qui donne aux acheteurs une raison de cliquer." },
      { t: "Du marketing pour démarrer", d: "L'essentiel pour commencer à être trouvé — pour que le travail vienne à vous." },
    ],
    fullTitle: "La formule complète",
    fullBody:
      "Image de marque + site Web + profil Google + une fiche {brand} qui se démarque — pris en charge du début à la fin, à des prix avantageux pour les membres.",
    cta: {
      title: "Dites-nous où en est votre entreprise.",
      description:
        "Nouvelle, en croissance ou en changement d'image : donnez-nous quelques détails et nous vous reviendrons avec un plan simple pour vous donner l'air d'une entreprise établie et facile à trouver.",
      primary: "Demander votre plan de démarrage",
      secondary: "Retour aux ressources",
    },
  },

  caseStudiesIndex: {
    meta: {
      title: "Études de cas de projets en immobilier commercial",
      description:
        "De vrais projets réalisés par les entrepreneurs membres de {brand} — le défi, l'approche et le résultat, par corps de métier et par région partout au Canada.",
    },
    listName: "Études de cas de projets en immobilier commercial",
    eyebrow: "Vrais projets",
    h1: "Études de cas de projets en immobilier commercial",
    lead: "Des travaux réalisés par les entrepreneurs membres de {brand} : ce dont l'immeuble avait besoin, comment l'entrepreneur s'y est pris et le résultat obtenu. Rédigées par les entreprises qui ont fait les travaux, révisées avant publication.",
    emptyTitle: "Les premières études de cas sont en révision",
    emptyDescription:
      "Nos entrepreneurs membres rédigent actuellement leurs projets récents. Revenez bientôt — ou, si vous êtes membre, soumettez le vôtre à partir de votre tableau de bord.",
    by: "Par {org} →",
    cta: {
      title: "Vous avez réalisé des travaux semblables?",
      description:
        "Les entrepreneurs membres publient leurs études de cas gratuitement — chacune renforce votre profil et votre visibilité sur les pages de {brand} par corps de métier et par ville.",
      primary: "Ajouter un projet",
      secondary: "Comment fonctionne l'adhésion",
    },
  },

  caseStudy: {
    notFound: "Étude de cas introuvable",
    metaTitle: "{title} — Étude de cas",
    by: "Projet réalisé par",
    challenge: "Le défi",
    approach: "L'approche",
    outcome: "Le résultat",
    reviewsHeading: "Ce que le client en a dit",
    viewOrg: "Voir {org}",
    more: "Plus d'entreprises : {trade} — {region}",
    cta: {
      title: "Vous avez un projet semblable à venir?",
      description:
        "Publiez-le gratuitement sur {brand} : des entrepreneurs peuvent manifester leur intérêt et vous les comparez au même endroit.",
      primary: "Publier un appel d'offres gratuitement",
      secondary: "Autres études de cas",
    },
  },
};

const es: typeof en = {
  crumbs: {
    home: "Inicio",
    templates: "Plantillas de RFP",
    costGuides: "Guías de costos",
    resources: "Recursos",
    caseStudies: "Casos de éxito",
  },

  templatesIndex: {
    meta: {
      title: "Plantillas de RFP gratuitas para administración de propiedades y bienes raíces comerciales (Canadá y EE. UU.)",
      description:
        "20 plantillas de RFP listas para usar para administradores de propiedades y propietarios de inmuebles comerciales: techado, HVAC, remoción de nieve, pavimentación, pintura, servicio de elevadores, moho y más. Personalícela y publíquela en 60 segundos.",
    },
    listName: "Plantillas de RFP comerciales y residenciales",
    eyebrow: "Plantillas de RFP",
    h1: "Plantillas de RFP gratuitas: de cero a publicada en 60 segundos",
    lead: "Deje de redactar sus RFP desde cero. Estas 20 plantillas cubren los trabajos en propiedades comerciales y residenciales que los administradores de propiedades en Canadá sacan a concurso con más frecuencia, con el alcance, los requisitos, el cronograma y los criterios de evaluación ya prellenados. Elija una plantilla, personalícela en segundos y publíquela gratis.",
    chipCount: "20 plantillas",
    chipPrefilled: "Alcance y requisitos prellenados",
    chipPdf: "PDF gratuito para descargar",
    writerBefore: "¿Quiere una RFP redactada para su trabajo exacto?",
    writerLink: "Use el Redactor de RFP gratuito →",
    writerAfter: "Cuatro preguntas, dos minutos.",
    useTemplate: "Usar esta plantilla",
    byTradeTitle: "Explorar por oficio",
    byTradeLead: "¿Busca un tipo de trabajo específico? Vaya directo a las plantillas de ese oficio.",
    howEyebrow: "Cómo funciona",
    howTitle: "De la plantilla a la RFP publicada en 60 segundos",
    steps: [
      {
        label: "Paso 1",
        title: "Elija una plantilla",
        body: "Explore los 20 trabajos más comunes en propiedades comerciales y residenciales. Cada uno es un alcance de trabajo real y listo para usar, no un formulario vacío para rellenar.",
      },
      {
        label: "Paso 2",
        title: "Personalícela en segundos",
        body: "Haga clic en “Usar esta plantilla”: el título, el alcance y los requisitos se prellenan en el formulario para publicar una RFP. Edite lo que no se ajuste y guarde.",
      },
      {
        label: "Paso 3",
        title: "Reciba ofertas de contratistas reales",
        body: "Su RFP se publica en {brand}. Contratistas de Canadá de ese oficio pueden verla y expresar interés; usted elige con quién hablar. Publicar es gratis.",
      },
    ],
    cta: {
      title: "¿Tiene un proyecto? Hay una plantilla para eso.",
      description:
        "Elija una plantilla arriba o publique su propia RFP desde cero en {brand}. En cualquier caso, contratistas de Canadá pueden responderle. Publicar es gratis.",
      primary: "Publicar una RFP",
      secondary: "Explorar el directorio",
    },
  },

  template: {
    notFound: "No encontrado",
    eyebrow: "{trade} · Plantilla de RFP",
    useTemplate: "Usar esta plantilla",
    downloadPdf: "Descargar PDF",
    noAccount: "¿No tiene cuenta? Regístrese gratis →",
    factPrefilled: "Alcance y requisitos prellenados",
    factTagged: "Oficio: {trade}",
    factPhases: "Cronograma de {n} etapas",
    whenToUse: "Cuándo usar esta plantilla",
    sampleTitle: "Ejemplo de título y resumen de la RFP",
    sampleLead: "Lo que se completa automáticamente al hacer clic en “Usar esta plantilla”. Puede editarlo todo.",
    titleLabel: "Título",
    summaryLabel: "Resumen",
    scope: "Alcance del trabajo",
    requirements: "Requisitos estándar",
    timeline: "Cronograma sugerido",
    siteAccess: "Acceso al sitio y logística",
    questionsTitle: "Preguntas que todo oferente debe responder",
    questionsLead: "Haga las mismas preguntas a todos los oferentes para obtener respuestas comparables.",
    evaluationTitle: "Criterios de evaluación",
    evaluationLead: "Cómo evaluará las ofertas cuando las reciba.",
    costEyebrow: "Consúltela junto con la guía de costos",
    costLead: "Vea cuánto cuesta un trabajo típico de {tradeLower} en Canadá antes de publicar, para saber qué rango de presupuesto esperar.",
    costCta: "Ver la guía de costos",
    matchingTitle: "Contratistas que hacen este trabajo",
    matchingLead: "Una vez que publique, este es el tipo de proveedores que verán su RFP y expresarán interés.",
    browseCompanies: "Ver empresas de {tradeLower}",
    fullDirectory: "Directorio completo",
    faqTitle: "Preguntas frecuentes",
    moreTemplates: "Más plantillas de RFP de {tradeLower}",
    seeTemplate: "Ver plantilla",
    cta: {
      title: "¿Listo para publicar su RFP de {tradeLower}?",
      description:
        "Haga clic abajo para empezar con la plantilla “{name}” ya prellenada. Cambie lo que no se ajuste a su proyecto y publíquela gratis.",
      primary: "Usar esta plantilla",
      secondary: "Ver todas las plantillas",
    },
  },

  print: {
    metaTitle: "{name} — versión para imprimir",
    pressBefore: "Presione",
    pressKeys: "Ctrl/Cmd + P",
    pressAfter: " y elija “Guardar como PDF” si el cuadro de diálogo de impresión no se abrió automáticamente.",
    back: "← Volver a la plantilla",
    headerEyebrow: "Plantilla de RFP — {brand}",
    whenToUse: "Cuándo usar esta plantilla",
    sampleTitle: "Título de ejemplo",
    summary: "Resumen",
    scope: "Alcance del trabajo",
    requirements: "Requisitos estándar",
    timeline: "Cronograma sugerido",
    labelColon: "{label}:",
    siteAccess: "Acceso al sitio y logística",
    questions: "Preguntas que todo oferente debe responder",
    evaluation: "Criterios de evaluación",
    footerTitle: "{brand} — Plantilla de RFP gratuita",
    footerBefore:
      "Esta plantilla sirve para definir el alcance; no es un contrato. Pida a su abogado que revise la RFP final y el contrato de adquisición. Para obtener precios reales según su alcance, publique su RFP en",
    footerAfter: " — los contratistas de Canadá responden gratis.",
    printedFrom: "Impreso desde {url}",
  },

  templateOg: {
    eyebrowFallback: "Plantilla de RFP",
    notFound: "Plantilla no encontrada",
    eyebrow: "Plantilla de RFP · {trade}",
    caption: "Gratis · lista para publicar",
  },

  costIndex: {
    meta: {
      title: "Guías de costos para propiedades comerciales (Canadá): cuánto cuestan los trabajos",
      description:
        "Guías de costos en lenguaje sencillo para trabajos en propiedades comerciales en Canadá: techado, HVAC, remodelaciones, pavimentación, remoción de nieve, limpieza y más. Vea los rangos típicos y luego publique una RFP para obtener cotizaciones reales.",
    },
    listName: "Guías de costos para propiedades comerciales",
    eyebrow: "Guías de costos",
    h1: "¿Cuánto cuestan los trabajos en propiedades comerciales en Canadá?",
    lead: "¿Está preparando el presupuesto de un proyecto? Estas guías le dan rangos de planificación honestos y en lenguaje sencillo para los trabajos más comunes en propiedades comerciales, para que llegue a su RFP sabiendo más o menos qué esperar. Son estimaciones, no cotizaciones: la cifra real la dan los contratistas interesados una vez que usted publica su alcance.",
    typical: "Típico:",
    seeGuide: "Ver la guía",
    cta: {
      title: "Olvídese de las suposiciones: obtenga cifras reales",
      description:
        "Publique su proyecto en {brand} y contratistas de Canadá pueden responderle con precios reales según su alcance. Publicar es gratis.",
      primary: "Publicar una RFP",
      secondary: "Explorar el directorio",
    },
  },

  costGuide: {
    notFound: "No encontrado",
    eyebrow: "Guía de costos · {trade}",
    rangeLabel: "Rango típico en Canadá",
    getQuotes: "Obtenga cotizaciones reales: publique una RFP",
    browseCompanies: "Ver empresas: {trade}",
    breakdownTitle: "Desglose típico de precios",
    breakdownLead:
      "Rangos generales de planificación para trabajos comerciales en Canadá. Su precio real depende del alcance, la región, el estado del edificio y el acceso.",
    thItem: "Concepto",
    thRange: "Rango típico",
    factorsTitle: "Qué hace variar el precio",
    accurateTitle: "Cómo obtener un precio preciso",
    accurateBody:
      "Las cifras de arriba sirven para presupuestar. Para obtener un precio real según su alcance, publique su proyecto como RFP en {brand}: describa el edificio, el trabajo y su región, y empresas de ese oficio pueden responderle con sus propios precios. Publicar es gratis, y recibir dos o tres respuestas competitivas es la forma más sencilla de conocer el precio real del mercado.",
    postRfp: "Publicar una RFP",
    howWorks: "Cómo funciona PMRFP",
    templateEyebrow: "Evite la página en blanco",
    templateTitle: "Use la plantilla “{name}”",
    templateBody:
      "Ya preparamos el alcance, los requisitos y los criterios de evaluación para este tipo de proyecto. Personalícela en segundos y publíquela: pase de la guía de costos a una RFP publicada sin redactar nada desde cero.",
    seeTemplate: "Ver la plantilla",
    useTemplate: "Usar esta plantilla",
    faqTitle: "Preguntas",
    cta: {
      title: "¿Está preparando su presupuesto? Obtenga cifras reales.",
      description:
        "Publique su proyecto en {brand} y contratistas de Canadá pueden responderle con precios reales según su alcance. Publicar es gratis.",
      primary: "Publicar una RFP",
      secondary: "Ver empresas: {trade}",
    },
  },

  costOg: {
    eyebrowFallback: "Guía de costos",
    notFound: "Guía de costos no encontrada",
    eyebrow: "Guía de costos · {trade}",
    subline: "Rango típico: {range}",
  },

  resourcesIndex: {
    meta: {
      title: "Recursos: guías sobre RFP y proveedores para propiedades comerciales",
      description:
        "Guías y listas de verificación para contratistas y administradores de propiedades en Canadá: cómo funcionan las RFP, la precalificación, las declaraciones de capacidades y más.",
    },
    eyebrow: "Recursos",
    h1: "Guías para contratistas y administradores de propiedades",
    lead: "Consejos prácticos para ganar y gestionar trabajos en propiedades comerciales en Canadá.",
    growEyebrow: "Llave en mano",
    growTitle: "¿Está abriendo un negocio o quiere verse más profesional?",
    growBody:
      "Ponga su negocio de oficios en línea: imagen de marca, sitio web, su perfil de Google y una ficha que destaque, todo hecho por nosotros.",
    learnMore: "Más información",
    costEyebrow: "Guías de costos",
    costTitle: "¿Cuánto cuestan los trabajos en propiedades comerciales en Canadá?",
    costBody:
      "Rangos de planificación honestos para techado, HVAC, remodelaciones, pavimentación, remoción de nieve, limpieza y más, para que llegue a su RFP sabiendo qué esperar.",
    seeGuides: "Ver guías",
    emptyTitle: "Aún no hay recursos",
    emptyDescription: "Vuelva pronto: publicamos guías con regularidad.",
    read: "Leer",
  },

  resource: {
    notFound: "Recurso no encontrado",
    back: "← Todos los recursos",
    cta: {
      title: "¿Listo para encontrar trabajo en propiedades comerciales?",
      description: "Aparezca en el directorio y siga las oportunidades de RFP en todo Canadá.",
      primary: "Registrarse como contratista",
      secondary: "Explorar oportunidades",
    },
  },

  grow: {
    meta: {
      title: "¿Abre o hace crecer un negocio? Configuración llave en mano",
      description:
        "¿Recién empieza o está listo para crecer? Ponga su negocio de oficios en línea: imagen de marca profesional, sitio web, su perfil de Google y una ficha de PMRFP impecable, todo hecho por nosotros.",
    },
    eyebrow: "Haga crecer su negocio",
    h1: "¿Está abriendo un negocio o quiere verse más profesional?",
    lead: "Los contratistas que ganan trabajos comerciales se ven confiables en línea. Si su negocio es nuevo, o todavía funciona con un logotipo de 2009 y sin un sitio web de verdad, nosotros lo dejamos todo listo para que se presente como el profesional que es.",
    ctaHelp: "Obtener ayuda para estar en línea",
    ctaList: "Primero registre su empresa",
    includedEyebrow: "Llave en mano",
    includedTitle: "Todo lo que necesita para verse como una empresa establecida.",
    includedLead:
      "Un solo equipo se encarga de toda la configuración para que usted pueda seguir en la obra. Elija las piezas que necesita, o el paquete completo.",
    items: [
      { t: "Marca y logotipo", d: "Una identidad limpia y profesional que hace que los administradores de propiedades lo tomen en serio." },
      { t: "Sitio web", d: "Un sitio rápido y moderno que muestra su trabajo, sus servicios y sus credenciales, y que convierte a los visitantes en llamadas." },
      { t: "Perfil de Empresa en Google", d: "Configurado y optimizado para que usted aparezca cuando compradores de su zona buscan su oficio." },
      { t: "Ficha de PMRFP impecable", d: "Un perfil de directorio completo y confiable que les da a los compradores una razón para hacer clic." },
      { t: "Marketing para arrancar", d: "Lo esencial para empezar a que lo encuentren, para que el trabajo llegue a usted." },
    ],
    fullTitle: "El paquete completo",
    fullBody:
      "Marca + sitio web + perfil de Google + una ficha destacada en {brand}, todo resuelto de principio a fin, con precios especiales para miembros.",
    cta: {
      title: "Cuéntenos en qué etapa está su negocio.",
      description:
        "Nuevo, en crecimiento o renovando su imagen: comparta algunos detalles y le responderemos con un plan sencillo para que se vea como una empresa establecida y sea fácil de encontrar.",
      primary: "Solicitar su plan de configuración",
      secondary: "Volver a recursos",
    },
  },

  caseStudiesIndex: {
    meta: {
      title: "Casos de éxito de proyectos en propiedades comerciales",
      description:
        "Proyectos reales terminados por contratistas miembros de {brand}: el desafío, el enfoque y el resultado, por oficio y región en todo Canadá.",
    },
    listName: "Casos de éxito de proyectos en propiedades comerciales",
    eyebrow: "Proyectos reales",
    h1: "Casos de éxito de proyectos en propiedades comerciales",
    lead: "Trabajos terminados por contratistas miembros de {brand}: lo que necesitaba el edificio, cómo lo abordó el contratista y cuál fue el resultado. Escritos por las empresas que hicieron el trabajo y revisados antes de publicarse.",
    emptyTitle: "Los primeros casos de éxito están en revisión",
    emptyDescription:
      "Los contratistas miembros están redactando sus proyectos recientes. Vuelva pronto o, si es miembro, envíe el suyo desde su panel.",
    by: "Por {org} →",
    cta: {
      title: "¿Ha hecho trabajos como este?",
      description:
        "Los contratistas miembros publican casos de éxito gratis; cada uno fortalece su perfil y su visibilidad en las páginas de {brand} por oficio y por ciudad.",
      primary: "Agregar un proyecto",
      secondary: "Cómo funciona la membresía",
    },
  },

  caseStudy: {
    notFound: "Caso de éxito no encontrado",
    metaTitle: "{title} — Caso de éxito",
    by: "Un proyecto terminado por",
    challenge: "El desafío",
    approach: "El enfoque",
    outcome: "El resultado",
    reviewsHeading: "Lo que dijo el cliente",
    viewOrg: "Ver {org}",
    more: "Más empresas: {trade} en {region}",
    cta: {
      title: "¿Tiene un proyecto como este en puerta?",
      description:
        "Publíquelo gratis en {brand}: los contratistas pueden expresar interés y usted los compara en un solo lugar.",
      primary: "Publicar una RFP gratis",
      secondary: "Más casos de éxito",
    },
  },
};

export default { en, fr, es };
