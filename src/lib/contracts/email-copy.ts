import { escHtml, emailBox, emailButton } from "@/lib/email/parts";
import { localizePath } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import type { BuiltEmail, EmailLang } from "@/lib/pm-jobs/email-copy";
import type { ContractCountry, RenewalStage } from "./rules";

/**
 * The Contract Renewal Calendar's email: the PM's renewal digest, in the
 * shared shell (lib/contracts/server sends it). One per company per day,
 * listing the contracts that just entered their renewal window, reached 14
 * days or hit their end date. The main button re-tenders the most urgent
 * one on PMRFP; every row has its own link. "Re-tender" in Canada, "rebid"
 * in the U.S.
 */

const COPY = {
  en: {
    subject: { one: "Renewal coming up: {label}, {when}", other: "{n} service contracts are coming up for renewal" },
    title: "Service contracts coming up for renewal",
    body: "These service contracts for <strong>{company}</strong> are coming up for renewal:",
    label: "{service} at {building}",
    ends: "ends {date}",
    endsToday: "ends today",
    ended: "ended {date}",
    renews: "renews automatically {date}",
    renewsToday: "renews automatically today",
    retender: { CA: "Re-tender on PMRFP", US: "Rebid on PMRFP" },
    calendar: "Open the renewal calendar",
    tip: "The RFP opens pre-filled with the trade, building, scope notes and a bid deadline worked out from the end date. Approved trades in your area quote, and you choose.",
    autoTip: "A contract that renews automatically usually needs written notice before the end date if you want to change vendors. Check its notice clause.",
    why: "You're getting this because your company tracks its service contracts on PMRFP",
    off: "Stop these reminders",
  },
  fr: {
    subject: { one: "Renouvellement à venir : {label}, {when}", other: "{n} contrats de service arrivent à renouvellement" },
    title: "Contrats de service à renouveler",
    body: "Ces contrats de service de <strong>{company}</strong> arrivent à renouvellement :",
    label: "{service} à {building}",
    ends: "se termine le {date}",
    endsToday: "se termine aujourd'hui",
    ended: "terminé le {date}",
    renews: "reconduit automatiquement le {date}",
    renewsToday: "reconduit automatiquement aujourd'hui",
    retender: { CA: "Relancer l'appel d'offres sur PMRFP", US: "Relancer l'appel d'offres sur PMRFP" },
    calendar: "Ouvrir le calendrier des renouvellements",
    tip: "L'appel d'offres s'ouvre déjà rempli avec le corps de métier, l'immeuble, les notes de portée et une date limite calculée à partir de la date de fin. Des entrepreneurs approuvés de votre région soumissionnent, et vous choisissez.",
    autoTip: "Un contrat à reconduction automatique exige habituellement un préavis écrit avant la date de fin si vous voulez changer de fournisseur. Vérifiez sa clause de préavis.",
    why: "Vous recevez ce courriel parce que votre entreprise suit ses contrats de service sur PMRFP",
    off: "Arrêter ces rappels",
  },
  es: {
    subject: { one: "Renovación próxima: {label}, {when}", other: "{n} contratos de servicio se acercan a su renovación" },
    title: "Contratos de servicio por renovar",
    body: "Estos contratos de servicio de <strong>{company}</strong> se acercan a su renovación:",
    label: "{service} en {building}",
    ends: "termina el {date}",
    endsToday: "termina hoy",
    ended: "terminó el {date}",
    renews: "se renueva automáticamente el {date}",
    renewsToday: "se renueva automáticamente hoy",
    retender: { CA: "Volver a licitar en PMRFP", US: "Volver a licitar en PMRFP" },
    calendar: "Abrir el calendario de renovaciones",
    tip: "La RFP se abre ya completada con el oficio, el edificio, las notas del alcance y una fecha límite calculada a partir del vencimiento. Contratistas aprobados de su zona cotizan, y usted elige.",
    autoTip: "Un contrato de renovación automática normalmente exige aviso por escrito antes del vencimiento si quiere cambiar de proveedor. Revise su cláusula de aviso.",
    why: "Recibe este correo porque su empresa lleva sus contratos de servicio en PMRFP",
    off: "Dejar de recibir estos recordatorios",
  },
} as const;

export interface DigestContract {
  id: string;
  /** The trade's name in the email's language, with the PM's description. */
  service: string;
  building: string | null;
  vendor: string | null;
  /** The current term's end ("YYYY-MM-DD"). */
  end: string;
  days: number;
  stage: RenewalStage;
  autoRenews: boolean;
}

const p = (html: string) => `<p style="margin:0 0 16px">${html}</p>`;
const link = (base: string, path: string, lang: EmailLang) => `${base}${localizePath(path, lang)}`;

/** The RFP form pre-filled from this contract (pm-dashboard/rfps/new?contract=). */
export function retenderPath(contractId: string): string {
  return `/pm-dashboard/rfps/new?contract=${contractId}`;
}

function when(lang: EmailLang, it: DigestContract): string {
  const c = COPY[lang];
  const date = formatDate(it.end, lang);
  if (it.autoRenews) return it.days === 0 ? c.renewsToday : fmt(c.renews, { date });
  if (it.days === 0) return c.endsToday;
  return it.days < 0 ? fmt(c.ended, { date }) : fmt(c.ends, { date });
}

function label(lang: EmailLang, it: DigestContract): string {
  return it.building ? fmt(COPY[lang].label, { service: it.service, building: it.building }) : it.service;
}

/** The PM's digest. `items` most urgent first. */
export function renewalDigestEmail(
  lang: EmailLang,
  x: { base: string; company: string; country: ContractCountry; items: DigestContract[]; unsubscribeUrl: string | null },
): BuiltEmail {
  const c = COPY[lang];
  const n = x.items.length;
  const retender = c.retender[x.country];
  const rows = x.items
    .map((it) => {
      const color = it.days < 0 ? "#B42318" : it.stage === "window" ? "#475569" : "#B54708";
      const vendor = it.vendor ? ` · ${escHtml(it.vendor)}` : "";
      const href = link(x.base, retenderPath(it.id), lang);
      return `<strong>${escHtml(label(lang, it))}</strong>${vendor}<br><span style="color:${color}">${escHtml(when(lang, it))}</span> · <a href="${href}">${retender}</a>`;
    })
    .join("<br><br>");
  const first = x.items[0];
  return {
    subject: n === 1 ? fmt(c.subject.one, { label: label(lang, first), when: when(lang, first) }) : fmt(c.subject.other, { n }),
    title: c.title,
    bodyHtml: [
      p(fmt(c.body, { company: escHtml(x.company) })),
      emailBox(rows),
      first ? p(emailButton(link(x.base, retenderPath(first.id), lang), retender)) : "",
      `<p style="font-size:14px;color:#475569">${c.tip}${x.items.some((it) => it.autoRenews) ? ` ${c.autoTip}` : ""}</p>`,
      `<p style="font-size:14px"><a href="${link(x.base, "/pm-dashboard/contracts", lang)}">${c.calendar}</a></p>`,
    ].join("\n"),
    footnote: [c.why, x.unsubscribeUrl ? `<a href="${x.unsubscribeUrl}" style="color:#64748b">${c.off}</a>` : null].filter(Boolean).join(". ").concat("."),
  };
}
