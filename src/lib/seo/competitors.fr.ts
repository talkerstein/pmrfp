/**
 * French copy for the /vs/[competitor] pages. Same shape as COMPETITORS
 * (lib/seo/competitors); slugs, flags and source URLs stay in the English data.
 * Translated faithfully: no claim is added, dropped or strengthened, and every
 * figure matches the English (reformatted as 1 200 $, not changed).
 * `nameOf` is the name after "de" ("de MERX", "d'Angi", "du statu quo").
 */
import type { Locale } from "@/i18n/config";
import { COMPETITORS, type Competitor } from "./competitors";
import { COMPETITORS_ES } from "./competitors.es";

export type CompetitorCopy =Omit<Competitor, "slug" | "name" | "publicTenderProof" | "priceSource"> & {
  name?: string;
  nameOf: string;
  priceSource?: { checked: string; note?: string };
};

const PRICE = "249 $ CAD/an (prix fixe)";

const FR: Record<string, CompetitorCopy> = {
  merx: {
    nameOf: "de MERX",
    seoTitle: "Tarifs MERX (2026) et une solution moins chère pour les entrepreneurs du bâtiment",
    seoDescription:
      "MERX Premium coûte de 50 $ à 167 $ par mois, facturé annuellement (de 600 $ à 2 004 $ par année). Ce que couvre chaque forfait, et une option à 249 $/an si vous soumissionnez seulement sur des travaux de bâtiment et d'immobilier.",
    priceTable: [
      { plan: "Basic", covers: "Appels d'offres des organismes membres participants", price: "Gratuit", perYear: "0 $" },
      { plan: "Premium Local", covers: "Une province (territoires compris)", price: "50 $/mois, facturé annuellement", perYear: "600 $" },
      { plan: "Premium Regional", covers: "Une région", price: "100 $/mois, facturé annuellement", perYear: "1 200 $" },
      { plan: "Premium National", covers: "Tout le Canada", price: "167 $/mois, facturé annuellement", perYear: "2 004 $" },
    ],
    priceSource: {
      checked: "24 septembre 2026",
      note: "En CAD, avant taxes. MERX indique que la facturation annuelle permet d'économiser 50 % par rapport à la facturation mensuelle. Les pistes de construction privée font l'objet d'un abonnement distinct (par exemple, l'Ontario à 113,17 $/mois, facturé annuellement).",
    },
    tagline: "Le plus grand agrégateur d'appels d'offres publics au Canada.",
    whatItIs:
      "MERX regroupe dans un seul fil les appels d'offres fédéraux, provinciaux, municipaux et du secteur MASH (plus certains projets de construction privée), vendus par province, par région ou pour tout le Canada. La plateforme permet le dépôt électronique des soumissions pour les acheteurs qui y publient.",
    whoFor: "Les fournisseurs qui soumissionnent sur des appels d'offres publics dans tous les secteurs, dans plusieurs provinces.",
    pricing:
      "Basic est gratuit; Premium coûte 50 $ (une province), 100 $ (une région) ou 167 $ (tout le Canada) par mois, facturé annuellement",
    strengths: [
      "La plus grande base de données d'appels d'offres au Canada, tous secteurs confondus",
      "Toutes les provinces et tous les territoires, en français et en anglais",
      "Dépôt électronique des soumissions pour les acheteurs qui publient sur MERX",
    ],
    weaknesses: [
      "Vous payez pour tous les secteurs alors que vous soumissionnez seulement sur des travaux de bâtiment et d'immobilier",
      "Une couverture plus large coûte plus cher : les forfaits régional et national sont offerts à l'année seulement",
      "Aucun appel d'offres privé de gestionnaires immobiliers, aucun historique des adjudicataires ni répertoire d'entreprises",
    ],
    angle:
      "MERX vend l'ensemble du fil d'appels d'offres canadiens. Si vous soumissionnez seulement sur des travaux de bâtiment et d'immobilier, PMRFP réunit les appels d'offres qui comptent (AchatsCanada, la Ville de Toronto, le SEAO du Québec et le Yukon) avec les appels d'offres privés des gestionnaires immobiliers, et des alertes quotidiennes, pour 249 $ par année.",
    rows: [
      { feature: "Prix", pmrfp: `${PRICE}, ou 29 $/mois`, them: "Basic gratuit; Premium de 50 $ à 167 $/mois facturé annuellement (de 600 $ à 2 004 $/an)" },
      { feature: "Appels d'offres publics", pmrfp: "AchatsCanada, Ville de Toronto, SEAO (Québec), Yukon", them: "Fédéraux, provinciaux, municipaux, MASH : tous les secteurs" },
      { feature: "Appels d'offres privés de gestionnaires immobiliers", pmrfp: "Oui", them: "Non" },
      { feature: "Filtré pour les métiers du bâtiment et de l'immobilier", pmrfp: "Oui", them: "Vous filtrez par catégorie" },
      { feature: "Qui a remporté les contrats passés, et pour combien", pmrfp: "Oui, gratuitement", them: "Avis d'attribution, lorsque l'acheteur les publie" },
      { feature: "Profil d'entreprise dans un répertoire public", pmrfp: "Oui", them: "Non" },
      { feature: "Dépôt des soumissions sur la plateforme", pmrfp: "Non : vous soumissionnez sur le portail de l'émetteur", them: "Oui, pour les appels d'offres hébergés sur MERX" },
    ],
    faqs: [
      { q: "Combien coûte MERX?", a: "Selon la page de tarifs de MERX (vérifiée le 24 septembre 2026), Basic est gratuit et Premium est vendu selon la couverture, facturé annuellement : Local (une province) 50 $ par mois, Regional 100 $ par mois, National 167 $ par mois. Cela représente 600 $, 1 200 $ ou 2 004 $ par année, en CAD avant taxes. MERX indique que la facturation annuelle permet d'économiser 50 % par rapport au paiement mensuel. PMRFP Trade Pro coûte 249 $ CAD par année, ou 29 $ par mois." },
      { q: "Combien coûte MERX pour l'Ontario?", a: "L'Ontario seul correspond au forfait Premium Local : 50 $ par mois facturé annuellement, soit 600 $ par année avant taxes (vérifié le 24 septembre 2026). Les pistes de construction privée de MERX font l'objet d'un abonnement distinct; le forfait Ontario coûte 113,17 $ par mois, facturé annuellement." },
      { q: "MERX est-il gratuit?", a: "Vous pouvez consulter les résumés d'appels d'offres sur MERX avec un compte gratuit. Les documents, les alertes par courriel et le dépôt de soumissions exigent un abonnement payant." },
      { q: "Existe-t-il une solution moins chère que MERX?", a: "Si vous soumissionnez seulement sur des travaux de bâtiment, d'entretien et d'immobilier, oui. PMRFP recueille les appels d'offres publics d'AchatsCanada, de la Ville de Toronto, du SEAO du Québec et du Yukon, y ajoute les appels d'offres privés des gestionnaires immobiliers et vous envoie un courriel le jour même où une occasion correspondante est publiée, pour 249 $ CAD par année. Si vous soumissionnez dans tous les secteurs et toutes les provinces, la couverture plus large de MERX vaut son prix." },
      { q: "PMRFP offre-t-il des appels d'offres gouvernementaux?", a: "Oui. Chaque matin, PMRFP importe les appels d'offres ouverts en bâtiment et en immobilier d'AchatsCanada, de la Ville de Toronto, du SEAO du Québec et du gouvernement du Yukon, en vertu de leurs licences de données ouvertes. Vous déposez toujours votre soumission sur le portail de l'émetteur." },
      { q: "Puis-je utiliser les deux?", a: "Beaucoup d'entrepreneurs le font. MERX pour la couverture la plus large du secteur public, PMRFP pour les appels d'offres des gestionnaires immobiliers, les appels d'offres en bâtiment filtrés, les adjudicataires des contrats passés et un profil dans le répertoire qui vous fait trouver." },
    ],
  },
  vendorpm: {
    nameOf: "de VendorPM",
    tagline: "Gestion des fournisseurs conçue à Toronto pour les gestionnaires immobiliers.",
    whatItIs:
      "VendorPM est une plateforme de gestion du cycle de vie et de la conformité des fournisseurs, utilisée par des gestionnaires immobiliers dans des dizaines de milliers d'immeubles pour trouver, intégrer et suivre leurs fournisseurs.",
    whoFor: "Les firmes de gestion immobilière de taille moyenne à grande qui gèrent la conformité de leurs fournisseurs à grande échelle.",
    pricing: "Entreprise / sur mesure (les fournisseurs paient des niveaux d'adhésion)",
    strengths: [
      "Conçu au Canada et axé sur l'immobilier commercial",
      "Solide suivi de la conformité et des assurances",
      "Vaste réseau d'immeubles",
    ],
    weaknesses: [
      "Orienté vers les processus des grandes firmes de gestion et la conformité des fournisseurs, pas vers la découverte d'appels d'offres ouverts",
      "Les tarifs d'adhésion des fournisseurs sont plus élevés et moins transparents",
      "Un répertoire public moins repérable dans les moteurs de recherche pour décrocher de nouveaux contrats",
    ],
    angle:
      "VendorPM est un excellent outil de conformité pour les grandes firmes de gestion. PMRFP est une porte d'entrée moins coûteuse, axée sur la découverte (un répertoire public et un tableau d'appels d'offres ouverts), conçue pour que les entrepreneurs soient trouvés et décrochent de nouveaux contrats commerciaux, pas seulement pour gérer la paperasse des immeubles qu'ils servent déjà.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "Sur mesure / plus élevé" },
      { feature: "Fonction principale", pmrfp: "Découverte + appels d'offres ouverts", them: "Conformité / cycle de vie des fournisseurs" },
      { feature: "Répertoire public, optimisé pour les moteurs de recherche", pmrfp: "Oui", them: "Limité" },
      { feature: "Tableau d'appels d'offres ouverts", pmrfp: "Oui", them: "Sur invitation" },
      { feature: "Axé sur l'immobilier commercial", pmrfp: "Oui", them: "Oui" },
    ],
    faqs: [
      { q: "En quoi PMRFP diffère-t-il de VendorPM?", a: "VendorPM est avant tout un outil de conformité et de gestion des fournisseurs pour les grands gestionnaires immobiliers. PMRFP est axé sur la découverte : un répertoire public et un tableau d'appels d'offres ouverts, à prix fixe de 249 $/an, pour que les entrepreneurs soient trouvés et décrochent de nouveaux contrats." },
      { q: "Je suis déjà sur VendorPM. Pourquoi ajouter PMRFP?", a: "Ils ne font pas le même travail. VendorPM vous garde conforme dans les immeubles qui font déjà appel à vous; PMRFP vous fait découvrir par ceux qui ne le font pas encore, grâce à un répertoire public et à un tableau d'appels d'offres ouverts. Beaucoup d'entrepreneurs utilisent les deux : VendorPM pour les comptes existants, PMRFP pour en gagner de nouveaux." },
    ],
  },
  "bidnet-direct": {
    nameOf: "de BidNet Direct",
    tagline: "Agrégateur nord-américain d'appels d'offres du secteur public.",
    whatItIs:
      "BidNet Direct regroupe les appels d'offres gouvernementaux américains et canadiens, avec un module d'appels d'offres publics canadiens et un système d'alertes.",
    whoFor: "Les fournisseurs qui visent des contrats gouvernementaux municipaux et provinciaux.",
    pricing: "Abonnement, habituellement environ 500 à 1 500 $ US/an (tarifs canadiens non publics)",
    strengths: ["Couvre des milliers d'organismes publics", "Bon système d'alertes", "Gratuit pour les acheteurs"],
    weaknesses: [
      "Centré sur les États-Unis, avec un volet canadien qui a l'air d'un ajout",
      "Aucun répertoire de fournisseurs ni marketing",
      "Aucun volet immobilier commercial privé",
    ],
    angle:
      "BidNet est un outil d'appels d'offres gouvernementaux d'abord américain. PMRFP est canadien : les appels d'offres en bâtiment et en immobilier d'AchatsCanada, de Toronto, du Québec et du Yukon, plus les appels d'offres privés des gestionnaires immobiliers, qui ne publient jamais sur les portails gouvernementaux.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "≈500 à 1 500 $ US/an" },
      { feature: "Créneau", pmrfp: "Travaux canadiens de bâtiment et d'immobilier : appels d'offres publics + privés", them: "Appels d'offres gouvernementaux" },
      { feature: "Répertoire de fournisseurs", pmrfp: "Oui", them: "Non" },
      { feature: "Canadien d'origine", pmrfp: "Oui", them: "D'abord américain" },
    ],
    faqs: [
      { q: "PMRFP offre-t-il des appels d'offres gouvernementaux?", a: "Oui, pour les travaux de bâtiment et d'immobilier : chaque matin, PMRFP importe les appels d'offres ouverts d'AchatsCanada, de la Ville de Toronto, du SEAO du Québec et du Yukon, aux côtés des appels d'offres privés des gestionnaires immobiliers. BidNet couvre beaucoup plus d'organismes américains." },
    ],
  },
  biddingo: {
    nameOf: "de Biddingo",
    tagline: "Plateforme canadienne d'appels d'offres du secteur MASH.",
    whatItIs:
      "Biddingo est une plateforme conçue au Canada pour l'approvisionnement des municipalités, des conseils scolaires et des hôpitaux, avec une solide couverture en Ontario.",
    whoFor: "Les fournisseurs qui soumissionnent sur des appels d'offres publics canadiens ou du secteur MASH.",
    pricing: "Version de base gratuite; Premium ≈499 $ CAD/an",
    strengths: ["Véritable plateforme canadienne", "Solide couverture du secteur MASH en Ontario", "Essai gratuit"],
    weaknesses: [
      "Axé sur le gouvernement et le secteur MASH, pas sur l'immobilier commercial",
      "Aucun répertoire de fournisseurs ni marketing d'entreprise",
      "Peu d'occasions du secteur privé",
    ],
    angle:
      "Biddingo sert le secteur public. PMRFP sert le marché de l'immobilier commercial privé, et donne à votre entreprise un profil marketing, pas seulement une boîte de réception de soumissions.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "≈499 $ CAD/an" },
      { feature: "Créneau", pmrfp: "Immobilier commercial privé", them: "MASH / secteur public" },
      { feature: "Répertoire de fournisseurs", pmrfp: "Oui", them: "Non" },
      { feature: "Canadien d'origine", pmrfp: "Oui", them: "Oui" },
    ],
    faqs: [
      { q: "PMRFP est-il moins cher que Biddingo?", a: "Oui : 249 $/an, prix fixe, contre environ 499 $/an pour Biddingo Premium, et PMRFP comprend une inscription dans un répertoire de fournisseurs consultable." },
    ],
  },
  constructconnect: {
    nameOf: "de ConstructConnect",
    tagline: "La plateforme dominante d'information sur les projets en préconstruction au Canada.",
    whatItIs:
      "ConstructConnect (avec Link2Build et le Daily Commercial News) suit les projets en préconstruction, les plans et les permis pour les entrepreneurs généraux, les sous-traitants et les fournisseurs.",
    whoFor: "Les entrepreneurs et les fournisseurs qui cherchent des pistes de projets de construction neuve.",
    pricing: "Sur devis : environ 1 500 à 3 000 $+ par année selon certaines sources (non affiché publiquement)",
    strengths: ["Données approfondies sur les projets en préconstruction", "Crédibilité éditoriale (DCN)", "Vaste clientèle canadienne"],
    weaknesses: [
      "Coûteux : hors de portée pour bien des petits entrepreneurs",
      "Orienté vers les pistes de construction neuve, pas vers les appels d'offres d'entretien et de rénovation d'immeubles",
      "Aucun répertoire de fournisseurs ni profil marketing",
    ],
    angle:
      "ConstructConnect sert à chasser la construction neuve. PMRFP sert à décrocher les travaux récurrents d'entretien, de rénovation et d'aménagement des exploitants d'immeubles commerciaux existants : un marché plus stable et beaucoup plus abordable pour la plupart des entrepreneurs.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "Sur devis (environ 1 500 à 3 000 $+/an selon certaines sources)" },
      { feature: "Type d'occasion", pmrfp: "Appels d'offres d'immeubles existants", them: "Préconstruction de bâtiments neufs" },
      { feature: "Répertoire de fournisseurs", pmrfp: "Oui", them: "Non" },
      { feature: "Coût d'entrée", pmrfp: "Bas, fixe", them: "Élevé" },
    ],
    faqs: [
      { q: "Que devrait choisir un petit entrepreneur?", a: "Si vous voulez un accès abordable aux travaux immobiliers commerciaux récurrents, PMRFP. Si vous avez le budget pour chasser de grands projets de construction neuve, ConstructConnect. Ils répondent à des besoins différents." },
    ],
  },
  dodge: {
    nameOf: "de Dodge Construction Network",
    tagline: "Information sur la construction américaine, pour les grandes entreprises.",
    whatItIs:
      "Dodge suit plus de 750 000 projets par année en Amérique du Nord pour les grands entrepreneurs généraux, fournisseurs et sous-traitants à la recherche de pistes en préconstruction.",
    whoFor: "Les grandes firmes aux budgets d'entreprise qui visent des pistes de construction neuve.",
    pricing: "≈6 000 à 12 000 $+ US par année, par utilisateur",
    strengths: ["Immense base de données de projets", "Information approfondie", "Solide couverture américaine"],
    weaknesses: [
      "Très coûteux : plus par année que ce que bien des entrepreneurs font de profit sur un seul chantier",
      "Centré sur les États-Unis; la couverture canadienne est secondaire",
      "Démesuré pour les petites et moyennes entreprises; aucun répertoire de fournisseurs",
    ],
    angle:
      "Dodge coûte plus par année que ce que bien des petits entrepreneurs gagnent sur un seul contrat. PMRFP est conçu pour le marché canadien de l'immobilier commercial, pour une infime fraction du prix.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "≈6 000 à 12 000 $+ US/an" },
      { feature: "Canadien d'origine", pmrfp: "Oui", them: "D'abord américain" },
      { feature: "Accessible aux petits entrepreneurs", pmrfp: "Oui", them: "Non" },
      { feature: "Répertoire de fournisseurs", pmrfp: "Oui", them: "Non" },
    ],
    faqs: [
      { q: "PMRFP est-il une solution de rechange à Dodge?", a: "Pour les entrepreneurs canadiens axés sur les travaux immobiliers commerciaux, PMRFP offre une visibilité dans le répertoire et des appels d'offres pertinents, sans le prix d'entreprise de Dodge." },
    ],
  },
  trustedpros: {
    nameOf: "de TrustedPros",
    tagline: "Avis et demandes d'entrepreneurs résidentiels au Canada.",
    whatItIs:
      "TrustedPros est une plateforme canadienne d'avis et de demandes pour entrepreneurs, axée sur les propriétaires de maisons.",
    whoFor: "Les propriétaires de maisons qui cherchent un entrepreneur.",
    pricing: "Abonnement + demandes (tarifs peu transparents)",
    strengths: ["Né au Canada", "Établi depuis 2004", "Profils et avis"],
    weaknesses: ["Résidentiel seulement, pas de commercial", "Qualité des demandes remise en question", "Tarifs opaques"],
    angle:
      "TrustedPros est fait pour les rénovations résidentielles. PMRFP est fait pour l'immobilier commercial : un autre acheteur, des contrats plus gros et une exigence de crédibilité plus élevée.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "Opaque, basé sur les demandes" },
      { feature: "Marché", pmrfp: "Immobilier commercial", them: "Résidentiel" },
      { feature: "Accès aux appels d'offres", pmrfp: "Oui", them: "Non" },
      { feature: "Acheteur", pmrfp: "Gestionnaires immobiliers / propriétaires d'immeubles", them: "Propriétaires de maisons" },
    ],
    faqs: [
      { q: "PMRFP m'enverra-t-il des demandes résidentielles?", a: "Non. PMRFP porte uniquement sur l'immobilier commercial : des gestionnaires immobiliers, des constructeurs et des propriétaires d'immeubles, pas des propriétaires de maisons." },
    ],
  },
  homestars: {
    nameOf: "de HomeStars",
    tagline: "La plus grande plateforme d'avis sur les entrepreneurs résidentiels au Canada.",
    whatItIs:
      "HomeStars (qui fait partie d'Angi/IAC) est la plus grande plateforme canadienne d'avis et de recommandations d'entrepreneurs résidentiels.",
    whoFor: "Les propriétaires de maisons; les entrepreneurs paient par demande ou par abonnement.",
    pricing: "Paiement par demande (≈15 à 85 $+ CAD par demande) + niveaux d'abonnement",
    strengths: ["La plus grande plateforme canadienne entre consommateurs et entrepreneurs", "Avis solides", "Couverture nationale"],
    weaknesses: [
      "Strictement résidentiel : aucun volet immobilier commercial",
      "Le paiement par demande fait grimper les coûts dans les métiers concurrentiels",
      "Aucune fonction d'appel d'offres",
    ],
    angle:
      "HomeStars est fait pour les rénovations de cuisine. PMRFP est fait pour les contrats commerciaux d'entretien et d'aménagement, qui valent souvent de 5 à 10 fois plus par contrat, avec des frais fixes au lieu de frais par demande.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "Par demande, variable" },
      { feature: "Marché", pmrfp: "Immobilier commercial", them: "Résidentiel" },
      { feature: "Modèle de coût", pmrfp: "Fixe, annuel", them: "Paiement par demande" },
      { feature: "Accès aux appels d'offres", pmrfp: "Oui", them: "Non" },
    ],
    faqs: [
      { q: "PMRFP, c'est comme HomeStars pour le commercial?", a: "L'idée est semblable (se faire découvrir), mais PMRFP sert les acheteurs de l'immobilier commercial, ajoute un tableau d'appels d'offres et facture un prix fixe de 249 $/an au lieu de frais par demande." },
    ],
  },
  angi: {
    nameOf: "d'Angi",
    tagline: "Place de marché américaine de services résidentiels.",
    whatItIs:
      "Angi (anciennement Angie's List) est une place de marché américaine de services résidentiels, présente au Canada surtout par l'entremise de HomeStars.",
    whoFor: "Les propriétaires de maisons.",
    pricing: "Par demande (≈15 à 100 $+ CAD), souvent des demandes partagées",
    strengths: ["Grande marque nord-américaine", "Large éventail de métiers"],
    weaknesses: [
      "Centré sur les États-Unis et le résidentiel",
      "Demandes partagées : la même demande va à plusieurs entrepreneurs",
      "Modèle de paiement par demande mal vu par bien des entrepreneurs",
    ],
    angle:
      "Angi vous envoie la même demande partagée qui est allée à quatre autres entrepreneurs. PMRFP vous met en contact avec des gestionnaires immobiliers qui publient de vrais appels d'offres commerciaux : vous êtes jugé sur le mérite et l'adéquation, pas sur la rapidité à rappeler.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "Par demande, variable" },
      { feature: "Demandes", pmrfp: "Manifestation d'intérêt sur de vrais appels d'offres", them: "Demandes partagées" },
      { feature: "Marché", pmrfp: "Immobilier commercial", them: "Résidentiel" },
      { feature: "Canadien d'origine", pmrfp: "Oui", them: "D'abord américain" },
    ],
    faqs: [
      { q: "Les occasions sur PMRFP sont-elles exclusives?", a: "Les appels d'offres sont ouverts aux membres qualifiés, mais vous répondez directement avec votre propre proposition. Ce n'est pas une demande partagée envoyée à des dizaines d'entrepreneurs." },
    ],
  },
  planhub: {
    nameOf: "de PlanHub",
    tagline: "Plateforme américaine de soumissions en construction commerciale.",
    whatItIs:
      "PlanHub est une plateforme infonuagique américaine de soumissions qui met en relation entrepreneurs généraux et sous-traitants sur des projets de construction commerciale.",
    whoFor: "Les entrepreneurs généraux et les sous-traitants américains en construction commerciale.",
    pricing: "Sous-traitants : gratuit à ≈1 199 $ US/an; entrepreneurs généraux : sur mesure",
    strengths: ["Vaste base de données de projets commerciaux américains", "Accès de base gratuit pour les sous-traitants", "Interface moderne"],
    weaknesses: [
      "Surtout le marché américain : faible couverture canadienne",
      "Axé sur la construction neuve, pas sur l'entretien d'immeubles",
      "Aucun répertoire de fournisseurs",
    ],
    angle:
      "PlanHub est un outil américain pour les soumissions en construction aux États-Unis. PMRFP est conçu au Canada pour les exploitants d'immeubles commerciaux canadiens et les travaux récurrents qu'ils octroient.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "Gratuit à ≈1 199 $ US/an" },
      { feature: "Couverture canadienne", pmrfp: "Canada d'abord", them: "D'abord américain" },
      { feature: "Type d'occasion", pmrfp: "Appels d'offres d'immeubles existants", them: "Soumissions de construction neuve" },
      { feature: "Répertoire de fournisseurs", pmrfp: "Oui", them: "Non" },
    ],
    faqs: [
      { q: "PlanHub fonctionne-t-il au Canada?", a: "Sa couverture est centrée sur les États-Unis. Pour les travaux immobiliers commerciaux au Canada, PMRFP est conçu sur mesure." },
    ],
  },
  buildingconnected: {
    nameOf: "de BuildingConnected",
    tagline: "Le réseau de soumissions en préconstruction d'Autodesk.",
    whatItIs:
      "BuildingConnected (propriété d'Autodesk) est un réseau de préconstruction où les entrepreneurs généraux gèrent leurs invitations à soumissionner et où les sous-traitants reçoivent des invitations.",
    whoFor: "Les entrepreneurs généraux de taille moyenne à grande et les sous-traitants qu'ils invitent, surtout en construction commerciale américaine.",
    pricing: "Sous-traitants : gratuit (réactif) ou ≈149 $ US/mois; entrepreneurs généraux : ≈3 600 à 5 000 $+ US/an",
    strengths: ["Plus d'un million de professionnels", "Intégration Autodesk", "Norme de l'industrie en construction commerciale américaine"],
    weaknesses: [
      "Réactif pour les sous-traitants : vous attendez d'être invité",
      "Centré sur les États-Unis; le Canada est secondaire",
      "Complexe et coûteux pour les petites entreprises",
    ],
    angle:
      "Avec BuildingConnected, il faut que quelqu'un vous invite. PMRFP vous permet d'inscrire votre entreprise de façon proactive et de répondre aux appels d'offres ouverts des gestionnaires immobiliers, sans attendre d'invitation.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "Gratuit à ≈149 $ US/mois (sous-traitants)" },
      { feature: "Modèle d'occasions", pmrfp: "Proactif : appels d'offres ouverts", them: "Sur invitation seulement" },
      { feature: "Couverture canadienne", pmrfp: "Canada d'abord", them: "D'abord américain" },
      { feature: "Répertoire de fournisseurs", pmrfp: "Oui", them: "Non" },
    ],
    faqs: [
      { q: "Dois-je être invité pour utiliser PMRFP?", a: "Non. Vous inscrivez votre entreprise et pouvez manifester votre intérêt pour tout appel d'offres ouvert qui vous convient, sans invitation." },
    ],
  },
  "status-quo": {
    name: "le statu quo",
    nameOf: "du statu quo",
    tagline: "Recommandations, listes de fournisseurs privilégiés et courriels.",
    whatItIs:
      "La façon dont la plupart des gestionnaires immobiliers commerciaux et des entrepreneurs se trouvent aujourd'hui : bouche-à-oreille, listes internes de fournisseurs, appels à froid et courriels.",
    whoFor: "Tous ceux qui n'ont pas encore trouvé de meilleur système.",
    pricing: "Gratuit en argent, coûteux en temps et en occasions manquées",
    strengths: ["Grande confiance envers les recommandations connues", "Aucun abonnement", "Fonctionne pour les joueurs établis"],
    weaknesses: [
      "Si vous n'êtes pas déjà sur une liste, vous êtes invisible",
      "Limité géographiquement et opaque",
      "Aucun repère de prix concurrentiel ni processus documenté",
    ],
    angle:
      "Si vous n'êtes pas déjà sur la liste de fournisseurs privilégiés de quelqu'un, vous n'existez pas. PMRFP crée une porte d'entrée pour les entrepreneurs qui ne sont pas encore branchés, et offre aux gestionnaires immobiliers une solution consultable plutôt que leur carnet d'adresses.",
    rows: [
      { feature: "Prix annuel", pmrfp: PRICE, them: "0 $ (coût en temps élevé)" },
      { feature: "Visibilité pour les nouveaux fournisseurs", pmrfp: "Oui", them: "Non" },
      { feature: "Processus d'appel d'offres concurrentiel", pmrfp: "Oui", them: "Rare" },
      { feature: "Portée pancanadienne", pmrfp: "Oui", them: "Local seulement" },
    ],
    faqs: [
      { q: "Pourquoi payer si les recommandations fonctionnent?", a: "Les recommandations fonctionnent, jusqu'à ce qu'elles se tarissent. PMRFP est le deuxième canal qui garde votre carnet de commandes plein quand le bouche-à-oreille se tait, et qui ouvre des portes en dehors de votre réseau actuel." },
    ],
  },
};

/** Copy per language; Spanish lives in ./competitors.es. */
const COPY: Partial<Record<Locale, Record<string, CompetitorCopy>>> = { fr: FR, es: COMPETITORS_ES };

function localize(c: Competitor, lang: Locale): Competitor {
  const copy = COPY[lang]?.[c.slug];
  if (!copy) return c;
  return {
    ...c,
    tagline: copy.tagline,
    whatItIs: copy.whatItIs,
    whoFor: copy.whoFor,
    pricing: copy.pricing,
    strengths: copy.strengths,
    weaknesses: copy.weaknesses,
    angle: copy.angle,
    rows: copy.rows,
    faqs: copy.faqs,
    name: copy.name ?? c.name,
    // No English fallback: without its own, a translated page uses its language's default title.
    seoTitle: copy.seoTitle,
    seoDescription: copy.seoDescription,
    priceTable: copy.priceTable ?? c.priceTable,
    priceSource: c.priceSource && copy.priceSource ? { ...c.priceSource, ...copy.priceSource } : c.priceSource,
  };
}

/** All competitors in the page language. */
export function competitorsFor(lang: Locale): Competitor[] {
  return COMPETITORS.map((c) => localize(c, lang));
}

/** One competitor in the page language, or null for an unknown slug. */
export function getCompetitorFor(slug: string, lang: Locale): Competitor | null {
  const c = COMPETITORS.find((x) => x.slug === slug);
  return c ? localize(c, lang) : null;
}

/** The name after "de" in French / Spanish ("de MERX", "du statu quo", "del statu quo"); the plain name in English. */
export function competitorNameOf(c: Competitor, lang: Locale): string {
  if (lang === "en") return c.name;
  return COPY[lang]?.[c.slug]?.nameOf ?? `de ${c.name}`;
}
