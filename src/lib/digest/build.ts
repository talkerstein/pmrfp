import type { RfpListItem } from "@/lib/data/types";
import type { MajorProject } from "@/lib/major-projects/data";
import { isPastContract, parseAward } from "@/lib/data/fomo";
import { isPublishableWinner } from "@/lib/data/winners";
import { normalizeRegion } from "@/lib/sponsors/model";
import { rfpMarket } from "@/lib/visitor-geo";
import { DIGEST_ADDRESS, DIGEST_SENDER, type DigestCountry, type DigestLang } from "./config";

/**
 * The free weekly email's content for ONE subscriber (pure, unit-tested).
 *
 * Country-first: a subscriber gets work from their own country only, and
 * within it their own province/state. Major projects are Canadian data, so a
 * U.S. subscriber never gets that section. Trades: the subscriber's picks, or
 * every trade when they picked none. A week with nothing in any section sends
 * nothing (no empty emails).
 */

export interface DigestSubscriber {
  id: string;
  country: DigestCountry;
  province: string;
  /** Trade slugs (trade_categories.slug); empty = every trade. */
  trades: string[];
  lang: DigestLang;
  consentAt: string;
}

export interface DigestData {
  /** YYYY-MM-DD (Toronto). */
  today: string;
  rfps: readonly RfpListItem[];
  projects: readonly MajorProject[];
  /** trade name ("Electrical") → slug ("electrical"). */
  tradeSlugByName: ReadonlyMap<string, string>;
}

export const OPEN_MAX = 6;
export const AWARD_MAX = 5;
export const PROJECT_MAX = 3;
/** Awards dated within this many days are "recent". */
export const AWARD_WINDOW_DAYS = 14;
/** Projects new or with a status change within this many days. */
export const PROJECT_WINDOW_DAYS = 7;

export interface DigestOpen { slug: string; title: string; deadline: string | null; city: string | null }
export interface DigestAwardItem { slug: string; title: string; winner: string; value: string | null; date: string }
export interface DigestProjectItem { slug: string; name: string; city: string | null; status: string; isNew: boolean; value: number | null }

export interface WeeklyDigest {
  open: DigestOpen[];
  openTotal: number;
  awards: DigestAwardItem[];
  awardsTotal: number;
  projects: DigestProjectItem[];
  empty: boolean;
}

const dayMinus = (today: string, days: number) => new Date(Date.parse(`${today}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

function inTrades(sub: DigestSubscriber, names: readonly string[], bySlug: ReadonlyMap<string, string>): boolean {
  if (!sub.trades.length) return true;
  const want = new Set(sub.trades);
  return names.some((n) => want.has(bySlug.get(n) ?? ""));
}

/** Same province/state as the subscriber, in the subscriber's country. */
function inPlace(sub: DigestSubscriber, province: string | null): boolean {
  if (rfpMarket({ province }) !== sub.country) return false;
  return normalizeRegion(province) === normalizeRegion(sub.province);
}

export function buildWeeklyDigest(sub: DigestSubscriber, data: DigestData): WeeklyDigest {
  const awardFrom = dayMinus(data.today, AWARD_WINDOW_DAYS);
  const projectFrom = dayMinus(data.today, PROJECT_WINDOW_DAYS);

  const open = data.rfps
    .filter((r) => !r.isDemo && r.status === "open" && !isPastContract(r) && (!r.deadline || r.deadline.slice(0, 10) >= data.today))
    .filter((r) => inPlace(sub, r.province) && inTrades(sub, r.categories, data.tradeSlugByName))
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));

  const awards = data.rfps
    .filter((r) => !r.isDemo && isPastContract(r) && r.deadline && r.deadline.slice(0, 10) >= awardFrom && r.deadline.slice(0, 10) <= data.today)
    .filter((r) => inPlace(sub, r.province) && inTrades(sub, r.categories, data.tradeSlugByName))
    .map((r) => ({ r, a: parseAward(r.summary) }))
    .filter(({ a }) => a.winner && isPublishableWinner(a.winner))
    .sort((x, y) => (y.r.deadline ?? "").localeCompare(x.r.deadline ?? ""));

  // Major projects are Canadian data: never in a U.S. subscriber's email.
  const projects =
    sub.country !== "CA"
      ? []
      : data.projects
          .filter((p) => !p.stale && p.status !== "completed" && p.status !== "cancelled")
          .filter((p) => p.province && normalizeRegion(p.province) === normalizeRegion(sub.province))
          .filter((p) => !sub.trades.length || p.tradesNeeded.some((t) => sub.trades.includes(t)))
          .map((p) => ({ p, isNew: p.firstSeen.slice(0, 10) >= projectFrom, changed: Boolean(p.statusChangedAt && p.statusChangedAt.slice(0, 10) >= projectFrom) }))
          .filter((x) => x.isNew || x.changed)
          .sort((a, b) => (b.p.estValueCad ?? 0) - (a.p.estValueCad ?? 0));

  const out: WeeklyDigest = {
    open: open.slice(0, OPEN_MAX).map((r) => ({ slug: r.slug, title: r.title, deadline: r.deadline, city: r.city })),
    openTotal: open.length,
    awards: awards.slice(0, AWARD_MAX).map(({ r, a }) => ({ slug: r.slug, title: r.title, winner: a.winner!, value: a.value, date: r.deadline!.slice(0, 10) })),
    awardsTotal: awards.length,
    projects: projects.slice(0, PROJECT_MAX).map(({ p, isNew }) => ({ slug: p.slug, name: p.name, city: p.city, status: p.status, isNew, value: p.estValueCad })),
    empty: false,
  };
  out.empty = !out.open.length && !out.awards.length && !out.projects.length;
  return out;
}

/* ------------------------------------------------------------------ email copy */

const COPY = {
  en: {
    subject: "{place} this week: {open} open bids, {awards} recent awards",
    title: "This week in {place}",
    intro: "Major projects, open bids and recent public contract awards in {place}{trades}.",
    tradesFor: " for {trades}",
    projects: "Major projects",
    projectsNote: "New on PMRFP or a status change this week. Trade packages usually go out through the general contractor.",
    newProject: "New",
    statusChange: "Status update",
    open: "Open bids",
    closes: "Closes {date}",
    ongoing: "No fixed closing date",
    moreOpen: "{n} more open in your area",
    awards: "Recently awarded",
    awardsNote: "Public contracts awarded in the last two weeks. These did not go through PMRFP.",
    won: "{winner} won this ({value})",
    wonNoValue: "{winner} won this",
    cta: "See everything on PMRFP",
    status: { proposed: "proposed", approved: "approved", under_construction: "under construction", completed: "completed", on_hold: "on hold", cancelled: "cancelled", unknown: "status unknown" },
    footer:
      "You're receiving this because you signed up for the free PMRFP weekly email on {date}. <a href=\"{unsub}\" style=\"color:#64748b\">Unsubscribe</a> in one click. PMRFP is operated by {sender}, {address} · {email}",
    confirmSubject: "Confirm your PMRFP weekly email",
    confirmTitle: "Confirm your weekly email",
    confirmBody: "Click the button to start the free PMRFP weekly email for {place}. If you didn't ask for it, ignore this message and you won't hear from us again.",
    confirmCta: "Yes, send me the weekly email",
    confirmFooter: "Sent because this address was entered on pmrfp.com. {sender}, {address} · {email}",
  },
  fr: {
    subject: "{place} cette semaine : {open} appels d'offres ouverts, {awards} octrois récents",
    title: "Cette semaine en {place}",
    intro: "Grands projets, appels d'offres ouverts et contrats publics octroyés récemment en {place}{trades}.",
    tradesFor: " pour {trades}",
    projects: "Grands projets",
    projectsNote: "Nouveaux sur PMRFP ou changement de statut cette semaine. Les lots de sous-traitance passent habituellement par l'entrepreneur général.",
    newProject: "Nouveau",
    statusChange: "Mise à jour du statut",
    open: "Appels d'offres ouverts",
    closes: "Clôture le {date}",
    ongoing: "Aucune date de clôture fixe",
    moreOpen: "{n} autres ouverts dans votre région",
    awards: "Octroyés récemment",
    awardsNote: "Contrats publics octroyés au cours des deux dernières semaines. Ils ne sont pas passés par PMRFP.",
    won: "{winner} a remporté ce contrat ({value})",
    wonNoValue: "{winner} a remporté ce contrat",
    cta: "Tout voir sur PMRFP",
    status: { proposed: "proposé", approved: "approuvé", under_construction: "en construction", completed: "terminé", on_hold: "en suspens", cancelled: "annulé", unknown: "statut inconnu" },
    footer:
      "Vous recevez ce courriel parce que vous vous êtes inscrit au courriel hebdomadaire gratuit de PMRFP le {date}. <a href=\"{unsub}\" style=\"color:#64748b\">Désabonnez-vous</a> en un clic. PMRFP est exploité par {sender}, {address} · {email}",
    confirmSubject: "Confirmez votre courriel hebdomadaire PMRFP",
    confirmTitle: "Confirmez votre courriel hebdomadaire",
    confirmBody: "Cliquez sur le bouton pour recevoir le courriel hebdomadaire gratuit de PMRFP pour {place}. Si vous ne l'avez pas demandé, ignorez ce message et vous n'aurez plus de nouvelles de nous.",
    confirmCta: "Oui, envoyez-moi le courriel hebdomadaire",
    confirmFooter: "Envoyé parce que cette adresse a été entrée sur pmrfp.com. {sender}, {address} · {email}",
  },
  es: {
    subject: "{place} esta semana: {open} licitaciones abiertas, {awards} adjudicaciones recientes",
    title: "Esta semana en {place}",
    intro: "Grandes proyectos, licitaciones abiertas y contratos públicos adjudicados recientemente en {place}{trades}.",
    tradesFor: " para {trades}",
    projects: "Grandes proyectos",
    projectsNote: "Nuevos en PMRFP o con cambio de estado esta semana. Los paquetes para subcontratistas suelen salir a través del contratista general.",
    newProject: "Nuevo",
    statusChange: "Cambio de estado",
    open: "Licitaciones abiertas",
    closes: "Cierra el {date}",
    ongoing: "Sin fecha de cierre fija",
    moreOpen: "{n} más abiertas en su zona",
    awards: "Adjudicados recientemente",
    awardsNote: "Contratos públicos adjudicados en las últimas dos semanas. No pasaron por PMRFP.",
    won: "{winner} ganó este contrato ({value})",
    wonNoValue: "{winner} ganó este contrato",
    cta: "Ver todo en PMRFP",
    status: { proposed: "propuesto", approved: "aprobado", under_construction: "en construcción", completed: "terminado", on_hold: "en pausa", cancelled: "cancelado", unknown: "estado desconocido" },
    footer:
      "Recibe este correo porque se suscribió al correo semanal gratuito de PMRFP el {date}. <a href=\"{unsub}\" style=\"color:#64748b\">Cancele la suscripción</a> con un clic. PMRFP es operado por {sender}, {address} · {email}",
    confirmSubject: "Confirme su correo semanal de PMRFP",
    confirmTitle: "Confirme su correo semanal",
    confirmBody: "Haga clic en el botón para recibir el correo semanal gratuito de PMRFP para {place}. Si no lo pidió, ignore este mensaje y no volverá a saber de nosotros.",
    confirmCta: "Sí, envíenme el correo semanal",
    confirmFooter: "Enviado porque esta dirección se ingresó en pmrfp.com. {sender}, {address} · {email}",
  },
} as const;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LOCALE: Record<DigestLang, string> = { en: "en-CA", fr: "fr-CA", es: "es-US" };
const prefix = (lang: DigestLang) => (lang === "en" ? "" : `/${lang}`);
const shortDate = (d: string, lang: DigestLang) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { month: "short", day: "numeric", timeZone: "UTC" });

export interface RenderedDigest {
  subject: string;
  title: string;
  bodyHtml: string;
  footnoteHtml: string;
}

/**
 * Subject, body and the CASL/CAN-SPAM footer (sender, mailing address,
 * reason, one-click unsubscribe). `placeName`/`tradeNames` are already in
 * the subscriber's language.
 */
export function renderWeeklyDigest(
  sub: DigestSubscriber,
  d: WeeklyDigest,
  opts: { base: string; unsubscribeUrl: string; placeName: string; tradeNames: string[]; contactEmail: string; sponsorHtml?: string },
): RenderedDigest {
  const c = COPY[sub.lang];
  const L = (path: string) => `${opts.base}${prefix(sub.lang)}${path}`;
  const link = (href: string, text: string) => `<a href="${esc(href)}" style="color:#282B59;font-weight:600">${esc(text)}</a>`;
  const h2 = (t: string) => `<h2 style="font-size:16px;margin:24px 0 8px;color:#1B1E45">${esc(t)}</h2>`;
  const note = (t: string) => `<p style="margin:0 0 8px;font-size:13px;color:#64748b">${esc(t)}</p>`;
  const li = (inner: string) => `<li style="margin:0 0 12px;line-height:22px">${inner}</li>`;
  const sub2 = (t: string) => `<br><span style="color:#64748b;font-size:13px">${esc(t)}</span>`;
  const trades = opts.tradeNames.length ? fill(c.tradesFor, { trades: opts.tradeNames.join(", ") }) : "";

  const parts: string[] = [`<p>${esc(fill(c.intro, { place: opts.placeName, trades }))}</p>`];
  if (d.projects.length) {
    parts.push(h2(c.projects), note(c.projectsNote));
    parts.push(
      `<ul style="padding-left:18px;margin:8px 0 16px">${d.projects
        .map((p) =>
          li(
            link(L(`/major-projects/${p.slug}`), p.name) +
              sub2([p.isNew ? c.newProject : c.statusChange, c.status[p.status as keyof typeof c.status] ?? p.status, p.city].filter(Boolean).join(" · ")),
          ),
        )
        .join("")}</ul>`,
    );
  }
  if (d.open.length) {
    parts.push(h2(c.open));
    parts.push(
      `<ul style="padding-left:18px;margin:8px 0 16px">${d.open
        .map((r) => li(link(L(`/rfps/${r.slug}`), r.title) + sub2([r.deadline ? fill(c.closes, { date: shortDate(r.deadline, sub.lang) }) : c.ongoing, r.city].filter(Boolean).join(" · "))))
        .join("")}</ul>`,
    );
    if (d.openTotal > d.open.length) parts.push(note(fill(c.moreOpen, { n: d.openTotal - d.open.length })));
  }
  if (d.awards.length) {
    parts.push(h2(c.awards), note(c.awardsNote));
    parts.push(
      `<ul style="padding-left:18px;margin:8px 0 16px">${d.awards
        .map((a) => li(link(L(`/rfps/${a.slug}`), a.title) + sub2(`${a.value ? fill(c.won, { winner: a.winner, value: a.value }) : fill(c.wonNoValue, { winner: a.winner })} · ${shortDate(a.date, sub.lang)}`)))
        .join("")}</ul>`,
    );
  }
  parts.push(
    `<p style="margin:20px 0 8px"><a href="${esc(L("/rfps"))}" style="display:inline-block;background:#282B59;color:#FFFFFF;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${esc(c.cta)}</a></p>`,
  );
  if (opts.sponsorHtml) parts.push(opts.sponsorHtml);

  return {
    subject: fill(c.subject, { place: opts.placeName, open: d.openTotal, awards: d.awardsTotal }),
    title: fill(c.title, { place: opts.placeName }),
    bodyHtml: parts.join("\n"),
    footnoteHtml: fill(c.footer, {
      date: shortDate(sub.consentAt, sub.lang),
      unsub: esc(opts.unsubscribeUrl),
      sender: DIGEST_SENDER,
      address: DIGEST_ADDRESS,
      email: opts.contactEmail,
    }),
  };
}

/** The one confirmation email (double opt-in). */
export function renderConfirmEmail(lang: DigestLang, opts: { confirmUrl: string; placeName: string; contactEmail: string }): RenderedDigest {
  const c = COPY[lang];
  return {
    subject: c.confirmSubject,
    title: c.confirmTitle,
    bodyHtml:
      `<p>${esc(fill(c.confirmBody, { place: opts.placeName }))}</p>` +
      `<p style="margin:20px 0 8px"><a href="${esc(opts.confirmUrl)}" style="display:inline-block;background:#282B59;color:#FFFFFF;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${esc(c.confirmCta)}</a></p>`,
    footnoteHtml: fill(c.confirmFooter, { sender: DIGEST_SENDER, address: DIGEST_ADDRESS, email: opts.contactEmail }),
  };
}
