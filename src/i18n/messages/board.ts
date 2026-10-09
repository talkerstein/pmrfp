/** Strings for this area. `fr` is typed against `en`, so every key must exist in both. */

/** Per-source overrides for lib/tenders/sources (keyed by source `key`). English uses the lib as-is. */
type SourceCopy = { issuer: string; portal: string; bidLabel: string; attribution: string };

const en = {
  // ---------- /rfps (the board) ----------
  meta: {
    title: "Free Commercial Property RFPs & Tenders — Canada and the US",
    titleCount: {
      one: "{n} Open Commercial Property RFP & Tender — Free, Updated Daily",
      other: "{n} Open Commercial Property RFPs & Tenders — Free, Updated Daily",
    },
    lead: { one: "{n} open", other: "{n} open" },
    leadNone: "Open",
    description:
      "{lead} commercial property RFPs and public tenders across Canada and the U.S., free to browse — snow removal, HVAC, roofing, cleaning, electrical and more. Updated every morning, with closing dates and past awards.",
  },
  hero: {
    eyebrow: "Tender board",
    title: "Commercial property RFPs and public tenders",
    body: "Private RFPs from property managers alongside public tenders from Canadian and U.S. buyers, with closing dates and past awards. Trade Pro members see full scope, documents and contacts.",
  },
  stats: {
    open: "Open",
    closingWeek: "Closing in 7d",
    awarded: "Awarded",
    pastAwards: "Past awards",
  },
  sort: { closing: "Closing soon", newest: "Newest" },
  country: { aria: "Country", ca: "Canada", us: "United States", all: "All" },
  tabs: { aria: "Listing view", open: "Open now", gc: "GC packages", awarded: "Awarded" },
  locked: { previews: "Previews shown.", unlock: "Trade Pro unlocks full details" },
  empty: {
    awarded: "No past contracts match these filters",
    gc: "No open GC sub-trade packages match these filters",
    open: "No open tenders match these filters",
    filtered: "Widen the region or trade, or check the other tabs. New tenders are added every morning.",
    unfiltered: "New tenders are added every morning. The awarded tab shows who won recent contracts.",
    clear: "Clear filters",
    alerts: "Get alerts for new tenders",
  },
  count: { one: "{n} listing", other: "{n} listings" },
  pageOf: " · page {page} of {pages}",
  pagination: { aria: "Pagination", prev: "Previous", next: "Next" },
  recent: {
    eyebrow: "Award notices",
    title: "Recently awarded",
    body: "Public contracts with the winning company and the value. Trade Pro members are alerted the day the next one in their trade is posted.",
    all: { one: "All {n} awards", other: "All {n} awards" },
  },

  // ---------- /rfps/[slug] (listing detail) ----------
  detail: {
    matches: {
      title: "Who can do this job",
      trades: "Companies that do this work",
      suppliers: "Suppliers for this job",
      does: "{trade} · serves {area}",
      supplies: "Supplies {trade} · serves {area}",
      featured: "Featured",
      emptyTitle: "No companies listed for {trade} in {area} yet",
      emptyBody: "Do this work or supply it? Get listed free and show up on jobs like this one.",
      listTrade: "List your company free",
      listSupplier: "List a supply company",
      getFeatured: "Get the top spot",
      note: "Listed companies that cover this trade and area. Featured companies pay for placement.",
    },
    meta: {
      notFound: "Opportunity not found",
      title: "{title} | RFP Opportunity",
      titlePlace: "{title} — {place}",
      description: "Commercial property RFP opportunity on PMRFP.",
      descTender: "{who} tender{where}.",
      descBuyer: "{buyer}",
      descPm: "Property manager",
      descWhere: " in {place}",
      descCloses: " Closes {date}.",
      descClosed: " Closed {date}.",
      descTail: " Free to view on PMRFP with trade, scope summary and deadline.",
    },
    breadcrumb: { aria: "Breadcrumb", board: "Tender board", listing: "Listing" },
    demo: {
      title: "Demo preview.",
      fullView: "You're seeing the full Trade Pro member view.",
      seeLocked: "See the visitor (locked) view",
      lockedView: "You're seeing the visitor (locked) view.",
      seeFull: "See the full member view",
    },
    kind: {
      award: "Award notice",
      gc: "GC sub-trade package",
      public: "Public tender",
      private: "Private RFP",
      sample: "· Sample listing",
    },
    facts: {
      reference: "Reference",
      notPublished: "Not published",
      source: "Source",
      gc: "General contractor",
      pm: "Property manager",
      awarded: "Awarded",
      closed: "Closed",
      quotesDue: "Quotes due",
      closes: "Closes",
      ongoing: "Ongoing",
      location: "Location",
      notSpecified: "Not specified",
    },
    /** Short "days left" after the date in the header. */
    daysLeft: { today: "today", tomorrow: "tomorrow", n: "{n} days left" },
    /** Under the date in the sidebar. */
    closesIn: { today: "Closes today", tomorrow: "Closes tomorrow", n: "Closes in {n} days" },
    closedArchive: {
      official: "Official notice",
      awardedTo: "Contract awarded to",
      awardedOn: "Awarded {date}",
      awardNotice: "Official award notice",
      awardListing: "Award details on PMRFP",
      noAward:
        "The buyer's open data doesn't show an award for this notice yet. The official notice has the documents and any result.",
      noteTitle: "Closed public tender.",
      noteBody:
        "Taken from {issuer}'s open data after it closed, for reference only. It can't be bid on, and it did not go through PMRFP.",
    },
    publicNote: {
      pastTitle: "Past public contract.",
      pastBody:
        "Already awarded by {issuer}. Listed so trades can see what this kind of work sells for and who wins it. It did not go through PMRFP.",
      openTitle: "Public tender.",
      openBody:
        "Issued by {issuer} and published on {portal}. PMRFP collects the tenders that fit commercial trades. Bids go directly to the issuer, not through PMRFP.",
    },
    gcNote: {
      title: "GC sub-trade package.",
      collecting: "A general contractor is collecting ",
      quotesTrade: "{trade} quotes",
      quotes: "quotes",
      forProject: " for ",
      end: ".",
      partOf: " It's part of a public contract: ",
      wonBy: ", won by {winner}",
      value: " ({value})",
    },
    status: {
      awardedTitle: "This RFP has been awarded.",
      awardedBody: "Watch for similar opportunities on the feed, or post your own RFP if you have a project.",
      closedTitle: "This RFP is closed.",
      closedBody: "No vendor was awarded the work through PMRFP.",
    },
    photos: {
      alt: "Property photo {n}",
      more: { one: "+ {n} more photo", other: "+ {n} more photos" },
    },
    award: {
      wonBy: "Won by",
      allWins: "See all {n} contracts they've won",
      hiringSubs: "The winner is hiring subs for this job",
      quotesDue: " · quotes due {date}",
      gone: "This contract is gone.",
      similar: {
        one: "{n} open {trade} tender is live right now.",
        other: "{n} open {trade} tenders are live right now.",
      },
      /** How the trade reads inside `similar`. */
      tradePhrase: "{trade}",
      tradeFallback: "trade",
      nextWontWait: "The next one won't wait either.",
      pitch:
        "Trade Pro emails you the day a new public tender in your trade and region is posted, with the direct link, full scope and buyer contact, so you're bidding on the next contract, not reading about who won the last one.",
      cta: "Get tender alerts for my trade",
      seeOpen: "See the open ones",
      official: "Official award notice",
    },
    full: {
      scope: "Project scope",
      requirements: "Requirements",
      budget: "Budget range",
      budgetRange: "${min} – ${max} {currency}",
      submission: "Submission instructions",
      contact: "Contact",
      afterSignIn: "Provided after sign-in",
      afterApproval: "Contact details are revealed after the property manager approves your interest.",
      mediated: "This opportunity is mediated by PMRFP. Express interest to connect.",
      openNotice: "Open the official notice on {portal}",
    },
    closed: {
      title: "This one closed on {date}.",
      region: {
        one: "{n} open RFP is live in {region} right now.",
        other: "{n} open RFPs are live in {region} right now.",
      },
      total: { one: "{n} open RFPs are live right now.", other: "{n} open RFPs are live right now." },
      body: "Trade Pro emails you the day a new RFP in your trade and region is posted, so you see the next one while it's still open.",
      cta: "Get alerts for my trade",
      seeOpen: "See what's open",
    },
    locked: {
      region: {
        one: "{n} open commercial RFPs in {region} right now",
        other: "{n} open commercial RFPs in {region} right now",
      },
      total: {
        one: "{n} open commercial RFPs on PMRFP right now",
        other: "{n} open commercial RFPs on PMRFP right now",
      },
      proof: "Trade Pro members get the full scope and contacts for every one, plus an email the day a new one matches their trade.",
      publicPitch:
        "This tender is public. What Trade Pro adds: every public tender that fits your trade in one place, a daily email when a new one is posted in your region, and the direct link, full scope and buyer contact for each, instead of checking government bid portals yourself.",
    },
    side: {
      region: "Region",
      propertyType: "Property type",
      trade: "Trade",
      alerts: "Get alerts for my trade",
      unlock: "Unlock full details",
      closedNote: "This RFP is closed. Trade Pro members get alerted to new ones in their trade and region.",
      unlockNote: "Scope, documents, buyer contact and the ability to express interest are included with Trade Pro.",
    },
    /** Money from award summaries ("$120,000 CAD"), reformatted outside English. */
    moneyCad: "${n} CAD",
    /** Public-source labels; empty in English (lib/tenders/sources is used as-is). */
    sources: {} as Record<string, SourceCopy>,
  },

  // ---------- Open Graph image ----------
  og: {
    eyebrow: "RFP",
    eyebrowRegion: "RFP · {region}",
    notFound: "Opportunity not found",
    closes: "Closes {date}",
    regionFallback: "Canada",
  },
};

const OGL_FR = (who: string) => `Contient des informations visées par la Licence du gouvernement ouvert – ${who}.`;
const CANADA_FR: SourceCopy = {
  issuer: "le gouvernement du Canada",
  portal: "AchatsCanada",
  bidLabel: "Soumissionner sur AchatsCanada",
  attribution: OGL_FR("Canada"),
};
const SEAO_FR: SourceCopy = {
  issuer: "un organisme public québécois",
  portal: "le SEAO",
  bidLabel: "Soumissionner sur le SEAO",
  attribution:
    "Source : Système électronique d'appel d'offres (SEAO), Secrétariat du Conseil du trésor du Québec — Données Québec, CC BY 4.0.",
};
const TORONTO_FR: SourceCopy = {
  issuer: "la Ville de Toronto",
  portal: "le portail d'appels d'offres de la Ville de Toronto",
  bidLabel: "Soumissionner sur le portail de la Ville",
  attribution: OGL_FR("Toronto"),
};

const fr: typeof en = {
  meta: {
    title: "Appels d'offres en immobilier commercial au Canada et aux États-Unis (gratuit)",
    titleCount: {
      one: "{n} appel d'offres ouvert en immobilier commercial — gratuit, mis à jour chaque jour",
      other: "{n} appels d'offres ouverts en immobilier commercial — gratuit, mis à jour chaque jour",
    },
    lead: { one: "{n} appel d'offres ouvert", other: "{n} appels d'offres ouverts" },
    leadNone: "Appels d'offres ouverts",
    description:
      "{lead} en immobilier commercial, privés et publics, au Canada et aux États-Unis : déneigement, CVC, toiture, entretien ménager, électricité et plus. Mis à jour chaque jour, avec dates de clôture et contrats octroyés.",
  },
  hero: {
    eyebrow: "Tableau des appels d'offres",
    title: "Appels d'offres privés et publics en immobilier commercial",
    body: "Les appels d'offres privés des gestionnaires immobiliers, réunis avec les appels d'offres publics d'acheteurs canadiens et américains, avec dates de clôture et contrats octroyés. Les membres Trade Pro voient la portée complète, les documents et les contacts.",
  },
  stats: {
    open: "Ouverts",
    closingWeek: "Clôture sous 7 j",
    awarded: "Valeur octroyée",
    pastAwards: "Contrats octroyés",
  },
  sort: { closing: "Clôture la plus proche", newest: "Plus récents" },
  country: { aria: "Pays", ca: "Canada", us: "États-Unis", all: "Tous" },
  tabs: { aria: "Affichage des annonces", open: "Ouverts", gc: "Lots de sous-traitance", awarded: "Octroyés" },
  locked: { previews: "Aperçus seulement.", unlock: "Trade Pro débloque tous les détails" },
  empty: {
    awarded: "Aucun contrat octroyé ne correspond à ces filtres",
    gc: "Aucun lot de sous-traitance ouvert ne correspond à ces filtres",
    open: "Aucun appel d'offres ouvert ne correspond à ces filtres",
    filtered:
      "Élargissez la région ou le corps de métier, ou consultez les autres onglets. De nouveaux appels d'offres sont ajoutés chaque matin.",
    unfiltered:
      "De nouveaux appels d'offres sont ajoutés chaque matin. L'onglet Octroyés montre qui a remporté les contrats récents.",
    clear: "Effacer les filtres",
    alerts: "Recevoir les alertes de nouveaux appels d'offres",
  },
  count: { one: "{n} annonce", other: "{n} annonces" },
  pageOf: " · page {page} sur {pages}",
  pagination: { aria: "Pagination", prev: "Précédent", next: "Suivant" },
  recent: {
    eyebrow: "Avis d'octroi",
    title: "Octroyés récemment",
    body: "Des contrats publics avec l'adjudicataire et la valeur. Les membres Trade Pro sont avertis le jour même où le prochain est publié dans leur corps de métier.",
    all: { one: "Voir le contrat octroyé", other: "Voir les {n} contrats octroyés" },
  },

  detail: {
    matches: {
      title: "Qui peut faire ce travail",
      trades: "Entreprises qui font ce travail",
      suppliers: "Fournisseurs pour ce projet",
      does: "{trade} · dessert {area}",
      supplies: "Fournit : {trade} · dessert {area}",
      featured: "En vedette",
      emptyTitle: "Aucune entreprise inscrite pour {trade} ({area}) pour l'instant",
      emptyBody: "Vous faites ce travail ou fournissez ces produits ? Inscrivez-vous gratuitement et apparaissez sur des projets comme celui-ci.",
      listTrade: "Inscrire mon entreprise gratuitement",
      listSupplier: "Inscrire un fournisseur",
      getFeatured: "Obtenir la première place",
      note: "Entreprises inscrites qui couvrent ce corps de métier et ce secteur. Les entreprises en vedette paient pour leur placement.",
    },
    meta: {
      notFound: "Occasion introuvable",
      title: "{title} | Appel d'offres",
      titlePlace: "{title} — {place}",
      description: "Appel d'offres en immobilier commercial sur PMRFP.",
      descTender: "Appel d'offres de {who}{where}.",
      descBuyer: "{buyer}",
      descPm: "gestionnaire immobilier",
      descWhere: " à {place}",
      descCloses: " Clôture le {date}.",
      descClosed: " Clos le {date}.",
      descTail: " Consultation gratuite sur PMRFP : métier, résumé et date limite.",
    },
    breadcrumb: { aria: "Fil d'Ariane", board: "Tableau des appels d'offres", listing: "Annonce" },
    demo: {
      title: "Aperçu démo.",
      fullView: "Vous voyez la vue complète des membres Trade Pro.",
      seeLocked: "Voir la vue visiteur (verrouillée)",
      lockedView: "Vous voyez la vue visiteur (verrouillée).",
      seeFull: "Voir la vue membre complète",
    },
    kind: {
      award: "Avis d'octroi",
      gc: "Lot de sous-traitance",
      public: "Appel d'offres public",
      private: "Appel d'offres privé",
      sample: "· Annonce exemple",
    },
    facts: {
      reference: "Référence",
      notPublished: "Non publiée",
      source: "Source",
      gc: "Entrepreneur général",
      pm: "Gestionnaire immobilier",
      awarded: "Octroyé",
      closed: "Fermé",
      quotesDue: "Remise des prix",
      closes: "Clôture",
      ongoing: "En continu",
      location: "Emplacement",
      notSpecified: "Non précisé",
    },
    daysLeft: { today: "aujourd'hui", tomorrow: "demain", n: "{n} jours restants" },
    closesIn: { today: "Clôture aujourd'hui", tomorrow: "Clôture demain", n: "Clôture dans {n} jours" },
    closedArchive: {
      official: "Avis officiel",
      awardedTo: "Contrat octroyé à",
      awardedOn: "Octroyé le {date}",
      awardNotice: "Avis d'attribution officiel",
      awardListing: "Détails de l'attribution sur PMRFP",
      noAward:
        "Les données ouvertes de l'acheteur n'indiquent pas encore d'attribution pour cet avis. L'avis officiel contient les documents et le résultat, s'il y a lieu.",
      noteTitle: "Appel d'offres public fermé.",
      noteBody:
        "Tiré des données ouvertes de {issuer} après sa fermeture, à titre de référence seulement. On ne peut plus y soumissionner, et il n'est pas passé par PMRFP.",
    },
    publicNote: {
      pastTitle: "Contrat public passé.",
      pastBody:
        "Déjà octroyé par {issuer}. Publié pour que les gens de métier voient combien ce genre de travail se paie et qui le remporte. Il n'est pas passé par PMRFP.",
      openTitle: "Appel d'offres public.",
      openBody:
        "Émis par {issuer} et publié sur {portal}. PMRFP rassemble les appels d'offres qui conviennent aux entrepreneurs commerciaux. Les soumissions vont directement à l'émetteur, pas à PMRFP.",
    },
    gcNote: {
      title: "Lot de sous-traitance d'entrepreneur général.",
      collecting: "Un entrepreneur général recueille des ",
      quotesTrade: "prix en {trade}",
      quotes: "prix",
      forProject: " pour ",
      end: ".",
      partOf: " Il fait partie d'un contrat public : ",
      wonBy: ", remporté par {winner}",
      value: " ({value})",
    },
    status: {
      awardedTitle: "Cet appel d'offres a été octroyé.",
      awardedBody: "Surveillez les occasions semblables sur le fil, ou publiez votre propre appel d'offres si vous avez un projet.",
      closedTitle: "Cet appel d'offres est fermé.",
      closedBody: "Aucun fournisseur n'a obtenu le contrat par l'entremise de PMRFP.",
    },
    photos: {
      alt: "Photo de l'immeuble {n}",
      more: { one: "+ {n} autre photo", other: "+ {n} autres photos" },
    },
    award: {
      wonBy: "Remporté par",
      allWins: "Voir les {n} contrats remportés par cette entreprise",
      hiringSubs: "L'adjudicataire cherche des sous-traitants pour ce contrat",
      quotesDue: " · remise des prix le {date}",
      gone: "Ce contrat est déjà pris.",
      similar: {
        one: "{n} appel d'offres ouvert {trade} est en ligne en ce moment.",
        other: "{n} appels d'offres ouverts {trade} sont en ligne en ce moment.",
      },
      tradePhrase: "en {trade}",
      tradeFallback: "dans ce domaine",
      nextWontWait: "Le prochain n'attendra pas non plus.",
      pitch:
        "Trade Pro vous envoie un courriel le jour même où un nouvel appel d'offres public est publié dans votre corps de métier et votre région, avec le lien direct, la portée complète et le contact de l'acheteur. Vous soumissionnez sur le prochain contrat au lieu de lire qui a remporté le dernier.",
      cta: "Recevoir les alertes pour mon corps de métier",
      seeOpen: "Voir ceux qui sont ouverts",
      official: "Avis d'octroi officiel",
    },
    full: {
      scope: "Portée du projet",
      requirements: "Exigences",
      budget: "Fourchette budgétaire",
      budgetRange: "{min} $ – {max} $ {currency}",
      submission: "Instructions de soumission",
      contact: "Contact",
      afterSignIn: "Fourni après la connexion",
      afterApproval: "Les coordonnées sont dévoilées une fois que le gestionnaire immobilier approuve votre intérêt.",
      mediated: "Cette occasion passe par PMRFP. Manifestez votre intérêt pour entrer en contact.",
      openNotice: "Ouvrir l'avis officiel sur {portal}",
    },
    closed: {
      title: "Cet appel d'offres a pris fin le {date}.",
      region: {
        one: "{region} : {n} appel d'offres ouvert en ce moment.",
        other: "{region} : {n} appels d'offres ouverts en ce moment.",
      },
      total: {
        one: "{n} appel d'offres ouvert en ce moment.",
        other: "{n} appels d'offres ouverts en ce moment.",
      },
      body: "Trade Pro vous envoie un courriel le jour même où un nouvel appel d'offres est publié dans votre corps de métier et votre région, pour que vous voyiez le prochain pendant qu'il est encore ouvert.",
      cta: "Recevoir les alertes pour mon corps de métier",
      seeOpen: "Voir ce qui est ouvert",
    },
    locked: {
      region: {
        one: "{region} : {n} appel d'offres commercial ouvert en ce moment",
        other: "{region} : {n} appels d'offres commerciaux ouverts en ce moment",
      },
      total: {
        one: "{n} appel d'offres commercial ouvert sur PMRFP en ce moment",
        other: "{n} appels d'offres commerciaux ouverts sur PMRFP en ce moment",
      },
      proof: "Les membres Trade Pro obtiennent la portée complète et les contacts de chacun, plus un courriel le jour même où un nouveau correspond à leur corps de métier.",
      publicPitch:
        "Cet appel d'offres est public. Ce que Trade Pro ajoute : tous les appels d'offres publics qui correspondent à votre corps de métier au même endroit, un courriel quotidien quand un nouveau est publié dans votre région, et le lien direct, la portée complète et le contact de l'acheteur pour chacun, au lieu de vérifier vous-même les portails d'appels d'offres gouvernementaux.",
    },
    side: {
      region: "Région",
      propertyType: "Type d'immeuble",
      trade: "Corps de métier",
      alerts: "Recevoir les alertes pour mon corps de métier",
      unlock: "Débloquer tous les détails",
      closedNote: "Cet appel d'offres est fermé. Les membres Trade Pro sont avertis des nouveaux dans leur corps de métier et leur région.",
      unlockNote: "La portée, les documents, le contact de l'acheteur et la possibilité de manifester votre intérêt sont inclus avec Trade Pro.",
    },
    moneyCad: "{n} $ CAD",
    sources: {
      canadabuys: CANADA_FR,
      awards: CANADA_FR,
      "canadabuys-closed": { ...CANADA_FR, bidLabel: "Ouvrir l'avis sur AchatsCanada" },
      seao: SEAO_FR,
      toronto: TORONTO_FR,
      "toronto-awards": TORONTO_FR,
      "ns-awards": {
        issuer: "un organisme public de la Nouvelle-Écosse",
        portal: "le portail d'approvisionnement de la Nouvelle-Écosse",
        bidLabel: "Ouvrir le portail de la N.-É.",
        attribution: OGL_FR("Nouvelle-Écosse"),
      },
      yukon: {
        issuer: "le gouvernement du Yukon",
        portal: "le portail bids&tenders du Yukon",
        bidLabel: "Soumissionner sur le portail du Yukon",
        attribution: OGL_FR("Yukon"),
      },
      "yukon-closed": {
        issuer: "le gouvernement du Yukon",
        portal: "le portail bids&tenders du Yukon",
        bidLabel: "Ouvrir le portail du Yukon",
        attribution: OGL_FR("Yukon"),
      },
      sam: {
        issuer: "une agence fédérale américaine",
        portal: "SAM.gov",
        bidLabel: "Soumissionner sur SAM.gov",
        attribution:
          "Source : SAM.gov Contract Opportunities, U.S. General Services Administration (données du gouvernement fédéral américain, domaine public).",
      },
      nyc: {
        issuer: "la Ville de New York",
        portal: "The City Record / PASSPort",
        bidLabel: "Ouvrir l'avis du City Record",
        attribution: "Source : The City Record, Ville de New York — NYC Open Data (Current Solicitations).",
      },
      "florida-vbs": {
        issuer: "un organisme de l'État de la Floride",
        portal: "le Florida Vendor Bid System",
        bidLabel: "Ouvrir sur Florida VBS",
        attribution:
          "Source : Florida Vendor Bid System, MyFloridaMarketPlace — avis d'appel d'offres public de l'État de la Floride.",
      },
      "la-county": {
        issuer: "le comté de Los Angeles",
        portal: "le site d'appels d'offres du comté de Los Angeles",
        bidLabel: "Ouvrir sur le site du comté de LA",
        attribution:
          "Source : liste des appels d'offres ouverts du comté de Los Angeles (camisvr.co.la.ca.us/LACoBids) — avis d'appel d'offres public.",
      },
      delaware: {
        issuer: "un organisme de l'État du Delaware",
        portal: "le site d'appels d'offres MyMarketplace du Delaware",
        bidLabel: "Ouvrir sur Delaware MyMarketplace",
        attribution:
          "Source : données ouvertes de l'État du Delaware — Open Bids (data.delaware.gov), avis d'appel d'offres public.",
      },
    },
  },

  og: {
    eyebrow: "Appel d'offres",
    eyebrowRegion: "Appel d'offres · {region}",
    notFound: "Occasion introuvable",
    closes: "Clôture le {date}",
    regionFallback: "Canada",
  },
};

/** Licence names are proper names with no official Spanish version, so they stay in English. */
const OGL_ES = (who: string) => `Contiene información autorizada bajo la Open Government Licence – ${who}.`;
const CANADA_ES: SourceCopy = {
  issuer: "el Gobierno de Canadá",
  portal: "CanadaBuys",
  bidLabel: "Presentar una oferta en CanadaBuys",
  attribution: OGL_ES("Canada"),
};
const SEAO_ES: SourceCopy = {
  issuer: "un organismo público de Quebec",
  portal: "el SEAO",
  bidLabel: "Presentar una oferta en el SEAO",
  attribution:
    "Fuente: Système électronique d'appel d'offres (SEAO), Secrétariat du Conseil du trésor du Québec — Données Québec, CC BY 4.0.",
};
const TORONTO_ES: SourceCopy = {
  issuer: "la Ciudad de Toronto",
  portal: "el portal de licitaciones de la Ciudad de Toronto",
  bidLabel: "Presentar una oferta en el portal de la Ciudad",
  attribution: OGL_ES("Toronto"),
};

const es: typeof en = {
  meta: {
    title: "Licitaciones y RFP de propiedades comerciales en Canadá y EE. UU. (gratis)",
    titleCount: {
      one: "{n} licitación abierta de propiedades comerciales — gratis, actualizada a diario",
      other: "{n} licitaciones abiertas de propiedades comerciales — gratis, actualizadas a diario",
    },
    lead: {
      one: "{n} solicitud de propuestas o licitación pública abierta",
      other: "{n} solicitudes de propuestas y licitaciones públicas abiertas",
    },
    leadNone: "Solicitudes de propuestas y licitaciones públicas abiertas",
    description:
      "{lead} para propiedades comerciales en Canadá y EE. UU.: remoción de nieve, HVAC, techado, limpieza, electricidad y más. Actualizadas a diario, con fechas de cierre y adjudicaciones anteriores.",
  },
  hero: {
    eyebrow: "Tablero de licitaciones",
    title: "Solicitudes de propuestas y licitaciones públicas de propiedades comerciales",
    body: "Solicitudes de propuestas privadas de administradores de propiedades junto con licitaciones públicas de compradores canadienses y estadounidenses, con fechas de cierre y adjudicaciones anteriores. Los miembros de Trade Pro ven el alcance completo, los documentos y los contactos.",
  },
  stats: {
    open: "Abiertas",
    closingWeek: "Cierran en 7 d",
    awarded: "Valor adjudicado",
    pastAwards: "Adjudicaciones anteriores",
  },
  sort: { closing: "Cierre más próximo", newest: "Más recientes" },
  country: { aria: "País", ca: "Canadá", us: "Estados Unidos", all: "Todos" },
  tabs: { aria: "Vista de anuncios", open: "Abiertas", gc: "Paquetes de subcontratación", awarded: "Adjudicadas" },
  locked: { previews: "Se muestran vistas previas.", unlock: "Trade Pro desbloquea todos los detalles" },
  empty: {
    awarded: "Ningún contrato anterior coincide con estos filtros",
    gc: "Ningún paquete de subcontratación abierto coincide con estos filtros",
    open: "Ninguna licitación abierta coincide con estos filtros",
    filtered: "Amplíe la región o el oficio, o revise las otras pestañas. Cada mañana se agregan nuevas licitaciones.",
    unfiltered: "Cada mañana se agregan nuevas licitaciones. La pestaña Adjudicadas muestra quién ganó los contratos recientes.",
    clear: "Borrar filtros",
    alerts: "Recibir alertas de nuevas licitaciones",
  },
  count: { one: "{n} anuncio", other: "{n} anuncios" },
  pageOf: " · página {page} de {pages}",
  pagination: { aria: "Paginación", prev: "Anterior", next: "Siguiente" },
  recent: {
    eyebrow: "Avisos de adjudicación",
    title: "Adjudicados recientemente",
    body: "Contratos públicos con la empresa ganadora y el valor. Los miembros de Trade Pro reciben una alerta el mismo día en que se publica el próximo de su oficio.",
    all: { one: "Ver la adjudicación", other: "Ver las {n} adjudicaciones" },
  },

  detail: {
    matches: {
      title: "Quién puede hacer este trabajo",
      trades: "Empresas que hacen este trabajo",
      suppliers: "Proveedores para este proyecto",
      does: "{trade} · atiende {area}",
      supplies: "Suministra {trade} · atiende {area}",
      featured: "Destacado",
      emptyTitle: "Aún no hay empresas de {trade} registradas en {area}",
      emptyBody: "¿Hace este trabajo o suministra materiales? Regístrese gratis y aparezca en proyectos como este.",
      listTrade: "Registrar mi empresa gratis",
      listSupplier: "Registrar un proveedor",
      getFeatured: "Obtener el primer lugar",
      note: "Empresas registradas que cubren este oficio y zona. Las empresas destacadas pagan por su ubicación.",
    },
    meta: {
      notFound: "Oportunidad no encontrada",
      title: "{title} | Solicitud de propuestas",
      titlePlace: "{title} — {place}",
      description: "Oportunidad de solicitud de propuestas para propiedades comerciales en PMRFP.",
      descTender: "Licitación de {who}{where}.",
      descBuyer: "{buyer}",
      descPm: "administrador de propiedades",
      descWhere: " en {place}",
      descCloses: " Cierra el {date}.",
      descClosed: " Cerró el {date}.",
      descTail: " Gratis en PMRFP: oficio, resumen y fecha límite.",
    },
    breadcrumb: { aria: "Ruta de navegación", board: "Tablero de licitaciones", listing: "Anuncio" },
    demo: {
      title: "Vista previa de demostración.",
      fullView: "Está viendo la vista completa para miembros de Trade Pro.",
      seeLocked: "Ver la vista de visitante (bloqueada)",
      lockedView: "Está viendo la vista de visitante (bloqueada).",
      seeFull: "Ver la vista completa para miembros",
    },
    kind: {
      award: "Aviso de adjudicación",
      gc: "Paquete de subcontratación",
      public: "Licitación pública",
      private: "Solicitud de propuestas privada",
      sample: "· Anuncio de ejemplo",
    },
    facts: {
      reference: "Referencia",
      notPublished: "No publicada",
      source: "Fuente",
      gc: "Contratista general",
      pm: "Administrador de propiedades",
      awarded: "Adjudicado",
      closed: "Cerró",
      quotesDue: "Cotizaciones hasta",
      closes: "Cierra",
      ongoing: "Continuo",
      location: "Ubicación",
      notSpecified: "No especificado",
    },
    daysLeft: { today: "hoy", tomorrow: "mañana", n: "quedan {n} días" },
    closesIn: { today: "Cierra hoy", tomorrow: "Cierra mañana", n: "Cierra en {n} días" },
    closedArchive: {
      official: "Aviso oficial",
      awardedTo: "Contrato adjudicado a",
      awardedOn: "Adjudicado el {date}",
      awardNotice: "Aviso oficial de adjudicación",
      awardListing: "Detalles de la adjudicación en PMRFP",
      noAward:
        "Los datos abiertos del comprador aún no muestran una adjudicación para este aviso. El aviso oficial tiene los documentos y el resultado, si lo hay.",
      noteTitle: "Licitación pública cerrada.",
      noteBody:
        "Tomada de los datos abiertos de {issuer} después de cerrar, solo como referencia. Ya no admite ofertas y no pasó por PMRFP.",
    },
    publicNote: {
      pastTitle: "Contrato público anterior.",
      pastBody:
        "Ya adjudicado por {issuer}. Se publica para que los contratistas vean cuánto se paga por este tipo de trabajo y quién lo gana. No pasó por PMRFP.",
      openTitle: "Licitación pública.",
      openBody:
        "Emitida por {issuer} y publicada en {portal}. PMRFP reúne las licitaciones que encajan con los oficios comerciales. Las ofertas van directamente al emisor, no a través de PMRFP.",
    },
    gcNote: {
      title: "Paquete de subcontratación del contratista general.",
      collecting: "Un contratista general está reuniendo ",
      quotesTrade: "cotizaciones de {trade}",
      quotes: "cotizaciones",
      forProject: " para ",
      end: ".",
      partOf: " Forma parte de un contrato público: ",
      wonBy: ", ganado por {winner}",
      value: " ({value})",
    },
    status: {
      awardedTitle: "Esta solicitud de propuestas ya fue adjudicada.",
      awardedBody: "Esté atento a oportunidades similares en el tablero, o publique su propia solicitud de propuestas si tiene un proyecto.",
      closedTitle: "Esta solicitud de propuestas está cerrada.",
      closedBody: "Ningún proveedor obtuvo el trabajo a través de PMRFP.",
    },
    photos: {
      alt: "Foto de la propiedad {n}",
      more: { one: "+ {n} foto más", other: "+ {n} fotos más" },
    },
    award: {
      wonBy: "Ganado por",
      allWins: "Ver los {n} contratos que ha ganado",
      hiringSubs: "El ganador está contratando subcontratistas para este trabajo",
      quotesDue: " · cotizaciones hasta el {date}",
      gone: "Este contrato ya no está disponible.",
      similar: {
        one: "Hay {n} licitación abierta {trade} publicada ahora mismo.",
        other: "Hay {n} licitaciones abiertas {trade} publicadas ahora mismo.",
      },
      tradePhrase: "de {trade}",
      tradeFallback: "de este oficio",
      nextWontWait: "La próxima tampoco va a esperar.",
      pitch:
        "Trade Pro le envía un correo el mismo día en que se publica una nueva licitación pública de su oficio y su región, con el enlace directo, el alcance completo y el contacto del comprador, para que presente una oferta en el próximo contrato en lugar de leer quién ganó el último.",
      cta: "Recibir alertas de licitaciones de mi oficio",
      seeOpen: "Ver las abiertas",
      official: "Aviso oficial de adjudicación",
    },
    full: {
      scope: "Alcance del proyecto",
      requirements: "Requisitos",
      budget: "Rango de presupuesto",
      budgetRange: "${min} – ${max} {currency}",
      submission: "Instrucciones para presentar la oferta",
      contact: "Contacto",
      afterSignIn: "Disponible después de iniciar sesión",
      afterApproval: "Los datos de contacto se revelan después de que el administrador de propiedades apruebe su interés.",
      mediated: "Esta oportunidad se gestiona a través de PMRFP. Manifieste su interés para ponerse en contacto.",
      openNotice: "Abrir el aviso oficial en {portal}",
    },
    closed: {
      title: "Esta oportunidad cerró el {date}.",
      region: {
        one: "Hay {n} solicitud de propuestas abierta en {region} ahora mismo.",
        other: "Hay {n} solicitudes de propuestas abiertas en {region} ahora mismo.",
      },
      total: {
        one: "Hay {n} solicitud de propuestas abierta ahora mismo.",
        other: "Hay {n} solicitudes de propuestas abiertas ahora mismo.",
      },
      body: "Trade Pro le envía un correo el mismo día en que se publica una nueva solicitud de propuestas de su oficio y su región, para que vea la próxima mientras todavía está abierta.",
      cta: "Recibir alertas de mi oficio",
      seeOpen: "Ver lo que está abierto",
    },
    locked: {
      region: {
        one: "{n} solicitud de propuestas comercial abierta en {region} ahora mismo",
        other: "{n} solicitudes de propuestas comerciales abiertas en {region} ahora mismo",
      },
      total: {
        one: "{n} solicitud de propuestas comercial abierta en PMRFP ahora mismo",
        other: "{n} solicitudes de propuestas comerciales abiertas en PMRFP ahora mismo",
      },
      proof: "Los miembros de Trade Pro obtienen el alcance completo y los contactos de cada una, además de un correo el mismo día en que una nueva coincide con su oficio.",
      publicPitch:
        "Esta licitación es pública. Lo que agrega Trade Pro: todas las licitaciones públicas que encajan con su oficio en un solo lugar, un correo diario cuando se publica una nueva en su región, y el enlace directo, el alcance completo y el contacto del comprador de cada una, en lugar de revisar usted mismo los portales de licitaciones del gobierno.",
    },
    side: {
      region: "Región",
      propertyType: "Tipo de propiedad",
      trade: "Oficio",
      alerts: "Recibir alertas de mi oficio",
      unlock: "Desbloquear todos los detalles",
      closedNote: "Esta solicitud de propuestas está cerrada. Los miembros de Trade Pro reciben alertas de las nuevas en su oficio y su región.",
      unlockNote: "El alcance, los documentos, el contacto del comprador y la posibilidad de manifestar interés están incluidos con Trade Pro.",
    },
    moneyCad: "${n} CAD",
    sources: {
      canadabuys: CANADA_ES,
      awards: CANADA_ES,
      "canadabuys-closed": { ...CANADA_ES, bidLabel: "Abrir el aviso en CanadaBuys" },
      seao: SEAO_ES,
      toronto: TORONTO_ES,
      "toronto-awards": TORONTO_ES,
      "ns-awards": {
        issuer: "un organismo público de Nueva Escocia",
        portal: "el portal de compras públicas de Nueva Escocia",
        bidLabel: "Abrir el portal de Nueva Escocia",
        attribution: OGL_ES("Nova Scotia"),
      },
      yukon: {
        issuer: "el Gobierno de Yukón",
        portal: "el portal bids&tenders de Yukón",
        bidLabel: "Presentar una oferta en el portal de Yukón",
        attribution: OGL_ES("Yukon"),
      },
      "yukon-closed": {
        issuer: "el Gobierno de Yukón",
        portal: "el portal bids&tenders de Yukón",
        bidLabel: "Abrir el portal de Yukón",
        attribution: OGL_ES("Yukon"),
      },
      sam: {
        issuer: "una agencia federal de EE. UU.",
        portal: "SAM.gov",
        bidLabel: "Presentar una oferta en SAM.gov",
        attribution:
          "Fuente: SAM.gov Contract Opportunities, U.S. General Services Administration (datos del gobierno federal de EE. UU., dominio público).",
      },
      nyc: {
        issuer: "la Ciudad de Nueva York",
        portal: "The City Record / PASSPort",
        bidLabel: "Abrir el aviso del City Record",
        attribution: "Fuente: The City Record, Ciudad de Nueva York — NYC Open Data (Current Solicitations).",
      },
      "florida-vbs": {
        issuer: "una agencia del estado de Florida",
        portal: "el Florida Vendor Bid System",
        bidLabel: "Abrir en Florida VBS",
        attribution:
          "Fuente: Florida Vendor Bid System, MyFloridaMarketPlace — aviso de licitación pública del estado de Florida.",
      },
      "la-county": {
        issuer: "el Condado de Los Ángeles",
        portal: "el sitio de licitaciones del Condado de Los Ángeles",
        bidLabel: "Abrir en el sitio del Condado de LA",
        attribution:
          "Fuente: lista de licitaciones abiertas del Condado de Los Ángeles (camisvr.co.la.ca.us/LACoBids) — aviso de licitación pública.",
      },
      delaware: {
        issuer: "una agencia del estado de Delaware",
        portal: "el sitio de licitaciones MyMarketplace de Delaware",
        bidLabel: "Abrir en Delaware MyMarketplace",
        attribution:
          "Fuente: datos abiertos del estado de Delaware — Open Bids (data.delaware.gov), aviso de licitación pública.",
      },
    },
  },

  og: {
    eyebrow: "Solicitud de propuestas",
    eyebrowRegion: "Solicitud de propuestas · {region}",
    notFound: "Oportunidad no encontrada",
    closes: "Cierra el {date}",
    regionFallback: "Canadá",
  },
};

export default { en, fr, es };
