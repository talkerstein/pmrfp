import { SITE } from "@/lib/site";
import { escHtml, emailBox, emailButton } from "@/lib/email/parts";
import { localizePath } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { getDictionary } from "@/i18n/dictionaries";
import type { BuiltEmail, EmailLang } from "@/lib/pm-jobs/email-copy";
import type { CertCountry, CertStatus, CertType } from "./rules";

/**
 * The tracker's three emails, in the shared shell (lib/email/send
 * sendVendorCertEmail): the vendor's upload request, the vendor's renewal
 * reminder, and the PM's expiry digest. Certificate names come from the
 * dashboard's own copy (certsClient.types), per country, so an email never
 * says WSIB to a U.S. vendor or COI to a Canadian one.
 */

const COPY = {
  en: {
    request: {
      subject: "{company} is asking for your {cert}",
      title: "Upload your certificate",
      body: "Hi {vendor}, <strong>{company}</strong> keeps an up-to-date {cert} on file for every vendor. Please upload yours using the secure link below. No account or password needed.",
      button: "Upload my certificate",
      expires: "This link works for {days} days.",
      pitchNew: "While you're there: a free PMRFP trade profile lets property managers find you and send you RFPs. Your certificate status shows on it.",
      pitchMember: "You're on PMRFP: keep your company profile's insurance status current so property managers see it.",
      why: "You're getting this because {company} listed you as a vendor on PMRFP and asked for your certificate",
      off: "Don't email me about certificates",
    },
    reminder: {
      subject: "Your {cert} on file with {company} expires {date}",
      subjectPast: "Your {cert} on file with {company} has expired",
      title: "Time to renew your certificate",
      body: "Hi {vendor}, the {cert} that <strong>{company}</strong> has on file for you expires on <strong>{date}</strong>. Please upload the renewed certificate.",
      bodyPast: "Hi {vendor}, the {cert} that <strong>{company}</strong> has on file for you expired on <strong>{date}</strong>. Please upload the renewed certificate.",
    },
    digest: {
      subject: { one: "1 vendor certificate needs attention", other: "{n} vendor certificates need attention" },
      title: "Vendor certificates expiring",
      body: "These certificates for <strong>{company}</strong> are expiring or have expired:",
      expires: "expires {date}",
      expired: "expired {date}",
      today: "expires today",
      button: "Open the tracker",
      tip: "Use \"Request certificate\" to email the vendor a secure upload link. Replacing a vendor? Post an RFP free and get quotes from approved trades.",
      why: "You're getting this because your company tracks vendor certificates on PMRFP",
      off: "Stop these reminders",
    },
  },
  fr: {
    request: {
      subject: "{company} vous demande votre {cert}",
      title: "Téléversez votre certificat",
      body: "Bonjour {vendor}, <strong>{company}</strong> garde au dossier un(e) {cert} à jour pour chaque fournisseur. Veuillez téléverser le vôtre au moyen du lien sécurisé ci-dessous. Aucun compte ni mot de passe requis.",
      button: "Téléverser mon certificat",
      expires: "Ce lien est valide pendant {days} jours.",
      pitchNew: "Pendant que vous y êtes : un profil d'entrepreneur gratuit sur PMRFP permet aux gestionnaires immobiliers de vous trouver et de vous envoyer des appels d'offres. L'état de vos certificats y paraît.",
      pitchMember: "Vous êtes sur PMRFP : tenez à jour l'état de vos assurances dans le profil de votre entreprise pour que les gestionnaires immobiliers le voient.",
      why: "Vous recevez ce courriel parce que {company} vous a inscrit comme fournisseur sur PMRFP et a demandé votre certificat",
      off: "Ne plus m'écrire au sujet des certificats",
    },
    reminder: {
      subject: "Votre {cert} au dossier chez {company} expire le {date}",
      subjectPast: "Votre {cert} au dossier chez {company} est expiré",
      title: "Il est temps de renouveler votre certificat",
      body: "Bonjour {vendor}, le {cert} que <strong>{company}</strong> a au dossier pour vous expire le <strong>{date}</strong>. Veuillez téléverser le certificat renouvelé.",
      bodyPast: "Bonjour {vendor}, le {cert} que <strong>{company}</strong> a au dossier pour vous a expiré le <strong>{date}</strong>. Veuillez téléverser le certificat renouvelé.",
    },
    digest: {
      subject: { one: "1 certificat de fournisseur demande votre attention", other: "{n} certificats de fournisseurs demandent votre attention" },
      title: "Certificats de fournisseurs qui expirent",
      body: "Ces certificats de <strong>{company}</strong> expirent bientôt ou sont expirés :",
      expires: "expire le {date}",
      expired: "expiré le {date}",
      today: "expire aujourd'hui",
      button: "Ouvrir le suivi",
      tip: "Utilisez « Demander le certificat » pour envoyer au fournisseur un lien de téléversement sécurisé. Vous remplacez un fournisseur? Publiez un appel d'offres gratuitement et recevez des soumissions d'entrepreneurs approuvés.",
      why: "Vous recevez ce courriel parce que votre entreprise suit les certificats de ses fournisseurs sur PMRFP",
      off: "Arrêter ces rappels",
    },
  },
  es: {
    request: {
      subject: "{company} le solicita su {cert}",
      title: "Suba su certificado",
      body: "Hola {vendor}, <strong>{company}</strong> mantiene en archivo un {cert} vigente de cada proveedor. Suba el suyo con el enlace seguro de abajo. No necesita cuenta ni contraseña.",
      button: "Subir mi certificado",
      expires: "Este enlace funciona durante {days} días.",
      pitchNew: "Ya que está ahí: un perfil de contratista gratuito en PMRFP permite que los administradores de propiedades lo encuentren y le envíen solicitudes de propuestas. El estado de su certificado aparece en él.",
      pitchMember: "Usted está en PMRFP: mantenga al día el estado de su seguro en el perfil de su empresa para que los administradores de propiedades lo vean.",
      why: "Recibe este correo porque {company} lo registró como proveedor en PMRFP y solicitó su certificado",
      off: "No enviarme correos sobre certificados",
    },
    reminder: {
      subject: "Su {cert} en archivo con {company} vence el {date}",
      subjectPast: "Su {cert} en archivo con {company} venció",
      title: "Es hora de renovar su certificado",
      body: "Hola {vendor}, el {cert} que <strong>{company}</strong> tiene en archivo para usted vence el <strong>{date}</strong>. Suba el certificado renovado.",
      bodyPast: "Hola {vendor}, el {cert} que <strong>{company}</strong> tiene en archivo para usted venció el <strong>{date}</strong>. Suba el certificado renovado.",
    },
    digest: {
      subject: { one: "1 certificado de proveedor requiere atención", other: "{n} certificados de proveedores requieren atención" },
      title: "Certificados de proveedores por vencer",
      body: "Estos certificados de <strong>{company}</strong> están por vencer o ya vencieron:",
      expires: "vence el {date}",
      expired: "venció el {date}",
      today: "vence hoy",
      button: "Abrir el registro",
      tip: "Use \"Solicitar certificado\" para enviar al proveedor un enlace seguro para subirlo. ¿Va a reemplazar a un proveedor? Publique una solicitud de propuestas gratis y reciba cotizaciones de contratistas aprobados.",
      why: "Recibe este correo porque su empresa lleva el registro de certificados de proveedores en PMRFP",
      off: "Dejar de recibir estos recordatorios",
    },
  },
} as const;

const p = (html: string) => `<p style="margin:0 0 16px">${html}</p>`;
const link = (base: string, path: string, lang: EmailLang) => `${base}${localizePath(path, lang)}`;

/** The certificate's name for this country, lower-cased mid-sentence where the language does that. */
export function certName(type: CertType, country: CertCountry, lang: EmailLang): string {
  return getDictionary(lang).certsClient.types[country][type];
}

function footer(parts: (string | null)[]): string {
  return parts.filter(Boolean).join(". ").concat(".");
}

interface VendorBits {
  base: string;
  company: string;
  vendor: string;
  type: CertType;
  country: CertCountry;
  uploadUrl: string;
  unsubscribeUrl: string;
  mailingAddress: string | null;
  /** The vendor already has a PMRFP company. */
  onPmrfp: boolean;
}

/**
 * The soft PMRFP prompt. It's promotional, so (CASL) it only goes out with
 * our mailing address in the footer; without one the email is just the PM's
 * request.
 */
function vendorPitch(lang: EmailLang, x: VendorBits): string {
  if (!x.mailingAddress) return "";
  const c = COPY[lang].request;
  const href = link(x.base, x.onPmrfp ? "/dashboard/company" : "/sign-up?role=trade", lang);
  return `<p style="font-size:14px;color:#475569">${x.onPmrfp ? c.pitchMember : c.pitchNew} <a href="${href}">${href.replace(/^https?:\/\//, "")}</a></p>`;
}

function vendorFooter(lang: EmailLang, x: VendorBits): string {
  const c = COPY[lang].request;
  return footer([
    fmt(c.why, { company: escHtml(x.company) }),
    `<a href="${x.unsubscribeUrl}" style="color:#64748b">${c.off}</a>`,
    x.mailingAddress ? `${SITE.name}, ${escHtml(x.mailingAddress)} · ${SITE.email}` : null,
  ]);
}

/** "Request certificate": the vendor gets a one-time upload link (no account). */
export function certRequestEmail(lang: EmailLang, x: VendorBits & { ttlDays: number }): BuiltEmail {
  const c = COPY[lang].request;
  const cert = certName(x.type, x.country, lang);
  const vars = { company: escHtml(x.company), vendor: escHtml(x.vendor), cert: escHtml(cert) };
  return {
    subject: fmt(c.subject, { company: x.company, cert }),
    title: c.title,
    bodyHtml: [
      p(fmt(c.body, vars)),
      p(emailButton(x.uploadUrl, c.button)),
      `<p style="font-size:14px;color:#475569">${fmt(c.expires, { days: x.ttlDays })}</p>`,
      vendorPitch(lang, x),
    ].join("\n"),
    footnote: vendorFooter(lang, x),
  };
}

/** The vendor's renewal reminder (at 14 and 0 days, when the PM switched it on). */
export function certReminderEmail(lang: EmailLang, x: VendorBits & { expiresOn: string; past: boolean }): BuiltEmail {
  const c = COPY[lang].reminder;
  const cert = certName(x.type, x.country, lang);
  const date = formatDate(x.expiresOn, lang);
  const vars = { company: escHtml(x.company), vendor: escHtml(x.vendor), cert: escHtml(cert), date };
  return {
    subject: fmt(x.past ? c.subjectPast : c.subject, { company: x.company, cert, date }),
    title: c.title,
    bodyHtml: [p(fmt(x.past ? c.bodyPast : c.body, vars)), p(emailButton(x.uploadUrl, COPY[lang].request.button)), vendorPitch(lang, x)].join("\n"),
    footnote: vendorFooter(lang, x),
  };
}

export interface DigestItem {
  vendor: string;
  type: CertType;
  expiresOn: string;
  status: CertStatus;
  days: number;
}

/** The PM's digest: certificates that just reached 30, 14 or 0 days. */
export function certDigestEmail(lang: EmailLang, x: { base: string; company: string; country: CertCountry; items: DigestItem[]; unsubscribeUrl: string | null }): BuiltEmail {
  const c = COPY[lang].digest;
  const n = x.items.length;
  const rows = x.items
    .map((it) => {
      const date = formatDate(it.expiresOn, lang);
      const when = it.days === 0 ? c.today : it.days < 0 ? fmt(c.expired, { date }) : fmt(c.expires, { date });
      const color = it.days < 0 ? "#B42318" : "#B54708";
      return `<strong>${escHtml(it.vendor)}</strong> · ${escHtml(certName(it.type, x.country, lang))} · <span style="color:${color}">${when}</span>`;
    })
    .join("<br>");
  return {
    subject: fmt(n === 1 ? c.subject.one : c.subject.other, { n }),
    title: c.title,
    bodyHtml: [
      p(fmt(c.body, { company: escHtml(x.company) })),
      emailBox(rows),
      p(emailButton(link(x.base, "/pm-dashboard/vendor-insurance", lang), c.button)),
      `<p style="font-size:14px;color:#475569">${c.tip}</p>`,
    ].join("\n"),
    footnote: footer([c.why, x.unsubscribeUrl ? `<a href="${x.unsubscribeUrl}" style="color:#64748b">${c.off}</a>` : null]),
  };
}
