import type { Locale } from "@/i18n/config";
import { startTrialPath } from "./gate";

/**
 * The "Bids you may have missed" section of the Monday free roundup
 * (/api/cron/tender-digest). It extends that one email; it is not a new
 * send, so the footer, the mailing address, the one-click unsubscribe and the
 * opt-out checks all stay exactly as they were.
 *
 * Off unless MISSED_BIDS_BLOCK_ENABLED is "1" or "true". The numbers are the
 * dashboard card's (lib/entitlement/missed-bids): bids in the member's
 * trades and region posted in the last 7 days, still open and already
 * closed. Nothing matched = no block.
 */

export function missedBidsEmailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.MISSED_BIDS_BLOCK_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true";
}

const COPY = {
  en: {
    title: "Bids you may have missed",
    body: (n: number, m: number) =>
      `This week ${n} open ${n === 1 ? "bid" : "bids"} matched your trade and region${m > 0 ? `; ${m} closed` : ""}. Pro members were emailed ${n === 1 ? "it" : "these"} the morning ${n === 1 ? "it was" : "they were"} posted.`,
    cta: "Start your free trial",
    note: "14 days of Trade Pro, no card.",
  },
  fr: {
    title: "Appels d'offres que vous avez peut-être manqués",
    body: (n: number, m: number) =>
      `Cette semaine, ${n} ${n === 1 ? "appel d'offres ouvert correspondait" : "appels d'offres ouverts correspondaient"} à votre métier et à votre région${m > 0 ? ` ; ${m} ${m === 1 ? "fermé" : "fermés"}` : ""}. Les membres Pro ${n === 1 ? "l'ont reçu" : "les ont reçus"} par courriel le matin de ${n === 1 ? "sa" : "leur"} publication.`,
    cta: "Commencer votre essai gratuit",
    note: "14 jours de Trade Pro, sans carte.",
  },
  es: {
    title: "Licitaciones que quizá se perdió",
    body: (n: number, m: number) =>
      `Esta semana ${n} ${n === 1 ? "licitación abierta coincidió" : "licitaciones abiertas coincidieron"} con su oficio y su región${m > 0 ? `; ${m} ${m === 1 ? "cerrada" : "cerradas"}` : ""}. Los miembros Pro ${n === 1 ? "la recibieron" : "las recibieron"} por correo la mañana en que ${n === 1 ? "se publicó" : "se publicaron"}.`,
    cta: "Comience su prueba gratis",
    note: "14 días de Trade Pro, sin tarjeta.",
  },
} as const;

/** The email's trial link: sign in (they already have an account), then the one-button trial page. */
export function missedBidsTrialUrl(base: string, lang: Locale): string {
  const next = startTrialPath("digest", "/dashboard");
  return `${base.replace(/\/$/, "")}${lang === "en" ? "" : "/" + lang}/sign-in?next=${encodeURIComponent(next)}`;
}

/** The compact section, or "" when there is nothing real to say. Own links get utm_* from the sender (tagEmailLinks). */
export function missedBidsEmailHtml(lang: Locale, counts: { openCount: number; closedCount: number } | null, trialUrl: string): string {
  if (!counts || counts.openCount <= 0) return "";
  const c = COPY[lang] ?? COPY.en;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;background:#FFF8E8;border:1px solid #F1DFAE;border-radius:12px;">` +
    `<tr><td style="padding:16px 20px;">` +
    `<p style="margin:0 0 6px;font-weight:700;color:#1B1E45;font-size:15px">${esc(c.title)}</p>` +
    `<p style="margin:0 0 10px;font-size:14px;line-height:21px;color:#1B1E45">${esc(c.body(counts.openCount, counts.closedCount))}</p>` +
    `<p style="margin:0;font-size:14px"><a href="${esc(trialUrl)}" style="color:#282B59;font-weight:700">${esc(c.cta)} &rarr;</a> <span style="color:#64748b">${esc(c.note)}</span></p>` +
    `</td></tr></table>`
  );
}
