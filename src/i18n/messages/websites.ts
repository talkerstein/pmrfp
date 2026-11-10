/**
 * /websites: done-for-you websites that plug into PMRFP, built and billed by
 * Talkerstein Consulting Group (PMRFP's affiliate, disclosed on the page).
 * Two offers, one page: a site for property-management firms and a "Proof
 * Site" for trades. Describe only what the pilot delivers; no ranking
 * promises and no claims about how many managers are on PMRFP.
 * {pmFrom} and {tradeMonthly} are the prices in lib/websites/config.ts.
 */
const en = {
  meta: {
    title: "Websites That Plug Into PMRFP: for Property Managers and Trades",
    description:
      "A website built for you that connects to PMRFP. Property managers get a vendor request page that posts jobs. Trades get a site that turns finished jobs into case studies and reviews.",
  },
  eyebrow: "Websites",
  title: "A website that does more than sit there.",
  lead: "We build it, you own it. Property managers get a site with a vendor request page that posts the job to PMRFP. Trades get a site that turns each finished job into a case study and a review request.",
  disclosureLabel: "Disclosure:",
  disclosure:
    "These websites are built and billed by Talkerstein Consulting Group, an affiliate of PMRFP, based in Toronto.",
  /** Same order as the door list on the page (points too). */
  doors: {
    pm: {
      tag: "For property managers",
      headline: "A site owners and tenants can use",
      blurb:
        "Most property-management sites lose people on a phone. Yours gets portal links, a maintenance request form and a vacancies page that work, plus a vendor page that saves you the phone calls.",
      price: "From ${pmFrom}, one time",
      priceNote: "You get a free homepage mockup before you pay anything.",
      cta: "Ask for a free mockup",
      points: [
        { t: "Vendor request page", d: "Describe the job once. It posts to PMRFP, and trades in your area that do that work get an email and can respond." },
        { t: "Portal links and payments", d: "Owners and tenants reach your existing portal and pay online from any page." },
        { t: "Maintenance requests", d: "A form tenants can finish on a phone, sent to the inbox you choose." },
        { t: "Pages for each area you serve", d: "One page per city or neighbourhood you manage in, written from your real buildings." },
      ],
    },
    trade: {
      tag: "For trades",
      headline: "A Proof Site: your finished jobs, working for you",
      blurb:
        "Property managers check you out before they call. Text us the photos when a job is done. We write it up, you approve it, and it goes on your site and your PMRFP profile.",
      price: "${tradeMonthly} a month, Trade Pro included",
      priceNote: "Pilot pricing. Month to month, cancel anytime.",
      cta: "Ask about the pilot",
      points: [
        { t: "Case studies from your photos", d: "Send photos and two lines about the job. We draft the write-up and publish it only after you approve it." },
        { t: "Review requests", d: "With your customer's OK, they get a short request to review the work." },
        { t: "A page for each service and city", d: "Only where you have real jobs to show. No filler pages." },
        { t: "Insurance and coverage up front", d: "Your trades, service area and insurance status in the first screen, with a quote request form." },
      ],
    },
  },
  how: {
    eyebrow: "How it works",
    title: "Four steps, and you do the first one",
    steps: [
      { t: "Tell us about your company", d: "Use the form below. We reply within one business day." },
      { t: "See it before you pay", d: "We send a homepage mockup built from your real services and photos." },
      { t: "We build and launch", d: "On your own domain. We set up the pages, forms and the PMRFP connection." },
      { t: "It keeps working", d: "Managers post jobs from their vendor page. Trades text photos and the site grows with each job." },
    ],
  },
  own: {
    eyebrow: "The fine print, up front",
    title: "You own it",
    points: [
      { t: "Your domain, your content", d: "The domain is registered in your name. If you leave, you take the site content and photos with you." },
      { t: "Nothing published without consent", d: "Photos of a customer's property go up only after you confirm the customer agreed. Locations show the city, never the address." },
      { t: "No ranking promises", d: "Nobody can guarantee a spot on Google. We build the pages search engines and buyers both need, from real work." },
    ],
  },
  form: {
    eyebrow: "Get started",
    title: "Tell us which one you need",
    pmTitle: "I manage property",
    tradeTitle: "I run a trade company",
    website: "Current website (optional)",
    pmMessage: "How many doors or buildings, and what bugs you about your current site?",
    tradeMessage: "Your trade, the cities you cover, and whether you have job photos.",
    send: "Send",
  },
};

const fr: typeof en = {
  meta: {
    title: "Des sites Web branchés sur PMRFP : pour gestionnaires immobiliers et entrepreneurs",
    description:
      "Un site Web fait pour vous et relié à PMRFP. Les gestionnaires immobiliers obtiennent une page de demande aux fournisseurs qui publie les travaux. Les entrepreneurs obtiennent un site qui transforme leurs chantiers terminés en études de cas et en avis.",
  },
  eyebrow: "Sites Web",
  title: "Un site Web qui travaille pour vous.",
  lead: "Nous le bâtissons, il vous appartient. Les gestionnaires immobiliers obtiennent un site avec une page de demande aux fournisseurs qui publie le travail sur PMRFP. Les entrepreneurs obtiennent un site qui transforme chaque chantier terminé en étude de cas et en demande d'avis.",
  disclosureLabel: "Divulgation :",
  disclosure:
    "Ces sites Web sont réalisés et facturés par Talkerstein Consulting Group, une société affiliée à PMRFP, établie à Toronto.",
  doors: {
    pm: {
      tag: "Pour les gestionnaires immobiliers",
      headline: "Un site que propriétaires et locataires peuvent utiliser",
      blurb:
        "La plupart des sites de gestion immobilière perdent les gens sur un téléphone. Le vôtre aura des liens vers le portail, un formulaire de demande d'entretien et une page des logements vacants qui fonctionnent, plus une page fournisseurs qui vous évite des appels.",
      price: "À partir de {pmFrom} $, une seule fois",
      priceNote: "Vous recevez une maquette gratuite de la page d'accueil avant de payer quoi que ce soit.",
      cta: "Demander une maquette gratuite",
      points: [
        { t: "Page de demande aux fournisseurs", d: "Décrivez le travail une fois. Il est publié sur PMRFP, et les entrepreneurs de votre région qui font ce travail reçoivent un courriel et peuvent répondre." },
        { t: "Liens vers le portail et paiements", d: "Propriétaires et locataires accèdent à votre portail actuel et paient en ligne depuis n'importe quelle page." },
        { t: "Demandes d'entretien", d: "Un formulaire que les locataires remplissent sur un téléphone, envoyé à la boîte de votre choix." },
        { t: "Une page par secteur desservi", d: "Une page par ville ou quartier où vous gérez des immeubles, rédigée à partir de vos vrais immeubles." },
      ],
    },
    trade: {
      tag: "Pour les entrepreneurs",
      headline: "Un site preuve : vos chantiers terminés travaillent pour vous",
      blurb:
        "Les gestionnaires immobiliers vous vérifient avant d'appeler. Textez-nous les photos quand un chantier est terminé. Nous rédigeons le texte, vous l'approuvez, et il paraît sur votre site et sur votre profil PMRFP.",
      price: "{tradeMonthly} $ par mois, Trade Pro inclus",
      priceNote: "Prix du projet pilote. Au mois, annulez en tout temps.",
      cta: "Se renseigner sur le projet pilote",
      points: [
        { t: "Des études de cas à partir de vos photos", d: "Envoyez des photos et deux lignes sur le chantier. Nous rédigeons le texte et ne le publions qu'après votre approbation." },
        { t: "Demandes d'avis", d: "Avec l'accord de votre client, il reçoit une courte demande d'avis sur le travail." },
        { t: "Une page par service et par ville", d: "Seulement là où vous avez de vrais chantiers à montrer. Aucune page de remplissage." },
        { t: "Assurance et territoire bien en vue", d: "Vos corps de métier, votre territoire et votre statut d'assurance dès le premier écran, avec un formulaire de demande de soumission." },
      ],
    },
  },
  how: {
    eyebrow: "Comment ça marche",
    title: "Quatre étapes, et vous faites la première",
    steps: [
      { t: "Parlez-nous de votre entreprise", d: "Utilisez le formulaire ci-dessous. Nous répondons en un jour ouvrable." },
      { t: "Voyez-le avant de payer", d: "Nous envoyons une maquette de la page d'accueil faite à partir de vos vrais services et photos." },
      { t: "Nous bâtissons et lançons", d: "Sur votre propre domaine. Nous mettons en place les pages, les formulaires et le lien avec PMRFP." },
      { t: "Il continue de travailler", d: "Les gestionnaires publient des travaux depuis leur page fournisseurs. Les entrepreneurs textent des photos et le site s'enrichit à chaque chantier." },
    ],
  },
  own: {
    eyebrow: "Les petits caractères, d'entrée de jeu",
    title: "Il vous appartient",
    points: [
      { t: "Votre domaine, votre contenu", d: "Le domaine est enregistré à votre nom. Si vous partez, vous gardez le contenu du site et les photos." },
      { t: "Rien n'est publié sans consentement", d: "Les photos de la propriété d'un client ne sont publiées qu'après votre confirmation que le client a accepté. Les lieux indiquent la ville, jamais l'adresse." },
      { t: "Aucune promesse de classement", d: "Personne ne peut garantir une place sur Google. Nous bâtissons les pages dont les moteurs de recherche et les acheteurs ont besoin, à partir de vrais travaux." },
    ],
  },
  form: {
    eyebrow: "Pour commencer",
    title: "Dites-nous lequel il vous faut",
    pmTitle: "Je gère des immeubles",
    tradeTitle: "Je dirige une entreprise de métier",
    website: "Site Web actuel (facultatif)",
    pmMessage: "Combien de logements ou d'immeubles, et qu'est-ce qui vous dérange dans votre site actuel?",
    tradeMessage: "Votre corps de métier, les villes desservies, et si vous avez des photos de chantiers.",
    send: "Envoyer",
  },
};

export default { en, fr };
