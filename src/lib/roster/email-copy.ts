import { SITE } from "@/lib/site";
import { escHtml, emailButton } from "@/lib/email/parts";
import { localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import type { BuiltEmail, EmailLang } from "@/lib/pm-jobs/email-copy";

/**
 * "Invite your current vendor to PMRFP" (lib/roster/server inviteVendor),
 * in the shared shell (lib/email/send sendTownJobEmail). It goes out under
 * CASL's referral exemption: one message, naming the person who referred
 * the vendor and saying it was sent because of that referral, with our
 * mailing address and an unsubscribe link.
 */

const COPY = {
  en: {
    subject: "{inviter} at {company} added you to their after-hours vendor list",
    title: "You're on a property manager's after-hours list",
    hi: "Hi {vendor},",
    hiNoName: "Hello,",
    body: "<strong>{inviter}</strong> at <strong>{company}</strong> lists your company as an after-hours vendor on PMRFP and asked us to let you know about it.",
    pitch: "PMRFP is where property managers in Canada and the U.S. post RFPs and find trades. A free trade profile lets them find you, see that you take emergency calls, and send you RFPs.",
    button: "Create my free trade profile",
    once: "This is the only email you'll get from us about this referral.",
    why: "You're getting this one-time email because {inviter} at {company} referred you to PMRFP",
    off: "Unsubscribe",
  },
  fr: {
    subject: "{inviter} de {company} vous a ajouté à sa liste de fournisseurs d'urgence",
    title: "Vous figurez sur la liste d'urgence d'un gestionnaire immobilier",
    hi: "Bonjour {vendor},",
    hiNoName: "Bonjour,",
    body: "<strong>{inviter}</strong> de <strong>{company}</strong> a inscrit votre entreprise comme fournisseur d'urgence sur PMRFP et nous a demandé de vous en informer.",
    pitch: "PMRFP est l'endroit où les gestionnaires immobiliers du Canada et des États-Unis publient des appels d'offres et trouvent des entrepreneurs. Un profil d'entrepreneur gratuit leur permet de vous trouver, de voir que vous répondez aux urgences et de vous envoyer des appels d'offres.",
    button: "Créer mon profil d'entrepreneur gratuit",
    once: "C'est le seul courriel que nous vous enverrons au sujet de cette recommandation.",
    why: "Vous recevez ce courriel unique parce que {inviter} de {company} vous a recommandé à PMRFP",
    off: "Se désabonner",
  },
  es: {
    subject: "{inviter} de {company} lo agregó a su lista de proveedores de emergencia",
    title: "Usted está en la lista de emergencia de un administrador de propiedades",
    hi: "Hola, {vendor}:",
    hiNoName: "Hola:",
    body: "<strong>{inviter}</strong> de <strong>{company}</strong> registró a su empresa como proveedor de emergencia en PMRFP y nos pidió que se lo hiciéramos saber.",
    pitch: "PMRFP es donde los administradores de propiedades de Canadá y EE. UU. publican solicitudes de propuestas y encuentran contratistas. Un perfil de contratista gratuito les permite encontrarlo, ver que atiende emergencias y enviarle solicitudes de propuestas.",
    button: "Crear mi perfil de contratista gratis",
    once: "Este es el único correo que recibirá de nosotros sobre esta recomendación.",
    why: "Recibe este correo único porque {inviter} de {company} lo recomendó a PMRFP",
    off: "Darse de baja",
  },
} as const;

const p = (html: string) => `<p style="margin:0 0 16px">${html}</p>`;

export interface InviteBits {
  base: string;
  /** The person who made the referral (CASL needs their name). */
  inviter: string;
  company: string;
  vendor: string | null;
  unsubscribeUrl: string;
  mailingAddress: string;
}

export function rosterInviteEmail(lang: EmailLang, x: InviteBits): BuiltEmail {
  const c = COPY[lang];
  const vars = { inviter: escHtml(x.inviter), company: escHtml(x.company), vendor: escHtml(x.vendor ?? "") };
  const signUp = `${x.base}${localizePath("/sign-up?role=trade", lang)}`;
  return {
    subject: fmt(c.subject, { inviter: x.inviter, company: x.company }),
    title: c.title,
    bodyHtml: [
      p(x.vendor ? fmt(c.hi, vars) : c.hiNoName),
      p(fmt(c.body, vars)),
      p(c.pitch),
      p(emailButton(signUp, c.button)),
      `<p style="font-size:14px;color:#475569">${c.once}</p>`,
    ].join("\n"),
    footnote: [
      fmt(c.why, vars),
      `<a href="${x.unsubscribeUrl}" style="color:#64748b">${c.off}</a>`,
      `${SITE.name}, ${escHtml(x.mailingAddress)} · ${SITE.email}`,
    ].join(". ").concat("."),
  };
}
