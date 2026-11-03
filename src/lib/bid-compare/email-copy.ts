import { SITE } from "@/lib/site";
import { escHtml, emailBox, emailButton } from "@/lib/email/parts";
import { localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import type { BuiltEmail, EmailLang } from "@/lib/pm-jobs/email-copy";
import type { ContactCard } from "@/lib/pm-jobs/rules";

/**
 * The Bid Comparison Sheet's two emails to a bidder, in the shared shell
 * (lib/email/send sendTownJobEmail, with List-Unsubscribe headers):
 *   award   the PM awarded them the job (only for a comparison that isn't
 *           linked to a PMRFP RFP; a linked one goes through the RFP's own
 *           "you were picked" email).
 *   invite  "Invite these bidders to PMRFP", for bidders not on PMRFP.
 * Both carry the bid's unsubscribe link. The PMRFP pitch is promotional,
 * so (CASL) it only goes out with our mailing address in the footer, and
 * the invite is never sent without one.
 */

const COPY = {
  en: {
    award: {
      subject: "{company} awarded you the job: {title}",
      title: "You won the job",
      body: "Hi {vendor}, <strong>{company}</strong> compared the quotes for <strong>{title}</strong> and picked yours. Here's how to reach them:",
      outro: "Please contact them to confirm the next steps.",
      pitch: "Want more work like this? A free PMRFP trade profile lets property managers find you and send you RFPs.",
      why: "You're getting this because {company} recorded your quote in a bid comparison on PMRFP",
    },
    invite: {
      subject: "{company} invites you to PMRFP",
      title: "Get the next RFP from {company}",
      body: "Hi {vendor}, <strong>{company}</strong> compared your quote for <strong>{title}</strong> on PMRFP, where property managers post their RFPs and award the work.",
      body2: "Create a free trade profile and you'll hear about RFPs that match your trade and area, including the next one from {company}.",
      button: "Create my free profile",
      why: "You're getting this because {company} recorded your quote in a bid comparison on PMRFP and asked us to invite you",
    },
    labels: { name: "Name", company: "Company", email: "Email", phone: "Phone" },
    off: "Don't email me again",
  },
  fr: {
    award: {
      subject: "{company} vous a octroyé le contrat : {title}",
      title: "Vous avez obtenu le contrat",
      body: "Bonjour {vendor}, <strong>{company}</strong> a comparé les soumissions pour <strong>{title}</strong> et a retenu la vôtre. Voici comment la joindre :",
      outro: "Communiquez avec elle pour confirmer la suite.",
      pitch: "Vous voulez plus de contrats comme celui-ci? Un profil d'entrepreneur gratuit sur PMRFP permet aux gestionnaires immobiliers de vous trouver et de vous envoyer des appels d'offres.",
      why: "Vous recevez ce courriel parce que {company} a inscrit votre soumission dans une comparaison sur PMRFP",
    },
    invite: {
      subject: "{company} vous invite sur PMRFP",
      title: "Recevez le prochain appel d'offres de {company}",
      body: "Bonjour {vendor}, <strong>{company}</strong> a comparé votre soumission pour <strong>{title}</strong> sur PMRFP, où les gestionnaires immobiliers publient leurs appels d'offres et octroient les contrats.",
      body2: "Créez un profil d'entrepreneur gratuit et vous serez avisé des appels d'offres qui correspondent à votre métier et à votre région, y compris le prochain de {company}.",
      button: "Créer mon profil gratuit",
      why: "Vous recevez ce courriel parce que {company} a inscrit votre soumission dans une comparaison sur PMRFP et nous a demandé de vous inviter",
    },
    labels: { name: "Nom", company: "Entreprise", email: "Courriel", phone: "Téléphone" },
    off: "Ne plus m'écrire",
  },
  es: {
    award: {
      subject: "{company} le adjudicó el trabajo: {title}",
      title: "Ganó el trabajo",
      body: "Hola {vendor}, <strong>{company}</strong> comparó las cotizaciones para <strong>{title}</strong> y eligió la suya. Así puede comunicarse con ellos:",
      outro: "Comuníquese con ellos para confirmar los siguientes pasos.",
      pitch: "¿Quiere más trabajos como este? Un perfil de contratista gratuito en PMRFP permite que los administradores de propiedades lo encuentren y le envíen RFP.",
      why: "Recibe este correo porque {company} registró su cotización en una comparación de ofertas en PMRFP",
    },
    invite: {
      subject: "{company} lo invita a PMRFP",
      title: "Reciba la próxima RFP de {company}",
      body: "Hola {vendor}, <strong>{company}</strong> comparó su cotización para <strong>{title}</strong> en PMRFP, donde los administradores de propiedades publican sus RFP y adjudican los trabajos.",
      body2: "Cree un perfil de contratista gratuito y recibirá avisos de las RFP de su oficio y su zona, incluida la próxima de {company}.",
      button: "Crear mi perfil gratis",
      why: "Recibe este correo porque {company} registró su cotización en una comparación de ofertas en PMRFP y nos pidió invitarlo",
    },
    labels: { name: "Nombre", company: "Empresa", email: "Correo", phone: "Teléfono" },
    off: "No volver a escribirme",
  },
} as const;

const p = (html: string) => `<p style="margin:0 0 16px">${html}</p>`;
const link = (base: string, path: string, lang: EmailLang) => `${base}${localizePath(path, lang)}`;
/** Subjects are plain text: no HTML, no line breaks. */
const plain = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

function footer(lang: EmailLang, why: string, x: { company: string; unsubscribeUrl: string; mailingAddress: string | null }): string {
  return [
    fmt(why, { company: escHtml(x.company) }),
    `<a href="${x.unsubscribeUrl}" style="color:#64748b">${COPY[lang].off}</a>`,
    x.mailingAddress ? `${SITE.name}, ${escHtml(x.mailingAddress)} · ${SITE.email}` : null,
  ]
    .filter(Boolean)
    .join(". ")
    .concat(".");
}

function contactBox(c: ContactCard, lang: EmailLang): string {
  const l = COPY[lang].labels;
  const rows = [
    c.name ? `<strong>${l.name}:</strong> ${escHtml(c.name)}` : null,
    c.company ? `<strong>${l.company}:</strong> ${escHtml(c.company)}` : null,
    c.email ? `<strong>${l.email}:</strong> <a href="mailto:${escHtml(c.email)}" style="color:#282B59">${escHtml(c.email)}</a>` : null,
    c.phone ? `<strong>${l.phone}:</strong> <a href="tel:${escHtml(c.phone.replace(/[^\d+]/g, ""))}" style="color:#282B59">${escHtml(c.phone)}</a>` : null,
  ].filter(Boolean);
  return rows.length ? emailBox(rows.join("<br>")) : "";
}

interface BidderBits {
  base: string;
  /** The PM's company. */
  company: string;
  vendor: string;
  title: string;
  unsubscribeUrl: string;
  mailingAddress: string | null;
}

/** The PM awarded this bidder the job (comparison not linked to a PMRFP RFP). */
export function bidAwardEmail(lang: EmailLang, x: BidderBits & { contact: ContactCard }): BuiltEmail {
  const c = COPY[lang].award;
  const vars = { company: escHtml(x.company), vendor: escHtml(x.vendor), title: escHtml(x.title) };
  const signUp = link(x.base, "/sign-up?role=trade", lang);
  return {
    subject: plain(fmt(c.subject, { company: x.company, title: x.title })),
    title: c.title,
    bodyHtml: [
      p(fmt(c.body, vars)),
      contactBox(x.contact, lang),
      p(c.outro),
      x.mailingAddress ? `<p style="font-size:14px;color:#475569">${c.pitch} <a href="${signUp}">${signUp.replace(/^https?:\/\//, "")}</a></p>` : "",
    ].join("\n"),
    footnote: footer(lang, c.why, x),
  };
}

/** "Invite these bidders to PMRFP" (only sent with a mailing address: the caller checks). */
export function bidInviteEmail(lang: EmailLang, x: BidderBits): BuiltEmail {
  const c = COPY[lang].invite;
  const vars = { company: escHtml(x.company), vendor: escHtml(x.vendor), title: escHtml(x.title) };
  return {
    subject: plain(fmt(c.subject, { company: x.company })),
    title: fmt(c.title, { company: escHtml(x.company) }),
    bodyHtml: [p(fmt(c.body, vars)), p(fmt(c.body2, vars)), p(emailButton(link(x.base, "/sign-up?role=trade", lang), c.button))].join("\n"),
    footnote: footer(lang, c.why, x),
  };
}
