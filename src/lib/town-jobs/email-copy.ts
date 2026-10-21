/**
 * Emails of a town's job (PMRFP for Towns, Part B2), in English, French and
 * Spanish (pure; the shell and sending are lib/email/send.ts). Every
 * member-typed value is escaped here. Tested in test/unit/town-jobs.test.ts.
 *
 *   invites      a matching trade on PMRFP, or a contractor by email. Both
 *                carry the CASL footer (why, the mailing address, an
 *                unsubscribe link); they go out only behind
 *                TOWN_INVITES_ENABLED.
 *   broadcasts   an answer to a question, an addendum: to everyone engaged
 *                with the job (responded or asked, plus followers). They
 *                carry an unsubscribe link and go out only behind
 *                TOWN_QA_EMAILS_ENABLED.
 *   to the town  a new question waiting for an answer.
 */
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { SITE } from "@/lib/site";
import { emailBox, emailButton, escHtml } from "@/lib/email/parts";
import type { BuiltEmail, EmailLang } from "@/lib/pm-jobs/email-copy";

const COPY = {
  en: {
    town: "the town",
    portal: "its official portal",
    due: "Closes {date}",
    noDue: "No fixed closing date",
    seeJob: "See the job",
    invite: {
      subject: "{buyer} invites you to quote: {title}",
      subjectMirror: "{buyer} invites you to bid: {title}",
      title: "You're invited to quote",
      titleMirror: "You're invited to bid",
      body: "{buyer} invited <strong>{company}</strong> to quote on this job, posted on PMRFP:",
      bodyEmail: "{buyer} would like a quote from you for this job, posted on PMRFP:",
      bodyMirror: "{buyer} invited you to bid on this tender. Bids go to {portal}; PMRFP shows the summary and the link.",
      free: "Responding to a town's job on PMRFP is always free.",
      button: "See the job and respond",
      buttonMirror: "See the tender",
      signUp: "Create a free account and respond",
      signUpNote: "It takes two minutes, and you come straight back to the job.",
      whyTrade: "You're receiving this because {buyer} invited matching trades on PMRFP, and your company is listed in this trade and area",
      whyEmail: "You're receiving this because {buyer} asked PMRFP to invite you to quote on this job. We won't add you to any list",
      settings: "Change your trades or areas",
      unsubscribe: "Turn off opportunity emails",
      unsubscribeEmail: "Don't send me invitations",
    },
    answer: {
      subject: "Answer published: {title}",
      title: "A question was answered",
      body: "{buyer} answered a question about <strong>{title}</strong>. Everyone sees the same answer; who asked is never shown.",
      q: "Question",
      a: "Answer",
    },
    addendum: {
      subject: "Addendum {n}: {title}",
      title: "Addendum {n} issued",
      body: "{buyer} issued addendum {n} for <strong>{title}</strong>:",
      deadline: "The closing date changed from {from} to {to}.",
      document: "Official document",
    },
    question: {
      subject: "New question on your job: {title}",
      title: "A bidder asked a question",
      body: "Someone asked a question about <strong>{title}</strong>. Answer it once from your dashboard: the answer is published on the listing without the asker's name and sent to everyone who responded.",
      button: "Answer the question",
    },
    engagedFoot: "You're getting this because you responded to or asked about this job on PMRFP, or follow {buyer}",
    off: "Turn off these emails",
  },
  fr: {
    town: "la municipalité",
    portal: "son portail officiel",
    due: "Clôture le {date}",
    noDue: "Sans date de clôture fixe",
    seeJob: "Voir l'appel d'offres",
    invite: {
      subject: "{buyer} vous invite à soumissionner : {title}",
      subjectMirror: "{buyer} vous invite à soumissionner : {title}",
      title: "Vous êtes invité à soumettre un prix",
      titleMirror: "Vous êtes invité à soumissionner",
      body: "{buyer} a invité <strong>{company}</strong> à soumettre un prix pour cet appel d'offres, publié sur PMRFP :",
      bodyEmail: "{buyer} aimerait recevoir votre prix pour cet appel d'offres, publié sur PMRFP :",
      bodyMirror: "{buyer} vous invite à soumissionner à cet appel d'offres. Les soumissions se déposent sur {portal}; PMRFP en affiche le résumé et le lien.",
      free: "Répondre à un appel d'offres municipal sur PMRFP est toujours gratuit.",
      button: "Voir l'appel d'offres et répondre",
      buttonMirror: "Voir l'appel d'offres",
      signUp: "Créer un compte gratuit et répondre",
      signUpNote: "Ça prend deux minutes, et vous revenez directement à l'appel d'offres.",
      whyTrade: "Vous recevez ce courriel parce que {buyer} a invité les entrepreneurs correspondants sur PMRFP et que votre entreprise est inscrite dans ce corps de métier et cette région",
      whyEmail: "Vous recevez ce courriel parce que {buyer} a demandé à PMRFP de vous inviter à soumettre un prix pour cet appel d'offres. Nous ne vous ajouterons à aucune liste",
      settings: "Modifier vos corps de métier ou vos régions",
      unsubscribe: "Ne plus recevoir les courriels d'occasions d'affaires",
      unsubscribeEmail: "Ne plus m'envoyer d'invitations",
    },
    answer: {
      subject: "Réponse publiée : {title}",
      title: "Une question a reçu une réponse",
      body: "{buyer} a répondu à une question sur <strong>{title}</strong>. Tout le monde voit la même réponse; l'auteur de la question n'est jamais indiqué.",
      q: "Question",
      a: "Réponse",
    },
    addendum: {
      subject: "Addenda {n} : {title}",
      title: "Addenda {n} publié",
      body: "{buyer} a publié l'addenda {n} pour <strong>{title}</strong> :",
      deadline: "La date de clôture passe du {from} au {to}.",
      document: "Document officiel",
    },
    question: {
      subject: "Nouvelle question sur votre appel d'offres : {title}",
      title: "Un soumissionnaire a posé une question",
      body: "Quelqu'un a posé une question sur <strong>{title}</strong>. Répondez-y une seule fois depuis votre tableau de bord : la réponse est publiée sur l'annonce sans le nom de l'auteur et envoyée à tous ceux qui ont répondu.",
      button: "Répondre à la question",
    },
    engagedFoot: "Vous recevez ce courriel parce que vous avez répondu à cet appel d'offres ou posé une question sur PMRFP, ou que vous suivez {buyer}",
    off: "Ne plus recevoir ces courriels",
  },
  es: {
    town: "el municipio",
    portal: "su portal oficial",
    due: "Cierra el {date}",
    noDue: "Sin fecha de cierre fija",
    seeJob: "Ver el trabajo",
    invite: {
      subject: "{buyer} lo invita a cotizar: {title}",
      subjectMirror: "{buyer} lo invita a presentar una oferta: {title}",
      title: "Lo invitan a cotizar",
      titleMirror: "Lo invitan a presentar una oferta",
      body: "{buyer} invitó a <strong>{company}</strong> a cotizar este trabajo, publicado en PMRFP:",
      bodyEmail: "{buyer} quisiera recibir su cotización para este trabajo, publicado en PMRFP:",
      bodyMirror: "{buyer} lo invita a presentar una oferta en esta licitación. Las ofertas se presentan en {portal}; PMRFP muestra el resumen y el enlace.",
      free: "Responder a un trabajo municipal en PMRFP siempre es gratis.",
      button: "Ver el trabajo y responder",
      buttonMirror: "Ver la licitación",
      signUp: "Crear una cuenta gratis y responder",
      signUpNote: "Toma dos minutos y vuelve directamente al trabajo.",
      whyTrade: "Recibe este correo porque {buyer} invitó a los contratistas que coinciden en PMRFP y su empresa está registrada en este oficio y esta zona",
      whyEmail: "Recibe este correo porque {buyer} le pidió a PMRFP que lo invitara a cotizar este trabajo. No lo agregaremos a ninguna lista",
      settings: "Cambiar sus oficios o zonas",
      unsubscribe: "Dejar de recibir correos de oportunidades",
      unsubscribeEmail: "No enviarme invitaciones",
    },
    answer: {
      subject: "Respuesta publicada: {title}",
      title: "Se respondió una pregunta",
      body: "{buyer} respondió una pregunta sobre <strong>{title}</strong>. Todos ven la misma respuesta; nunca se muestra quién preguntó.",
      q: "Pregunta",
      a: "Respuesta",
    },
    addendum: {
      subject: "Adenda {n}: {title}",
      title: "Se publicó la adenda {n}",
      body: "{buyer} publicó la adenda {n} de <strong>{title}</strong>:",
      deadline: "La fecha de cierre cambió del {from} al {to}.",
      document: "Documento oficial",
    },
    question: {
      subject: "Nueva pregunta sobre su trabajo: {title}",
      title: "Un oferente hizo una pregunta",
      body: "Alguien hizo una pregunta sobre <strong>{title}</strong>. Respóndala una sola vez desde su panel: la respuesta se publica en el anuncio sin el nombre de quien preguntó y se envía a todos los que respondieron.",
      button: "Responder la pregunta",
    },
    engagedFoot: "Recibe este correo porque respondió o preguntó sobre este trabajo en PMRFP, o porque sigue a {buyer}",
    off: "Dejar de recibir estos correos",
  },
} as const;

const p = (html: string) => `<p>${html}</p>`;
const link = (base: string, path: string, lang: Locale) => `${base}${localizePath(path, lang)}`;
const day = (d: string, lang: EmailLang) => formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "long", day: "numeric", year: "numeric" });
const multiline = (s: string) => escHtml(s).replace(/\n/g, "<br>");

function buyerOf(lang: EmailLang, buyer: string | null | undefined): string {
  return escHtml(buyer?.trim() || COPY[lang].town);
}

/** The sign-up link an invited contractor gets: a free trade account that comes back to the job. */
export function inviteSignUpPath(slug: string, lang: Locale): string {
  const next = localizePath(`/rfps/${slug}`, lang);
  return `/sign-up?${new URLSearchParams({ role: "trade", next }).toString()}`;
}

interface JobBits {
  base: string;
  buyer: string | null;
  title: string;
  slug: string;
  deadline: string | null;
  summary: string | null;
  mirror: boolean;
  portal: string | null;
}

function jobBlock(lang: EmailLang, x: JobBits): string {
  const c = COPY[lang];
  const meta = escHtml(x.deadline ? fmt(c.due, { date: day(x.deadline, lang) }) : c.noDue);
  const summary = x.summary ? emailBox(multiline(x.summary.length > 400 ? `${x.summary.slice(0, 397)}…` : x.summary)) : "";
  return `<p style="margin:12px 0 4px"><a href="${link(x.base, `/rfps/${x.slug}`, lang)}" style="color:#282B59;font-weight:700;font-size:17px">${escHtml(x.title)}</a><br><span style="color:#0C7A5A;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${meta}</span></p>${summary}`;
}

/** An invitation to a matching trade on PMRFP (one person at the company). Commercial: CASL footer. */
export function tradeInviteEmail(lang: EmailLang, x: JobBits & { company: string; unsubscribeUrl: string; mailingAddress: string }): BuiltEmail {
  const c = COPY[lang].invite;
  const buyer = buyerOf(lang, x.buyer);
  const portal = x.portal?.trim() ? escHtml(x.portal.trim()) : COPY[lang].portal;
  const footer = [
    fmt(c.whyTrade, { buyer }),
    `<a href="${link(x.base, "/dashboard/company", lang)}" style="color:#64748b">${c.settings}</a>`,
    `<a href="${x.unsubscribeUrl}" style="color:#64748b">${c.unsubscribe}</a>`,
    `${SITE.name}, ${escHtml(x.mailingAddress)} · ${SITE.email}`,
  ].join(". ");
  return {
    subject: fmt(x.mirror ? c.subjectMirror : c.subject, { buyer: x.buyer?.trim() || COPY[lang].town, title: x.title }),
    title: x.mirror ? c.titleMirror : c.title,
    bodyHtml: [
      p(x.mirror ? fmt(c.bodyMirror, { buyer, portal }) : fmt(c.body, { buyer, company: escHtml(x.company) })),
      jobBlock(lang, x),
      p(emailButton(link(x.base, `/rfps/${x.slug}`, lang), x.mirror ? c.buttonMirror : c.button)),
      x.mirror ? "" : `<p style="font-size:14px;color:#475569">${c.free}</p>`,
    ].join("\n"),
    footnote: `${footer}.`,
  };
}

/** An invitation to a contractor who isn't on PMRFP: a free sign-up that returns to the job. Commercial: CASL footer. */
export function emailInviteEmail(lang: EmailLang, x: JobBits & { unsubscribeUrl: string; mailingAddress: string }): BuiltEmail {
  const c = COPY[lang].invite;
  const buyer = buyerOf(lang, x.buyer);
  const portal = x.portal?.trim() ? escHtml(x.portal.trim()) : COPY[lang].portal;
  const footer = [
    fmt(c.whyEmail, { buyer }),
    `<a href="${x.unsubscribeUrl}" style="color:#64748b">${c.unsubscribeEmail}</a>`,
    `${SITE.name}, ${escHtml(x.mailingAddress)} · ${SITE.email}`,
  ].join(". ");
  const signUp = `${x.base}${localizePath(inviteSignUpPath(x.slug, lang), lang)}`;
  return {
    subject: fmt(x.mirror ? c.subjectMirror : c.subject, { buyer: x.buyer?.trim() || COPY[lang].town, title: x.title }),
    title: x.mirror ? c.titleMirror : c.title,
    bodyHtml: [
      p(x.mirror ? fmt(c.bodyMirror, { buyer, portal }) : fmt(c.bodyEmail, { buyer })),
      jobBlock(lang, x),
      x.mirror
        ? p(emailButton(link(x.base, `/rfps/${x.slug}`, lang), c.buttonMirror))
        : `${p(emailButton(signUp, c.signUp))}<p style="font-size:14px;color:#475569">${c.signUpNote} ${c.free}</p>`,
    ].join("\n"),
    footnote: `${footer}.`,
  };
}

function engagedFooter(lang: EmailLang, buyer: string, unsubscribeUrl: string | null, mailingAddress: string | null): string {
  const c = COPY[lang];
  return [
    fmt(c.engagedFoot, { buyer }),
    unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#64748b">${c.off}</a>` : null,
    mailingAddress ? `${SITE.name}, ${escHtml(mailingAddress)} · ${SITE.email}` : null,
  ]
    .filter(Boolean)
    .join(". ")
    .concat(".");
}

/** An answer, to everyone engaged with the job. Never names who asked. */
export function answerEmail(
  lang: EmailLang,
  x: { base: string; buyer: string | null; title: string; slug: string; question: string; answer: string; unsubscribeUrl: string | null; mailingAddress: string | null },
): BuiltEmail {
  const c = COPY[lang].answer;
  const buyer = buyerOf(lang, x.buyer);
  return {
    subject: fmt(c.subject, { title: x.title }),
    title: c.title,
    bodyHtml: [
      p(fmt(c.body, { buyer, title: escHtml(x.title) })),
      emailBox(`<strong>${c.q}:</strong> ${multiline(x.question)}<br><br><strong>${c.a}:</strong> ${multiline(x.answer)}`),
      p(emailButton(link(x.base, `/rfps/${x.slug}#questions`, lang), COPY[lang].seeJob)),
    ].join("\n"),
    footnote: engagedFooter(lang, buyer, x.unsubscribeUrl, x.mailingAddress),
  };
}

/** An addendum, to everyone engaged with the job (with the closing-date change when there is one). */
export function addendumEmail(
  lang: EmailLang,
  x: {
    base: string;
    buyer: string | null;
    title: string;
    slug: string;
    number: number;
    body: string;
    officialUrl: string | null;
    oldDeadline: string | null;
    newDeadline: string | null;
    unsubscribeUrl: string | null;
    mailingAddress: string | null;
  },
): BuiltEmail {
  const c = COPY[lang].addendum;
  const buyer = buyerOf(lang, x.buyer);
  const moved = x.oldDeadline && x.newDeadline ? p(`<strong>${fmt(c.deadline, { from: day(x.oldDeadline, lang), to: day(x.newDeadline, lang) })}</strong>`) : "";
  const doc = x.officialUrl ? p(`<a href="${escHtml(x.officialUrl)}" style="color:#282B59;font-weight:600">${c.document} ↗</a>`) : "";
  return {
    subject: fmt(c.subject, { n: x.number, title: x.title }),
    title: fmt(c.title, { n: x.number }),
    bodyHtml: [p(fmt(c.body, { buyer, n: x.number, title: escHtml(x.title) })), emailBox(multiline(x.body)), moved, doc, p(emailButton(link(x.base, `/rfps/${x.slug}#addenda`, lang), COPY[lang].seeJob))].join("\n"),
    footnote: engagedFooter(lang, buyer, x.unsubscribeUrl, x.mailingAddress),
  };
}

/** To the town: a new question is waiting (no asker named here either). */
export function questionWaitingEmail(lang: EmailLang, x: { base: string; title: string; rfpId: string }): BuiltEmail {
  const c = COPY[lang].question;
  return {
    subject: fmt(c.subject, { title: x.title }),
    title: c.title,
    bodyHtml: [p(fmt(c.body, { title: escHtml(x.title) })), p(emailButton(link(x.base, `/buyer-dashboard/jobs/${x.rfpId}#questions`, lang), c.button))].join("\n"),
    footnote: "",
  };
}
