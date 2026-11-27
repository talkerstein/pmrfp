/**
 * The welcome email sent when onboarding completes, and the "you're live"
 * email sent when an admin approves a listing. Pure, in the member's language;
 * the sending is in lib/email/send.
 */
import { localizePath, type Locale } from "@/i18n/config";
import { emailButton, escHtml } from "@/lib/email/parts";
import type { BuiltEmail } from "@/lib/pm-jobs/email-copy";

export type WelcomeKind = "trade" | "supplier" | "property_manager" | "general_contractor" | "landlord";

export interface WelcomeInput {
  base: string;
  lang: Locale;
  kind: WelcomeKind;
  name?: string | null;
  companyName: string;
  profileSlug?: string | null;
  /** In the directory right now, with trades and areas filled in. */
  live?: boolean;
  /** Waiting on a person at PMRFP (pending_review). */
  pending?: boolean;
  tradeSlug?: string | null;
  /** Same-day job emails are on (PM_JOB_ALERTS_ENABLED). Off, posters aren't promised them. */
  sameDayAlerts: boolean;
}

const TOOL_PATHS = {
  insurance: "/pm-dashboard/vendor-insurance",
  bids: "/pm-dashboard/bid-comparisons",
  contracts: "/pm-dashboard/contracts",
  roster: "/pm-dashboard/roster",
} as const;

type ToolKey = keyof typeof TOOL_PATHS;
/** Wraps a label in a link. */
type A = (label: string) => string;

const COPY: Record<Locale, {
  title: (first: string | null) => string;
  live: { trade: (name: string, see: A) => string; supplier: (name: string, see: A) => string };
  pending: (name: string) => string;
  incomplete: { trade: (name: string) => string; supplier: (name: string) => string };
  project: string;
  projectCta: string;
  work: (a: A) => string;
  supplierStep: string;
  supplierCta: string;
  supplierWork: (a: A) => string;
  gc: (sameDay: boolean) => string;
  gcCta: string;
  landlord: (sameDay: boolean) => string;
  landlordCta: string;
  landlordWriter: (a: A) => string;
  pm: (sameDay: boolean) => string;
  pmCta: string;
  pmWriter: (a: A) => string;
  toolsIntro: string;
  tools: Record<ToolKey, [label: string, what: string]>;
  footListing: string;
  footBuyer: string;
  approved: { subject: string; title: string; body: (name: string, see: A) => string; next: string; cta: string; signIn: (a: A) => string };
}> = {
  en: {
    title: (first) => (first ? `Welcome to PMRFP, ${first}` : "Welcome to PMRFP"),
    live: {
      trade: (name, see) => `<strong>${name}</strong> is now listed in the PMRFP directory, where property managers look for trades: ${see("see your profile")}.`,
      supplier: (name, see) => `<strong>${name}</strong> is now listed on PMRFP, where property managers and contractors look for suppliers: ${see("see your page")}.`,
    },
    pending: (name) => `We're reviewing <strong>${name}</strong>. It isn't public yet, and we'll email you as soon as it's live.`,
    incomplete: {
      trade: (name) => `<strong>${name}</strong> is set up. Add the trades and areas you cover so property managers can find you.`,
      supplier: (name) => `<strong>${name}</strong> is set up. Add what you supply and the areas you cover so buyers can find you.`,
    },
    project: "<strong>Your best next step:</strong> add a project. Snap before-and-after photos of a job you're proud of, type one sentence, and PMRFP writes it up for your profile.",
    projectCta: "Add your first project",
    work: (a) => `Then see the open tenders in your trade: ${a("browse open work")}. Trade Pro ($249 a year) opens the full details and emails you every new match each morning.`,
    supplierStep: "<strong>Your best next step:</strong> finish your company page: your logo, a short description of what you supply, and a phone number.",
    supplierCta: "Finish your company page",
    supplierWork: (a) => `You can also ${a("see the open tenders")}.`,
    gc: (sameDay) => `Post each sub-trade package for free, for example "Roofing package, quotes due Oct 10". ${sameDay ? "Matching local trades are emailed the same day it's published and send you quotes." : "Once it's published, local trades can send you quotes."} Their profiles show photos of past work and reviews.`,
    gcCta: "Post a sub-trade package",
    landlord: (sameDay) => `Need a roof patched, a boiler serviced, or a unit turned over? Post the job on PMRFP for free, once. ${sameDay ? "Matching local trades are emailed the same day it's published and send you their price" : "Once it's published, local trades can send you their price"}, so you're not chasing quotes one call at a time.`,
    landlordCta: "Post your first repair or maintenance job",
    landlordWriter: (a) => `Not sure how to describe it? The ${a("free RFP writer")} drafts one for you. You can also invite the trades you already use from your dashboard.`,
    pm: (sameDay) => `Posting an RFP on PMRFP is free. Describe the job once, and ${sameDay ? "matching local trades are emailed the same day it's published and send you their price." : "once it's published, local trades can send you their price."}`,
    pmCta: "Post your first RFP",
    pmWriter: (a) => `Not sure how to write it? The ${a("free RFP writer")} drafts one for you.`,
    toolsIntro: "Also free in your account:",
    tools: {
      insurance: ["Vendor insurance tracker", "see whose coverage is about to run out"],
      bids: ["Bid comparison sheet", "line up quotes side by side"],
      contracts: ["Contract renewal calendar", "see which contracts are coming up for renewal"],
      roster: ["After-hours vendor roster", "who to call when something breaks after hours"],
    },
    footListing: "PMRFP helps you find work and get found. It doesn't guarantee contracts.",
    footBuyer: "PMRFP doesn't guarantee responses or work; check each company's licences and insurance before you hire.",
    approved: {
      subject: "Your PMRFP listing is live",
      title: "Your listing is live",
      body: (name, see) => `<strong>${name}</strong> is approved and now shows in the PMRFP directory: ${see("see your public page")}.`,
      next: "<strong>One thing to do next:</strong> property managers hire companies they can check, so add your logo, a short description and your insurance details.",
      cta: "Finish your profile",
      signIn: (a) => `No password handy? ${a("The sign-in page")} can email you a link.`,
    },
  },
  fr: {
    title: (first) => (first ? `Bienvenue sur PMRFP, ${first}` : "Bienvenue sur PMRFP"),
    live: {
      trade: (name, see) => `<strong>${name}</strong> figure maintenant dans le répertoire PMRFP, où les gestionnaires immobiliers cherchent des entrepreneurs : ${see("voir votre profil")}.`,
      supplier: (name, see) => `<strong>${name}</strong> figure maintenant sur PMRFP, où les gestionnaires immobiliers et les entrepreneurs cherchent des fournisseurs : ${see("voir votre page")}.`,
    },
    pending: (name) => `Nous vérifions la fiche de <strong>${name}</strong>. Elle n'est pas encore publique, et nous vous écrirons dès qu'elle sera en ligne.`,
    incomplete: {
      trade: (name) => `Le compte de <strong>${name}</strong> est créé. Ajoutez vos métiers et vos territoires pour que les gestionnaires immobiliers vous trouvent.`,
      supplier: (name) => `Le compte de <strong>${name}</strong> est créé. Ajoutez ce que vous fournissez et vos territoires pour que les acheteurs vous trouvent.`,
    },
    project: "<strong>Votre meilleure prochaine étape :</strong> ajoutez un projet. Prenez des photos avant et après d'un beau chantier, écrivez une phrase, et PMRFP rédige la description pour votre profil.",
    projectCta: "Ajouter votre premier projet",
    work: (a) => `Consultez ensuite les appels d'offres ouverts dans votre métier : ${a("voir les occasions")}. Trade Pro (249 $ par année) donne accès à tous les détails et vous envoie chaque matin les nouvelles occasions.`,
    supplierStep: "<strong>Votre meilleure prochaine étape :</strong> complétez votre page : votre logo, une courte description de ce que vous fournissez et un numéro de téléphone.",
    supplierCta: "Compléter votre page",
    supplierWork: (a) => `Vous pouvez aussi ${a("voir les appels d'offres ouverts")}.`,
    gc: (sameDay) => `Publiez gratuitement chaque lot de sous-traitance, par exemple « Lot toiture, soumissions dues le 10 octobre ». ${sameDay ? "Les entrepreneurs locaux du métier reçoivent un courriel le jour même de la publication et vous envoient leurs soumissions." : "Une fois le lot publié, les entrepreneurs locaux peuvent vous envoyer leurs soumissions."} Leurs profils montrent des photos de travaux passés et des avis.`,
    gcCta: "Publier un lot de sous-traitance",
    landlord: (sameDay) => `Un toit à réparer, une chaudière à entretenir, un logement à remettre en état ? Publiez le travail une seule fois sur PMRFP, gratuitement. ${sameDay ? "Les entrepreneurs locaux du métier reçoivent un courriel le jour même de la publication et vous envoient leur prix" : "Une fois le travail publié, les entrepreneurs locaux peuvent vous envoyer leur prix"} : plus besoin de courir après les soumissions un appel à la fois.`,
    landlordCta: "Publier votre premier travail",
    landlordWriter: (a) => `Vous ne savez pas comment le décrire ? Le ${a("rédacteur d'appels d'offres gratuit")} le rédige pour vous. Vous pouvez aussi inviter vos entrepreneurs habituels depuis votre tableau de bord.`,
    pm: (sameDay) => `Publier un appel d'offres sur PMRFP est gratuit. Décrivez le travail une seule fois, et ${sameDay ? "les entrepreneurs locaux du métier reçoivent un courriel le jour même de la publication et vous envoient leur prix." : "une fois l'appel d'offres publié, les entrepreneurs locaux peuvent vous envoyer leur prix."}`,
    pmCta: "Publier votre premier appel d'offres",
    pmWriter: (a) => `Vous ne savez pas comment le rédiger ? Le ${a("rédacteur d'appels d'offres gratuit")} le fait pour vous.`,
    toolsIntro: "Aussi gratuit dans votre compte :",
    tools: {
      insurance: ["Suivi des assurances des fournisseurs", "voyez quelles couvertures arrivent à échéance"],
      bids: ["Tableau comparatif des soumissions", "comparez les prix côte à côte"],
      contracts: ["Calendrier des renouvellements de contrats", "voyez quels contrats arrivent à renouvellement"],
      roster: ["Liste des fournisseurs d'urgence", "qui appeler quand un bris survient après les heures"],
    },
    footListing: "PMRFP vous aide à trouver du travail et à être trouvé. PMRFP ne garantit pas de contrats.",
    footBuyer: "PMRFP ne garantit ni réponse ni contrat; vérifiez les licences et les assurances de chaque entreprise avant d'embaucher.",
    approved: {
      subject: "Votre fiche PMRFP est en ligne",
      title: "Votre fiche est en ligne",
      body: (name, see) => `La fiche de <strong>${name}</strong> est approuvée et figure maintenant dans le répertoire PMRFP : ${see("voir votre page publique")}.`,
      next: "<strong>Une chose à faire ensuite :</strong> les gestionnaires immobiliers embauchent des entreprises qu'ils peuvent vérifier. Ajoutez votre logo, une courte description et vos assurances.",
      cta: "Compléter votre profil",
      signIn: (a) => `Pas de mot de passe sous la main ? ${a("La page de connexion")} peut vous envoyer un lien par courriel.`,
    },
  },
  es: {
    title: (first) => (first ? `Le damos la bienvenida a PMRFP, ${first}` : "Le damos la bienvenida a PMRFP"),
    live: {
      trade: (name, see) => `<strong>${name}</strong> ya aparece en el directorio de PMRFP, donde los administradores de propiedades buscan contratistas: ${see("ver su perfil")}.`,
      supplier: (name, see) => `<strong>${name}</strong> ya aparece en PMRFP, donde los administradores de propiedades y los contratistas buscan proveedores: ${see("ver su página")}.`,
    },
    pending: (name) => `Estamos revisando la página de <strong>${name}</strong>. Aún no es pública; le avisaremos por correo en cuanto esté publicada.`,
    incomplete: {
      trade: (name) => `La cuenta de <strong>${name}</strong> está lista. Agregue sus oficios y sus zonas para aparecer en las búsquedas de los administradores de propiedades.`,
      supplier: (name) => `La cuenta de <strong>${name}</strong> está lista. Agregue lo que suministra y sus zonas para aparecer en las búsquedas.`,
    },
    project: "<strong>Su mejor siguiente paso:</strong> agregue un proyecto. Tome fotos del antes y el después de un buen trabajo, escriba una frase, y PMRFP redacta la descripción para su perfil.",
    projectCta: "Agregar su primer proyecto",
    work: (a) => `Después vea las licitaciones abiertas en su oficio: ${a("ver oportunidades")}. Trade Pro ($249 al año) abre todos los detalles y le envía cada mañana las nuevas oportunidades.`,
    supplierStep: "<strong>Su mejor siguiente paso:</strong> complete su página: su logo, una breve descripción de lo que suministra y un teléfono.",
    supplierCta: "Completar su página",
    supplierWork: (a) => `También puede ${a("ver las licitaciones abiertas")}.`,
    gc: (sameDay) => `Publique gratis cada paquete de subcontratación, por ejemplo "Paquete de techos, cotizaciones antes del 10 de octubre". ${sameDay ? "Los contratistas locales de ese oficio reciben un correo el mismo día de la publicación y le envían cotizaciones." : "Una vez publicado, los contratistas locales pueden enviarle cotizaciones."} Sus perfiles muestran fotos de trabajos anteriores y reseñas.`,
    gcCta: "Publicar un paquete de subcontratación",
    landlord: (sameDay) => `¿Necesita reparar un techo, dar servicio a una caldera o preparar una unidad? Publique el trabajo una vez en PMRFP, gratis. ${sameDay ? "Los contratistas locales de ese oficio reciben un correo el mismo día de la publicación y le envían su precio" : "Una vez publicado, los contratistas locales pueden enviarle su precio"}, así no tiene que buscar cotizaciones llamada por llamada.`,
    landlordCta: "Publicar su primer trabajo",
    landlordWriter: (a) => `¿No sabe cómo describirlo? El ${a("redactor de RFP gratis")} lo redacta por usted. También puede invitar a los contratistas que ya usa desde su panel.`,
    pm: (sameDay) => `Publicar una RFP en PMRFP es gratis. Describa el trabajo una vez, y ${sameDay ? "los contratistas locales de ese oficio reciben un correo el mismo día de la publicación y le envían su precio." : "una vez publicada, los contratistas locales pueden enviarle su precio."}`,
    pmCta: "Publicar su primera RFP",
    pmWriter: (a) => `¿No sabe cómo redactarla? El ${a("redactor de RFP gratis")} lo hace por usted.`,
    toolsIntro: "También gratis en su cuenta:",
    tools: {
      insurance: ["Registro de seguros de proveedores", "vea qué coberturas están por vencer"],
      bids: ["Cuadro comparativo de ofertas", "compare precios lado a lado"],
      contracts: ["Calendario de renovación de contratos", "vea qué contratos están por renovarse"],
      roster: ["Lista de proveedores de emergencia", "a quién llamar cuando algo falla fuera de horario"],
    },
    footListing: "PMRFP le ayuda a encontrar trabajo y a que lo encuentren. No garantiza contratos.",
    footBuyer: "PMRFP no garantiza respuestas ni trabajos; verifique las licencias y los seguros de cada empresa antes de contratar.",
    approved: {
      subject: "Su página en PMRFP ya está publicada",
      title: "Su página ya está publicada",
      body: (name, see) => `La página de <strong>${name}</strong> fue aprobada y ya aparece en el directorio de PMRFP: ${see("ver su página pública")}.`,
      next: "<strong>Lo siguiente:</strong> los administradores de propiedades contratan a empresas que pueden verificar. Agregue su logo, una breve descripción y su seguro.",
      cta: "Completar su perfil",
      signIn: (a) => `¿No tiene su contraseña a mano? ${a("La página de inicio de sesión")} puede enviarle un enlace por correo.`,
    },
  },
};

const anchor = (href: string): A => (label) => `<a href="${href}" style="color:#282B59">${label}</a>`;

/** One clear next step per kind of member, in their language. Trades and suppliers hear where their listing stands. */
export function welcomeEmail(i: WelcomeInput): BuiltEmail {
  const c = COPY[i.lang];
  const url = (path: string) => `${i.base}${localizePath(path, i.lang)}`;
  const first = i.name?.trim().split(/\s+/)[0] || null;
  const name = escHtml(i.companyName);
  const writer = anchor(url("/rfp-writer"));
  const toolList = () =>
    `<p style="margin:16px 0 4px"><strong>${c.toolsIntro}</strong></p>
       <ul style="margin:0;padding-left:20px">${(Object.keys(TOOL_PATHS) as ToolKey[])
         .map((k) => `<li style="margin:4px 0">${anchor(url(TOOL_PATHS[k]))(c.tools[k][0])}: ${c.tools[k][1]}</li>`)
         .join("")}</ul>`;

  let body: string;
  if (i.kind === "trade" || i.kind === "supplier") {
    const supplier = i.kind === "supplier";
    const profile = anchor(url(i.profileSlug ? `/directory/${i.profileSlug}` : "/dashboard"));
    const status = i.live
      ? (supplier ? c.live.supplier : c.live.trade)(name, profile)
      : i.pending
        ? c.pending(name)
        : (supplier ? c.incomplete.supplier : c.incomplete.trade)(name);
    const open = anchor(url(`/rfps${i.tradeSlug ? `?category=${i.tradeSlug}` : ""}`));
    body = supplier
      ? `<p>${status}</p>
       <p style="margin:16px 0 4px">${c.supplierStep}</p>
       <p>${emailButton(url("/dashboard/company"), c.supplierCta)}</p>
       <p style="margin:16px 0 0">${c.supplierWork(open)}</p>`
      : `<p>${status}</p>
       <p style="margin:16px 0 4px">${c.project}</p>
       <p>${emailButton(url("/dashboard/projects/new"), c.projectCta)}</p>
       <p style="margin:16px 0 0">${c.work(open)}</p>`;
  } else if (i.kind === "general_contractor") {
    body = `<p>${c.gc(i.sameDayAlerts)}</p>
       <p>${emailButton(url("/gc-packages/new"), c.gcCta)}</p>`;
  } else if (i.kind === "landlord") {
    body = `<p>${c.landlord(i.sameDayAlerts)}</p>
       <p>${emailButton(url("/pm-dashboard/rfps/new"), c.landlordCta)}</p>
       <p style="margin:16px 0 0">${c.landlordWriter(writer)}</p>
       ${toolList()}`;
  } else {
    body = `<p>${c.pm(i.sameDayAlerts)}</p>
       <p>${emailButton(url("/pm-dashboard/rfps/new"), c.pmCta)}</p>
       <p style="margin:16px 0 0">${c.pmWriter(writer)}</p>
       ${toolList()}`;
  }

  return {
    subject: c.title(first),
    title: c.title(first ? escHtml(first) : null),
    bodyHtml: body,
    footnote: i.kind === "trade" || i.kind === "supplier" ? c.footListing : c.footBuyer,
  };
}

/** A person at PMRFP approved a listing: it's public now, and what to do next. No pitch. */
export function listingApprovedEmail(i: { base: string; lang: Locale; companyName: string; slug: string | null }): BuiltEmail {
  const c = COPY[i.lang];
  const url = (path: string) => `${i.base}${localizePath(path, i.lang)}`;
  const a = c.approved;
  return {
    subject: a.subject,
    title: a.title,
    bodyHtml: `<p>${a.body(escHtml(i.companyName), anchor(url(i.slug ? `/directory/${i.slug}` : "/dashboard")))}</p>
       <p style="margin:16px 0 4px">${a.next}</p>
       <p>${emailButton(url("/dashboard/company"), a.cta)}</p>
       <p style="margin:16px 0 0">${a.signIn(anchor(url("/sign-in")))}</p>`,
    footnote: c.footListing,
  };
}
