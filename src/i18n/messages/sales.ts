/**
 * Sales pages: /pricing, /for-trades, /for-property-managers and their server
 * components (stats strip, email preview, category grid).
 * Pricing copy that also lives in lib/site.ts (PRICING notes, COPY blocks) is
 * mirrored here: the English must stay identical to site.ts.
 */
const en = {
  photoAlt: {
    windowCleaners: "Window cleaners on ropes washing the glass facade of an office tower",
    floorCoating: "Crew rolling a coating onto the concrete floor of a large warehouse",
    retailAerial: "Aerial view of a suburban retail power centre and its parking lots",
  },
  plans: {
    earlyBird: "Early-bird: lock in $249/yr — rises to $399 once we hit 100 subscribers.",
    guarantee: "Cancel anytime — your access runs to the end of your billing period. Subscriptions are non-refundable.",
    roi: "One won commercial RFP typically covers years of Trade Pro.",
  },
  copy: {
    tradeValue:
      "Most building work goes to trades the property manager already knows. PMRFP gets you on the list: a searchable company profile, plus the RFPs they post — matched to your trade and region.",
    pmValue:
      "Post your project once, free. Trades that match your category and region see it and respond. Compare them in one place — no obligation to hire.",
  },
  stats: {
    rfps: "RFPs posted · last 30 days",
    trades: "trade companies listed",
    daily: "Daily",
    dailyLabel: "new tenders every morning",
    markets: "Canada + U.S.",
    marketsLabel: "commercial & residential",
  },
  email: {
    subject: {
      one: "{n} new {trade} match on {site} today",
      other: "{n} new {trade} matches on {site} today",
    },
    from: "From {site} <{email}> · every morning",
    intro: "New RFPs and public tenders in your trades and regions since yesterday, soonest deadline first:",
    closes: "Closes {date}",
    noDeadline: "No fixed closing date",
    cta: "Open your feed",
  },
  pricing: {
    meta: {
      title: "Pricing",
      description:
        "Simple, transparent pricing for trades in Canada and the U.S. Start with a free directory listing, or go Trade Pro for full RFP access.",
    },
    eyebrow: "Pricing",
    title: "Simple pricing, built for trades.",
    lead: "Get found for free, or unlock full RFP access with Trade Pro. Property managers, builders, and owners post projects at no cost.",
    free: {
      name: "Free",
      blurb: "Get listed and discoverable — no RFP access.",
      price: "$0",
      per: "/forever",
      features: ["Directory listing", "Basic company profile", "Appear in vendor searches"],
      cta: "Join free",
    },
    featured: {
      name: "Featured",
      blurb: "Maximum visibility — rank at the top where buyers look first.",
      price: "${n}",
      per: "{currency}/year",
      features: [
        "Everything in Trade Pro",
        "Featured placement — top of your categories",
        "Featured in your service regions",
        "Featured badge on your profile",
        "Priority in directory search results",
        "Maximum visibility to buyers",
      ],
      cta: "Get Featured",
    },
    preview: {
      eyebrow: "What you get",
      title: "One email every morning. Every match in your trade and area.",
      description:
        "This is the Trade Pro alert, filled with real open tenders from today's board. No more checking a dozen portals.",
    },
    faqEyebrow: "FAQ",
    faqTitle: "Pricing questions",
    faq: [
      {
        q: "Do you offer refunds?",
        a: "Subscriptions are non-refundable, but you can cancel anytime from the billing portal — your access continues to the end of your paid period and you won't be charged again.",
      },
      {
        q: "Does PMRFP guarantee work?",
        a: "No. PMRFP is where property managers post RFPs and trades get found. We don't guarantee contracts, bid success, or revenue.",
      },
      {
        q: "Can I cancel?",
        a: "Yes, your subscription stays active until the end of the billing period. Monthly plans can be cancelled any time.",
      },
      {
        q: "Where does PMRFP work?",
        a: "Across Canada and the United States. Public tenders come from CanadaBuys, the City of Toronto, Quebec's SEAO and Yukon in Canada, and from SAM.gov for U.S. federal building work. Property managers post RFPs in both countries.",
      },
      {
        q: "Can U.S. companies sign up and pay?",
        a: "Yes. Prices are in Canadian dollars and any major card works. At current exchange rates Trade Pro comes to about US$180 a year (or about US$21 a month); your card issuer does the conversion.",
      },
      {
        q: "Can property managers post for free?",
        a: "Yes. Property managers, builders, and owners can post RFPs at no cost.",
      },
      {
        q: "Can I join if I only serve one region?",
        a: "Yes. Choose the categories and regions you serve and you'll only be matched against relevant opportunities.",
      },
    ],
  },
  forTrades: {
    meta: {
      title: "For Trade Companies",
      description:
        "Get discovered for commercial property work. PMRFP helps trades and contractors get listed, monitor RFP opportunities, and express interest in one focused place.",
    },
    eyebrow: "For trade companies",
    title: "Get discovered for commercial property work.",
    lead: "Most building work goes to whoever the property manager already knows. {site} is where they post RFPs — get listed, watch your trade and region, and bid.",
    join: "Join as a Trade Company",
    seePricing: "See pricing",
    comparePlans: "Compare plans",
    opportunity: {
      eyebrow: "The opportunity",
      title: "Why commercial property work matters",
      description:
        "Commercial properties need a steady roster of reliable trades — for maintenance, upgrades, emergencies, and capital projects. The work is consistent and high-value, but it rarely reaches companies that aren't already known.",
      punch: "Most commercial property opportunities never reach your inbox unless you are already known.",
    },
    how: {
      eyebrow: "How it works",
      title: "How PMRFP helps",
      body: "PMRFP makes you easier to find and gives you one place to watch the RFPs that match.",
    },
    included: {
      eyebrow: "What's included",
      title: "Everything you need to get found and win building work",
      items: {
        profile: {
          title: "Company profile",
          body: "A structured, professional profile showing your services, categories, and regions.",
        },
        directory: {
          title: "Directory listing",
          body: "Become discoverable to property managers, builders, and building owners searching for vendors.",
        },
        feed: {
          title: "RFP feed",
          body: "See the RFPs property managers post in your categories and regions.",
        },
        save: {
          title: "Save RFPs",
          body: "Bookmark RFPs you want to revisit and keep your shortlist organized.",
        },
        bid: {
          title: "Bid on RFPs",
          body: "Show interest on RFPs that fit and track every submission you make.",
        },
        alerts: {
          title: "Matching alerts",
          body: "Get notified when new RFPs match your services so you never miss a fit.",
        },
        badge: {
          title: "Verified vendor badge",
          body: "Embed a PMRFP badge on your website so visitors can open your company profile and see the details recorded there.",
        },
      },
    },
    badge: {
      title: "Show you're a verified {site} vendor",
      body: "Grab a copy-paste badge for your website that links visitors to your profile, so they can see your services, areas and the details recorded there.",
      cta: "Get your badge",
    },
    who: {
      eyebrow: "Who should join",
      title: "Built for the trades that keep commercial properties running",
      trades: [
        "Electricians",
        "HVAC & mechanical",
        "Roofers",
        "Cleaning & janitorial",
        "Snow removal",
        "Landscaping & grounds",
        "General contractors",
        "Plumbing",
        "Painting & coatings",
        "Fire & life safety",
        "Security & access",
        "Restoration",
      ],
    },
    pricing: {
      eyebrow: "Pricing",
      title: "${price} {currency}/year for Trade Pro",
      body: "Start with a free directory listing, or go Pro for full RFP access, saved RFPs, bidding, and matching alerts.",
    },
    faqEyebrow: "FAQ",
    faqTitle: "Common questions",
    faq: [
      {
        q: "Does PMRFP guarantee work?",
        a: "No. PMRFP is where property managers post RFPs and trades get found. We don't guarantee contracts, bid success, or revenue.",
      },
      {
        q: "Can I cancel?",
        a: "Yes. You can cancel anytime. Your subscription stays active until the end of your current billing period.",
      },
      {
        q: "Which regions do you cover?",
        a: "Pick the exact regions and categories you serve and you'll only be matched to relevant work. We're live in major metros and adding more — if your area is still building out, join the founding list and we'll alert you as opportunities come online.",
      },
      {
        q: "Can I join if I only serve one region?",
        a: "Absolutely. Choose the categories and regions you actually serve, and you'll only be matched against relevant opportunities.",
      },
    ],
    cta: {
      title: "Get listed before your competitors do.",
    },
  },
  forPms: {
    meta: {
      title: "For Property Managers, Builders & Owners",
      description:
        "Post your building project free, and compare the trades that bid — by category and region. No obligation to hire.",
    },
    eyebrow: "For property managers, builders, owners & real estate professionals",
    badge: "Free for property managers",
    title: "Post a project. Find the right vendors. No pressure to hire.",
    lead: {
      before:
        "Post your building project free. Trades that match your category and region see it and bid. Compare them in one place — no obligation to hire. Built for property managers, builders, owners, and ",
      link: "real estate professionals",
      after: ".",
    },
    postFree: "Post an RFP — free",
    landlord: {
      text: "Landlord or independent building owner? Same tools, same price (free): post repair and maintenance jobs for the buildings you own, compare the trades that respond, and invite the ones you already use.",
      cta: "Sign up as a landlord",
    },
    writeRfp: "Write my RFP — free tool",
    caption: "Retail, office, industrial, condo: post the work for any building you run.",
    how: {
      eyebrow: "How it works",
      title: "A focused way to source commercial trades",
      steps: {
        post: {
          title: "Post your project",
          body: "Describe the work, set your category, region, and property type, and publish a clear RFP in minutes. No drawn-out forms.",
        },
        find: {
          title: "Find vendors by category and region",
          body: "Browse a focused directory of trades and service companies, filtered to exactly the work and locations you need covered.",
        },
        time: {
          title: "Reduce time wasted searching",
          body: "Stop chasing referrals and cold-calling contractors. Let qualified companies come to you and review interest in one place.",
        },
      },
    },
    directory: {
      eyebrow: "Directory",
      title: "Find vendors by category and region",
      description:
        "Explore trades across the categories that keep commercial properties running, then filter to your region.",
      cta: "View full directory",
    },
    privacy: {
      title: "Keep details private if needed",
      body: "You control contact visibility. Share your details openly to speed things up, or keep them private and review interested vendors before deciding who to connect with.",
    },
    noObligation: "No obligation to hire",
    cta: {
      title: "Find the right vendors for your next commercial project.",
      description: "Post your project free. Trades come to you with their interest.",
      secondary: "Browse the directory",
    },
  },
  becomeSupplier: {
    meta: {
      title: "Become a Supplier on PMRFP — Reach Commercial Trades & Property Managers",
      description:
        "List your supply house, distributorship, rental yard or rep agency free on PMRFP. Get in front of the trades and property managers bidding on commercial building work in Canada and the U.S.",
    },
    crumb: "Become a supplier",
    eyebrow: "For suppliers",
    title: "Become a PMRFP supplier",
    lead: "Get in front of the trades and property managers bidding on commercial property work in your area. A supplier listing is free.",
    primary: "List your company free",
    secondary: "Advertise on PMRFP",
    stats: {
      open: "open RFPs and tenders on the board",
      trades: "trade companies listed",
      categories: "trade categories",
    },
    why: {
      eyebrow: "Why list",
      title: "Your customers are already here, bidding work.",
      items: [
        {
          title: "Trades buying for jobs",
          body: "Trades on PMRFP bid on roofing, HVAC, electrical, paving, cleaning and other building work. Every job they win needs materials, equipment or rentals.",
        },
        {
          title: "Property managers buying direct",
          body: "Property managers, owners and builders use the directory to find vendors, and some buy supplies and equipment directly rather than through a contractor.",
        },
        {
          title: "Matched to the work",
          body: "Your listing shows the trades you sell into and the regions you serve, so you turn up next to the jobs that use what you sell.",
        },
      ],
    },
    where: {
      eyebrow: "Where you show up",
      title: "Where your listing appears",
      items: {
        directory: { title: "Supplier Directory", body: "Searchable by trade, region and property type. Featured suppliers sort first." },
        rfp: { title: "\"Who can do this job\" on RFP pages", body: "Each RFP and tender page lists matching trades, then suppliers that sell into that trade in that area." },
        home: { title: "Homepage supplier strip", body: "The homepage shows material and equipment suppliers, featured listings first." },
        digest: { title: "Weekly tender digest", body: "Listed suppliers get the weekly email of new tenders, so you see what your trade customers are about to price." },
      },
    },
    busiest: {
      title: "Open work by trade right now",
      body: "Open RFPs and public tenders on PMRFP today, by trade. These are the jobs your trade customers are pricing.",
    },
    plans: {
      eyebrow: "Free and paid",
      title: "Start free. Pay only for more visibility.",
      perYear: "/yr",
      perMonth: "/mo",
      oneTime: "one time",
      from: "from",
      free: { name: "Free listing", price: "$0", body: "Company profile in the Supplier Directory, the trades you sell into, your regions, and matching on RFP pages." },
      seo: { name: "SEO Listing", body: "Your company on the trade and city pages property managers find on Google and in AI answers, plus an unlimited project photo gallery." },
      featured: { name: "Featured", body: "Everything in Trade Pro, plus priority placement at the top of your categories and regions." },
      sponsor: { name: "Trade Spotlight sponsorship", body: "One sponsor slot across a trade's pages, its RFP pages, member dashboards and match emails. Always labelled as sponsored." },
      spotlight: { name: "Project Spotlight", body: "A reviewed, clearly labelled article about one finished project, with photos." },
      marketplace: { name: "Equipment Marketplace", price: "Free", body: "List surplus or used equipment. No commission; buyers message you through PMRFP." },
      currencyNote: "Prices in CAD. Project Spotlight is US${usd} in the U.S.",
    },
    refer: {
      title: "Refer your trade customers",
      body: "Your contractor customers win more work when they're on the board. Refer a trade and earn up to ${fee} when they activate an annual Trade Pro plan.",
      cta: "Refer a trade",
    },
    who: {
      eyebrow: "Who it's for",
      title: "For the companies that supply building work",
      list: [
        "Electrical wholesalers",
        "Plumbing & HVAC distributors",
        "Roofing supply",
        "Lumber & building materials",
        "Janitorial & sanitation supply",
        "Safety & PPE suppliers",
        "Equipment rental yards",
        "Paint & coatings",
        "Flooring distributors",
        "Landscape & snow supply",
        "Manufacturers' reps",
        "Fasteners & industrial supply",
      ],
    },
    faqEyebrow: "FAQ",
    faqTitle: "Supplier questions",
    faq: [
      {
        q: "Is a supplier listing free?",
        a: "Yes. A supplier account and directory listing are free. Paid options (SEO Listing, Featured, sponsorship, Project Spotlight) only add visibility.",
      },
      {
        q: "Who sees my listing?",
        a: "Trades, property managers, owners and builders browsing the Supplier Directory, plus anyone reading an RFP page where your trades and region match the job.",
      },
      {
        q: "Can I list for both Canada and the U.S.?",
        a: "Yes. PMRFP covers Canada and the United States. Set the regions you actually deliver to so you match the right jobs.",
      },
      {
        q: "Do you take a cut of my sales?",
        a: "No. PMRFP doesn't process payments between members and takes no commission, including on Marketplace equipment listings.",
      },
      {
        q: "How is advertising different from Featured?",
        a: "Featured moves your listing to the top of your categories and regions in the directory. A sponsorship puts a labelled sponsor unit on a trade's pages, its RFP pages, member dashboards and match emails.",
      },
    ],
    cta: {
      title: "Put your company in front of the trades bidding work near you.",
      description: "Free listing. Takes a few minutes.",
    },
  },
};

const fr: typeof en = {
  photoAlt: {
    windowCleaners: "Laveurs de vitres suspendus à des cordes nettoyant la façade vitrée d'une tour de bureaux",
    floorCoating: "Équipe appliquant un revêtement au rouleau sur le plancher de béton d'un grand entrepôt",
    retailAerial: "Vue aérienne d'un mégacentre commercial de banlieue et de ses stationnements",
  },
  plans: {
    earlyBird: "Tarif de lancement : bloquez 249 $/an — le prix passera à 399 $ dès que nous atteindrons 100 abonnés.",
    guarantee:
      "Annulez en tout temps — votre accès se poursuit jusqu'à la fin de votre période de facturation. Les abonnements ne sont pas remboursables.",
    roi: "Un seul appel d'offres commercial remporté couvre généralement plusieurs années de Trade Pro.",
  },
  copy: {
    tradeValue:
      "La plupart des travaux d'immeubles vont aux entrepreneurs que le gestionnaire immobilier connaît déjà. PMRFP vous met sur sa liste : un profil d'entreprise facile à trouver, plus les appels d'offres qu'il publie — selon votre corps de métier et votre région.",
    pmValue:
      "Publiez votre projet une seule fois, gratuitement. Les entrepreneurs qui correspondent à votre catégorie et à votre région le voient et répondent. Comparez-les au même endroit — aucune obligation d'embaucher.",
  },
  stats: {
    rfps: "appels d'offres publiés · 30 derniers jours",
    trades: "entreprises inscrites",
    daily: "Chaque jour",
    dailyLabel: "de nouveaux appels d'offres chaque matin",
    markets: "Canada + É.-U.",
    marketsLabel: "commercial et résidentiel",
  },
  email: {
    subject: {
      one: "{trade} : {n} nouvelle occasion sur {site} aujourd'hui",
      other: "{trade} : {n} nouvelles occasions sur {site} aujourd'hui",
    },
    from: "De {site} <{email}> · chaque matin",
    intro:
      "Nouveaux appels d'offres privés et publics dans vos corps de métier et vos régions depuis hier, par date de clôture la plus proche :",
    closes: "Clôture le {date}",
    noDeadline: "Aucune date de clôture fixe",
    cta: "Ouvrir votre fil",
  },
  pricing: {
    meta: {
      title: "Tarifs",
      description:
        "Des tarifs simples et transparents pour les entrepreneurs du Canada et des États-Unis. Commencez avec une fiche gratuite au répertoire, ou passez à Trade Pro pour un accès complet aux appels d'offres.",
    },
    eyebrow: "Tarifs",
    title: "Des tarifs simples, pensés pour les entrepreneurs.",
    lead: "Faites-vous trouver gratuitement, ou débloquez l'accès complet aux appels d'offres avec Trade Pro. Les gestionnaires immobiliers, constructeurs et propriétaires publient leurs projets sans frais.",
    free: {
      name: "Gratuit",
      blurb: "Soyez inscrit et visible — sans accès aux appels d'offres.",
      price: "0 $",
      per: "/pour toujours",
      features: ["Fiche au répertoire", "Profil d'entreprise de base", "Visibilité dans les recherches de fournisseurs"],
      cta: "S'inscrire gratuitement",
    },
    featured: {
      name: "En vedette",
      blurb: "Visibilité maximale — apparaissez en tête, là où les acheteurs regardent en premier.",
      price: "{n} $",
      per: "{currency}/an",
      features: [
        "Tout ce qu'inclut Trade Pro",
        "Placement en vedette — en tête de vos catégories",
        "En vedette dans vos régions desservies",
        "Badge « En vedette » sur votre profil",
        "Priorité dans les résultats de recherche du répertoire",
        "Visibilité maximale auprès des acheteurs",
      ],
      cta: "Passer en vedette",
    },
    preview: {
      eyebrow: "Ce que vous recevez",
      title: "Un courriel chaque matin. Toutes les occasions dans votre métier et votre secteur.",
      description:
        "Voici l'alerte Trade Pro, remplie de vrais appels d'offres ouverts tirés du tableau d'aujourd'hui. Fini la tournée d'une douzaine de portails.",
    },
    faqEyebrow: "FAQ",
    faqTitle: "Questions sur les tarifs",
    faq: [
      {
        q: "Offrez-vous des remboursements?",
        a: "Les abonnements ne sont pas remboursables, mais vous pouvez annuler en tout temps à partir du portail de facturation — votre accès se poursuit jusqu'à la fin de la période payée et vous ne serez plus facturé.",
      },
      {
        q: "PMRFP garantit-il du travail?",
        a: "Non. PMRFP est l'endroit où les gestionnaires immobiliers publient des appels d'offres et où les entrepreneurs se font trouver. Nous ne garantissons ni contrats, ni succès des soumissions, ni revenus.",
      },
      {
        q: "Puis-je annuler?",
        a: "Oui, votre abonnement reste actif jusqu'à la fin de la période de facturation. Les forfaits mensuels peuvent être annulés en tout temps.",
      },
      {
        q: "Où PMRFP est-il offert?",
        a: "Partout au Canada et aux États-Unis. Les appels d'offres publics proviennent d'AchatsCanada, de la Ville de Toronto, du SEAO du Québec et du Yukon au Canada, et de SAM.gov pour les travaux de bâtiment fédéraux aux États-Unis. Les gestionnaires immobiliers publient des appels d'offres dans les deux pays.",
      },
      {
        q: "Les entreprises américaines peuvent-elles s'inscrire et payer?",
        a: "Oui. Les prix sont en dollars canadiens et toutes les grandes cartes de crédit sont acceptées. Au taux de change actuel, Trade Pro revient à environ 180 $ US par année (ou environ 21 $ US par mois); l'émetteur de votre carte s'occupe de la conversion.",
      },
      {
        q: "Les gestionnaires immobiliers peuvent-ils publier gratuitement?",
        a: "Oui. Les gestionnaires immobiliers, constructeurs et propriétaires peuvent publier des appels d'offres sans frais.",
      },
      {
        q: "Puis-je m'inscrire si je ne dessers qu'une seule région?",
        a: "Oui. Choisissez les catégories et les régions que vous desservez, et seules les occasions pertinentes vous seront proposées.",
      },
    ],
  },
  forTrades: {
    meta: {
      title: "Pour les entrepreneurs",
      description:
        "Faites-vous connaître pour des contrats en immobilier commercial. PMRFP aide les gens de métier et les entrepreneurs à s'inscrire au répertoire, à suivre les appels d'offres et à manifester leur intérêt, au même endroit.",
    },
    eyebrow: "Pour les entrepreneurs",
    title: "Faites-vous connaître pour des contrats en immobilier commercial.",
    lead: "La plupart des travaux d'immeubles vont aux entrepreneurs que le gestionnaire immobilier connaît déjà. C'est sur {site} qu'il publie ses appels d'offres — inscrivez-vous, suivez votre corps de métier et votre région, et soumissionnez.",
    join: "S'inscrire comme entrepreneur",
    seePricing: "Voir les tarifs",
    comparePlans: "Comparer les forfaits",
    opportunity: {
      eyebrow: "L'occasion",
      title: "Pourquoi viser l'immobilier commercial",
      description:
        "Les immeubles commerciaux ont besoin d'une équipe stable d'entrepreneurs fiables — pour l'entretien, les améliorations, les urgences et les projets d'immobilisations. Le travail est régulier et payant, mais il se rend rarement aux entreprises qu'on ne connaît pas déjà.",
      punch:
        "La plupart des occasions en immobilier commercial n'arrivent jamais dans votre boîte de réception, à moins qu'on vous connaisse déjà.",
    },
    how: {
      eyebrow: "Comment ça marche",
      title: "Comment PMRFP vous aide",
      body: "PMRFP vous rend plus facile à trouver et vous donne un seul endroit pour suivre les appels d'offres qui vous correspondent.",
    },
    included: {
      eyebrow: "Ce qui est inclus",
      title: "Tout ce qu'il faut pour vous faire trouver et décrocher des contrats",
      items: {
        profile: {
          title: "Profil d'entreprise",
          body: "Un profil structuré et professionnel qui présente vos services, vos catégories et vos régions.",
        },
        directory: {
          title: "Fiche au répertoire",
          body: "Soyez visible auprès des gestionnaires immobiliers, constructeurs et propriétaires d'immeubles qui cherchent des fournisseurs.",
        },
        feed: {
          title: "Fil d'appels d'offres",
          body: "Voyez les appels d'offres que les gestionnaires immobiliers publient dans vos catégories et vos régions.",
        },
        save: {
          title: "Appels d'offres sauvegardés",
          body: "Mettez de côté les appels d'offres à revoir et gardez votre liste restreinte bien organisée.",
        },
        bid: {
          title: "Soumissionner",
          body: "Manifestez votre intérêt pour les appels d'offres qui vous conviennent et suivez chacune de vos soumissions.",
        },
        alerts: {
          title: "Alertes sur mesure",
          body: "Soyez avisé dès qu'un nouvel appel d'offres correspond à vos services, pour ne jamais rater une bonne occasion.",
        },
        badge: {
          title: "Badge de fournisseur vérifié",
          body: "Intégrez un badge PMRFP à votre site Web pour que les visiteurs puissent ouvrir votre profil d'entreprise et voir les renseignements qui y sont inscrits.",
        },
      },
    },
    badge: {
      title: "Montrez que vous êtes un fournisseur {site} vérifié",
      body: "Ajoutez à votre site Web un badge à copier-coller qui mène les visiteurs à votre profil, où ils verront vos services, vos secteurs et les renseignements qui y sont inscrits.",
      cta: "Obtenir votre badge",
    },
    who: {
      eyebrow: "Pour qui",
      title: "Conçu pour les gens de métier qui font rouler les immeubles commerciaux",
      trades: [
        "Électriciens",
        "CVC et mécanique",
        "Couvreurs",
        "Nettoyage et entretien ménager",
        "Déneigement",
        "Aménagement paysager et terrains",
        "Entrepreneurs généraux",
        "Plomberie",
        "Peinture et revêtements",
        "Sécurité incendie et des personnes",
        "Sécurité et contrôle d'accès",
        "Restauration après sinistre",
      ],
    },
    pricing: {
      eyebrow: "Tarifs",
      title: "Trade Pro : {price} $ {currency}/an",
      body: "Commencez avec une fiche gratuite au répertoire, ou passez à Pro pour l'accès complet aux appels d'offres, la sauvegarde, les soumissions et les alertes sur mesure.",
    },
    faqEyebrow: "FAQ",
    faqTitle: "Questions fréquentes",
    faq: [
      {
        q: "PMRFP garantit-il du travail?",
        a: "Non. PMRFP est l'endroit où les gestionnaires immobiliers publient des appels d'offres et où les entrepreneurs se font trouver. Nous ne garantissons ni contrats, ni succès des soumissions, ni revenus.",
      },
      {
        q: "Puis-je annuler?",
        a: "Oui. Vous pouvez annuler en tout temps. Votre abonnement reste actif jusqu'à la fin de votre période de facturation en cours.",
      },
      {
        q: "Quelles régions couvrez-vous?",
        a: "Choisissez précisément les régions et les catégories que vous desservez, et seuls les contrats pertinents vous seront proposés. Nous sommes présents dans les grands centres et en ajoutons d'autres — si votre secteur est encore en développement, inscrivez-vous à la liste des membres fondateurs et nous vous aviserons dès que des occasions s'y présenteront.",
      },
      {
        q: "Puis-je m'inscrire si je ne dessers qu'une seule région?",
        a: "Absolument. Choisissez les catégories et les régions que vous desservez réellement, et seules les occasions pertinentes vous seront proposées.",
      },
    ],
    cta: {
      title: "Inscrivez-vous avant vos concurrents.",
    },
  },
  forPms: {
    meta: {
      title: "Pour les gestionnaires immobiliers, constructeurs et propriétaires",
      description:
        "Publiez gratuitement votre projet d'immeuble et comparez les entrepreneurs qui soumissionnent — par catégorie et par région. Aucune obligation d'embaucher.",
    },
    eyebrow: "Pour les gestionnaires immobiliers, constructeurs, propriétaires et professionnels de l'immobilier",
    badge: "Gratuit pour les gestionnaires immobiliers",
    title: "Publiez un projet. Trouvez les bons fournisseurs. Aucune pression pour embaucher.",
    lead: {
      before:
        "Publiez gratuitement votre projet d'immeuble. Les entrepreneurs qui correspondent à votre catégorie et à votre région le voient et soumissionnent. Comparez-les au même endroit — aucune obligation d'embaucher. Conçu pour les gestionnaires immobiliers, constructeurs, propriétaires et ",
      link: "professionnels de l'immobilier",
      after: ".",
    },
    postFree: "Publier un appel d'offres — gratuit",
    landlord: {
      text: "Propriétaire bailleur ou propriétaire indépendant d'immeubles? Mêmes outils, même prix (gratuit) : publiez les travaux de réparation et d'entretien de vos immeubles, comparez les entrepreneurs qui répondent et invitez ceux avec qui vous travaillez déjà.",
      cta: "S'inscrire comme propriétaire",
    },
    writeRfp: "Rédiger mon appel d'offres — outil gratuit",
    caption: "Commerce de détail, bureaux, industriel, copropriété : publiez les travaux de tout immeuble que vous gérez.",
    how: {
      eyebrow: "Comment ça marche",
      title: "Une façon ciblée de trouver des entrepreneurs commerciaux",
      steps: {
        post: {
          title: "Publiez votre projet",
          body: "Décrivez les travaux, choisissez la catégorie, la région et le type d'immeuble, et publiez un appel d'offres clair en quelques minutes. Pas de formulaires interminables.",
        },
        find: {
          title: "Trouvez des fournisseurs par catégorie et par région",
          body: "Parcourez un répertoire ciblé d'entrepreneurs et d'entreprises de services, filtré selon les travaux et les endroits précis que vous devez couvrir.",
        },
        time: {
          title: "Perdez moins de temps à chercher",
          body: "Fini la chasse aux références et les appels à froid aux entrepreneurs. Laissez les entreprises qualifiées venir à vous et consultez les marques d'intérêt au même endroit.",
        },
      },
    },
    directory: {
      eyebrow: "Répertoire",
      title: "Trouvez des fournisseurs par catégorie et par région",
      description:
        "Explorez les entrepreneurs dans les catégories qui font rouler les immeubles commerciaux, puis filtrez selon votre région.",
      cta: "Voir tout le répertoire",
    },
    privacy: {
      title: "Gardez vos coordonnées privées au besoin",
      body: "Vous contrôlez la visibilité de vos coordonnées. Partagez-les ouvertement pour accélérer les choses, ou gardez-les privées et examinez les fournisseurs intéressés avant de décider avec qui communiquer.",
    },
    noObligation: "Aucune obligation d'embaucher",
    cta: {
      title: "Trouvez les bons fournisseurs pour votre prochain projet commercial.",
      description: "Publiez votre projet gratuitement. Les entrepreneurs intéressés viennent à vous.",
      secondary: "Parcourir le répertoire",
    },
  },
  becomeSupplier: {
    meta: {
      title: "Devenir fournisseur sur PMRFP — Rejoignez les entrepreneurs et gestionnaires immobiliers commerciaux",
      description:
        "Inscrivez gratuitement votre centre de distribution, comptoir, centre de location ou agence de représentants sur PMRFP. Présentez-vous aux entrepreneurs et gestionnaires immobiliers qui soumissionnent des travaux commerciaux au Canada et aux États-Unis.",
    },
    crumb: "Devenir fournisseur",
    eyebrow: "Pour les fournisseurs",
    title: "Devenez fournisseur PMRFP",
    lead: "Présentez-vous aux entrepreneurs et aux gestionnaires immobiliers qui soumissionnent des travaux commerciaux dans votre région. L'inscription d'un fournisseur est gratuite.",
    primary: "Inscrire votre entreprise gratuitement",
    secondary: "Annoncer sur PMRFP",
    stats: {
      open: "appels d'offres ouverts sur le tableau",
      trades: "entreprises de métiers inscrites",
      categories: "catégories de métiers",
    },
    why: {
      eyebrow: "Pourquoi s'inscrire",
      title: "Vos clients sont déjà ici et soumissionnent.",
      items: [
        {
          title: "Des entrepreneurs qui achètent pour leurs chantiers",
          body: "Les entrepreneurs sur PMRFP soumissionnent en toiture, CVC, électricité, pavage, entretien ménager et autres travaux de bâtiment. Chaque contrat obtenu exige des matériaux, de l'équipement ou de la location.",
        },
        {
          title: "Des gestionnaires qui achètent directement",
          body: "Gestionnaires immobiliers, propriétaires et constructeurs utilisent le répertoire pour trouver des fournisseurs, et certains achètent fournitures et équipement directement plutôt que par un entrepreneur.",
        },
        {
          title: "Jumelé aux travaux",
          body: "Votre fiche indique les métiers que vous approvisionnez et les régions que vous desservez, pour apparaître à côté des travaux qui utilisent vos produits.",
        },
      ],
    },
    where: {
      eyebrow: "Où vous apparaissez",
      title: "Où votre fiche s'affiche",
      items: {
        directory: { title: "Répertoire des fournisseurs", body: "Recherche par métier, région et type de propriété. Les fournisseurs en vedette apparaissent en premier." },
        rfp: { title: "« Qui peut faire ce travail » sur les pages d'appels d'offres", body: "Chaque page d'appel d'offres liste les entrepreneurs correspondants, puis les fournisseurs qui approvisionnent ce métier dans ce secteur." },
        home: { title: "Bandeau fournisseurs de l'accueil", body: "La page d'accueil présente des fournisseurs de matériaux et d'équipement, les fiches en vedette d'abord." },
        digest: { title: "Résumé hebdomadaire des appels d'offres", body: "Les fournisseurs inscrits reçoivent le courriel hebdomadaire des nouveaux appels d'offres, pour voir ce que vos clients s'apprêtent à chiffrer." },
      },
    },
    busiest: {
      title: "Travaux ouverts par métier en ce moment",
      body: "Appels d'offres ouverts et appels publics sur PMRFP aujourd'hui, par métier. Ce sont les travaux que vos clients entrepreneurs chiffrent.",
    },
    plans: {
      eyebrow: "Gratuit et payant",
      title: "Commencez gratuitement. Payez seulement pour plus de visibilité.",
      perYear: "/an",
      perMonth: "/mois",
      oneTime: "paiement unique",
      from: "à partir de",
      free: { name: "Fiche gratuite", price: "0 $", body: "Profil d'entreprise dans le répertoire des fournisseurs, les métiers que vous approvisionnez, vos régions et le jumelage sur les pages d'appels d'offres." },
      seo: { name: "Fiche SEO", body: "Votre entreprise sur les pages métier et ville que les gestionnaires trouvent sur Google et dans les réponses d'IA, plus une galerie de photos de projets illimitée." },
      featured: { name: "En vedette", body: "Tout ce qu'offre Trade Pro, plus un placement prioritaire en tête de vos catégories et régions." },
      sponsor: { name: "Commandite Trade Spotlight", body: "Un emplacement de commanditaire sur les pages d'un métier, ses pages d'appels d'offres, les tableaux de bord des membres et les courriels de jumelage. Toujours identifié comme commandité." },
      spotlight: { name: "Project Spotlight", body: "Un article révisé et clairement identifié sur un projet terminé, avec photos." },
      marketplace: { name: "Marché d'équipement", price: "Gratuit", body: "Annoncez de l'équipement usagé ou excédentaire. Aucune commission; les acheteurs vous écrivent par PMRFP." },
      currencyNote: "Prix en CAD. Project Spotlight coûte {usd} $ US aux États-Unis.",
    },
    refer: {
      title: "Recommandez vos clients entrepreneurs",
      body: "Vos clients entrepreneurs obtiennent plus de travaux quand ils sont sur le tableau. Recommandez un entrepreneur et gagnez jusqu'à {fee} $ lorsqu'il active un forfait Trade Pro annuel.",
      cta: "Recommander un entrepreneur",
    },
    who: {
      eyebrow: "Pour qui",
      title: "Pour les entreprises qui approvisionnent les travaux de bâtiment",
      list: [
        "Grossistes en électricité",
        "Distributeurs en plomberie et CVC",
        "Fournitures de toiture",
        "Bois et matériaux de construction",
        "Produits d'entretien sanitaire",
        "Fournisseurs de sécurité et d'EPI",
        "Centres de location d'équipement",
        "Peintures et revêtements",
        "Distributeurs de revêtements de sol",
        "Fournitures d'aménagement paysager et de déneigement",
        "Agences de représentants de fabricants",
        "Quincaillerie industrielle et fixations",
      ],
    },
    faqEyebrow: "FAQ",
    faqTitle: "Questions des fournisseurs",
    faq: [
      {
        q: "La fiche fournisseur est-elle gratuite?",
        a: "Oui. Le compte fournisseur et la fiche au répertoire sont gratuits. Les options payantes (Fiche SEO, En vedette, commandite, Project Spotlight) ajoutent seulement de la visibilité.",
      },
      {
        q: "Qui voit ma fiche?",
        a: "Les entrepreneurs, gestionnaires immobiliers, propriétaires et constructeurs qui consultent le répertoire des fournisseurs, ainsi que toute personne lisant une page d'appel d'offres où vos métiers et votre région correspondent au travail.",
      },
      {
        q: "Puis-je m'inscrire pour le Canada et les États-Unis?",
        a: "Oui. PMRFP couvre le Canada et les États-Unis. Indiquez les régions que vous desservez réellement pour être jumelé aux bons travaux.",
      },
      {
        q: "Prenez-vous une part de mes ventes?",
        a: "Non. PMRFP ne traite pas les paiements entre membres et ne prend aucune commission, y compris sur les annonces d'équipement du Marché.",
      },
      {
        q: "Quelle différence entre la publicité et En vedette?",
        a: "En vedette place votre fiche en tête de vos catégories et régions dans le répertoire. Une commandite ajoute un encart identifié comme commandité sur les pages d'un métier, ses pages d'appels d'offres, les tableaux de bord des membres et les courriels de jumelage.",
      },
    ],
    cta: {
      title: "Présentez votre entreprise aux entrepreneurs qui soumissionnent près de chez vous.",
      description: "Fiche gratuite. Quelques minutes suffisent.",
    },
  },
};

const es: typeof en = {
  photoAlt: {
    windowCleaners: "Limpiadores de ventanas colgados de cuerdas lavando la fachada de vidrio de una torre de oficinas",
    floorCoating: "Equipo aplicando con rodillo un recubrimiento sobre el piso de concreto de un gran almacén",
    retailAerial: "Vista aérea de un gran centro comercial suburbano y sus estacionamientos",
  },
  plans: {
    earlyBird: "Precio de lanzamiento: asegure $249 al año — sube a $399 cuando lleguemos a 100 suscriptores.",
    guarantee:
      "Cancele cuando quiera — su acceso dura hasta el final de su periodo de facturación. Las suscripciones no son reembolsables.",
    roi: "Una sola RFP comercial ganada suele cubrir varios años de Trade Pro.",
  },
  copy: {
    tradeValue:
      "La mayoría de los trabajos en edificios van a contratistas que el administrador de propiedades ya conoce. PMRFP lo pone en esa lista: un perfil de empresa fácil de encontrar, más las RFP que publican — según su oficio y su región.",
    pmValue:
      "Publique su proyecto una sola vez, gratis. Los contratistas que coinciden con su categoría y su región lo ven y responden. Compárelos en un solo lugar — sin obligación de contratar.",
  },
  stats: {
    rfps: "RFP publicadas · últimos 30 días",
    trades: "empresas de oficios registradas",
    daily: "A diario",
    dailyLabel: "nuevas licitaciones cada mañana",
    markets: "Canadá + EE. UU.",
    marketsLabel: "comercial y residencial",
  },
  email: {
    subject: {
      one: "{trade}: {n} nueva oportunidad en {site} hoy",
      other: "{trade}: {n} nuevas oportunidades en {site} hoy",
    },
    from: "De {site} <{email}> · cada mañana",
    intro: "Nuevas RFP y licitaciones públicas en sus oficios y regiones desde ayer, empezando por la fecha límite más próxima:",
    closes: "Cierra el {date}",
    noDeadline: "Sin fecha de cierre fija",
    cta: "Ver mis oportunidades",
  },
  pricing: {
    meta: {
      title: "Precios",
      description:
        "Precios simples y transparentes para contratistas en Canadá y EE. UU. Empiece con una ficha gratuita en el directorio o elija Trade Pro para tener acceso completo a las RFP.",
    },
    eyebrow: "Precios",
    title: "Precios simples, pensados para contratistas.",
    lead: "Hágase visible gratis o desbloquee el acceso completo a las RFP con Trade Pro. Los administradores de propiedades, constructores y propietarios publican proyectos sin costo.",
    free: {
      name: "Gratis",
      blurb: "Aparezca en el directorio y hágase visible — sin acceso a las RFP.",
      price: "$0",
      per: "/para siempre",
      features: ["Ficha en el directorio", "Perfil básico de la empresa", "Aparece en las búsquedas de proveedores"],
      cta: "Registrarse gratis",
    },
    featured: {
      name: "Destacado",
      blurb: "Máxima visibilidad — aparezca arriba, donde los compradores miran primero.",
      price: "${n}",
      per: "{currency} al año",
      features: [
        "Todo lo que incluye Trade Pro",
        "Ubicación destacada — arriba en sus categorías",
        "Destacado en sus regiones de servicio",
        "Insignia de Destacado en su perfil",
        "Prioridad en los resultados de búsqueda del directorio",
        "Máxima visibilidad ante los compradores",
      ],
      cta: "Obtener Destacado",
    },
    preview: {
      eyebrow: "Lo que recibe",
      title: "Un correo cada mañana. Cada oportunidad de su oficio y su zona.",
      description:
        "Esta es la alerta de Trade Pro, con licitaciones abiertas reales del tablero de hoy. Se acabó revisar una docena de portales.",
    },
    faqEyebrow: "Preguntas frecuentes",
    faqTitle: "Preguntas sobre precios",
    faq: [
      {
        q: "¿Ofrecen reembolsos?",
        a: "Las suscripciones no son reembolsables, pero puede cancelar cuando quiera desde el portal de facturación — su acceso continúa hasta el final del periodo pagado y no se le volverá a cobrar.",
      },
      {
        q: "¿PMRFP garantiza trabajo?",
        a: "No. PMRFP es donde los administradores de propiedades publican RFP y donde los contratistas se hacen visibles. No garantizamos contratos, el éxito de las ofertas ni ingresos.",
      },
      {
        q: "¿Puedo cancelar?",
        a: "Sí, su suscripción sigue activa hasta el final del periodo de facturación. Los planes mensuales se pueden cancelar en cualquier momento.",
      },
      {
        q: "¿Dónde funciona PMRFP?",
        a: "En todo Canadá y Estados Unidos. Las licitaciones públicas provienen de CanadaBuys, la Ciudad de Toronto, el SEAO de Quebec y Yukon en Canadá, y de SAM.gov para obras federales de edificios en EE. UU. Los administradores de propiedades publican RFP en ambos países.",
      },
      {
        q: "¿Las empresas de EE. UU. pueden registrarse y pagar?",
        a: "Sí. Los precios están en dólares canadienses y se acepta cualquier tarjeta principal. Al tipo de cambio actual, Trade Pro sale en aproximadamente US$180 al año (o unos US$21 al mes); el emisor de su tarjeta hace la conversión.",
      },
      {
        q: "¿Los administradores de propiedades pueden publicar gratis?",
        a: "Sí. Los administradores de propiedades, constructores y propietarios pueden publicar RFP sin costo.",
      },
      {
        q: "¿Puedo unirme si solo trabajo en una región?",
        a: "Sí. Elija las categorías y regiones en las que trabaja y solo recibirá oportunidades relevantes.",
      },
    ],
  },
  forTrades: {
    meta: {
      title: "Para empresas de oficios",
      description:
        "Hágase visible para trabajos en propiedades comerciales. PMRFP ayuda a los oficios y contratistas a aparecer en el directorio, seguir oportunidades de RFP y expresar interés en un solo lugar.",
    },
    eyebrow: "Para empresas de oficios",
    title: "Hágase visible para trabajos en propiedades comerciales.",
    lead: "La mayoría de los trabajos en edificios se los lleva quien el administrador de propiedades ya conoce. {site} es donde publican sus RFP — regístrese, siga su oficio y su región, y presente ofertas.",
    join: "Registrarse como contratista",
    seePricing: "Ver precios",
    comparePlans: "Comparar planes",
    opportunity: {
      eyebrow: "La oportunidad",
      title: "Por qué importan los trabajos en propiedades comerciales",
      description:
        "Las propiedades comerciales necesitan un grupo estable de contratistas confiables — para mantenimiento, mejoras, emergencias y proyectos de capital. El trabajo es constante y de alto valor, pero rara vez llega a empresas que no son conocidas.",
      punch: "La mayoría de las oportunidades en propiedades comerciales nunca llegan a su bandeja de entrada si no lo conocen de antemano.",
    },
    how: {
      eyebrow: "Cómo funciona",
      title: "Cómo ayuda PMRFP",
      body: "PMRFP hace que sea más fácil encontrarlo y le da un solo lugar para seguir las RFP que le corresponden.",
    },
    included: {
      eyebrow: "Qué incluye",
      title: "Todo lo que necesita para hacerse visible y ganar trabajos en edificios",
      items: {
        profile: {
          title: "Perfil de la empresa",
          body: "Un perfil estructurado y profesional que muestra sus servicios, categorías y regiones.",
        },
        directory: {
          title: "Ficha en el directorio",
          body: "Hágase visible para los administradores de propiedades, constructores y propietarios de edificios que buscan proveedores.",
        },
        feed: {
          title: "Listado de RFP",
          body: "Vea las RFP que publican los administradores de propiedades en sus categorías y regiones.",
        },
        save: {
          title: "Guardar RFP",
          body: "Marque las RFP que quiera volver a revisar y mantenga organizada su lista de preselección.",
        },
        bid: {
          title: "Ofertar en RFP",
          body: "Exprese interés en las RFP que le convienen y dé seguimiento a cada oferta que presente.",
        },
        alerts: {
          title: "Alertas de oportunidades",
          body: "Reciba un aviso cuando nuevas RFP coincidan con sus servicios, para no perderse ninguna.",
        },
        badge: {
          title: "Insignia de proveedor verificado",
          body: "Inserte una insignia de PMRFP en su sitio web para que los visitantes puedan abrir el perfil de su empresa y ver los datos registrados allí.",
        },
      },
    },
    badge: {
      title: "Muestre que es un proveedor verificado de {site}",
      body: "Obtenga una insignia para copiar y pegar en su sitio web que lleva a los visitantes a su perfil, donde verán sus servicios, sus zonas y los datos registrados allí.",
      cta: "Obtener su insignia",
    },
    who: {
      eyebrow: "Quién debería unirse",
      title: "Hecho para los oficios que mantienen en marcha las propiedades comerciales",
      trades: [
        "Electricistas",
        "HVAC y mecánica",
        "Techadores",
        "Limpieza y conserjería",
        "Remoción de nieve",
        "Jardinería y áreas verdes",
        "Contratistas generales",
        "Plomería",
        "Pintura y recubrimientos",
        "Seguridad contra incendios y protección de la vida",
        "Seguridad y control de acceso",
        "Restauración de daños",
      ],
    },
    pricing: {
      eyebrow: "Precios",
      title: "Trade Pro: ${price} {currency} al año",
      body: "Empiece con una ficha gratuita en el directorio o pase a Pro para tener acceso completo a las RFP, guardar RFP, presentar ofertas y recibir alertas de oportunidades.",
    },
    faqEyebrow: "Preguntas frecuentes",
    faqTitle: "Preguntas comunes",
    faq: [
      {
        q: "¿PMRFP garantiza trabajo?",
        a: "No. PMRFP es donde los administradores de propiedades publican RFP y donde los contratistas se hacen visibles. No garantizamos contratos, el éxito de las ofertas ni ingresos.",
      },
      {
        q: "¿Puedo cancelar?",
        a: "Sí. Puede cancelar en cualquier momento. Su suscripción sigue activa hasta el final de su periodo de facturación actual.",
      },
      {
        q: "¿Qué regiones cubren?",
        a: "Elija exactamente las regiones y categorías en las que trabaja y solo recibirá trabajos relevantes. Ya estamos en las principales áreas metropolitanas y seguimos sumando más — si su zona aún se está desarrollando, únase a la lista de fundadores y le avisaremos cuando lleguen oportunidades.",
      },
      {
        q: "¿Puedo unirme si solo trabajo en una región?",
        a: "Por supuesto. Elija las categorías y regiones en las que realmente trabaja y solo recibirá oportunidades relevantes.",
      },
    ],
    cta: {
      title: "Regístrese antes que su competencia.",
    },
  },
  forPms: {
    meta: {
      title: "Para administradores de propiedades, constructores y propietarios",
      description:
        "Publique gratis su proyecto de edificio y compare a los contratistas que presentan ofertas — por categoría y región. Sin obligación de contratar.",
    },
    eyebrow: "Para administradores de propiedades, constructores, propietarios y profesionales inmobiliarios",
    badge: "Gratis para administradores de propiedades",
    title: "Publique un proyecto. Encuentre a los proveedores adecuados. Sin presión para contratar.",
    lead: {
      before:
        "Publique gratis su proyecto de edificio. Los contratistas que coinciden con su categoría y su región lo ven y presentan ofertas. Compárelos en un solo lugar — sin obligación de contratar. Hecho para administradores de propiedades, constructores, propietarios y ",
      link: "profesionales inmobiliarios",
      after: ".",
    },
    postFree: "Publicar una RFP — gratis",
    landlord: {
      text: "¿Es arrendador o dueño independiente de edificios? Mismas herramientas, mismo precio (gratis): publique trabajos de reparación y mantenimiento para sus edificios, compare a los contratistas que responden e invite a los que ya usa.",
      cta: "Registrarse como propietario",
    },
    writeRfp: "Redactar mi RFP — herramienta gratuita",
    caption: "Comercios, oficinas, naves industriales, condominios: publique los trabajos de cualquier edificio que administre.",
    how: {
      eyebrow: "Cómo funciona",
      title: "Una forma enfocada de encontrar contratistas comerciales",
      steps: {
        post: {
          title: "Publique su proyecto",
          body: "Describa el trabajo, elija la categoría, la región y el tipo de propiedad, y publique una RFP clara en minutos. Sin formularios interminables.",
        },
        find: {
          title: "Encuentre proveedores por categoría y región",
          body: "Explore un directorio enfocado de oficios y empresas de servicios, filtrado exactamente por el trabajo y las ubicaciones que necesita cubrir.",
        },
        time: {
          title: "Pierda menos tiempo buscando",
          body: "Deje de perseguir recomendaciones y de llamar en frío a contratistas. Deje que las empresas calificadas vengan a usted y revise su interés en un solo lugar.",
        },
      },
    },
    directory: {
      eyebrow: "Directorio",
      title: "Encuentre proveedores por categoría y región",
      description:
        "Explore los oficios de las categorías que mantienen en marcha las propiedades comerciales y luego filtre por su región.",
      cta: "Ver el directorio completo",
    },
    privacy: {
      title: "Mantenga sus datos privados si lo necesita",
      body: "Usted controla la visibilidad de sus datos de contacto. Compártalos abiertamente para agilizar las cosas, o manténgalos privados y revise a los proveedores interesados antes de decidir con quién ponerse en contacto.",
    },
    noObligation: "Sin obligación de contratar",
    cta: {
      title: "Encuentre a los proveedores adecuados para su próximo proyecto comercial.",
      description: "Publique su proyecto gratis. Los contratistas interesados vienen a usted.",
      secondary: "Explorar el directorio",
    },
  },
  becomeSupplier: {
    meta: {
      title: "Hágase proveedor en PMRFP — Llegue a contratistas y administradores de propiedades comerciales",
      description:
        "Publique gratis su distribuidora, almacén, patio de renta de equipo o agencia de representantes en PMRFP. Preséntese ante los contratistas y administradores de propiedades que cotizan obra comercial en Canadá y EE. UU.",
    },
    crumb: "Hágase proveedor",
    eyebrow: "Para proveedores",
    title: "Hágase proveedor de PMRFP",
    lead: "Preséntese ante los contratistas y administradores de propiedades que cotizan obra en propiedades comerciales de su zona. El perfil de proveedor es gratis.",
    primary: "Publique su empresa gratis",
    secondary: "Anúnciese en PMRFP",
    stats: {
      open: "RFP y licitaciones abiertas en el tablero",
      trades: "empresas de oficios en el directorio",
      categories: "categorías de oficios",
    },
    why: {
      eyebrow: "Por qué publicar",
      title: "Sus clientes ya están aquí, cotizando obra.",
      items: [
        {
          title: "Contratistas que compran para sus obras",
          body: "Los contratistas en PMRFP cotizan techado, HVAC, electricidad, pavimentación, limpieza y otras obras de edificios. Cada trabajo que ganan necesita materiales, equipo o renta.",
        },
        {
          title: "Administradores que compran directo",
          body: "Administradores de propiedades, dueños y constructores usan el directorio para encontrar proveedores, y algunos compran insumos y equipo directamente en lugar de hacerlo por medio de un contratista.",
        },
        {
          title: "Conectado con la obra",
          body: "Su perfil indica los oficios a los que vende y las regiones que atiende, para que aparezca junto a los trabajos que usan lo que usted vende.",
        },
      ],
    },
    where: {
      eyebrow: "Dónde aparece",
      title: "Dónde se muestra su perfil",
      items: {
        directory: { title: "Directorio de proveedores", body: "Búsqueda por oficio, región y tipo de propiedad. Los proveedores destacados aparecen primero." },
        rfp: { title: "\"Quién puede hacer este trabajo\" en las páginas de RFP", body: "Cada página de RFP y licitación muestra los contratistas que coinciden y luego los proveedores que venden a ese oficio en esa zona." },
        home: { title: "Franja de proveedores en la página de inicio", body: "La página de inicio muestra proveedores de materiales y equipo, primero los destacados." },
        digest: { title: "Resumen semanal de licitaciones", body: "Los proveedores registrados reciben el correo semanal de nuevas licitaciones, para ver lo que sus clientes están por cotizar." },
      },
    },
    busiest: {
      title: "Obra abierta por oficio en este momento",
      body: "RFP abiertas y licitaciones públicas en PMRFP hoy, por oficio. Son los trabajos que sus clientes contratistas están cotizando.",
    },
    plans: {
      eyebrow: "Gratis y de pago",
      title: "Empiece gratis. Pague solo por más visibilidad.",
      perYear: "/año",
      perMonth: "/mes",
      oneTime: "pago único",
      from: "desde",
      free: { name: "Perfil gratis", price: "$0", body: "Perfil de empresa en el directorio de proveedores, los oficios a los que vende, sus regiones y la coincidencia en páginas de RFP." },
      seo: { name: "Perfil SEO", body: "Su empresa en las páginas de oficio y ciudad que los administradores encuentran en Google y en respuestas de IA, más una galería ilimitada de fotos de proyectos." },
      featured: { name: "Destacado", body: "Todo lo de Trade Pro, más ubicación prioritaria al inicio de sus categorías y regiones." },
      sponsor: { name: "Patrocinio Trade Spotlight", body: "Un espacio de patrocinio en las páginas de un oficio, sus páginas de RFP, los paneles de los miembros y los correos de coincidencias. Siempre identificado como patrocinado." },
      spotlight: { name: "Project Spotlight", body: "Un artículo revisado y claramente identificado sobre un proyecto terminado, con fotos." },
      marketplace: { name: "Mercado de equipo", price: "Gratis", body: "Publique equipo usado o excedente. Sin comisión; los compradores le escriben por PMRFP." },
      currencyNote: "Precios en CAD. Project Spotlight cuesta US${usd} en EE. UU.",
    },
    refer: {
      title: "Recomiende a sus clientes contratistas",
      body: "Sus clientes contratistas ganan más trabajo cuando están en el tablero. Recomiende a un contratista y gane hasta ${fee} cuando active un plan anual Trade Pro.",
      cta: "Recomendar a un contratista",
    },
    who: {
      eyebrow: "Para quién",
      title: "Para las empresas que abastecen la obra de edificios",
      list: [
        "Mayoristas eléctricos",
        "Distribuidores de plomería y HVAC",
        "Suministros de techado",
        "Madera y materiales de construcción",
        "Suministros de limpieza y sanitarios",
        "Proveedores de seguridad y EPP",
        "Patios de renta de equipo",
        "Pinturas y recubrimientos",
        "Distribuidores de pisos",
        "Suministros de jardinería y nieve",
        "Representantes de fabricantes",
        "Tornillería y suministro industrial",
      ],
    },
    faqEyebrow: "Preguntas frecuentes",
    faqTitle: "Preguntas de proveedores",
    faq: [
      {
        q: "¿El perfil de proveedor es gratis?",
        a: "Sí. La cuenta de proveedor y el perfil en el directorio son gratis. Las opciones de pago (Perfil SEO, Destacado, patrocinio, Project Spotlight) solo agregan visibilidad.",
      },
      {
        q: "¿Quién ve mi perfil?",
        a: "Contratistas, administradores de propiedades, dueños y constructores que consultan el directorio de proveedores, además de quien lea una página de RFP donde sus oficios y región coincidan con el trabajo.",
      },
      {
        q: "¿Puedo registrarme para Canadá y EE. UU.?",
        a: "Sí. PMRFP cubre Canadá y Estados Unidos. Indique las regiones que realmente atiende para coincidir con los trabajos correctos.",
      },
      {
        q: "¿Se quedan con un porcentaje de mis ventas?",
        a: "No. PMRFP no procesa pagos entre miembros ni cobra comisión, tampoco en las publicaciones de equipo del Mercado.",
      },
      {
        q: "¿En qué se diferencia la publicidad de Destacado?",
        a: "Destacado pone su perfil al inicio de sus categorías y regiones en el directorio. Un patrocinio coloca una unidad identificada como patrocinada en las páginas de un oficio, sus páginas de RFP, los paneles de los miembros y los correos de coincidencias.",
      },
    ],
    cta: {
      title: "Ponga su empresa frente a los contratistas que cotizan obra cerca de usted.",
      description: "Perfil gratis. Toma unos minutos.",
    },
  },
};

export default { en, fr, es };
