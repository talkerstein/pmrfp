/**
 * "New from buyers you follow" (same-day, Trade Pro and trial) in English,
 * French and Spanish (pure; the shell and sending are lib/email/send.ts).
 * A commercial message: CASL footer with the mailing address, why they get
 * it, a link to manage follows and the one-click unsubscribe (the same
 * account link the other opportunity emails use; it turns them all off).
 */
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { SITE } from "@/lib/site";
import { emailButton, escHtml } from "@/lib/email/parts";
import type { BuiltEmail } from "@/lib/pm-jobs/email-copy";

export type FollowEmailLang = "en" | "fr" | "es";

const COPY = {
  en: {
    subjectOne: "New bid from {buyer}: {title}",
    subjectMany: "{n} new bids from buyers you follow",
    title: "New from buyers you follow",
    intro: "Posted on PMRFP since our last email, from buyers you follow:",
    closes: "Closes {date}",
    noDue: "No fixed closing date",
    button: "See the bids",
    manage: "Manage the buyers you follow",
    why: "You're receiving this because you follow these buyers on PMRFP with Trade Pro",
    unsubscribe: "Turn off opportunity emails",
  },
  fr: {
    subjectOne: "Nouvel appel d'offres de {buyer} : {title}",
    subjectMany: "{n} nouveaux appels d'offres des acheteurs que vous suivez",
    title: "Du nouveau chez les acheteurs que vous suivez",
    intro: "Publiés sur PMRFP depuis notre dernier courriel, par des acheteurs que vous suivez :",
    closes: "Clôture le {date}",
    noDue: "Aucune date de clôture fixe",
    button: "Voir les appels d'offres",
    manage: "Gérer les acheteurs que vous suivez",
    why: "Vous recevez ce courriel parce que vous suivez ces acheteurs sur PMRFP avec Trade Pro",
    unsubscribe: "Désactiver les courriels d'occasions",
  },
  es: {
    subjectOne: "Nueva licitación de {buyer}: {title}",
    subjectMany: "{n} nuevas licitaciones de compradores que sigue",
    title: "Novedades de los compradores que sigue",
    intro: "Publicadas en PMRFP desde nuestro último correo, por compradores que sigue:",
    closes: "Cierra el {date}",
    noDue: "Sin fecha de cierre fija",
    button: "Ver las licitaciones",
    manage: "Gestionar los compradores que sigue",
    why: "Recibe este correo porque sigue a estos compradores en PMRFP con Trade Pro",
    unsubscribe: "Desactivar los correos de oportunidades",
  },
} as const;

const link = (base: string, path: string, lang: Locale) => `${base}${localizePath(path, lang)}`;

export interface FollowEmailItem {
  title: string;
  slug: string;
  deadline: string | null;
  /** The followed buyer it came from ("Town of Cobourg"). */
  buyer: string;
}

export function followAlertEmail(lang: FollowEmailLang, x: { base: string; items: readonly FollowEmailItem[]; unsubscribeUrl: string; mailingAddress: string }): BuiltEmail {
  const c = COPY[lang];
  const first = x.items[0];
  const subject = x.items.length === 1 ? fmt(c.subjectOne, { buyer: first.buyer, title: first.title }) : fmt(c.subjectMany, { n: x.items.length });
  const list = x.items
    .map((i) => {
      const when = i.deadline ? fmt(c.closes, { date: formatDate(`${i.deadline.slice(0, 10)}T12:00:00Z`, lang, { month: "short", day: "numeric", year: "numeric" }) }) : c.noDue;
      return `<li style="margin:0 0 14px;line-height:22px"><a href="${link(x.base, `/rfps/${i.slug}`, lang)}" style="color:#282B59;font-weight:700">${escHtml(i.title)}</a><br><span style="color:#64748b;font-size:13px">${escHtml(i.buyer)} · ${escHtml(when)}</span></li>`;
    })
    .join("");
  const footer = [
    c.why,
    `<a href="${link(x.base, "/dashboard/following", lang)}" style="color:#64748b">${c.manage}</a>`,
    `<a href="${x.unsubscribeUrl}" style="color:#64748b">${c.unsubscribe}</a>`,
    `${SITE.name}, ${escHtml(x.mailingAddress)} · ${SITE.email}`,
  ].join(". ");
  return {
    subject: subject.replace(/<[^>]+>/g, ""),
    title: c.title,
    bodyHtml: [`<p>${c.intro}</p>`, `<ul style="padding-left:18px;margin:16px 0">${list}</ul>`, `<p>${emailButton(link(x.base, x.items.length === 1 ? `/rfps/${first.slug}` : "/dashboard/following", lang), c.button)}</p>`].join("\n"),
    footnote: `${footer}.`,
  };
}

/** The Monday roundup's section (English, like the roundup). Empty string when there's nothing. */
export function weeklyFollowSectionHtml(base: string, items: readonly FollowEmailItem[], opts: { sameDay: boolean }): string {
  if (!items.length) return "";
  const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  const rows = items
    .map(
      (i) =>
        `<li style="margin:0 0 12px;line-height:22px"><a href="${base}/rfps/${i.slug}" style="color:#282B59;font-weight:600">${escHtml(i.title)}</a>` +
        `<br><span style="color:#64748b;font-size:13px">${escHtml(i.buyer)} · ${i.deadline ? `Closes ${fmtDay(i.deadline)}` : "No fixed closing date"}</span></li>`,
    )
    .join("");
  return `<h3 style="margin:24px 0 8px;font-size:17px;color:#1B1E45">From buyers you follow</h3>
       <ul style="padding-left:18px;margin:8px 0 12px">${rows}</ul>
       <p style="font-size:13px;color:#64748b;margin:0 0 8px">${opts.sameDay ? "Trade Pro gets these the same day they're posted, and follows as many buyers as it likes." : "Trade Pro follows as many buyers as it likes."} <a href="${base}/dashboard/following" style="color:#282B59">Manage the buyers you follow</a>.</p>`;
}
