/**
 * The municipal RFP writer (PMRFP for Towns, Part B2): a town's quote
 * request, small-works tender, consultant RFP or prequalified trades list,
 * with the province's clause pack (./clauses). Template only (no AI): the
 * clauses must come out exactly as checked. Plain language for a department
 * head, not a procurement officer.
 *
 * Same last pass as the PM writer (lib/rfp-writer/postprocess, PR #170): no
 * invented site facts, visible [Confirm: …] blanks, the buyer's own words
 * once. Never a local preference unless the town asks, and never in Ontario.
 * Quebec documents come out in French; New Brunswick can ask for both
 * languages. Tested in test/unit/town-jobs.test.ts.
 */
import { LOCALE_TAG } from "@/i18n/config";
import { confirmBlank, finalizeDraft, siteAccessBlock, tidyUserText, type WriterLang } from "@/lib/rfp-writer/postprocess";
import type { RfpDraft, WizardInput } from "@/lib/rfp-writer/schema";
import {
  ACCESSIBILITY_BLANK,
  BILINGUAL_CLAUSE,
  CLAUSES_AS_OF,
  PROVINCE_NAME,
  RBQ_CLAUSE,
  SAFETY_ROLE,
  bidSecurityClauses,
  bylawClause,
  documentLanguage,
  localPreferenceAllowed,
  localPreferenceClause,
  money,
  packFor,
  thresholdCheck,
  type ThresholdCheck,
} from "./clauses";
import type { FacilityService, MunicipalInput, MuniTemplate } from "./schema";

export interface MunicipalDraft extends RfpDraft {
  /** The language the document came out in (Quebec: French). */
  lang: WriterLang;
  /** New Brunswick, both languages. */
  bilingual: boolean;
  clausesAsOf: string;
  /** Above a trade-agreement threshold: post it on the official system and mirror it on PMRFP. */
  threshold: ThresholdCheck;
  /** The town asked for a local preference where it's not allowed (Ontario): left out. */
  localPreferenceRefused: boolean;
}

const TEXT = {
  en: {
    doc: { rfq: "Request for quotations", rft: "Request for tenders", rfp: "Request for proposals", call: "Call for a prequalified trades list" },
    services: { janitorial: "janitorial services", "grass-cutting": "grass cutting", snow: "snow clearing & sanding" } as Record<FacilityService, string>,
    Services: { janitorial: "Janitorial services", "grass-cutting": "Grass cutting", snow: "Snow clearing & sanding" } as Record<FacilityService, string>,
    and: "and",
    bca: "Building condition assessment",
    project: "project name",
    tradesBlank: "trades on the list",
    sitesBlank: "buildings, parks, lots or roads covered",
    startBlank: "start date",
    years: (n: number) => (n === 1 ? "1 year" : `${n} years`),
    summary: {
      "facility-services": "{buyer} is asking for written quotes for {what} at the sites listed below, for a {term} contract. At least three quotes are sought.",
      "small-works": "{buyer} is asking for prices for {what}. The work is described below; the lowest compliant price is expected to win.",
      consultant: "{buyer} is looking for a qualified consultant for {what}. Proposals are scored on experience, approach and price.",
      "standing-offer": "{buyer} is setting up a list of prequalified contractors for {what}, for {term}. Being on the list is not a promise of work.",
    } as Record<MuniTemplate, string>,
    heads: { about: "About this request:", need: "What we need:", scope: "Scope of work:", sites: "Sites covered:", term: "Contract term:", report: "What we receive:", list: "How the list works:" },
    about: "{buyer} ({province}) is a public buyer. This document explains the work, what bidders must provide and how the choice is made.",
    term: "{term}, starting {start}, with the option to extend for up to {ext} more year(s) at the Town's choice.",
    termNoExt: "{term}, starting {start}.",
    facility: {
      janitorial: [
        "Janitorial services:",
        "- Clean the buildings listed above to the schedule [Confirm: cleaning frequency for each building].",
        "- Supply all labour, equipment and cleaning products (low-odour, certified green products where possible).",
        "- Washrooms, floors, garbage and recycling, entrances and high-touch surfaces at every visit.",
        "- Keys and alarm codes stay with named staff; criminal record checks for anyone working in Town buildings [Confirm: checks required].",
        "- Price per building per month, plus an hourly rate for extra cleaning on request.",
      ],
      "grass-cutting": [
        "Grass cutting and trimming:",
        "- Cut, trim and blow clean the parks, cemeteries and boulevards listed above [Confirm: approximate area of each site].",
        "- Season: [Confirm: start and end dates].",
        "- Cut when the grass reaches [Confirm: height], or at least every [Confirm: number of days].",
        "- Price per cut per site, plus an hourly rate for extra work on request.",
      ],
      snow: [
        "Snow clearing and sanding:",
        "- Plow, clear and sand or salt the lots, sidewalks and entrances listed above.",
        "- Start when snowfall reaches [Confirm: depth]; sites clear by [Confirm: time of day].",
        "- Supply and spread [Confirm: sand, salt or a mix] on ice, within [Confirm: response time] of a call.",
        "- Keep a log of every visit (date, time, work done) and share it with the Town on request.",
        "- Price per event or per season for each site (say which), plus hourly rates for equipment.",
      ],
    } as Record<FacilityService, string[]>,
    works: [
      "- Supply all labour, materials, equipment and supervision to complete the work described above.",
      "- Drawings or specifications: [Confirm: attached documents or link].",
      "- Get and pay for the permits and inspections the work needs.",
      "- Protect the building, the public and Town staff; keep public areas safe and open where possible.",
      "- Clean up daily and dispose of debris legally.",
      "- Warranty: at least one year on workmanship [Confirm: warranty period], plus manufacturers' warranties, and as-built notes at the end.",
    ],
    consultant: [
      "- Visit and assess each building listed above: structure, envelope and roof, mechanical, electrical, plumbing, life safety and accessibility.",
      "- Review the records the Town provides [Confirm: drawings and past reports available].",
      "- Rate the condition of each component and estimate its remaining life.",
      "- Build a capital plan of repairs and replacements with cost estimates over [Confirm: number] years, in order of priority.",
    ],
    consultantReport: [
      "- A draft report, then a final report after the Town's comments.",
      "- The capital plan as a spreadsheet the Town can update.",
      "- A short presentation to staff or Council [Confirm: presentation needed].",
    ],
    standing: [
      "- Contractors who meet the requirements below are added to the list for {term}.",
      "- When a job comes up, the Town asks listed contractors for a price [Confirm: by rotation, or quotes from several listed contractors].",
      "- Hourly rates, equipment rates and the materials markup you give now apply for the whole term [Confirm: yearly price adjustment].",
      "- Being on the list is not a promise of work, and the Town may still buy outside the list where its by-law allows.",
    ],
    insurance: (amount: string) => `Commercial general liability insurance of at least ${amount} per occurrence [Confirm: amount], naming {buyer} as additional insured; certificate before work starts.`,
    auto: "Automobile liability insurance of at least $2,000,000 [Confirm: amount] for vehicles and equipment used on the work.",
    professional: "Professional liability (errors and omissions) insurance of at least $2,000,000 per claim [Confirm: amount].",
    references: "Three references for similar work in the last three years, municipal or commercial.",
    equipment: "A list of the equipment you will use, and how you cover a breakdown.",
    licensed: "The work is led by a professional engineer or architect licensed in {province} [Confirm: discipline required].",
    tradeLicences: "The licences the trades need in {province} [Confirm: e.g. electrical or gas licences].",
    submit: {
      how: "Send your price on PMRFP by {deadline} [Confirm: closing time, e.g. 2:00 p.m. local time]. Late submissions are not accepted.",
      include: "Include: your price (using the price form or table in this document), your insurance certificate (or a letter from your insurer), your workers' compensation clearance, and your references.",
      includeProposal: "Include: a short proposal (team, approach, schedule), your fee, your insurance certificate (or a letter from your insurer), your workers' compensation clearance, and your references.",
      includeList: "Include: your company details, hourly rates by type of worker, equipment rates, your materials markup, your emergency response time, your insurance certificate, your workers' compensation clearance, and your references.",
      questions: "Ask questions in writing on PMRFP by {qdeadline}. Answers are published on the listing for every bidder, without the asker's name. Any change is issued as a numbered addendum on the listing.",
      siteVisit: "Site visit: {date} [Confirm: time and meeting place]. Attendance is optional but recommended.",
      siteVisitAsk: "A site visit can be arranged for interested bidders [Confirm: how to book one].",
      award: "The Town may accept any quote, award by site or in part, or not award, as its purchasing by-law allows. No contract exists until the Town confirms it in writing.",
      conflict: "Declare any conflict of interest with Town staff or Council members.",
      asOf: "Clauses current as of {asOf}.",
    },
    eval: {
      price: "Lowest compliant price (meets every requirement)",
      priceSite: "Lowest compliant price for each site, or in total [Confirm: how the Town compares quotes]",
      consultant: ["Relevant experience and references (30%)", "Approach and work plan (30%)", "Schedule (10%)", "Fee (30%)"],
      list: ["Meets every requirement (pass or fail)", "Experience and references", "Rates [Confirm: how rates are scored]"],
      weights: "[Confirm: scoring weights]",
    },
    questions: {
      "facility-services": ["What is your price per site, and what does it include?", "Which equipment and how many staff will you use, and who covers a breakdown or a sick day?", "How do you record each visit, and how fast can you respond to a call?", "Which similar municipal or commercial contracts have you held recently?"],
      "small-works": ["What is your schedule from contract signing to completion?", "Which parts of the work, if any, will you subcontract, and to whom?", "What warranty do you give on workmanship and materials?", "How will you keep the public and Town staff safe while the building stays open?"],
      consultant: ["Who will lead the assessment, and what similar municipal work have they done?", "How many site visits do you plan, and how long will they take?", "How do you estimate costs in the capital plan?", "When would we receive the draft and final reports?"],
      "standing-offer": ["Which trades and areas can you cover, and how fast can you respond to an urgent call?", "What are your hourly rates by type of worker, and your materials markup?", "Who will be the Town's contact at your company?", "Which similar municipal or commercial work have you done recently?"],
    } as Record<MuniTemplate, string[]>,
  },
  fr: {
    doc: { rfq: "Demande de prix", rft: "Appel d'offres", rfp: "Appel de propositions", call: "Appel de qualification de fournisseurs" },
    services: { janitorial: "l'entretien ménager", "grass-cutting": "la tonte du gazon", snow: "le déneigement et l'épandage d'abrasifs" } as Record<FacilityService, string>,
    Services: { janitorial: "Entretien ménager", "grass-cutting": "Tonte du gazon", snow: "Déneigement et épandage d'abrasifs" } as Record<FacilityService, string>,
    and: "et",
    bca: "Évaluation de l'état des bâtiments",
    project: "nom du projet",
    tradesBlank: "corps de métier visés",
    sitesBlank: "bâtiments, parcs, stationnements ou rues visés",
    startBlank: "date de début",
    years: (n: number) => (n === 1 ? "1 an" : `${n} ans`),
    summary: {
      "facility-services": "{buyer} demande des prix écrits pour {what} aux endroits énumérés ci-dessous, pour un contrat de {term}. Au moins trois prix sont sollicités.",
      "small-works": "{buyer} demande des prix pour {what}. Les travaux sont décrits ci-dessous; le plus bas prix conforme devrait l'emporter.",
      consultant: "{buyer} cherche un consultant qualifié pour {what}. Les propositions sont évaluées selon l'expérience, la démarche et le prix.",
      "standing-offer": "{buyer} constitue une liste d'entrepreneurs qualifiés pour {what}, pour {term}. Être sur la liste ne garantit aucun contrat.",
    } as Record<MuniTemplate, string>,
    heads: { about: "À propos de cette demande :", need: "Ce dont nous avons besoin :", scope: "Portée des travaux :", sites: "Endroits visés :", term: "Durée du contrat :", report: "Ce que nous recevons :", list: "Fonctionnement de la liste :" },
    about: "{buyer} ({province}) est un organisme public. Ce document décrit les travaux, ce que les soumissionnaires doivent fournir et la façon dont le choix est fait.",
    term: "{term}, à compter du {start}, avec la possibilité de prolonger d'au plus {ext} an(s) au choix de la municipalité.",
    termNoExt: "{term}, à compter du {start}.",
    facility: {
      janitorial: [
        "Entretien ménager :",
        "- Nettoyer les bâtiments énumérés ci-dessus selon l'horaire [À confirmer : fréquence de nettoyage de chaque bâtiment].",
        "- Fournir toute la main-d'œuvre, l'équipement et les produits (produits écologiques certifiés et peu odorants si possible).",
        "- Toilettes, planchers, déchets et recyclage, entrées et surfaces souvent touchées à chaque visite.",
        "- Les clés et codes d'alarme restent sous la garde d'employés nommés; vérification des antécédents judiciaires pour toute personne qui travaille dans les bâtiments municipaux [À confirmer : vérifications exigées].",
        "- Prix par bâtiment par mois, plus un taux horaire pour du nettoyage supplémentaire sur demande.",
      ],
      "grass-cutting": [
        "Tonte et taille du gazon :",
        "- Tondre, tailler et souffler les parcs, cimetières et terre-pleins énumérés ci-dessus [À confirmer : superficie approximative de chaque endroit].",
        "- Saison : [À confirmer : dates de début et de fin].",
        "- Tondre lorsque le gazon atteint [À confirmer : hauteur], ou au moins tous les [À confirmer : nombre de jours].",
        "- Prix par tonte par endroit, plus un taux horaire pour les travaux supplémentaires sur demande.",
      ],
      snow: [
        "Déneigement et épandage d'abrasifs :",
        "- Déneiger et épandre du sable ou du sel dans les stationnements, trottoirs et entrées énumérés ci-dessus.",
        "- Commencer lorsque la neige atteint [À confirmer : épaisseur]; endroits dégagés avant [À confirmer : heure].",
        "- Fournir et épandre [À confirmer : sable, sel ou mélange] sur la glace, dans un délai de [À confirmer : délai d'intervention] après un appel.",
        "- Tenir un registre de chaque intervention (date, heure, travaux faits) et le remettre à la municipalité sur demande.",
        "- Prix par intervention ou par saison pour chaque endroit (précisez lequel), plus des taux horaires pour l'équipement.",
      ],
    } as Record<FacilityService, string[]>,
    works: [
      "- Fournir toute la main-d'œuvre, les matériaux, l'équipement et la surveillance nécessaires aux travaux décrits ci-dessus.",
      "- Plans ou devis : [À confirmer : documents joints ou lien].",
      "- Obtenir et payer les permis et inspections nécessaires.",
      "- Protéger le bâtiment, le public et le personnel municipal; garder les aires publiques sécuritaires et ouvertes si possible.",
      "- Nettoyer chaque jour et éliminer les débris de façon conforme.",
      "- Garantie : au moins un an sur la main-d'œuvre [À confirmer : durée de la garantie], plus les garanties des fabricants, et des notes de fin de travaux.",
    ],
    consultant: [
      "- Visiter et évaluer chaque bâtiment énuméré ci-dessus : structure, enveloppe et toiture, mécanique, électricité, plomberie, sécurité incendie et accessibilité.",
      "- Examiner les documents fournis par la municipalité [À confirmer : plans et rapports antérieurs disponibles].",
      "- Évaluer l'état de chaque composante et estimer sa durée de vie restante.",
      "- Préparer un plan d'immobilisations (réparations et remplacements) avec estimations de coûts sur [À confirmer : nombre] ans, par ordre de priorité.",
    ],
    consultantReport: [
      "- Un rapport préliminaire, puis un rapport final après les commentaires de la municipalité.",
      "- Le plan d'immobilisations dans un chiffrier que la municipalité peut mettre à jour.",
      "- Une courte présentation au personnel ou au conseil [À confirmer : présentation requise].",
    ],
    standing: [
      "- Les entrepreneurs qui satisfont aux exigences ci-dessous sont inscrits sur la liste pour {term}.",
      "- Lorsqu'un besoin survient, la municipalité demande un prix aux entrepreneurs inscrits [À confirmer : à tour de rôle, ou prix de plusieurs entrepreneurs inscrits].",
      "- Les taux horaires, les taux d'équipement et la majoration des matériaux soumis maintenant s'appliquent pendant toute la durée [À confirmer : ajustement annuel des prix].",
      "- Être sur la liste ne garantit aucun contrat, et la municipalité peut acheter hors de la liste si son règlement le permet.",
    ],
    insurance: (amount: string) => `Assurance responsabilité civile générale d'au moins ${amount} par sinistre [À confirmer : montant], désignant {buyer} comme assuré additionnel; certificat remis avant le début des travaux.`,
    auto: "Assurance responsabilité automobile d'au moins 2 000 000 $ [À confirmer : montant] pour les véhicules et l'équipement utilisés.",
    professional: "Assurance responsabilité professionnelle (erreurs et omissions) d'au moins 2 000 000 $ par réclamation [À confirmer : montant].",
    references: "Trois références pour des travaux semblables au cours des trois dernières années, municipaux ou commerciaux.",
    equipment: "La liste de l'équipement que vous utiliserez et la façon dont vous palliez un bris.",
    licensed: "Les travaux sont dirigés par un ingénieur ou un architecte membre de son ordre professionnel au {province} [À confirmer : discipline exigée].",
    tradeLicences: "Les licences et cartes de compétence exigées pour les métiers visés au {province} [À confirmer : p. ex. électricité ou gaz].",
    submit: {
      how: "Soumettez votre prix sur PMRFP au plus tard le {deadline} [À confirmer : heure de clôture, p. ex. 14 h, heure locale]. Aucune soumission en retard n'est acceptée.",
      include: "Joignez : votre prix (selon le bordereau de prix ou le tableau du présent document), votre certificat d'assurance (ou une lettre de votre assureur), votre attestation de la commission des accidents du travail et vos références.",
      includeProposal: "Joignez : une courte proposition (équipe, démarche, échéancier), vos honoraires, votre certificat d'assurance (ou une lettre de votre assureur), votre attestation de la commission des accidents du travail et vos références.",
      includeList: "Joignez : les coordonnées de votre entreprise, vos taux horaires par catégorie de travailleurs, vos taux d'équipement, votre majoration sur les matériaux, votre délai d'intervention d'urgence, votre certificat d'assurance, votre attestation de la commission des accidents du travail et vos références.",
      questions: "Posez vos questions par écrit sur PMRFP au plus tard le {qdeadline}. Les réponses sont publiées sur l'annonce pour tous les soumissionnaires, sans le nom de l'auteur. Toute modification est publiée sous forme d'addenda numéroté sur l'annonce.",
      siteVisit: "Visite des lieux : {date} [À confirmer : heure et lieu de rendez-vous]. Facultative, mais recommandée.",
      siteVisitAsk: "Une visite des lieux peut être organisée pour les soumissionnaires intéressés [À confirmer : comment la réserver].",
      award: "La municipalité peut accepter n'importe quel prix, adjuger par endroit ou en partie, ou ne pas adjuger, comme son règlement le permet. Aucun contrat n'existe avant que la municipalité le confirme par écrit.",
      conflict: "Déclarez tout conflit d'intérêts avec le personnel ou les membres du conseil.",
      asOf: "Clauses à jour en date de {asOf}.",
    },
    eval: {
      price: "Plus bas prix conforme (satisfait à toutes les exigences)",
      priceSite: "Plus bas prix conforme pour chaque endroit ou au total [À confirmer : méthode de comparaison des prix]",
      consultant: ["Expérience pertinente et références (30 %)", "Démarche et plan de travail (30 %)", "Échéancier (10 %)", "Honoraires (30 %)"],
      list: ["Satisfait à toutes les exigences (réussite ou échec)", "Expérience et références", "Taux [À confirmer : méthode d'évaluation des taux]"],
      weights: "[À confirmer : pondération]",
    },
    questions: {
      "facility-services": ["Quel est votre prix par endroit et que comprend-il?", "Quel équipement et combien d'employés utiliserez-vous, et comment palliez-vous un bris ou une absence?", "Comment consignez-vous chaque visite et en combien de temps pouvez-vous répondre à un appel?", "Quels contrats municipaux ou commerciaux semblables avez-vous eus récemment?"],
      "small-works": ["Quel est votre échéancier entre la signature et la fin des travaux?", "Quelles parties des travaux sous-traiterez-vous, s'il y a lieu, et à qui?", "Quelle garantie offrez-vous sur la main-d'œuvre et les matériaux?", "Comment assurerez-vous la sécurité du public et du personnel pendant que le bâtiment reste ouvert?"],
      consultant: ["Qui dirigera l'évaluation et quels mandats municipaux semblables cette personne a-t-elle réalisés?", "Combien de visites prévoyez-vous et combien de temps dureront-elles?", "Comment estimez-vous les coûts du plan d'immobilisations?", "Quand recevrions-nous les rapports préliminaire et final?"],
      "standing-offer": ["Quels métiers et quels secteurs couvrez-vous, et en combien de temps répondez-vous à un appel urgent?", "Quels sont vos taux horaires par catégorie de travailleurs et votre majoration sur les matériaux?", "Qui sera la personne-ressource de la municipalité dans votre entreprise?", "Quels travaux municipaux ou commerciaux semblables avez-vous faits récemment?"],
    } as Record<MuniTemplate, string[]>,
  },
  es: {
    doc: { rfq: "Solicitud de cotizaciones", rft: "Licitación", rfp: "Solicitud de propuestas", call: "Convocatoria para una lista de contratistas precalificados" },
    services: { janitorial: "servicios de limpieza", "grass-cutting": "corte de césped", snow: "remoción de nieve y esparcido de arena" } as Record<FacilityService, string>,
    Services: { janitorial: "Servicios de limpieza", "grass-cutting": "Corte de césped", snow: "Remoción de nieve y esparcido de arena" } as Record<FacilityService, string>,
    and: "y",
    bca: "Evaluación del estado de edificios",
    project: "nombre del proyecto",
    tradesBlank: "oficios de la lista",
    sitesBlank: "edificios, parques, estacionamientos o calles incluidos",
    startBlank: "fecha de inicio",
    years: (n: number) => (n === 1 ? "1 año" : `${n} años`),
    summary: {
      "facility-services": "{buyer} solicita cotizaciones por escrito para {what} en los sitios indicados abajo, para un contrato de {term}. Se buscan al menos tres cotizaciones.",
      "small-works": "{buyer} solicita precios para {what}. El trabajo se describe abajo; se espera adjudicar al precio más bajo que cumpla todo.",
      consultant: "{buyer} busca un consultor calificado para {what}. Las propuestas se califican por experiencia, enfoque y precio.",
      "standing-offer": "{buyer} prepara una lista de contratistas precalificados para {what}, por {term}. Estar en la lista no garantiza trabajo.",
    } as Record<MuniTemplate, string>,
    heads: { about: "Acerca de esta solicitud:", need: "Lo que necesitamos:", scope: "Alcance del trabajo:", sites: "Sitios incluidos:", term: "Plazo del contrato:", report: "Lo que recibimos:", list: "Cómo funciona la lista:" },
    about: "{buyer} ({province}) es un comprador público. Este documento explica el trabajo, lo que los oferentes deben entregar y cómo se elige.",
    term: "{term}, a partir del {start}, con opción de prorrogar hasta {ext} año(s) más a elección del municipio.",
    termNoExt: "{term}, a partir del {start}.",
    facility: {
      janitorial: [
        "Servicios de limpieza:",
        "- Limpiar los edificios indicados arriba según el horario [Por confirmar: frecuencia de limpieza de cada edificio].",
        "- Proveer toda la mano de obra, el equipo y los productos (productos ecológicos certificados y de bajo olor cuando sea posible).",
        "- Baños, pisos, basura y reciclaje, entradas y superficies de mucho contacto en cada visita.",
        "- Las llaves y los códigos de alarma quedan con personal designado; verificación de antecedentes penales para quien trabaje en edificios municipales [Por confirmar: verificaciones exigidas].",
        "- Precio por edificio por mes, más una tarifa por hora para limpieza adicional a solicitud.",
      ],
      "grass-cutting": [
        "Corte y recorte de césped:",
        "- Cortar, recortar y soplar los parques, cementerios y camellones indicados arriba [Por confirmar: superficie aproximada de cada sitio].",
        "- Temporada: [Por confirmar: fechas de inicio y fin].",
        "- Cortar cuando el césped alcance [Por confirmar: altura], o al menos cada [Por confirmar: número de días].",
        "- Precio por corte por sitio, más una tarifa por hora para trabajo adicional a solicitud.",
      ],
      snow: [
        "Remoción de nieve y esparcido de arena:",
        "- Quitar la nieve y esparcir arena o sal en los estacionamientos, banquetas y entradas indicados arriba.",
        "- Empezar cuando la nieve alcance [Por confirmar: espesor]; sitios despejados antes de [Por confirmar: hora].",
        "- Proveer y esparcir [Por confirmar: arena, sal o mezcla] sobre el hielo, dentro de [Por confirmar: tiempo de respuesta] tras una llamada.",
        "- Llevar un registro de cada visita (fecha, hora, trabajo hecho) y compartirlo con el municipio a solicitud.",
        "- Precio por evento o por temporada para cada sitio (indique cuál), más tarifas por hora del equipo.",
      ],
    } as Record<FacilityService, string[]>,
    works: [
      "- Proveer toda la mano de obra, los materiales, el equipo y la supervisión para el trabajo descrito arriba.",
      "- Planos o especificaciones: [Por confirmar: documentos adjuntos o enlace].",
      "- Obtener y pagar los permisos e inspecciones que necesite el trabajo.",
      "- Proteger el edificio, al público y al personal municipal; mantener seguras y abiertas las áreas públicas cuando sea posible.",
      "- Limpiar a diario y desechar los escombros conforme a la ley.",
      "- Garantía: al menos un año sobre la mano de obra [Por confirmar: periodo de garantía], más las garantías de los fabricantes, y notas finales de obra.",
    ],
    consultant: [
      "- Visitar y evaluar cada edificio indicado arriba: estructura, envolvente y techo, sistemas mecánicos, eléctricos y de plomería, seguridad contra incendios y accesibilidad.",
      "- Revisar los documentos que entregue el municipio [Por confirmar: planos e informes anteriores disponibles].",
      "- Calificar el estado de cada componente y estimar su vida útil restante.",
      "- Preparar un plan de inversiones (reparaciones y reemplazos) con costos estimados a [Por confirmar: número] años, por orden de prioridad.",
    ],
    consultantReport: [
      "- Un informe preliminar y luego un informe final tras los comentarios del municipio.",
      "- El plan de inversiones en una hoja de cálculo que el municipio pueda actualizar.",
      "- Una breve presentación al personal o al concejo [Por confirmar: presentación requerida].",
    ],
    standing: [
      "- Los contratistas que cumplan los requisitos de abajo se agregan a la lista por {term}.",
      "- Cuando surja un trabajo, el municipio pide precio a los contratistas de la lista [Por confirmar: por turno, o cotizaciones de varios contratistas de la lista].",
      "- Las tarifas por hora, las tarifas de equipo y el margen sobre materiales que presente ahora se aplican durante todo el plazo [Por confirmar: ajuste anual de precios].",
      "- Estar en la lista no garantiza trabajo, y el municipio puede comprar fuera de la lista si su reglamento lo permite.",
    ],
    insurance: (amount: string) => `Seguro de responsabilidad civil general de al menos ${amount} por siniestro [Por confirmar: monto], con {buyer} como asegurado adicional; certificado antes de empezar el trabajo.`,
    auto: "Seguro de responsabilidad civil de automóviles de al menos $2,000,000 [Por confirmar: monto] para los vehículos y el equipo usados.",
    professional: "Seguro de responsabilidad profesional (errores y omisiones) de al menos $2,000,000 por reclamo [Por confirmar: monto].",
    references: "Tres referencias de trabajos similares en los últimos tres años, municipales o comerciales.",
    equipment: "La lista del equipo que usará y cómo cubre una avería.",
    licensed: "El trabajo lo dirige un ingeniero o arquitecto con licencia en {province} [Por confirmar: especialidad requerida].",
    tradeLicences: "Las licencias que necesitan los oficios en {province} [Por confirmar: p. ej., licencias de electricidad o gas].",
    submit: {
      how: "Envíe su precio en PMRFP a más tardar el {deadline} [Por confirmar: hora de cierre, p. ej., 2:00 p. m., hora local]. No se aceptan entregas tardías.",
      include: "Incluya: su precio (con el formulario o la tabla de precios de este documento), su certificado de seguro (o una carta de su aseguradora), su certificado de compensación laboral y sus referencias.",
      includeProposal: "Incluya: una propuesta breve (equipo, enfoque, calendario), sus honorarios, su certificado de seguro (o una carta de su aseguradora), su certificado de compensación laboral y sus referencias.",
      includeList: "Incluya: los datos de su empresa, tarifas por hora por tipo de trabajador, tarifas de equipo, su margen sobre materiales, su tiempo de respuesta de emergencia, su certificado de seguro, su certificado de compensación laboral y sus referencias.",
      questions: "Haga sus preguntas por escrito en PMRFP a más tardar el {qdeadline}. Las respuestas se publican en el anuncio para todos los oferentes, sin el nombre de quien preguntó. Todo cambio se publica como una adenda numerada en el anuncio.",
      siteVisit: "Visita al sitio: {date} [Por confirmar: hora y punto de encuentro]. Es opcional, pero se recomienda.",
      siteVisitAsk: "Se puede organizar una visita al sitio para los oferentes interesados [Por confirmar: cómo reservarla].",
      award: "El municipio puede aceptar cualquier cotización, adjudicar por sitio o en parte, o no adjudicar, según lo permita su reglamento de compras. No existe contrato hasta que el municipio lo confirme por escrito.",
      conflict: "Declare cualquier conflicto de interés con el personal o los miembros del concejo.",
      asOf: "Cláusulas vigentes a {asOf}.",
    },
    eval: {
      price: "Precio más bajo que cumpla todos los requisitos",
      priceSite: "Precio más bajo que cumpla todo, por sitio o en total [Por confirmar: cómo se comparan las cotizaciones]",
      consultant: ["Experiencia pertinente y referencias (30 %)", "Enfoque y plan de trabajo (30 %)", "Calendario (10 %)", "Honorarios (30 %)"],
      list: ["Cumple todos los requisitos (aprueba o no aprueba)", "Experiencia y referencias", "Tarifas [Por confirmar: cómo se califican las tarifas]"],
      weights: "[Por confirmar: ponderación]",
    },
    questions: {
      "facility-services": ["¿Cuál es su precio por sitio y qué incluye?", "¿Qué equipo y cuánto personal usará, y cómo cubre una avería o una ausencia?", "¿Cómo registra cada visita y en cuánto tiempo puede atender una llamada?", "¿Qué contratos municipales o comerciales similares ha tenido recientemente?"],
      "small-works": ["¿Cuál es su calendario desde la firma hasta la terminación?", "¿Qué partes del trabajo subcontratará, si alguna, y a quién?", "¿Qué garantía ofrece sobre la mano de obra y los materiales?", "¿Cómo mantendrá seguros al público y al personal mientras el edificio siga abierto?"],
      consultant: ["¿Quién dirigirá la evaluación y qué trabajos municipales similares ha hecho?", "¿Cuántas visitas al sitio prevé y cuánto durarán?", "¿Cómo estima los costos del plan de inversiones?", "¿Cuándo recibiríamos los informes preliminar y final?"],
      "standing-offer": ["¿Qué oficios y zonas cubre, y en cuánto tiempo atiende una llamada urgente?", "¿Cuáles son sus tarifas por hora por tipo de trabajador y su margen sobre materiales?", "¿Quién será el contacto del municipio en su empresa?", "¿Qué trabajos municipales o comerciales similares ha hecho recientemente?"],
    } as Record<MuniTemplate, string[]>,
  },
} as const;

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

function fmtDay(iso: string, lang: WriterLang): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(LOCALE_TAG[lang], { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Question cut-off when the town didn't pick one: 5 days before closing, never in the past. */
export function defaultQuestionDeadline(closing: string, today: string = new Date().toISOString().slice(0, 10)): string {
  const d = new Date(`${closing}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 5);
  const iso = d.toISOString().slice(0, 10);
  return iso < today ? (today < closing ? today : closing) : iso;
}

function list(items: string[], and: string): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/** Which threshold applies: construction for small works, goods and services otherwise. */
export function thresholdKind(template: MuniTemplate): "construction" | "goodsServices" {
  return template === "small-works" ? "construction" : "goodsServices";
}

/** The kind of post this draft becomes on PMRFP (a quote request; above the thresholds the town mirrors the official posting instead). */
export const WRITER_POST_KIND = "quote_request" as const;

function composeIn(lang: WriterLang, input: MunicipalInput): RfpDraft {
  const T = TEXT[lang];
  const pack = packFor(input.province);
  const province = PROVINCE_NAME[input.province][lang];
  const buyer = input.buyerName.trim();
  const b = (s: string) => fill(s, { buyer, province });
  const services = (input.services ?? []) as FacilityService[];
  const project = input.projectName?.trim() || confirmBlank(lang, T.project);
  const term = T.years(input.termYears ?? (input.template === "standing-offer" ? 3 : 1));
  const construction = input.template === "small-works";
  const tradeWork = construction || input.template === "standing-offer";

  // Title and the "what" of the summary.
  const doc =
    input.template === "facility-services" ? T.doc.rfq : input.template === "small-works" ? (input.docType === "rft" ? T.doc.rft : T.doc.rfq) : input.template === "consultant" ? T.doc.rfp : T.doc.call;
  const subject =
    input.template === "facility-services"
      ? list(services.map((s) => T.Services[s]).map((s, i) => (i ? s.charAt(0).toLowerCase() + s.slice(1) : s)), T.and)
      : input.template === "consultant"
        ? input.projectName?.trim() || T.bca
        : input.template === "standing-offer"
          ? input.trades?.trim() || confirmBlank(lang, T.tradesBlank)
          : project;
  // Mid-sentence: "Arena roof replacement" → "arena roof replacement" (acronyms like "HVAC" stay).
  const midSentence = (s: string) => (/^\p{Lu}\p{Ll}/u.test(s) ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s);
  const what =
    input.template === "facility-services"
      ? list(services.map((s) => T.services[s]), T.and)
      : input.template === "consultant"
        ? midSentence(input.projectName?.trim() || T.bca)
        : midSentence(subject);
  const title = `${doc}: ${subject} — ${buyer}`;
  const termYears = input.termYears ?? (input.template === "standing-offer" ? 3 : 1);
  // "a 2-year contract" in English; "un contrat de 2 ans" / "un contrato de 2 años" read fine as is.
  const summary = fill(T.summary[input.template], { buyer, what, term: lang === "en" && input.template === "facility-services" ? `${termYears}-year` : term });

  // Scope.
  const sites = input.sites?.trim() ? input.sites.trim() : confirmBlank(lang, T.sitesBlank);
  const scope: string[] = [
    `${T.heads.about}\n${b(T.about)}`,
    `${T.heads.need}\n${tidyUserText(input.description, { city: undefined, province: undefined }, lang)}`,
    `${T.heads.sites}\n${sites}`,
  ];
  if (input.template === "facility-services") scope.push(services.map((s) => T.facility[s].join("\n")).join("\n\n"));
  if (input.template === "small-works") scope.push(`${T.heads.scope}\n${T.works.join("\n")}`);
  if (input.template === "consultant") scope.push(`${T.heads.scope}\n${T.consultant.join("\n")}`, `${T.heads.report}\n${T.consultantReport.join("\n")}`);
  if (input.template === "standing-offer") scope.push(`${T.heads.list}\n${T.standing.map((l) => fill(l, { term })).join("\n")}`);
  if (input.template !== "consultant") {
    const start = input.startDate ? fmtDay(input.startDate, lang) : confirmBlank(lang, T.startBlank);
    const ext = input.extensionYears ?? 0;
    if (input.template !== "small-works") scope.push(`${T.heads.term}\n${fill(ext > 0 ? T.term : T.termNoExt, { term, start, ext })}`);
  }
  // Never the sample site facts: visible blanks to confirm.
  if (input.template !== "consultant") scope.push(siteAccessBlock(lang, { occupied: undefined }));

  // Requirements: insurance first, then the province pack.
  const cgl = input.insurance ?? (construction ? 5_000_000 : 2_000_000);
  const req: string[] = [b(T.insurance(money(cgl, lang)))];
  if (input.template === "facility-services" && services.includes("snow")) req.push(T.auto);
  if (construction) req.push(T.auto);
  if (input.template === "consultant") req.push(T.professional);
  req.push(pack.workersComp[lang]);
  if (tradeWork) req.push(SAFETY_ROLE[pack.safetyRole ?? "blank"][lang]);
  if (tradeWork && pack.rbq) req.push(RBQ_CLAUSE[lang]);
  if (tradeWork) req.push(fill(T.tradeLicences, { province }));
  if (input.template === "consultant") req.push(fill(T.licensed, { province }));
  req.push((pack.accessibility ?? ACCESSIBILITY_BLANK)[lang]);
  if (input.template === "facility-services" || input.template === "standing-offer") req.push(T.equipment);
  req.push(T.references);
  if (input.bidSecurity) req.push(...bidSecurityClauses(lang, construction));

  // Submission, terms and the by-law.
  const deadline = fmtDay(input.bidDeadline, lang);
  const qdeadline = fmtDay(input.questionDeadline ?? defaultQuestionDeadline(input.bidDeadline), lang);
  const sub: string[] = [
    fill(T.submit.how, { deadline }),
    input.template === "consultant" ? T.submit.includeProposal : input.template === "standing-offer" ? T.submit.includeList : T.submit.include,
    fill(T.submit.questions, { qdeadline }),
  ];
  if (input.siteVisit) sub.push(input.siteVisitDate ? fill(T.submit.siteVisit, { date: fmtDay(input.siteVisitDate, lang) }) : T.submit.siteVisitAsk);
  if (construction) sub.push(pack.payment[lang], pack.contractForm[lang]);
  // Local preference: only when asked, never where it's prohibited, always with the threshold rule.
  if (input.localPreference && localPreferenceAllowed(input.province)) {
    const clause = localPreferenceClause(lang, input.province);
    if (clause) sub.push(clause);
  }
  if (packFor(input.province).language === "bilingual_option" && input.bilingual) sub.push(BILINGUAL_CLAUSE[lang]);
  sub.push(T.submit.award, T.submit.conflict, bylawClause(lang, input.bylawRef), fill(T.submit.asOf, { asOf: CLAUSES_AS_OF }));

  const evaluation =
    input.template === "consultant"
      ? [...T.eval.consultant, T.eval.weights]
      : input.template === "standing-offer"
        ? [...T.eval.list]
        : [input.template === "facility-services" ? T.eval.priceSite : T.eval.price];

  const draft: RfpDraft = {
    title,
    summary,
    scope: scope.join("\n\n"),
    requirements: req.map((r) => `- ${r}`).join("\n"),
    submissionInstructions: sub.join("\n"),
    evaluationCriteria: evaluation,
    questionsForBidders: [...T.questions[input.template]],
  };

  // #170's last pass: no invented site facts, no [X]%, the buyer's own words once.
  const asWizard = {
    description: input.description,
    size: input.sites,
    city: undefined,
    // The RBQ line comes from the clause pack, only for trade work (not janitorial or a consultant).
    province: tradeWork && pack.rbq ? "Quebec" : undefined,
    lang,
  } as unknown as WizardInput;
  return finalizeDraft(draft, asWizard, { lang, structuredSummary: summary });
}

/**
 * The town's document: in the page's language, in French for Quebec, or in
 * both English and French for a New Brunswick town that asks.
 */
export function composeMunicipal(input: MunicipalInput): MunicipalDraft {
  const doc = documentLanguage(input.province, input.lang ?? "en", input.bilingual);
  const threshold = thresholdCheck(input.province, input.estimatedValue ?? null, thresholdKind(input.template));
  const localPreferenceRefused = Boolean(input.localPreference && !localPreferenceAllowed(input.province));
  const meta = { clausesAsOf: CLAUSES_AS_OF, threshold, localPreferenceRefused };
  if (!doc.bilingual) return { ...composeIn(doc.lang, input), lang: doc.lang, bilingual: false, ...meta };
  const en = composeIn("en", input);
  const fr = composeIn("fr", input);
  const both = (a: string, c: string) => `${a}\n\n— Version française —\n\n${c}`;
  return {
    title: `${en.title} / ${fr.title}`,
    summary: `${en.summary}\n\n${fr.summary}`,
    scope: both(en.scope, fr.scope),
    requirements: both(en.requirements, fr.requirements),
    submissionInstructions: both(en.submissionInstructions, fr.submissionInstructions),
    evaluationCriteria: en.evaluationCriteria.map((c, i) => `${c} / ${fr.evaluationCriteria[i] ?? ""}`.replace(/ \/ $/, "")),
    questionsForBidders: en.questionsForBidders.map((q, i) => `${q} / ${fr.questionsForBidders[i] ?? ""}`.replace(/ \/ $/, "")),
    lang: "en",
    bilingual: true,
    ...meta,
  };
}
