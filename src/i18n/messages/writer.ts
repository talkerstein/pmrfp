/**
 * RFP Writer: the /rfp-writer page (server, getT("writer")) and the wizard
 * (client, useT("writer")). `fr` and `es` are typed against `en`, so every key must exist in each.
 * The generated RFP text itself is written server-side (lib/rfp-writer).
 */
const en = {
  meta: {
    // Search Console (Jun–Sep 2026): "rfp real estate", "commercial real estate
    // rfp" and "rfp property management" show impressions, zero clicks. Use their words.
    title: "Commercial Real Estate & Property Management RFP Writer — Free (Canada & US)",
    description:
      "Answer four quick questions and get a complete commercial property RFP — scope, insurance and WSIB requirements, submission instructions and bid scoring — ready to send or post free. Built for Canadian property managers.",
  },
  page: {
    crumbHome: "Home",
    crumbWriter: "RFP Writer",
    appName: "{brand} RFP Writer",
    eyebrow: "Free tool · For property managers",
    h1: "Write a complete RFP in about two minutes.",
    intro:
      "Answer four quick questions. Get the scope, insurance and WSIB requirements, submission instructions and bid scoring, ready to send to your vendors or post free on {brand}.",
    pmBadge: "Property managers: sign in and our AI tailors it to your exact building — free.",
    faqTitle: "FAQ",
    faqs: [
      {
        q: "Is the RFP writer really free?",
        a: "Yes. Anyone can write RFPs from our expert templates. With a free property manager account, AI also tailors each RFP to your specific building and job. Posting on PMRFP to get bids is free for property managers too.",
      },
      {
        q: "Do I need an account?",
        a: "No account is needed to write an RFP from our templates. A free property manager account adds AI tailoring and lets you post the RFP on PMRFP so trades in your region can bid.",
      },
      {
        q: "Can I use the RFP outside PMRFP?",
        a: "Yes. It's yours: send it to your own vendor list, attach it to an email or paste it into your company template.",
      },
      {
        q: "Is this legal advice?",
        a: "No. It's a well-structured starting draft based on how Canadian property managers run competitive bids. Review it before sending, and have a lawyer review the contract you sign with the winning bidder on larger or multi-year work.",
      },
    ],
    /** Markdown. {templates} and {guide} are filled with language-prefixed links. */
    about: `## What the RFP writer gives you

A complete request for proposal that gets **real, comparable bids**, because every contractor prices the same job:

- **A clear title and summary** that tell a busy contractor in two seconds whether the job is for them.
- **A full scope**: the property, the work, what's included, what's excluded, and add-alternates priced separately.
- **Bidder requirements**: liability insurance with you as additional insured, WSIB or provincial WCB clearance, the licences the trade needs, and references.
- **Submission instructions** with your deadline, site visit, question cut-off and budget guidance.
- **Published scoring weights**, so bidders know how you'll decide and your board can see why you picked the winner.
- **Questions for bidders** that separate strong contractors from weak ones for that exact job.

## How it works

1. Pick the trade and describe the job in plain words.
2. Tell us about the property: type, city, size, whether it's occupied.
3. Set the timing, bid deadline and (optionally) your budget.
4. Choose the insurance level, site visit and what matters most in picking a winner.

It starts from our [expert RFP templates]({templates}) for that trade and tailors them to your answers. Want the reasoning behind each section? Read [how to post an RFP that gets real bids]({guide}).`,
    preferExample: "Prefer to start from a finished example?",
    browseTemplates: "Browse the RFP templates",
  },
  wizard: {
    steps: ["The job", "The property", "Timing & budget", "Bidder rules"],
    timing: {
      asap: "As soon as possible",
      "1-month": "Within a month",
      "1-3-months": "1–3 months",
      "3-6-months": "3–6 months",
      "next-season": "Next season",
    },
    examples: [
      "Flat roof over the east wing leaks in heavy rain. About 18,000 sq ft, 20+ years old. Looking at full replacement.",
      "Seasonal snow clearing and salting for a 120-unit condo: driveway, 60-space lot and sidewalks. 24/7 response.",
      "Replace the 2 original boilers (natural gas, hot water) in a 9-storey apartment building. Keep heat downtime minimal.",
    ],
    exampleLabels: ["Roof", "Snow", "Boilers"],

    tradeLabel: "Which trade is this for?",
    tradeSearch: "Search trades — roofing, snow, HVAC…",
    closestMatch: "Closest match (optional)",
    describeLabel: "Describe the job in a sentence or two",
    describeHint: "Plain words are fine. What's wrong, what you want done, anything a contractor must know.",
    tryExample: "Try an example:",

    propertyType: "Property type",
    select: "Select…",
    size: "Size (optional)",
    sizeHint: "Sq ft, units, storeys, lot size — whatever fits.",
    sizePlaceholder: "e.g. 18,000 sq ft roof, 9 storeys",
    city: "City",
    cityPlaceholder: "e.g. Mississauga",
    province: "Province / state",
    canada: "Canada",
    unitedStates: "United States",
    occupied: "Is the building occupied during the work?",
    yes: "Yes",
    no: "No",
    notSure: "Not sure",

    workKind: "What kind of work is it?",
    project: "One-time project",
    serviceContract: "Ongoing service contract",
    when: "When should the work happen?",
    deadline: "Bid deadline",
    deadlineHint: "Three weeks is right for capital work; 1–2 weeks for small jobs.",
    deadlineHintUrgent: "Urgent work: a few days is enough for contractors to price a repair.",
    budget: "Budget range (optional, {currency})",
    budgetHint: "Shared with bidders only if you choose to when posting.",
    min: "Min",
    max: "Max",

    insurance: "Liability insurance required",
    insuranceHint: "$5M is standard for capital work; $2M for lower-risk service contracts.",
    insurance5m: "$5 million",
    insurance2m: "$2 million",
    siteVisit: "Site visit before pricing?",
    siteVisitDate: "Site visit date (optional)",
    priority: "What matters most when you pick a winner?",
    balanced: "Balanced",
    lowestPrice: "Lowest price",
    bestQuality: "Best quality & experience",

    back: "Back",
    next: "Next",
    writing: "Writing your RFP…",
    write: "Write my RFP",
    drafting: "Drafting scope, requirements and bidder questions — usually under a minute.",
  },
  result: {
    ready: "Your RFP is ready.",
    sourceAi: "Tailored to your job by AI.",
    sourceTemplate: "Built from our expert template for this trade.",
    editAnything: "Edit anything below.",
    /** {n}: how many [Confirm: …] blanks are left in the draft. */
    blanks: "Fill in the {n} bracketed blanks, like [Confirm: …], before you send it. We never guess site details.",
    copyAll: "Copy all",
    print: "Print / PDF",
    postOnPmrfp: "Post it free on PMRFP",
    aiTitle: "Want it written around your exact job?",
    aiBody:
      "Our AI tailors the scope, requirements and bidder questions to your building — free with a property manager account.",
    aiCta: "Tailor it free",
    title: "Title",
    summary: "Summary",
    scope: "Scope",
    requirements: "Requirements",
    submission: "Submission instructions",
    evaluation: "How bids will be evaluated",
    questions: "Questions for bidders",
    copy: "Copy",
    bidsTitle: "Get bids on it — free",
    bidsBody:
      "Post it on PMRFP and qualified trades in your region see it. You stay anonymous until you choose to engage. Your draft carries over — no retyping.",
    bidsCta: "Post it free",
    emailTitle: "Email me a copy",
    emailSent: "Sent to {email}. It includes a link to post it when you're ready.",
    emailPlaceholder: "you@company.ca",
    send: "Send",
    sending: "Sending…",
    emailNote: "One email with your RFP. No newsletter.",
    changeAnswers: "Change my answers",
    disclaimer: "A starting draft, not legal advice. Review before sending to bidders.",
  },
  /** Section headings in the "Copy all" plain-text version. */
  plainText: {
    scope: "SCOPE",
    requirements: "REQUIREMENTS",
    submission: "SUBMISSION INSTRUCTIONS",
    evaluation: "HOW BIDS WILL BE EVALUATED",
    questions: "QUESTIONS FOR BIDDERS",
  },
  toast: {
    tooMany: "You've written a few RFPs in a row — try again in a few minutes.",
    error: "Something went wrong writing your RFP. Please try again.",
    copied: "Copied",
    fullCopied: "Full RFP copied",
    copyFailed: "Couldn't copy — select the text instead.",
    sent: "Sent — check your inbox.",
    sendFailed: "Couldn't send. Check the email address and try again.",
  },
};

const fr: typeof en = {
  meta: {
    title: "Rédacteur d'appels d'offres pour l'immobilier commercial et la gestion immobilière — gratuit (Canada et É.-U.)",
    description:
      "Répondez à quatre questions rapides et obtenez un appel d'offres complet pour votre immeuble : portée des travaux, exigences d'assurance et d'attestation CNESST (WSIB en Ontario), instructions de dépôt et grille d'évaluation, prêt à envoyer ou à publier gratuitement. Conçu pour les gestionnaires immobiliers canadiens.",
  },
  page: {
    crumbHome: "Accueil",
    crumbWriter: "Rédacteur d'appels d'offres",
    appName: "Rédacteur d'appels d'offres {brand}",
    eyebrow: "Outil gratuit · Pour les gestionnaires immobiliers",
    h1: "Rédigez un appel d'offres complet en deux minutes environ.",
    intro:
      "Répondez à quatre questions rapides. Obtenez la portée des travaux, les exigences d'assurance et d'attestation CNESST (WSIB en Ontario), les instructions de dépôt et la grille d'évaluation, prêtes à envoyer à vos fournisseurs ou à publier gratuitement sur {brand}.",
    pmBadge: "Gestionnaires immobiliers : connectez-vous et notre IA l'adapte à votre immeuble — gratuitement.",
    faqTitle: "Questions fréquentes",
    faqs: [
      {
        q: "Le rédacteur d'appels d'offres est-il vraiment gratuit?",
        a: "Oui. Tout le monde peut rédiger des appels d'offres à partir de nos modèles d'experts. Avec un compte gratuit de gestionnaire immobilier, l'IA adapte aussi chaque appel d'offres à votre immeuble et à vos travaux. La publication sur PMRFP pour recevoir des soumissions est également gratuite pour les gestionnaires immobiliers.",
      },
      {
        q: "Ai-je besoin d'un compte?",
        a: "Non. Aucun compte n'est nécessaire pour rédiger un appel d'offres à partir de nos modèles. Un compte gratuit de gestionnaire immobilier ajoute l'adaptation par l'IA et vous permet de publier l'appel d'offres sur PMRFP pour que les entrepreneurs de votre région puissent soumissionner.",
      },
      {
        q: "Puis-je utiliser l'appel d'offres en dehors de PMRFP?",
        a: "Oui. Il vous appartient : envoyez-le à votre propre liste de fournisseurs, joignez-le à un courriel ou collez-le dans le gabarit de votre entreprise.",
      },
      {
        q: "S'agit-il d'un avis juridique?",
        a: "Non. C'est une ébauche de départ bien structurée, fondée sur la façon dont les gestionnaires immobiliers canadiens mènent leurs appels d'offres concurrentiels. Révisez-la avant de l'envoyer et, pour des travaux importants ou pluriannuels, faites réviser par un avocat le contrat que vous signerez avec l'adjudicataire.",
      },
    ],
    about: `## Ce que le rédacteur d'appels d'offres vous donne

Un appel d'offres complet qui vous rapporte des **soumissions réelles et comparables**, parce que chaque entrepreneur chiffre exactement les mêmes travaux :

- **Un titre et un résumé clairs** qui disent en deux secondes à un entrepreneur occupé si le contrat est pour lui.
- **Une portée des travaux complète** : l'immeuble, les travaux, ce qui est inclus, ce qui est exclu et les options à prix séparé.
- **Des exigences pour les soumissionnaires** : assurance responsabilité civile vous désignant comme assuré additionnel, attestation de conformité de la CNESST (WSIB en Ontario, ou la commission des accidents du travail de votre province), les licences exigées pour le corps de métier et des références.
- **Des instructions de dépôt** avec votre date de clôture, la visite des lieux, la date limite pour les questions et une indication du budget.
- **Une grille d'évaluation publiée**, pour que les soumissionnaires sachent comment vous déciderez et que votre conseil d'administration voie pourquoi vous avez retenu l'adjudicataire.
- **Des questions aux soumissionnaires** qui distinguent les entrepreneurs solides des plus faibles pour ces travaux précis.

## Comment ça fonctionne

1. Choisissez le corps de métier et décrivez les travaux dans vos mots.
2. Parlez-nous de l'immeuble : type, ville, taille, et s'il est occupé.
3. Indiquez l'échéancier, la date de clôture des soumissions et (au besoin) votre budget.
4. Choisissez le niveau d'assurance, la visite des lieux et ce qui compte le plus pour choisir l'adjudicataire.

Le rédacteur part de nos [modèles d'appels d'offres d'experts]({templates}) pour ce corps de métier et les adapte à vos réponses. Vous voulez comprendre le raisonnement derrière chaque section? Lisez [comment publier un appel d'offres qui attire de vraies soumissions]({guide}).`,
    preferExample: "Vous préférez partir d'un exemple complet?",
    browseTemplates: "Parcourez les modèles d'appels d'offres",
  },
  wizard: {
    steps: ["Les travaux", "L'immeuble", "Échéancier et budget", "Règles de soumission"],
    timing: {
      asap: "Dès que possible",
      "1-month": "D'ici un mois",
      "1-3-months": "1 à 3 mois",
      "3-6-months": "3 à 6 mois",
      "next-season": "La saison prochaine",
    },
    examples: [
      "Infiltrations d'eau par le toit plat de l'aile est lors de fortes pluies. Environ 18 000 pi², plus de 20 ans. Nous envisageons un remplacement complet.",
      "Déneigement et déglaçage saisonniers pour une copropriété de 120 logements : entrée, stationnement de 60 places et trottoirs. Intervention 24 h sur 24, 7 jours sur 7.",
      "Remplacer les 2 chaudières d'origine (gaz naturel, eau chaude) d'un immeuble d'appartements de 9 étages. Réduire au minimum les interruptions de chauffage.",
    ],
    exampleLabels: ["Toiture", "Déneigement", "Chaudières"],

    tradeLabel: "Pour quel corps de métier?",
    tradeSearch: "Recherchez un corps de métier — toiture, déneigement, CVC…",
    closestMatch: "Modèle le plus proche (facultatif)",
    describeLabel: "Décrivez les travaux en une phrase ou deux",
    describeHint: "Des mots simples suffisent. Ce qui ne va pas, ce que vous voulez faire faire, tout ce qu'un entrepreneur doit savoir.",
    tryExample: "Essayez un exemple :",

    propertyType: "Type d'immeuble",
    select: "Sélectionnez…",
    size: "Taille (facultatif)",
    sizeHint: "Pi², logements, étages, superficie du terrain — ce qui convient.",
    sizePlaceholder: "p. ex. toit de 18 000 pi², 9 étages",
    city: "Ville",
    cityPlaceholder: "p. ex. Laval",
    province: "Province / État",
    canada: "Canada",
    unitedStates: "États-Unis",
    occupied: "L'immeuble est-il occupé pendant les travaux?",
    yes: "Oui",
    no: "Non",
    notSure: "Je ne sais pas",

    workKind: "De quel type de travaux s'agit-il?",
    project: "Projet ponctuel",
    serviceContract: "Contrat de service continu",
    when: "Quand les travaux doivent-ils avoir lieu?",
    deadline: "Date de clôture des soumissions",
    deadlineHint: "Trois semaines conviennent aux travaux majeurs; 1 à 2 semaines aux petits travaux.",
    deadlineHintUrgent: "Travaux urgents : quelques jours suffisent aux entrepreneurs pour chiffrer une réparation.",
    budget: "Fourchette budgétaire (facultatif, {currency})",
    budgetHint: "Communiquée aux soumissionnaires seulement si vous le choisissez au moment de publier.",
    min: "Min.",
    max: "Max.",

    insurance: "Assurance responsabilité civile exigée",
    insuranceHint: "5 M$ est la norme pour les travaux majeurs; 2 M$ pour les contrats de service à faible risque.",
    insurance5m: "5 millions $",
    insurance2m: "2 millions $",
    siteVisit: "Visite des lieux avant le dépôt des prix?",
    siteVisitDate: "Date de la visite des lieux (facultatif)",
    priority: "Qu'est-ce qui compte le plus pour choisir l'adjudicataire?",
    balanced: "Équilibré",
    lowestPrice: "Le prix le plus bas",
    bestQuality: "La meilleure qualité et expérience",

    back: "Retour",
    next: "Suivant",
    writing: "Rédaction de votre appel d'offres…",
    write: "Rédiger mon appel d'offres",
    drafting: "Rédaction de la portée des travaux, des exigences et des questions aux soumissionnaires — habituellement moins d'une minute.",
  },
  result: {
    ready: "Votre appel d'offres est prêt.",
    sourceAi: "Adapté à vos travaux par l'IA.",
    sourceTemplate: "Rédigé à partir de notre modèle d'expert pour ce corps de métier.",
    editAnything: "Vous pouvez tout modifier ci-dessous.",
    blanks: "Remplissez les {n} champs entre crochets, comme [À confirmer : …], avant l'envoi. Nous ne devinons jamais les détails du site.",
    copyAll: "Tout copier",
    print: "Imprimer / PDF",
    postOnPmrfp: "Publiez-le gratuitement sur PMRFP",
    aiTitle: "Vous voulez qu'il soit rédigé pour vos travaux précis?",
    aiBody:
      "Notre IA adapte la portée des travaux, les exigences et les questions aux soumissionnaires à votre immeuble — gratuitement avec un compte de gestionnaire immobilier.",
    aiCta: "Adaptez-le gratuitement",
    title: "Titre",
    summary: "Résumé",
    scope: "Portée des travaux",
    requirements: "Exigences",
    submission: "Instructions de dépôt",
    evaluation: "Évaluation des soumissions",
    questions: "Questions aux soumissionnaires",
    copy: "Copier",
    bidsTitle: "Recevez des soumissions — gratuitement",
    bidsBody:
      "Publiez-le sur PMRFP et les entrepreneurs qualifiés de votre région le verront. Vous restez anonyme jusqu'à ce que vous choisissiez d'entrer en contact. Votre ébauche est reprise telle quelle — rien à retaper.",
    bidsCta: "Publiez-le gratuitement",
    emailTitle: "Envoyez-moi une copie par courriel",
    emailSent: "Envoyé à {email}. Le courriel contient un lien pour le publier quand vous serez prêt.",
    emailPlaceholder: "vous@entreprise.ca",
    send: "Envoyer",
    sending: "Envoi…",
    emailNote: "Un seul courriel avec votre appel d'offres. Aucune infolettre.",
    changeAnswers: "Modifier mes réponses",
    disclaimer: "Une ébauche de départ, pas un avis juridique. Révisez-la avant de l'envoyer aux soumissionnaires.",
  },
  plainText: {
    scope: "PORTÉE DES TRAVAUX",
    requirements: "EXIGENCES",
    submission: "INSTRUCTIONS DE DÉPÔT",
    evaluation: "ÉVALUATION DES SOUMISSIONS",
    questions: "QUESTIONS AUX SOUMISSIONNAIRES",
  },
  toast: {
    tooMany: "Vous avez rédigé plusieurs appels d'offres d'affilée — réessayez dans quelques minutes.",
    error: "Une erreur s'est produite pendant la rédaction de votre appel d'offres. Veuillez réessayer.",
    copied: "Copié",
    fullCopied: "Appel d'offres complet copié",
    copyFailed: "Impossible de copier — sélectionnez plutôt le texte.",
    sent: "Envoyé — vérifiez votre boîte de réception.",
    sendFailed: "Envoi impossible. Vérifiez l'adresse courriel et réessayez.",
  },
};

const es: typeof en = {
  meta: {
    title: "Redactor de RFP para bienes raíces comerciales y administración de propiedades — gratis (EE. UU. y Canadá)",
    description:
      "Responda cuatro preguntas rápidas y obtenga una RFP completa para su propiedad comercial: alcance del trabajo, requisitos de seguro y de compensación laboral, instrucciones para presentar ofertas y criterios de evaluación, lista para enviar o publicar gratis. Pensada para administradores de propiedades de EE. UU. y Canadá.",
  },
  page: {
    crumbHome: "Inicio",
    crumbWriter: "Redactor de RFP",
    appName: "Redactor de RFP de {brand}",
    eyebrow: "Herramienta gratuita · Para administradores de propiedades",
    h1: "Redacte una RFP completa en unos dos minutos.",
    intro:
      "Responda cuatro preguntas rápidas. Obtenga el alcance del trabajo, los requisitos de seguro y de compensación laboral, las instrucciones para presentar ofertas y los criterios de evaluación, listos para enviar a sus proveedores o publicar gratis en {brand}.",
    pmBadge: "Administradores de propiedades: inicien sesión y nuestra IA la adapta a su edificio, gratis.",
    faqTitle: "Preguntas frecuentes",
    faqs: [
      {
        q: "¿El Redactor de RFP es realmente gratis?",
        a: "Sí. Cualquier persona puede redactar RFP a partir de nuestras plantillas de expertos. Con una cuenta gratuita de administrador de propiedades, la IA además adapta cada RFP a su edificio y a su trabajo. Publicar en PMRFP para recibir ofertas también es gratis para los administradores de propiedades.",
      },
      {
        q: "¿Necesito una cuenta?",
        a: "No. No necesita una cuenta para redactar una RFP a partir de nuestras plantillas. Una cuenta gratuita de administrador de propiedades agrega la adaptación con IA y le permite publicar la RFP en PMRFP para que los contratistas de su región presenten ofertas.",
      },
      {
        q: "¿Puedo usar la RFP fuera de PMRFP?",
        a: "Sí. Es suya: envíela a su propia lista de proveedores, adjúntela a un correo electrónico o péguela en la plantilla de su empresa.",
      },
      {
        q: "¿Esto es asesoría legal?",
        a: "No. Es un primer borrador bien estructurado, basado en cómo los administradores de propiedades organizan procesos competitivos de ofertas. Revíselo antes de enviarlo y, para trabajos grandes o de varios años, pida a un abogado que revise el contrato que firmará con el adjudicatario.",
      },
    ],
    about: `## Lo que le da el Redactor de RFP

Una solicitud de propuestas completa que consigue **ofertas reales y comparables**, porque todos los contratistas cotizan exactamente el mismo trabajo:

- **Un título y un resumen claros** que le dicen en dos segundos a un contratista ocupado si el trabajo es para él.
- **Un alcance completo**: la propiedad, el trabajo, lo que está incluido, lo que está excluido y las alternativas adicionales con precio por separado.
- **Requisitos para los oferentes**: seguro de responsabilidad civil con usted como asegurado adicional, prueba de seguro de compensación laboral (según la ley estatal en EE. UU.; certificado de la WSIB o de la WCB provincial en Canadá), las licencias que exige el oficio y referencias.
- **Instrucciones para presentar ofertas** con su fecha de cierre, la visita al sitio, la fecha límite para preguntas y un presupuesto de referencia.
- **Criterios de evaluación publicados**, para que los oferentes sepan cómo decidirá y su junta pueda ver por qué eligió al adjudicatario.
- **Preguntas para los oferentes** que distinguen a los contratistas sólidos de los débiles para ese trabajo en particular.

## Cómo funciona

1. Elija el oficio y describa el trabajo con sus propias palabras.
2. Cuéntenos sobre la propiedad: tipo, ciudad, tamaño y si está ocupada.
3. Indique los plazos, la fecha de cierre de las ofertas y (si lo desea) su presupuesto.
4. Elija el nivel de seguro, la visita al sitio y lo que más le importa para elegir al adjudicatario.

El redactor parte de nuestras [plantillas de RFP de expertos]({templates}) para ese oficio y las adapta a sus respuestas. ¿Quiere entender el razonamiento detrás de cada sección? Lea [cómo publicar una RFP que reciba ofertas reales]({guide}).`,
    preferExample: "¿Prefiere partir de un ejemplo terminado?",
    browseTemplates: "Vea las plantillas de RFP",
  },
  wizard: {
    steps: ["El trabajo", "La propiedad", "Plazos y presupuesto", "Reglas para oferentes"],
    timing: {
      asap: "Lo antes posible",
      "1-month": "Dentro de un mes",
      "1-3-months": "1 a 3 meses",
      "3-6-months": "3 a 6 meses",
      "next-season": "La próxima temporada",
    },
    examples: [
      "El techo plano del ala este tiene filtraciones cuando llueve fuerte. Unos 18,000 pies², más de 20 años. Evaluamos un reemplazo completo.",
      "Remoción de nieve y aplicación de sal durante la temporada para un condominio de 120 unidades: entrada vehicular, estacionamiento de 60 espacios y aceras. Respuesta 24/7.",
      "Reemplazar las 2 calderas originales (gas natural, agua caliente) de un edificio de apartamentos de 9 pisos. Mantener al mínimo el tiempo sin calefacción.",
    ],
    exampleLabels: ["Techo", "Nieve", "Calderas"],

    tradeLabel: "¿Para qué oficio es?",
    tradeSearch: "Busque un oficio: techado, nieve, HVAC…",
    closestMatch: "Plantilla más parecida (opcional)",
    describeLabel: "Describa el trabajo en una o dos oraciones",
    describeHint: "Con palabras sencillas basta. Qué está mal, qué quiere que se haga y todo lo que un contratista debe saber.",
    tryExample: "Pruebe un ejemplo:",

    propertyType: "Tipo de propiedad",
    select: "Seleccione…",
    size: "Tamaño (opcional)",
    sizeHint: "Pies², unidades, pisos, tamaño del terreno: lo que corresponda.",
    sizePlaceholder: "p. ej., techo de 18,000 pies², 9 pisos",
    city: "Ciudad",
    cityPlaceholder: "p. ej., Miami",
    province: "Provincia / estado",
    canada: "Canadá",
    unitedStates: "Estados Unidos",
    occupied: "¿El edificio estará ocupado durante el trabajo?",
    yes: "Sí",
    no: "No",
    notSure: "No lo sé",

    workKind: "¿Qué tipo de trabajo es?",
    project: "Proyecto único",
    serviceContract: "Contrato de servicio continuo",
    when: "¿Cuándo debe realizarse el trabajo?",
    deadline: "Fecha de cierre de las ofertas",
    deadlineHint: "Tres semanas es lo adecuado para obras mayores; de 1 a 2 semanas para trabajos pequeños.",
    deadlineHintUrgent: "Trabajo urgente: unos pocos días bastan para que los contratistas coticen una reparación.",
    budget: "Rango de presupuesto (opcional, {currency})",
    budgetHint: "Solo se comparte con los oferentes si usted así lo decide al publicar.",
    min: "Mín.",
    max: "Máx.",

    insurance: "Seguro de responsabilidad civil exigido",
    insuranceHint: "$5 millones es lo habitual para obras mayores; $2 millones para contratos de servicio de menor riesgo.",
    insurance5m: "$5 millones",
    insurance2m: "$2 millones",
    siteVisit: "¿Visita al sitio antes de cotizar?",
    siteVisitDate: "Fecha de la visita al sitio (opcional)",
    priority: "¿Qué es lo más importante al elegir al adjudicatario?",
    balanced: "Equilibrado",
    lowestPrice: "El precio más bajo",
    bestQuality: "La mejor calidad y experiencia",

    back: "Atrás",
    next: "Siguiente",
    writing: "Redactando su RFP…",
    write: "Redactar mi RFP",
    drafting: "Redactando el alcance, los requisitos y las preguntas para los oferentes; normalmente toma menos de un minuto.",
  },
  result: {
    ready: "Su RFP está lista.",
    sourceAi: "Adaptada a su trabajo con IA.",
    sourceTemplate: "Creada a partir de nuestra plantilla de expertos para este oficio.",
    editAnything: "Puede editar todo a continuación.",
    blanks: "Complete los {n} espacios entre corchetes, como [Por confirmar: …], antes de enviarla. Nunca adivinamos los detalles del sitio.",
    copyAll: "Copiar todo",
    print: "Imprimir / PDF",
    postOnPmrfp: "Publíquela gratis en PMRFP",
    aiTitle: "¿Quiere que se redacte en torno a su trabajo específico?",
    aiBody:
      "Nuestra IA adapta el alcance, los requisitos y las preguntas para los oferentes a su edificio, gratis con una cuenta de administrador de propiedades.",
    aiCta: "Adáptela gratis",
    title: "Título",
    summary: "Resumen",
    scope: "Alcance del trabajo",
    requirements: "Requisitos",
    submission: "Instrucciones para presentar ofertas",
    evaluation: "Cómo se evaluarán las ofertas",
    questions: "Preguntas para los oferentes",
    copy: "Copiar",
    bidsTitle: "Reciba ofertas, gratis",
    bidsBody:
      "Publíquela en PMRFP y los contratistas calificados de su región la verán. Usted se mantiene anónimo hasta que decida avanzar. Su borrador se transfiere tal cual: no tendrá que volver a escribir nada.",
    bidsCta: "Publíquela gratis",
    emailTitle: "Envíeme una copia por correo electrónico",
    emailSent: "Enviada a {email}. Incluye un enlace para publicarla cuando lo desee.",
    emailPlaceholder: "usted@empresa.com",
    send: "Enviar",
    sending: "Enviando…",
    emailNote: "Un solo correo con su RFP. Sin boletines.",
    changeAnswers: "Cambiar mis respuestas",
    disclaimer: "Un primer borrador, no asesoría legal. Revíselo antes de enviarlo a los oferentes.",
  },
  plainText: {
    scope: "ALCANCE DEL TRABAJO",
    requirements: "REQUISITOS",
    submission: "INSTRUCCIONES PARA PRESENTAR OFERTAS",
    evaluation: "CÓMO SE EVALUARÁN LAS OFERTAS",
    questions: "PREGUNTAS PARA LOS OFERENTES",
  },
  toast: {
    tooMany: "Ha redactado varias RFP seguidas; vuelva a intentarlo en unos minutos.",
    error: "Algo salió mal al redactar su RFP. Vuelva a intentarlo.",
    copied: "Copiado",
    fullCopied: "RFP completa copiada",
    copyFailed: "No se pudo copiar; seleccione el texto manualmente.",
    sent: "Enviado; revise su bandeja de entrada.",
    sendFailed: "No se pudo enviar. Verifique la dirección de correo electrónico y vuelva a intentarlo.",
  },
};

export default { en, fr, es };
