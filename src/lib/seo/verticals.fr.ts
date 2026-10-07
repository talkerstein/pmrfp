/**
 * French copy for the /for/[vertical] pages. Same shape as VERTICALS
 * (lib/seo/verticals), minus slugs and link targets, which stay in the English
 * data. `who` reads after "Pour" ("Pour les constructeurs, ..."). A vertical
 * without French copy falls back to English.
 */
import type { Locale } from "@/i18n/config";
import { VERTICALS, type Vertical } from "./verticals";
import { VERTICALS_ES } from "./verticals.es";

export type VerticalCopy = Omit<Vertical, "slug" | "cta" | "secondaryCta"> & { cta: string; secondaryCta: string };

const FR: Record<string, VerticalCopy> = {
  builders: {
    name: "Constructeurs",
    who: "les constructeurs, promoteurs et entrepreneurs généraux",
    headline: "Recevez les prix de vos sous-traitants en quelques jours, pas après des semaines d'appels.",
    positioning:
      "Publiez chaque lot de sous-traitance une seule fois, gratuitement. Les entrepreneurs commerciaux vérifiés qui desservent votre région le voient dès le lendemain matin et vous signalent leur intérêt. Comparez leurs profils, leurs qualifications et leurs réalisations au même endroit, puis embauchez ceux qui conviennent.",
    pains: [
      "Des heures au téléphone à courir après un sous-traitant pour chaque corps de métier, sur chaque chantier",
      "Les trois mêmes sous-traitants soumissionnent chaque fois, donc aucune pression sur les prix",
      "Aucun moyen rapide de vérifier l'expérience commerciale ou les assurances d'un nouveau sous-traitant",
      "Les prix arrivent par texto, par courriel et par message vocal, dans des formats différents",
      "Aucune trace écrite quand une relation avec un sous-traitant tourne mal",
    ],
    valueProps: [
      { title: "Publiez une fois, recevez de l'intérêt", desc: "Un lot par corps de métier. Les entrepreneurs correspondants le reçoivent dans leur courriel du matin et vous répondent." },
      { title: "Un bassin au-delà de vos trois habituels", desc: "Cherchez des entrepreneurs commerciaux par corps de métier et par région, avec leurs territoires desservis et leurs spécialités bien en vue." },
      { title: "Les qualifications avant l'appel", desc: "Les profils affichent les assurances, la CNESST / WSIB, les années d'activité, les projets et qui les recommande." },
      { title: "Voyez à quel prix se vendent les travaux", desc: "Les contrats publics octroyés montrent qui remporte les contrats près de chez vous et à quel prix, pour que vos budgets tiennent la route." },
      { title: "Gratuit de votre côté", desc: "Publier, parcourir et comparer ne coûte rien. Ce sont les entrepreneurs qui paient pour l'accès, pas vous." },
    ],
    features: ["Lots de sous-traitance gratuits", "Répertoire par corps de métier et région", "Données sur les contrats publics octroyés", "Toutes les réponses au même endroit"],
    faqs: [
      { q: "Nous avons déjà nos sous-traitants attitrés.", a: "Gardez-les. PMRFP est votre bassin de relève quand un sous-traitant attitré est occupé ou trop cher, ou quand vous travaillez dans une nouvelle région." },
      { q: "Est-ce simplement une course au plus bas prix?", a: "Non. Vous choisissez selon l'adéquation, les qualifications et les réalisations. Rien n'est octroyé automatiquement à qui que ce soit." },
      { q: "Combien ça coûte?", a: "Rien pour les constructeurs et les entrepreneurs généraux. La publication de lots et la consultation du répertoire sont gratuites." },
      { q: "Couvrez-vous les États-Unis?", a: "Oui. PMRFP couvre le Canada et les États-Unis; le répertoire des entrepreneurs est actuellement le plus fourni dans le Grand Toronto." },
      { q: "En combien de temps les entrepreneurs voient-ils mon lot?", a: "Les entrepreneurs correspondants le reçoivent dans leur courriel du matin, le lendemain de votre publication, et il apparaît sur le tableau immédiatement." },
    ],
    cta: "Publier un lot de sous-traitance",
    secondaryCta: "Parcourir le répertoire",
    metaTitle: "PMRFP pour les constructeurs : trouvez et embauchez des sous-traitants commerciaux",
    metaDescription:
      "Constructeurs et promoteurs : publiez gratuitement chaque lot de sous-traitance et recevez l'intérêt de sous-traitants commerciaux vérifiés au Canada et aux États-Unis. Comparez qualifications et réalisations au même endroit.",
  },
  "general-contractors": {
    name: "Entrepreneurs généraux",
    who: "les entrepreneurs généraux qui embauchent des sous-traitants",
    headline: "Vous avez décroché le contrat? Obtenez les prix de vos sous-traitants dès cette semaine.",
    positioning:
      "Publiez gratuitement un lot pour chaque corps de métier dont vous avez besoin : toiture, électricité, gypse. Les entrepreneurs de ce corps de métier et de cette région le reçoivent dans leur courriel du matin et vous envoient leurs prix. Et comme PMRFP importe chaque jour les contrats publics octroyés, vous voyez qui vient de remporter des contrats publics près de chez vous.",
    pains: [
      "Des jours au téléphone à courir après des sous-traitants pour chaque corps de métier d'un nouveau chantier",
      "Les quelques mêmes sous-traitants soumissionnent chaque fois, quand ils ont de la place",
      "Aucun moyen simple de vérifier les réalisations d'un nouveau sous-traitant avant de l'embaucher",
      "Les prix arrivent par texto, par courriel et par message vocal, dans des formats différents",
      "Les contrats publics ont des échéances qui n'attendent pas les rappels",
    ],
    valueProps: [
      { title: "Publiez vos lots de sous-traitance gratuitement", desc: "Un lot par corps de métier : portée, chantier, date limite des prix. Sans frais, sans contrat, sans facturation par client potentiel." },
      { title: "Des prix d'entrepreneurs locaux", desc: "Les entrepreneurs de ce corps de métier dans cette région reçoivent votre lot dans leur courriel quotidien et vous répondent par PMRFP." },
      { title: "Voyez leur travail d'abord", desc: "Les profils des entrepreneurs présentent des photos de réalisations et des avis, ainsi que les assurances et la CNESST / WSIB lorsque l'entrepreneur les a ajoutées." },
      { title: "Liez le contrat public que vous avez remporté", desc: "Vous arrivez d'un contrat public octroyé? Votre lot affiche le contrat, pour que les entrepreneurs sachent que le chantier est réel et financé." },
      { title: "Voyez qui vient de remporter des contrats publics", desc: "Chaque jour, nous ajoutons de nouveaux contrats publics octroyés : qui les a remportés, pour quels travaux et pour combien." },
    ],
    features: ["Lots de sous-traitance", "Alertes quotidiennes aux entrepreneurs", "Répertoire des entrepreneurs", "Contrats publics octroyés", "Suivi des marques d'intérêt"],
    faqs: [
      { q: "Combien ça coûte à un entrepreneur général?", a: "Rien. La publication de lots et la consultation du répertoire des entrepreneurs sont gratuites pour les entrepreneurs généraux. Ce sont les entrepreneurs spécialisés qui paient l'abonnement qui leur envoie votre lot." },
      { q: "Qui voit mon lot?", a: "Tout le monde peut voir le titre, le résumé, la région et la date limite des prix. La portée complète et vos coordonnées vont aux entrepreneurs abonnés, et vous choisissez si vos coordonnées s'affichent ou si les entrepreneurs vous joignent par PMRFP." },
      { q: "Dois-je avoir remporté un contrat public?", a: "Non. Publiez des lots pour n'importe quel chantier que vous soumissionnez ou réalisez, privé ou public. Lier un contrat public octroyé est facultatif." },
      { q: "PMRFP garantit-il des prix?", a: "Non. PMRFP présente votre lot aux entrepreneurs de ce corps de métier et de cette région. Nous ne pouvons pas promettre combien d'entre eux vous enverront un prix." },
    ],
    cta: "Publier un lot de sous-traitance — gratuit",
    secondaryCta: "Voir qui vient de remporter des contrats publics",
    metaTitle: "Publiez gratuitement vos lots de sous-traitance — PMRFP pour les entrepreneurs généraux",
    metaDescription:
      "Entrepreneurs généraux : publiez gratuitement un lot de sous-traitance par corps de métier et recevez des prix d'entrepreneurs locaux, avec photos de réalisations et avis. Voyez qui vient de remporter des contrats publics près de chez vous.",
  },
  tradesmen: {
    name: "Entrepreneurs spécialisés",
    who: "les électriciens, techniciens en CVC, couvreurs, entreprises d'entretien ménager, déneigeurs et plus",
    headline: "Arrêtez d'attendre que le téléphone sonne.",
    positioning:
      "PMRFP est le répertoire canadien des entrepreneurs en immobilier commercial. Votre inscription à 249 $/an place votre entreprise devant les gestionnaires immobiliers, promoteurs et constructeurs qui cherchent activement votre corps de métier dans votre ville.",
    pains: [
      "Les plateformes d'appels d'offres gouvernementaux sont bureaucratiques et surtout axées sur le secteur public",
      "HomeStars et TrustedPros n'envoient que des demandes résidentielles : mauvais acheteur, mauvaise taille de contrat",
      "Solliciter les gestionnaires immobiliers à froid est lent et coûteux",
      "Aucun moyen de mettre en valeur vos qualifications commerciales auprès de nouveaux clients",
    ],
    valueProps: [
      { title: "Faites-vous découvrir", desc: "Les gestionnaires immobiliers, constructeurs et propriétaires parcourent le répertoire par corps de métier et par ville. Soyez-y quand ils cherchent." },
      { title: "De vrais appels d'offres commerciaux", desc: "Accédez aux travaux récurrents d'entretien, de rénovation et d'aménagement qui paient de façon régulière." },
      { title: "249 $/an, prix fixe — pas de paiement par demande", desc: "Une visibilité illimitée pour des frais annuels prévisibles." },
      { title: "Montrez vos qualifications", desc: "Votre profil met en valeur vos assurances, la CNESST / WSIB, votre territoire desservi, vos spécialités et vos types de projets." },
      { title: "Manifestez votre intérêt directement", desc: "Répondez vous-même aux occasions : sans intermédiaire, sans course aux demandes partagées." },
    ],
    features: ["Inscription au répertoire", "Tableau des appels d'offres", "Manifester son intérêt", "Alertes de correspondance", "Occasions enregistrées"],
    faqs: [
      { q: "J'ai assez de travail grâce au bouche-à-oreille.", a: "Pour l'instant. PMRFP est votre police d'assurance : un deuxième canal quand les recommandations se tarissent." },
      { q: "PMRFP garantit-il des contrats?", a: "Non. PMRFP offre de la visibilité et un accès à des occasions, pas de contrats, de réponses ni de revenus garantis." },
    ],
    cta: "Inscrivez votre entreprise — 249 $/an",
    secondaryCta: "Voir les tarifs",
    metaTitle: "PMRFP pour les entrepreneurs spécialisés — Décrochez des contrats immobiliers commerciaux au Canada",
    metaDescription:
      "Entrepreneurs spécialisés : inscrivez-vous là où les gestionnaires immobiliers cherchent, accédez aux appels d'offres commerciaux et décrochez des contrats récurrents. 249 $ CAD/an, prix fixe, pas de paiement par demande.",
  },
  "sales-teams": {
    name: "Équipes de vente",
    who: "les représentants en développement des affaires des entrepreneurs et des fournisseurs",
    headline: "Votre prochain contrat commercial est déjà publié.",
    positioning:
      "Pour les représentants en développement des affaires des entrepreneurs et des fournisseurs, PMRFP est un fil en direct d'appels d'offres immobiliers commerciaux, jumelé à une visibilité dans le répertoire qui vous place sur la liste restreinte avant même la publication de l'appel d'offres.",
    pains: [
      "Un carnet de commandes mince et irrégulier, trop dépendant des comptes existants",
      "Des heures perdues à courir après des pistes gouvernementales ou de construction neuve qui ne correspondent pas à votre créneau",
      "Aucune source centrale pour les appels d'offres immobiliers commerciaux privés en Ontario",
      "Difficile de démontrer vos qualifications et vos réalisations à des clients sollicités à froid",
      "De longs cycles de vente avec les firmes de gestion immobilière",
    ],
    valueProps: [
      { title: "Soyez visible avant l'appel d'offres", desc: "Les gestionnaires immobiliers parcourent le répertoire pour dresser leur liste restreinte. Faites-vous trouver tôt." },
      { title: "Un vrai carnet de commandes", desc: "Le tableau des appels d'offres est un fil structuré et exploitable d'occasions privées en cours." },
      { title: "Un budget de développement prévisible", desc: "Un coût annuel fixe vaut mieux que des dépenses imprévisibles par demande." },
      { title: "Une fiche de capacités toujours à jour", desc: "Le profil de votre entreprise est visible par chaque exploitant immobilier inscrit." },
      { title: "Plus chaleureux que la sollicitation à froid", desc: "Manifester votre intérêt convertit plus vite qu'un appel à froid à un gestionnaire qui n'a jamais entendu parler de vous." },
    ],
    features: ["Inscription au répertoire", "Alertes d'appels d'offres par corps de métier et région", "Manifester son intérêt", "Gestion du profil d'entreprise"],
    faqs: [
      { q: "Notre entreprise figure déjà sur certaines listes de gestionnaires.", a: "Figurez-vous sur toutes? PMRFP vous expose aux gestionnaires immobiliers en dehors de votre réseau actuel, surtout les portefeuilles de taille moyenne." },
      { q: "Comment mesurer le rendement?", a: "Un seul nouveau contrat d'entretien commercial rembourse généralement plusieurs fois les frais annuels." },
    ],
    cta: "Ajouter votre entreprise",
    secondaryCta: "Voir les occasions",
    metaTitle: "PMRFP pour les équipes de vente — Un carnet d'appels d'offres commerciaux pour les entrepreneurs",
    metaDescription:
      "Représentants en ventes et en développement des affaires d'entreprises spécialisées : un fil en direct d'appels d'offres immobiliers commerciaux canadiens et une visibilité dans le répertoire qui vous place tôt sur les listes restreintes. Tarif annuel fixe.",
  },
  investors: {
    name: "Investisseurs et propriétaires immobiliers",
    who: "les investisseurs immobiliers et propriétaires de portefeuilles",
    headline: "Votre portefeuille mérite de meilleurs fournisseurs que le premier qui répond.",
    positioning:
      "PMRFP offre aux investisseurs immobiliers et aux propriétaires un répertoire consultable d'entrepreneurs commerciaux, avec leurs qualifications, pour ne plus dépendre de celui que votre dernier gestionnaire vous a recommandé.",
    pains: [
      "Trouver des entrepreneurs qualifiés pour des immeubles commerciaux prend trop de temps",
      "Les listes de fournisseurs privilégiés sont opaques, non vérifiées et ne suivent pas d'un immeuble à l'autre",
      "Aucune façon structurée de lancer un appel de prix concurrentiel pour l'entretien ou les travaux d'immobilisation",
      "Des tarifs au-dessus du marché, sans pression concurrentielle sur les fournisseurs en place",
      "Des lacunes de qualifications et de conformité qui créent des risques d'assurance et de responsabilité",
    ],
    valueProps: [
      { title: "Parcourez des entrepreneurs vérifiés", desc: "Cherchez par catégorie, région et qualification, gratuitement." },
      { title: "Menez un vrai processus", desc: "Publiez un appel d'offres pour n'importe quel immeuble et recevez des propositions structurées." },
      { title: "Transparence des prix", desc: "Un processus concurrentiel fait ressortir des prix et une portée équitables." },
      { title: "Réduisez votre risque", desc: "Les profils font ressortir les assurances, les permis et les réalisations pour réduire votre exposition à la responsabilité." },
      { title: "Gratuit du côté de la demande", desc: "Aucun coût pour les propriétaires et les investisseurs, pour publier comme pour parcourir." },
    ],
    features: ["Consultation du répertoire", "Publication d'appels d'offres", "Présélection de fournisseurs", "Qualifications visibles"],
    faqs: [
      { q: "Mon gestionnaire immobilier s'en occupe.", a: "PMRFP complète votre gestionnaire : c'est l'outil qu'il peut utiliser pour trouver des fournisseurs qualifiés pour vos actifs." },
      { q: "Je n'ai que quelques immeubles.", a: "PMRFP est gratuit du côté de la demande : aucun coût pour publier un appel d'offres ou parcourir les fournisseurs." },
    ],
    cta: "Parcourir le répertoire",
    secondaryCta: "Publier un appel d'offres",
    metaTitle: "PMRFP pour les investisseurs immobiliers — Trouvez des fournisseurs commerciaux vérifiés au Canada",
    metaDescription:
      "Investisseurs et propriétaires immobiliers : parcourez un répertoire d'entrepreneurs commerciaux avec leurs qualifications et lancez des appels d'offres concurrentiels pour votre portefeuille. Publication et consultation gratuites.",
  },
  "real-estate": {
    name: "Professionnels de l'immobilier",
    who: "les courtiers immobiliers, agences et investisseurs immobiliers",
    headline: "Vos entrepreneurs de confiance. Votre nom. Un seul lien.",
    positioning:
      "Enregistrez les entrepreneurs en qui vous avez confiance sur une page à votre nom, et textez à vos clients un seul lien au lieu d'un numéro de mémoire. Derrière : un répertoire d'entrepreneurs commerciaux et résidentiels avec leurs qualifications, et une façon simple de publier les réparations avant la mise en vente, les remises en état entre locataires et l'entretien qui protègent une transaction.",
    pains: [
      "Les réparations avant la mise en vente retardent une vente pendant que vous cherchez un entrepreneur fiable",
      "Le même homme à tout faire débordé ralentit chaque inscription et chaque remise en état",
      "Aucun bassin d'entrepreneurs vérifiés quand une transaction exige des travaux avant la conclusion de la vente",
      "L'entretien du portefeuille est réactif, éparpillé entre des contacts personnels",
      "Aucune trace écrite ni qualification quand une relation avec un fournisseur tourne mal",
    ],
    valueProps: [
      { title: "Votre page d'entrepreneurs de confiance", desc: "Enregistrez les entrepreneurs en qui vous avez confiance, ajoutez une note sur chacun et textez à vos clients un seul lien au lieu d'un numéro de mémoire. Gratuit pour 5 entrepreneurs." },
      { title: "Un bassin vérifié, sur demande", desc: "Cherchez des entrepreneurs commerciaux et résidentiels par catégorie, région et qualification, gratuitement." },
      { title: "Publiez les travaux une fois", desc: "Réparations avant la mise en vente, remises en état de logements ou projets d'immobilisation : publiez un appel d'offres et des entrepreneurs qualifiés répondent." },
      { title: "Concluez plus vite", desc: "Ne laissez plus un entrepreneur introuvable retarder une vente ou une remise en marché." },
      { title: "Les qualifications d'entrée de jeu", desc: "Les profils font ressortir les assurances, les permis et les réalisations pour réduire votre risque." },
      { title: "Gratuit du côté de la demande", desc: "Aucun coût pour les courtiers, les agences ou les investisseurs, pour publier comme pour parcourir." },
    ],
    features: ["Page d'entrepreneurs de confiance à partager", "Recherche dans le répertoire par corps de métier et région", "Publication d'appels d'offres", "Qualifications visibles"],
    faqs: [
      { q: "Est-ce pour acheter ou vendre des maisons?", a: "Non. PMRFP n'est pas un site d'inscriptions immobilières. Il vous met en contact avec les entrepreneurs qui font les travaux sur les propriétés : réparations, remises en état, rénovations et entretien." },
      { q: "J'ai déjà un homme à tout faire.", a: "Tant mieux. PMRFP est votre bassin de relève quand il est occupé, quand les travaux dépassent ses compétences, ou quand une propriété est dans une autre ville." },
      { q: "Combien coûte la page d'entrepreneurs de confiance?", a: "Elle est gratuite jusqu'à 5 entrepreneurs. Realtor Pro coûte 249 $ CAD par année : entrepreneurs illimités, plus votre téléphone et votre courriel sur la page, pour que chaque client qui l'ouvre puisse vous joindre." },
    ],
    cta: "Créer votre page d'entrepreneurs de confiance",
    secondaryCta: "Parcourir le répertoire",
    metaTitle: "PMRFP pour l'immobilier — Trouvez des entrepreneurs vérifiés pour vos inscriptions et portefeuilles",
    metaDescription:
      "Courtiers, agences et investisseurs : parcourez un répertoire d'entrepreneurs commerciaux et résidentiels avec leurs qualifications et publiez vos réparations avant la mise en vente, vos remises en état et vos travaux d'entretien. Publication et consultation gratuites.",
  },
  "condo-boards": {
    name: "Syndicats de copropriété",
    who: "les syndicats de copropriété et copropriétés autogérées",
    headline: "Montrez à vos copropriétaires que vous avez mené un processus équitable, pas juste un coup de fil.",
    positioning:
      "PMRFP permet au conseil d'administration d'un syndicat de copropriété de mener un appel d'offres ouvert et documenté, et de montrer aux copropriétaires exactement comment un fournisseur a été choisi : des soumissions concurrentielles, consignées au dossier. Un approvisionnement transparent, comme on s'attend à ce que fonctionnent les bons conseils d'administration.",
    pains: [
      "Les copropriétaires remettent en question le choix des fournisseurs à l'assemblée générale, et il n'y a aucune trace écrite à montrer",
      "Le même entrepreneur l'emporte chaque année sans soumission concurrentielle",
      "Trouver des entrepreneurs pour un projet repose sur des administrateurs bénévoles qui ont déjà un emploi",
      "Aucun processus documenté pour appuyer une décision fiduciaire ou une demande d'accès aux registres",
      "Des travaux d'immobilisation et d'entretien octroyés sans que les copropriétaires voient les autres options",
    ],
    valueProps: [
      { title: "Un processus concurrentiel documenté", desc: "Publiez un projet, recueillez des soumissions et gardez un dossier clair de qui a soumissionné et pourquoi vous l'avez choisi." },
      { title: "Une transparence visible pour les copropriétaires", desc: "Montrez au syndicat que vous avez mené un processus ouvert, pas une poignée de main avec un seul fournisseur." },
      { title: "Des entrepreneurs vérifiés, sur demande", desc: "Joignez des entrepreneurs commerciaux par catégorie et région, avec leurs qualifications bien en vue." },
      { title: "Publication gratuite", desc: "Publier un projet et recueillir des soumissions ne coûte rien au syndicat." },
      { title: "Conçu aussi pour les copropriétés autogérées", desc: "Aucun gestionnaire immobilier requis : un conseil peut mener tout le processus lui-même." },
    ],
    features: ["Publication d'appels d'offres", "Historique documenté des soumissions", "Répertoire par corps de métier et région", "Qualifications visibles"],
    faqs: [
      { q: "Notre gestionnaire immobilier s'occupe des fournisseurs.", a: "Très bien. PMRFP est l'outil que votre gestionnaire (ou votre conseil) utilise pour mener un processus concurrentiel que vous pouvez présenter aux copropriétaires. Il renforce la recommandation du gestionnaire, il ne la remplace pas." },
      { q: "Les soumissions concurrentielles sont-elles exigées par la loi?", a: "Non. Mener des soumissions concurrentielles documentées est une bonne pratique de gouvernance que l'on attend de plus en plus des conseils, pas une obligation légale. PMRFP la rend simplement facile." },
      { q: "Nous sommes autogérés.", a: "PMRFP est conçu pour ça : un conseil de bénévoles peut publier un projet, recueillir des soumissions d'entrepreneurs vérifiés et conserver le dossier, sans embaucher qui que ce soit." },
    ],
    cta: "Publier un projet — gratuit",
    secondaryCta: "Parcourir les entrepreneurs vérifiés",
    metaTitle: "PMRFP pour les syndicats de copropriété — Des soumissions concurrentielles transparentes à montrer aux copropriétaires",
    metaDescription:
      "Syndicats de copropriété et copropriétés autogérées : menez un appel d'offres ouvert et documenté, recueillez des soumissions concurrentielles d'entrepreneurs vérifiés et montrez aux copropriétaires un processus équitable. Publication gratuite.",
  },
  suppliers: {
    name: "Fournisseurs et distributeurs",
    who: "les fournisseurs de produits, de matériaux et d'équipement de construction",
    headline: "Présentez-vous aux entrepreneurs et aux constructeurs qui achètent ce que vous vendez.",
    positioning:
      "PMRFP inscrit les fournisseurs de produits, de matériaux et d'équipement de construction dans un répertoire consultable et fait connaître les projets commerciaux, pour que les entrepreneurs, constructeurs et gestionnaires immobiliers qui s'approvisionnent en produits comme les vôtres puissent vous trouver.",
    pains: [
      "Décrocher de nouveaux comptes d'entrepreneurs et de constructeurs commerciaux est lent et dépend des représentants",
      "Aucun endroit central où les acheteurs commerciaux canadiens cherchent des fournisseurs",
      "Difficile de présenter votre catalogue et vos qualifications aux bons acheteurs",
      "La visibilité sur les projets et les appels d'offres appartient aux entrepreneurs généraux, pas aux fournisseurs",
      "Des dépenses marketing qui donnent peu d'indices sur qui achète vraiment",
    ],
    valueProps: [
      { title: "Faites-vous découvrir par les acheteurs", desc: "Les entrepreneurs, constructeurs et gestionnaires immobiliers parcourent le répertoire par catégorie et région. Soyez-y quand ils s'approvisionnent." },
      { title: "Voyez la demande en temps réel", desc: "Suivez les appels d'offres commerciaux pour repérer les projets qui auront besoin de vos produits." },
      { title: "Tarif annuel fixe", desc: "Un coût prévisible, pas de paiement par demande ni de publicité payée à l'impression." },
      { title: "Mettez en valeur votre catalogue et vos conditions", desc: "Votre profil présente vos catégories de produits, votre territoire desservi et les détails de vos comptes entrepreneurs." },
      { title: "Bâtissez le volet fournisseurs du réseau", desc: "Côtoyez les entrepreneurs et les constructeurs que vous servez déjà, dans une seule place de marché commerciale canadienne." },
    ],
    features: ["Inscription au répertoire", "Ciblage par catégorie et région", "Visibilité sur les appels d'offres", "Profil d'entreprise", "Badge Vérifié"],
    faqs: [
      { q: "PMRFP est-il réservé aux entrepreneurs?", a: "Non. Les fournisseurs et distributeurs s'inscrivent aux côtés des entrepreneurs : le même répertoire et le même abonnement Pro, adaptés pour que les acheteurs commerciaux trouvent ce que vous vendez." },
      { q: "Comment les fournisseurs utilisent-ils les appels d'offres?", a: "La visibilité sur les appels d'offres vous aide à repérer les projets commerciaux à venir qui auront besoin de matériaux ou d'équipement, pour joindre tôt les bons entrepreneurs." },
    ],
    cta: "Inscrire votre entreprise",
    secondaryCta: "Parcourir le répertoire des fournisseurs",
    metaTitle: "PMRFP pour les fournisseurs — Joignez les entrepreneurs et constructeurs commerciaux canadiens",
    metaDescription:
      "Fournisseurs de produits et de matériaux de construction : inscrivez-vous là où les entrepreneurs, constructeurs et gestionnaires immobiliers commerciaux canadiens s'approvisionnent, et suivez la demande des projets. Tarif annuel fixe.",
  },
};

/** Copy per language; Spanish lives in ./verticals.es. */
const COPY: Partial<Record<Locale, Record<string, VerticalCopy>>> = { fr: FR, es: VERTICALS_ES };

function localize(v: Vertical, lang: Locale): Vertical {
  const copy = COPY[lang]?.[v.slug];
  if (!copy) return v;
  return {
    ...v,
    ...copy,
    cta: { href: v.cta.href, label: copy.cta },
    secondaryCta: { href: v.secondaryCta.href, label: copy.secondaryCta },
  };
}

/** All verticals in the page language. */
export function verticalsFor(lang: Locale): Vertical[] {
  return VERTICALS.map((v) => localize(v, lang));
}

/** One vertical in the page language, or null for an unknown slug. */
export function getVerticalFor(slug: string, lang: Locale): Vertical | null {
  const v = VERTICALS.find((x) => x.slug === slug);
  return v ? localize(v, lang) : null;
}
