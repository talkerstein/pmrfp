/**
 * Emails of the PM job flow, in English, French and Spanish (pure; the
 * shell and sending are lib/email/send.ts). Every member-typed value is
 * escaped here. Tested in test/unit/pm-job-flow.test.ts.
 *
 *   to the poster  newInterest, published, rejected
 *   to a trade     confirmation, jobAlert (commercial: CASL footer with the
 *                  mailing address and an unsubscribe link), declined, picked,
 *                  notSelected, contactShared
 */
import { localizePath, LOCALE_TAG, type Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { COPY, SITE } from "@/lib/site";
import { emailBox, emailButton, escHtml } from "@/lib/email/parts";
import type { ContactCard } from "./rules";

/** Who posted the job: a property manager (or landlord, owner), a general contractor, or a town (a public buyer). */
export type PosterKind = "pm" | "gc" | "town";

export interface BuiltEmail {
  subject: string;
  title: string;
  bodyHtml: string;
  footnote: string;
}

const COPY_BY_LANG = {
  en: {
    poster: { pm: "the property manager", gc: "the general contractor", town: "the town" },
    Poster: { pm: "The property manager", gc: "The general contractor", town: "The town" },
    labels: { quote: "Quote", estimate: "estimate", firm: "firm price", start: "Can start", notes: "Notes", availability: "Availability", name: "Name", company: "Company", email: "Email", phone: "Phone" },
    seeResponses: "See your responses",
    seeOpen: "See open jobs",
    keepComing: "New jobs in your trades and area keep coming. We'll email you when the next one is posted.",
    respondedFoot: "You're getting this because you responded to this job on PMRFP.",
    newInterest: {
      subject: "New response to your job: {title}",
      title: "A trade responded to your job",
      intro: "<strong>{vendor}</strong> responded to <strong>{title}</strong>.",
      outro: "See their message, quote and company profile, then shortlist, decline or pick a trade. Your contact details stay private until you pick a trade or choose to share them.",
      button: "Review responses",
      foot: "You're getting this because you posted this job on PMRFP. PMRFP doesn't guarantee responses or work; check each company's licences and insurance before you hire.",
    },
    confirmation: {
      subject: "Response sent: {title}",
      title: "Your response was sent",
      body: "We sent your response to <strong>{title}</strong> to {poster}. You'll get an email when they shortlist, pick or decline it. Their contact details are shared once they pick you or choose to share them.",
      left: "You have {left} of {limit} free responses left this month. Trade Pro is unlimited.",
      none: "That was your last free response this month. Trade Pro is unlimited.",
      foot: COPY.interestDisclaimer as string,
    },
    jobAlert: {
      subject: "New {trade} job in {place}: {title}",
      subjectNoPlace: "New {trade} job: {title}",
      subjectNoTrade: "New job in {place}: {title}",
      title: "A new job matches your trades",
      intro: "Posted on PMRFP today, in your trades and area:",
      due: "Responses due {date}",
      noDue: "No fixed deadline",
      free: "Free accounts can respond to {limit} jobs a month. Trade Pro is unlimited.",
      pro: "Your Trade Pro membership lets you respond to as many jobs as you like.",
      town: "Posted by {buyer}. Responding to a town's job is always free and never counts toward your monthly limit.",
      townMirror: "An official tender from {buyer}. Bids go to {portal}; PMRFP shows the summary and the link, free.",
      portal: "its official portal",
      mirrorButton: "See the tender",
      button: "See the job and respond",
      why: "You're receiving this because your company is listed on PMRFP in this trade and area",
      settings: "Change your trades or areas",
      unsubscribe: "Turn off opportunity emails",
    },
    declined: {
      subject: "Update on your response: {title}",
      title: "{Poster} went another way",
      body: "Thanks for responding to <strong>{title}</strong>. {Poster} decided not to go ahead with your response this time.",
      note: "Their note:",
    },
    picked: {
      subject: "You were picked: {title}",
      title: "Good news: you were picked",
      body: "{Poster} picked <strong>{company}</strong> for <strong>{title}</strong>. Here's how to reach them:",
      outro: "Get in touch soon to confirm the scope, schedule and price. PMRFP isn't part of the contract: agree the terms directly with them.",
      foot: "PMRFP connects you; it isn't a party to the work. Confirm scope, insurance and payment terms in writing.",
    },
    notSelected: {
      subject: "{title}: the job went to another company",
      title: "Thanks for responding",
      body: "{Poster} picked another company for <strong>{title}</strong>. Thanks for taking the time to respond.",
    },
    contactShared: {
      subject: "{Poster} shared their contact: {title}",
      title: "You can now contact {poster}",
      body: "{Poster} for <strong>{title}</strong> shared their contact details with <strong>{company}</strong>:",
      outro: "Reach out to talk through the job. They haven't picked a company yet.",
    },
    published: {
      subject: "Your job is live: {title}",
      title: "Your job is published",
      body: "<strong>{title}</strong> is now live on PMRFP.",
      on: "Matching local trades are being emailed today. You'll get an email each time one responds.",
      off: "Trades in that trade and area can now see it and respond. You'll get an email each time one responds.",
      outro: "You stay anonymous until you pick a trade or choose to share your contact.",
      button: "View your listing",
      responses: "Review responses",
      foot: COPY.disclaimer as string,
    },
    rejected: {
      subject: "Your listing wasn't published: {title}",
      title: "We couldn't publish your listing",
      body: "We reviewed <strong>{title}</strong> and didn't publish it.",
      reason: "Reason:",
      outro: "Fix it and post it again any time, or reply to this email if you have a question.",
      button: "Post it again",
      foot: COPY.disclaimer as string,
    },
  },
  fr: {
    poster: { pm: "le gestionnaire immobilier", gc: "l'entrepreneur général", town: "la municipalité" },
    Poster: { pm: "Le gestionnaire immobilier", gc: "L'entrepreneur général", town: "La municipalité" },
    labels: { quote: "Prix", estimate: "estimation", firm: "prix ferme", start: "Peut commencer le", notes: "Notes", availability: "Disponibilité", name: "Nom", company: "Entreprise", email: "Courriel", phone: "Téléphone" },
    seeResponses: "Voir vos réponses",
    seeOpen: "Voir les appels d'offres ouverts",
    keepComing: "De nouveaux appels d'offres arrivent dans vos corps de métier et votre région. Nous vous écrirons dès que le prochain sera publié.",
    respondedFoot: "Vous recevez ce courriel parce que vous avez répondu à cet appel d'offres sur PMRFP.",
    newInterest: {
      subject: "Nouvelle réponse à votre appel d'offres : {title}",
      title: "Un entrepreneur a répondu à votre appel d'offres",
      intro: "<strong>{vendor}</strong> a répondu à <strong>{title}</strong>.",
      outro: "Consultez son message, son prix et son profil, puis présélectionnez, déclinez ou retenez un entrepreneur. Vos coordonnées restent confidentielles jusqu'à ce que vous reteniez un entrepreneur ou choisissiez de les partager.",
      button: "Voir les réponses",
      foot: "Vous recevez ce courriel parce que vous avez publié cet appel d'offres sur PMRFP. PMRFP ne garantit ni réponse ni contrat; vérifiez les licences et les assurances de chaque entreprise avant d'embaucher.",
    },
    confirmation: {
      subject: "Réponse envoyée : {title}",
      title: "Votre réponse a été envoyée",
      body: "Nous avons transmis votre réponse à <strong>{title}</strong> à {poster}. Vous recevrez un courriel s'il la présélectionne, la retient ou la décline. Ses coordonnées vous sont transmises dès qu'il vous retient ou choisit de les partager.",
      left: "Il vous reste {left} de vos {limit} réponses gratuites ce mois-ci. Trade Pro est illimité.",
      none: "C'était votre dernière réponse gratuite ce mois-ci. Trade Pro est illimité.",
      foot: "En manifestant votre intérêt, vous comprenez que PMRFP ne représente aucune des parties à titre de courtier, d'agent d'approvisionnement, de conseiller juridique ou de garant des travaux.",
    },
    jobAlert: {
      subject: "Nouvel appel d'offres en {trade} à {place} : {title}",
      subjectNoPlace: "Nouvel appel d'offres en {trade} : {title}",
      subjectNoTrade: "Nouvel appel d'offres à {place} : {title}",
      title: "Un nouvel appel d'offres correspond à vos corps de métier",
      intro: "Publié aujourd'hui sur PMRFP, dans vos corps de métier et votre région :",
      due: "Réponses attendues d'ici le {date}",
      noDue: "Sans date limite",
      free: "Un compte gratuit peut répondre à {limit} appels d'offres par mois. Trade Pro est illimité.",
      pro: "Votre abonnement Trade Pro vous permet de répondre à autant d'appels d'offres que vous voulez.",
      town: "Publié par {buyer}. Répondre à un appel d'offres municipal est toujours gratuit et ne compte jamais dans votre limite mensuelle.",
      townMirror: "Un appel d'offres officiel de {buyer}. Les soumissions se déposent sur {portal}; PMRFP en affiche le résumé et le lien, gratuitement.",
      portal: "son portail officiel",
      mirrorButton: "Voir l'appel d'offres",
      button: "Voir l'appel d'offres et répondre",
      why: "Vous recevez ce courriel parce que votre entreprise est inscrite sur PMRFP dans ce corps de métier et cette région",
      settings: "Modifier vos corps de métier ou vos régions",
      unsubscribe: "Ne plus recevoir les courriels d'occasions d'affaires",
    },
    declined: {
      subject: "Mise à jour de votre réponse : {title}",
      title: "{Poster} a fait un autre choix",
      body: "Merci d'avoir répondu à <strong>{title}</strong>. {Poster} a décidé de ne pas donner suite à votre réponse cette fois-ci.",
      note: "Son message :",
    },
    picked: {
      subject: "Vous avez été retenu : {title}",
      title: "Bonne nouvelle : vous avez été retenu",
      body: "{Poster} a retenu <strong>{company}</strong> pour <strong>{title}</strong>. Voici comment le joindre :",
      outro: "Communiquez avec lui rapidement pour confirmer la portée des travaux, l'échéancier et le prix. PMRFP n'est pas partie au contrat : entendez-vous directement avec lui sur les conditions.",
      foot: "PMRFP vous met en contact, mais n'est pas partie aux travaux. Confirmez par écrit la portée, les assurances et les modalités de paiement.",
    },
    notSelected: {
      subject: "{title} : le contrat a été confié à une autre entreprise",
      title: "Merci d'avoir répondu",
      body: "{Poster} a retenu une autre entreprise pour <strong>{title}</strong>. Merci d'avoir pris le temps de répondre.",
    },
    contactShared: {
      subject: "{Poster} vous a transmis ses coordonnées : {title}",
      title: "Vous pouvez maintenant joindre {poster}",
      body: "{Poster} de <strong>{title}</strong> a transmis ses coordonnées à <strong>{company}</strong> :",
      outro: "Communiquez avec lui pour discuter des travaux. Il n'a pas encore retenu d'entreprise.",
    },
    published: {
      subject: "Votre appel d'offres est en ligne : {title}",
      title: "Votre appel d'offres est publié",
      body: "<strong>{title}</strong> est maintenant en ligne sur PMRFP.",
      on: "Les entrepreneurs locaux correspondants reçoivent un courriel aujourd'hui. Vous recevrez un courriel chaque fois que l'un d'eux répond.",
      off: "Les entrepreneurs de ce corps de métier et de cette région peuvent maintenant le voir et y répondre. Vous recevrez un courriel chaque fois que l'un d'eux répond.",
      outro: "Vous restez anonyme jusqu'à ce que vous reteniez un entrepreneur ou choisissiez de partager vos coordonnées.",
      button: "Voir votre annonce",
      responses: "Voir les réponses",
      foot: "PMRFP est une plateforme pour publier des appels d'offres et trouver des entrepreneurs. Nous ne garantissons ni la disponibilité des projets, ni le succès des soumissions, ni l'octroi des contrats, ni la réponse des gestionnaires immobiliers, ni les revenus. Les membres sont responsables de leurs propres vérifications, qualifications, assurances, licences, prix et ententes.",
    },
    rejected: {
      subject: "Votre annonce n'a pas été publiée : {title}",
      title: "Nous n'avons pas pu publier votre annonce",
      body: "Nous avons examiné <strong>{title}</strong> et ne l'avons pas publiée.",
      reason: "Raison :",
      outro: "Corrigez-la et publiez-la de nouveau quand vous voulez, ou répondez à ce courriel si vous avez une question.",
      button: "Publier de nouveau",
      foot: "PMRFP est une plateforme pour publier des appels d'offres et trouver des entrepreneurs. Nous ne garantissons ni la disponibilité des projets, ni le succès des soumissions, ni l'octroi des contrats, ni la réponse des gestionnaires immobiliers, ni les revenus. Les membres sont responsables de leurs propres vérifications, qualifications, assurances, licences, prix et ententes.",
    },
  },
  es: {
    poster: { pm: "el administrador de propiedades", gc: "el contratista general", town: "el municipio" },
    Poster: { pm: "El administrador de propiedades", gc: "El contratista general", town: "El municipio" },
    labels: { quote: "Cotización", estimate: "estimado", firm: "precio firme", start: "Puede empezar", notes: "Notas", availability: "Disponibilidad", name: "Nombre", company: "Empresa", email: "Correo electrónico", phone: "Teléfono" },
    seeResponses: "Ver sus respuestas",
    seeOpen: "Ver trabajos abiertos",
    keepComing: "Siguen llegando trabajos nuevos en sus oficios y su zona. Le escribiremos cuando se publique el próximo.",
    respondedFoot: "Recibe este correo porque respondió a este trabajo en PMRFP.",
    newInterest: {
      subject: "Nueva respuesta a su trabajo: {title}",
      title: "Un contratista respondió a su trabajo",
      intro: "<strong>{vendor}</strong> respondió a <strong>{title}</strong>.",
      outro: "Revise su mensaje, su cotización y el perfil de su empresa; después preseleccione, decline o elija a un contratista. Sus datos de contacto se mantienen privados hasta que elija a un contratista o decida compartirlos.",
      button: "Ver respuestas",
      foot: "Recibe este correo porque publicó este trabajo en PMRFP. PMRFP no garantiza respuestas ni trabajo; verifique las licencias y el seguro de cada empresa antes de contratar.",
    },
    confirmation: {
      subject: "Respuesta enviada: {title}",
      title: "Su respuesta fue enviada",
      body: "Enviamos su respuesta a <strong>{title}</strong> a {poster}. Recibirá un correo cuando la preseleccione, la elija o la decline. Sus datos de contacto se comparten cuando lo elija a usted o decida compartirlos.",
      left: "Le quedan {left} de {limit} respuestas gratuitas este mes. Trade Pro es ilimitado.",
      none: "Esa fue su última respuesta gratuita de este mes. Trade Pro es ilimitado.",
      foot: "Al manifestar su interés, usted entiende que PMRFP no representa a ninguna de las partes como corredor, agente de adquisiciones, asesor legal ni garante del trabajo.",
    },
    jobAlert: {
      subject: "Nuevo trabajo de {trade} en {place}: {title}",
      subjectNoPlace: "Nuevo trabajo de {trade}: {title}",
      subjectNoTrade: "Nuevo trabajo en {place}: {title}",
      title: "Un nuevo trabajo coincide con sus oficios",
      intro: "Publicado hoy en PMRFP, en sus oficios y su zona:",
      due: "Respuestas hasta el {date}",
      noDue: "Sin fecha límite",
      free: "Las cuentas gratuitas pueden responder a {limit} trabajos al mes. Trade Pro es ilimitado.",
      pro: "Su membresía Trade Pro le permite responder a todos los trabajos que quiera.",
      town: "Publicado por {buyer}. Responder a un trabajo municipal siempre es gratis y nunca cuenta para su límite mensual.",
      townMirror: "Una licitación oficial de {buyer}. Las ofertas se presentan en {portal}; PMRFP muestra el resumen y el enlace, gratis.",
      portal: "su portal oficial",
      mirrorButton: "Ver la licitación",
      button: "Ver el trabajo y responder",
      why: "Recibe este correo porque su empresa está registrada en PMRFP en este oficio y esta zona",
      settings: "Cambiar sus oficios o zonas",
      unsubscribe: "Dejar de recibir correos de oportunidades",
    },
    declined: {
      subject: "Actualización sobre su respuesta: {title}",
      title: "{Poster} eligió otra opción",
      body: "Gracias por responder a <strong>{title}</strong>. {Poster} decidió no seguir adelante con su respuesta esta vez.",
      note: "Su nota:",
    },
    picked: {
      subject: "Lo eligieron: {title}",
      title: "Buenas noticias: lo eligieron",
      body: "{Poster} eligió a <strong>{company}</strong> para <strong>{title}</strong>. Así puede contactarlo:",
      outro: "Comuníquese pronto para confirmar el alcance, el calendario y el precio. PMRFP no es parte del contrato: acuerde las condiciones directamente con ellos.",
      foot: "PMRFP los pone en contacto, pero no es parte del trabajo. Confirme por escrito el alcance, el seguro y las condiciones de pago.",
    },
    notSelected: {
      subject: "{title}: el trabajo se asignó a otra empresa",
      title: "Gracias por responder",
      body: "{Poster} eligió a otra empresa para <strong>{title}</strong>. Gracias por tomarse el tiempo de responder.",
    },
    contactShared: {
      subject: "{Poster} compartió su contacto: {title}",
      title: "Ya puede contactar a {poster}",
      body: "{Poster} de <strong>{title}</strong> compartió sus datos de contacto con <strong>{company}</strong>:",
      outro: "Comuníquese para hablar del trabajo. Todavía no ha elegido a una empresa.",
    },
    published: {
      subject: "Su trabajo está publicado: {title}",
      title: "Su trabajo está publicado",
      body: "<strong>{title}</strong> ya está en línea en PMRFP.",
      on: "Hoy les enviamos un correo a los contratistas locales que coinciden. Recibirá un correo cada vez que uno responda.",
      off: "Los contratistas de ese oficio y esa zona ya pueden verlo y responder. Recibirá un correo cada vez que uno responda.",
      outro: "Usted se mantiene anónimo hasta que elija a un contratista o decida compartir su contacto.",
      button: "Ver su publicación",
      responses: "Ver respuestas",
      foot: "PMRFP es una plataforma para publicar solicitudes de propuestas y encontrar contratistas. No garantizamos la disponibilidad de proyectos, el éxito de las ofertas, la adjudicación de contratos, la respuesta de los administradores de propiedades ni los ingresos. Los miembros son responsables de su propia diligencia debida, calificaciones, seguros, licencias, precios y acuerdos.",
    },
    rejected: {
      subject: "Su anuncio no se publicó: {title}",
      title: "No pudimos publicar su anuncio",
      body: "Revisamos <strong>{title}</strong> y no lo publicamos.",
      reason: "Motivo:",
      outro: "Corríjalo y vuelva a publicarlo cuando quiera, o responda a este correo si tiene alguna pregunta.",
      button: "Publicarlo de nuevo",
      foot: "PMRFP es una plataforma para publicar solicitudes de propuestas y encontrar contratistas. No garantizamos la disponibilidad de proyectos, el éxito de las ofertas, la adjudicación de contratos, la respuesta de los administradores de propiedades ni los ingresos. Los miembros son responsables de su propia diligencia debida, calificaciones, seguros, licencias, precios y acuerdos.",
    },
  },
} as const;

export type EmailLang = keyof typeof COPY_BY_LANG;

export function emailLang(v: unknown): EmailLang {
  return v === "fr" || v === "es" ? v : "en";
}

/** Subject lines are plain text: strip the tags the body copy uses. */
const plain = (s: string) => s.replace(/<[^>]+>/g, "");

function posterVars(lang: EmailLang, kind: PosterKind) {
  const c = COPY_BY_LANG[lang];
  return { poster: c.poster[kind], Poster: c.Poster[kind] };
}

const link = (base: string, path: string, lang: Locale) => `${base}${localizePath(path, lang)}`;

export interface QuoteInfo {
  amount?: number | null;
  kind?: "estimate" | "firm" | null;
  notes?: string | null;
  startDate?: string | null;
  availability?: string | null;
  currency?: "CAD" | "USD";
}

export function formatQuote(amount: number, currency: "CAD" | "USD", lang: EmailLang): string {
  return amount.toLocaleString(LOCALE_TAG[lang], { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 });
}

function quoteBox(q: QuoteInfo | undefined, lang: EmailLang): string {
  if (!q) return "";
  const l = COPY_BY_LANG[lang].labels;
  const rows: string[] = [];
  if (q.amount != null) {
    const kind = q.kind ? ` (${q.kind === "firm" ? l.firm : l.estimate})` : "";
    rows.push(`<strong>${l.quote}:</strong> ${escHtml(formatQuote(q.amount, q.currency ?? "CAD", lang))}${kind}`);
  }
  if (q.startDate) rows.push(`<strong>${l.start}:</strong> ${escHtml(formatDate(q.startDate, lang, { month: "long", day: "numeric", year: "numeric" }))}`);
  if (q.availability) rows.push(`<strong>${l.availability}:</strong> ${escHtml(q.availability)}`);
  if (q.notes) rows.push(`<strong>${l.notes}:</strong> ${escHtml(q.notes).replace(/\n/g, "<br>")}`);
  return rows.length ? emailBox(rows.join("<br>")) : "";
}

function contactBox(c: ContactCard, lang: EmailLang): string {
  const l = COPY_BY_LANG[lang].labels;
  const rows = [
    c.name ? `<strong>${l.name}:</strong> ${escHtml(c.name)}` : null,
    c.company ? `<strong>${l.company}:</strong> ${escHtml(c.company)}` : null,
    c.email ? `<strong>${l.email}:</strong> <a href="mailto:${escHtml(c.email)}" style="color:#282B59">${escHtml(c.email)}</a>` : null,
    c.phone ? `<strong>${l.phone}:</strong> <a href="tel:${escHtml(c.phone.replace(/[^\d+]/g, ""))}" style="color:#282B59">${escHtml(c.phone)}</a>` : null,
  ].filter(Boolean);
  return rows.length ? emailBox(rows.join("<br>")) : "";
}

const p = (html: string) => `<p>${html}</p>`;

// ── To the poster ────────────────────────────────────────────────────

/** Where the poster handles responses: the PM dashboard, or a town's own (lib/town-jobs). */
export function responsesPath(rfpId: string, posterKind: PosterKind = "pm"): string {
  return posterKind === "town" ? `/buyer-dashboard/jobs/${rfpId}/responses` : `/pm-dashboard/rfps/${rfpId}/interests`;
}

export function newInterestEmail(lang: EmailLang, x: { base: string; vendorName: string; rfpTitle: string; rfpId: string; quote?: QuoteInfo; posterKind?: PosterKind }): BuiltEmail {
  const c = COPY_BY_LANG[lang].newInterest;
  const vars = { vendor: escHtml(x.vendorName), title: escHtml(x.rfpTitle) };
  return {
    subject: plain(fmt(c.subject, { title: x.rfpTitle })),
    title: c.title,
    bodyHtml: [p(fmt(c.intro, vars)), quoteBox(x.quote, lang), p(c.outro), p(emailButton(link(x.base, responsesPath(x.rfpId, x.posterKind), lang), c.button))].join("\n"),
    footnote: c.foot,
  };
}

export function publishedEmail(lang: EmailLang, x: { base: string; title: string; slug: string; rfpId: string; alertsOn: boolean; posterKind?: PosterKind }): BuiltEmail {
  const c = COPY_BY_LANG[lang].published;
  return {
    subject: plain(fmt(c.subject, { title: x.title })),
    title: c.title,
    bodyHtml: [
      p(fmt(c.body, { title: escHtml(x.title) })),
      p(x.alertsOn ? c.on : c.off),
      p(c.outro),
      p(
        `${emailButton(link(x.base, `/rfps/${x.slug}`, lang), c.button)}${
          x.rfpId ? `&nbsp; <a href="${link(x.base, responsesPath(x.rfpId, x.posterKind), lang)}" style="color:#282B59;font-weight:600">${c.responses}</a>` : ""
        }`,
      ),
    ].join("\n"),
    footnote: c.foot,
  };
}

export function rejectedEmail(lang: EmailLang, x: { base: string; title: string; reason: string | null; posterKind?: PosterKind }): BuiltEmail {
  const c = COPY_BY_LANG[lang].rejected;
  const reason = x.reason?.trim() ? `${p(`<strong>${c.reason}</strong>`)}${emailBox(escHtml(x.reason.trim()).replace(/\n/g, "<br>"))}` : "";
  const again = x.posterKind === "town" ? "/buyer-dashboard/jobs/new" : "/pm-dashboard/rfps/new";
  return {
    subject: plain(fmt(c.subject, { title: x.title })),
    title: c.title,
    bodyHtml: [p(fmt(c.body, { title: escHtml(x.title) })), reason, p(c.outro), p(emailButton(link(x.base, again, lang), c.button))].join("\n"),
    footnote: c.foot,
  };
}

// ── To a trade ───────────────────────────────────────────────────────

export function confirmationEmail(
  lang: EmailLang,
  x: { base: string; rfpTitle: string; posterKind: PosterKind; allowance?: { unlimited: boolean; left: number; limit: number } },
): BuiltEmail {
  const all = COPY_BY_LANG[lang];
  const c = all.confirmation;
  const a = x.allowance && !x.allowance.unlimited ? p(x.allowance.left > 0 ? fmt(c.left, { left: x.allowance.left, limit: x.allowance.limit }) : c.none) : "";
  return {
    subject: plain(fmt(c.subject, { title: x.rfpTitle })),
    title: c.title,
    bodyHtml: [p(fmt(c.body, { title: escHtml(x.rfpTitle), ...posterVars(lang, x.posterKind) })), a, p(emailButton(link(x.base, "/dashboard/interests", lang), all.seeResponses))].join("\n"),
    footnote: c.foot,
  };
}

export function jobAlertEmail(
  lang: EmailLang,
  x: {
    base: string;
    title: string;
    slug: string;
    trade: string | null;
    place: string | null;
    deadline: string | null;
    summary: string | null;
    pro: boolean;
    freeLimit: number;
    unsubscribeUrl: string;
    mailingAddress: string;
    /** A public buyer's job (lib/town-jobs): who posted it, and whether it's a mirror of a formal tender. */
    town?: { buyer: string | null; mirror: boolean; portal: string | null };
  },
): BuiltEmail {
  const c = COPY_BY_LANG[lang].jobAlert;
  const buyer = escHtml(x.town?.buyer?.trim() || COPY_BY_LANG[lang].poster.town);
  const townLine = x.town
    ? x.town.mirror
      ? fmt(c.townMirror, { buyer, portal: x.town.portal?.trim() ? escHtml(x.town.portal.trim()) : c.portal })
      : fmt(c.town, { buyer })
    : null;
  const subjectTpl = x.trade && x.place ? c.subject : x.trade ? c.subjectNoPlace : x.place ? c.subjectNoTrade : `${c.title}: {title}`;
  const subject = fmt(subjectTpl, { trade: x.trade ?? "", place: x.place ?? "", title: x.title });
  const meta = [x.trade, x.place, x.deadline ? fmt(c.due, { date: formatDate(x.deadline, lang, { month: "short", day: "numeric", year: "numeric" }) }) : c.noDue]
    .filter(Boolean)
    .map((s) => escHtml(String(s)))
    .join(" · ");
  const summary = x.summary ? emailBox(escHtml(x.summary.length > 400 ? `${x.summary.slice(0, 397)}…` : x.summary).replace(/\n/g, "<br>")) : "";
  const footer = [
    c.why,
    `<a href="${link(x.base, "/dashboard/company", lang)}" style="color:#64748b">${c.settings}</a>`,
    `<a href="${x.unsubscribeUrl}" style="color:#64748b">${c.unsubscribe}</a>`,
    `${SITE.name}, ${escHtml(x.mailingAddress)} · ${SITE.email}`,
  ].join(". ");
  return {
    subject: plain(subject),
    title: c.title,
    bodyHtml: [
      p(c.intro),
      `<p style="margin:12px 0 4px"><a href="${link(x.base, `/rfps/${x.slug}`, lang)}" style="color:#282B59;font-weight:700;font-size:17px">${escHtml(x.title)}</a><br><span style="color:#0C7A5A;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${meta}</span></p>`,
      summary,
      p(emailButton(link(x.base, `/rfps/${x.slug}`, lang), x.town?.mirror ? c.mirrorButton : c.button)),
      `<p style="font-size:14px;color:#475569">${townLine ?? (x.pro ? c.pro : fmt(c.free, { limit: x.freeLimit }))}</p>`,
    ].join("\n"),
    footnote: `${footer}.`,
  };
}

export function declinedEmail(lang: EmailLang, x: { base: string; rfpTitle: string; posterKind: PosterKind; note: string | null }): BuiltEmail {
  const all = COPY_BY_LANG[lang];
  const c = all.declined;
  const v = { title: escHtml(x.rfpTitle), ...posterVars(lang, x.posterKind) };
  const note = x.note?.trim() ? `${p(`<strong>${c.note}</strong>`)}${emailBox(escHtml(x.note.trim()).replace(/\n/g, "<br>"))}` : "";
  return {
    subject: plain(fmt(c.subject, { title: x.rfpTitle })),
    title: fmt(c.title, v),
    bodyHtml: [p(fmt(c.body, v)), note, p(all.keepComing), p(emailButton(link(x.base, "/rfps", lang), all.seeOpen))].join("\n"),
    footnote: all.respondedFoot,
  };
}

export function pickedEmail(lang: EmailLang, x: { base: string; rfpTitle: string; posterKind: PosterKind; company: string; contact: ContactCard }): BuiltEmail {
  const all = COPY_BY_LANG[lang];
  const c = all.picked;
  return {
    subject: plain(fmt(c.subject, { title: x.rfpTitle })),
    title: c.title,
    bodyHtml: [
      p(fmt(c.body, { title: escHtml(x.rfpTitle), company: escHtml(x.company), ...posterVars(lang, x.posterKind) })),
      contactBox(x.contact, lang),
      p(c.outro),
      p(emailButton(link(x.base, "/dashboard/interests", lang), all.seeResponses)),
    ].join("\n"),
    footnote: c.foot,
  };
}

export function notSelectedEmail(lang: EmailLang, x: { base: string; rfpTitle: string; posterKind: PosterKind }): BuiltEmail {
  const all = COPY_BY_LANG[lang];
  const c = all.notSelected;
  return {
    subject: plain(fmt(c.subject, { title: x.rfpTitle })),
    title: c.title,
    bodyHtml: [p(fmt(c.body, { title: escHtml(x.rfpTitle), ...posterVars(lang, x.posterKind) })), p(all.keepComing), p(emailButton(link(x.base, "/rfps", lang), all.seeOpen))].join("\n"),
    footnote: all.respondedFoot,
  };
}

export function contactSharedEmail(lang: EmailLang, x: { base: string; rfpTitle: string; posterKind: PosterKind; company: string; contact: ContactCard }): BuiltEmail {
  const all = COPY_BY_LANG[lang];
  const c = all.contactShared;
  const v = { title: escHtml(x.rfpTitle), company: escHtml(x.company), ...posterVars(lang, x.posterKind) };
  return {
    subject: plain(fmt(c.subject, { ...v, title: x.rfpTitle })),
    title: fmt(c.title, v),
    bodyHtml: [p(fmt(c.body, v)), contactBox(x.contact, lang), p(c.outro), p(emailButton(link(x.base, "/dashboard/interests", lang), all.seeResponses))].join("\n"),
    footnote: all.respondedFoot,
  };
}
