/**
 * Lifecycle email copy, en / fr / es. Plain text first: each email is a few
 * blocks (paragraphs, a short list, link lines) rendered once as text and
 * once as a minimal HTML wrapper. Pure and unit-tested; the admin preview
 * (/admin/lifecycle) and the brief (briefs/marketing/2026-10-16-lifecycle-
 * sequence.md) render the same functions with sample data.
 *
 * Rules: short (< 150 words before the footer), only real numbers passed in
 * by the caller, one currency per member (CAD in Canada, USD in the U.S.;
 * Trade Pro's yearly price is CAD-only so U.S. copy never quotes it),
 * Founding 500 never shows a remaining count unless foundingScarcity says
 * "low" (≤ FOUNDING_LOW_SPOTS left). Footer: why you got it, one-click
 * unsubscribe, sender name and postal address (CASL / CAN-SPAM).
 */
import { localizePath, type Locale } from "@/i18n/config";
import { formatDate, formatNumber } from "@/i18n/format";
import { emailUtmUrl } from "@/lib/email/utm";
import { FOUNDING, FOUNDING_LOW_SPOTS, foundingPrice, type FoundingScarcity } from "@/lib/founding/config";
import { FREE_LEAD_LIMIT } from "@/lib/leads/view";
import { THIN_MARKET } from "@/lib/leads/match";
import type { CountryCode } from "@/lib/visitor-geo";
import type { Persona } from "./persona";
import { LIFECYCLE_ADDRESS, LIFECYCLE_SENDER, LIFECYCLE_UTM_SOURCE, isTrialStep, type StepId } from "./config";

/** Regular Trade Pro, CAD a year (lib/site PRICING.proAnnual; billed in CAD only). */
export const TRADE_PRO_ANNUAL_CAD = 249;

export interface CopyData {
  lang: Locale;
  country: CountryCode;
  firstName: string | null;
  company: string;
  /** Display names, already in the member's language. */
  trades: string[];
  /** City, else province/state, in the member's language. */
  area: string | null;
  hasTrades: boolean;
  hasAreas: boolean;
  /** What the copy leads with (lib/lifecycle/persona). */
  persona: Persona;
  market: { openBids: number; projects: number; winners: number; packages: number; total: number };
  /** Up to 3 real lead titles (free view). */
  leadTitles: string[];
  hasProject: boolean;
  hasBadge: boolean;
  /** Their trades with a priced range in their province (what Pro unlocks). */
  proBenchmarks: number;
  benchmark: {
    trade: string;
    province: string;
    valued: number;
    examples: { title: string; amount: number; date: string }[];
    path: string;
  } | null;
  foundingScarcity: FoundingScarcity;
  trial: { endsAt: string; daysLeft: number; alertsSent: number; saved: number; interests: number } | null;
}

export interface RenderContext {
  /** https://pmrfp.com (no trailing slash). */
  base: string;
  /** Signed one-click link (lib/email/unsubscribe lifecycleUnsubscribeUrl), or null when no secret is set. */
  unsubscribeUrl: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  /** Words before the footer (the < 150 rule). */
  words: number;
}

type Block = { p: string } | { list: string[] } | { link: { label: string; url: string } };

/* ------------------------------------------------------------------ helpers */

const NBSP = " ";

/** "$250 CAD" / "250 $ CAD" (fr) / "$200 USD". */
export function money(amount: number, currency: "CAD" | "USD", lang: Locale): string {
  const v = formatNumber(Math.round(amount), lang);
  return lang === "fr" ? `${v}${NBSP}$${NBSP}${currency}` : `$${v}${NBSP}${currency}`;
}

/** Founding 500 in the member's own currency (CAD in Canada, USD in the U.S.). */
export function foundingPriceLabel(country: CountryCode, lang: Locale): string {
  const p = foundingPrice(country);
  return money(p.amount, p.currency === "usd" ? "USD" : "CAD", lang);
}

/** Trade Pro yearly, Canada only (it's billed in CAD; U.S. copy never quotes it). */
export function annualLabel(country: CountryCode, lang: Locale): string | null {
  return country === "CA" ? money(TRADE_PRO_ANNUAL_CAD, "CAD", lang) : null;
}

const pl = (n: number, one: string, other: string) => (n === 1 ? one : other).replace("{n}", String(n));

function joinList(items: string[], lang: Locale): string {
  const and = lang === "fr" ? "et" : lang === "es" ? "y" : "and";
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

export const PATHS = {
  company: "/dashboard/company",
  leads: "/dashboard",
  projectNew: "/dashboard/projects/new",
  badge: "/badge",
  trial: "/dashboard/trial",
  forum: "/forum",
  reputation: "/reputation",
  founding: "/founding-500",
  terms: "/terms#founding-500",
  annual: "/dashboard/billing?plan=pro&interval=annual",
  settings: "/dashboard/settings",
} as const;

/** Our link: localized and tagged utm_source=lifecycle&utm_medium=email&utm_campaign=<step>. */
export function lifecycleUrl(base: string, path: string, lang: Locale, step: StepId): string {
  return emailUtmUrl(`${base.replace(/\/+$/, "")}${localizePath(path, lang)}`, step, false, LIFECYCLE_UTM_SOURCE);
}

/* ------------------------------------------------------------------ strings */

interface Strings {
  hi: (first: string | null) => string;
  why: string;
  whyTrial: string;
  unsub: string;
  unsubManual: string;
  welcome: {
    subject: (first: string | null) => string;
    intro: (company: string) => string;
    todo: string;
    todoCta: string;
    done: (trades: string) => string;
    doneCta: string;
    doneMore: string;
    reply: string;
  };
  market: {
    subject: (trade: string, area: string | null) => string;
    subjectNoTrades: string;
    intro: (trades: string, area: string | null) => string;
    bids: [string, string];
    projects: [string, string];
    winners: [string, string];
    packages: [string, string];
    priceBands: [string, string];
    lens: Record<Persona, string>;
    examples: string;
    cta: string;
    thin: (n: number, trades: string, area: string | null) => string;
    thinTip: string;
    thinCta: string;
    noTrades: string;
  };
  getFound: {
    subject: string;
    introTwo: string;
    introOne: string;
    project: string;
    projectCta: string;
    badge: string;
    badgeCta: string;
  };
  trialOffer: {
    subject: string;
    intro: (shown: number, total: number) => string;
    introSmall: string;
    unlock: Record<Persona, (trade: string) => string>;
    allLeads: (total: number) => string;
    winners: [string, string];
    bench: [string, string];
    alerts: string;
    terms: string;
    cta: string;
  };
  benchmark: {
    subject: (trade: string, province: string) => string;
    intro: (valued: number, trade: string, province: string) => string;
    examples: string;
    pro: string;
    cta: string;
  };
  community: { subject: string; intro: string; karma: string; cta: string; cta2: string };
  founding: {
    subject: string;
    intro: (price: string) => string;
    regular: (annual: string) => string;
    low: (n: number) => string;
    refund: string;
    cta: string;
    terms: string;
  };
  trialDay1: { subject: string; intro: string; feed: (n: number) => string; alerts: string; save: string; cta: string; cta2: string };
  trialDay7: {
    subject: string;
    intro: string;
    alerts: [string, string];
    saved: [string, string];
    interests: [string, string];
    feed: [string, string];
    quiet: (n: number) => string;
    left: [string, string];
    cta: string;
  };
  trialDay12: {
    subject: [string, string];
    intro: (date: string) => string;
    keep: string;
    founding: (price: string) => string;
    annual: (annual: string | null) => string;
    cta: string;
    cta2: string;
  };
  trialExpired: { subject: string; intro: string; offer: (price: string) => string; cta: string; cta2: string };
  winback: {
    subject: (trade: string, area: string | null) => string;
    intro: (n: number, trades: string, area: string | null) => string;
    offer: (price: string, annual: string | null) => string;
    last: string;
    cta: string;
  };
}

const FREE = FREE_LEAD_LIMIT;

const EN: Strings = {
  hi: (f) => (f ? `Hi ${f},` : "Hi,"),
  why: "You're getting this because you have a PMRFP account.",
  whyTrial: "You're getting this because your company started a Trade Pro trial on PMRFP.",
  unsub: "Unsubscribe from these emails",
  unsubManual: 'To stop these emails, reply with "unsubscribe".',
  welcome: {
    subject: (f) => (f ? `Welcome to PMRFP, ${f}` : "Welcome to PMRFP"),
    intro: (c) =>
      `PMRFP finds commercial work for ${c}: open bids and public tenders, new projects and permits, and the contractors who just won jobs and will be hiring subs.`,
    todo: "One thing first: pick your trades and the areas you serve. Every lead we show or email you is matched on those two, so until they're set we can't match anything.",
    todoCta: "Finish your profile (2 minutes)",
    done: (t) => `Your trades (${t}) and areas are set, so your leads are already matched.`,
    doneCta: "See your leads",
    doneMore: "Work in more places or trades? Add them. Leads match on both.",
    reply: "Questions? Just reply to this email.",
  },
  market: {
    subject: (t, a) => (a ? `${t} work in ${a} right now` : `${t} work on PMRFP right now`),
    subjectNoTrades: "Your leads need one thing from you",
    intro: (t, a) => `Here's what PMRFP has matched for ${t}${a ? ` in ${a}` : ""}:`,
    bids: ["{n} open bid or tender", "{n} open bids and tenders"],
    projects: ["{n} new project or permit this month", "{n} new projects and permits this month"],
    winners: ["{n} contractor who won public work this month (they hire subs)", "{n} contractors who won public work this month (they hire subs)"],
    packages: ["{n} GC sub-trade package", "{n} GC sub-trade packages"],
    priceBands: ["Price ranges for {n} of your trades, from real public awards", "Price ranges for {n} of your trades, from real public awards"],
    lens: {
      recurring: "Service contracts come back up for tender. Knowing who holds yours now, and what it paid, is how you get ready for the rebid.",
      specialty: "Each award shows who won and when. The contractor who won is often the one hiring subs next.",
      subtrade: "New projects and permits are where subtrades get in early, before the work is tendered.",
    },
    examples: "A few of them:",
    cta: "See all your leads",
    thin: (n, t, a) => `Honest answer: PMRFP has ${pl(n, "{n} lead", "{n} leads")} for ${t}${a ? ` in ${a}` : ""} right now. That's thin.`,
    thinTip: "Most members widen it by adding nearby areas or a second trade they do. Leads match on both.",
    thinCta: "Add areas or trades",
    noTrades: "You haven't picked your trades yet, so there's nothing to match. It takes two minutes.",
  },
  getFound: {
    subject: "Free ways to get found by property managers",
    introTwo: "Property managers hire trades they can check. Two free things help most:",
    introOne: "Property managers hire trades they can check. One free thing helps a lot:",
    project: "Add a project: before-and-after photos and one sentence. PMRFP writes it up for your profile.",
    projectCta: "Add a project",
    badge: "Put the PMRFP badge on your website. It shows visitors you're listed and links to your profile, projects and reviews.",
    badgeCta: "Get your badge",
  },
  trialOffer: {
    subject: "Try Trade Pro free for 14 days",
    intro: (s, t) => `Your free account shows ${s} of your ${t} matched leads.`,
    introSmall: "Your free account shows your leads, without the details that win work.",
    unlock: {
      recurring: (t) => `Trade Pro shows who holds the ${t} contracts near you, what they paid and when they were awarded, so you can plan for the rebid:`,
      specialty: (t) => `Trade Pro shows who won ${t} work near you, and at what price:`,
      subtrade: () => "If you want the full picture, Trade Pro unlocks:",
    },
    allLeads: (t) => `All ${t} leads, not just the first ${FREE}`,
    winners: ["Who won: the contractor on {n} recent award in your trades", "Who won: the contractors on {n} recent awards in your trades"],
    bench: ["What similar contracts paid: price ranges for {n} of your trades", "What similar contracts paid: price ranges for {n} of your trades"],
    alerts: "New matches emailed to you each morning",
    terms: "14 days free. No card. One click to start, and it just ends: nothing to cancel.",
    cta: "Start the free trial",
  },
  benchmark: {
    subject: (t, p) => `What ${t} jobs sold for in ${p}`,
    intro: (v, t, p) => `PMRFP tracks public contract awards. In the last 24 months, ${v} ${t} contracts in ${p} were awarded with a published price.`,
    examples: "Two recent ones:",
    pro: "Trade Pro shows the full range (low, typical, high), who won, and every award behind it. Worth a look before you price your next bid.",
    cta: "See the benchmark",
  },
  community: {
    subject: "Ask other trades, and get credit for good answers",
    intro: "The PMRFP forum is where trades compare notes: pricing, prequalification, slow-paying clients, which tenders are worth the effort.",
    karma: "Helpful answers earn reputation points that show on your company profile, so property managers can see you know the work.",
    cta: "Visit the forum",
    cta2: "How reputation works",
  },
  founding: {
    subject: "Founding 500: Trade Pro for life, one payment",
    intro: (p) => `A plain offer while PMRFP is early: Founding 500 members pay once, ${p}, and keep Trade Pro for life. No renewals.`,
    regular: (a) => `Trade Pro is otherwise ${a} a year.`,
    low: (n) => `Fewer than ${n} spots are left.`,
    refund: `Not for you? Email us within ${FOUNDING.refundDays} days for a full refund.`,
    cta: "See the offer",
    terms: "Terms",
  },
  trialDay1: {
    subject: "Your Trade Pro trial is on",
    intro: "Your 14-day trial is running. Three things to do first:",
    feed: (n) =>
      n > 0
        ? `Open your lead feed: all ${n} matched leads, with contractor names and bid-list links where we have them.`
        : "Open your lead feed: contractor names and bid-list links show where we have them.",
    alerts: "Check your alert settings, so new matches reach your inbox each morning.",
    save: "Save the bids you want and send interest straight from the listing.",
    cta: "Open your leads",
    cta2: "Alert settings",
  },
  trialDay7: {
    subject: "A week into your trial: what you've seen",
    intro: "A week in. Your trial so far:",
    alerts: ["{n} new lead emailed to you", "{n} new leads emailed to you"],
    saved: ["{n} bid saved", "{n} bids saved"],
    interests: ["{n} interest sent", "{n} interests sent"],
    feed: ["{n} lead in your feed right now", "{n} leads in your feed right now"],
    quiet: (n) => `Quiet week on your side. Your feed has ${pl(n, "{n} lead", "{n} leads")} waiting.`,
    left: ["{n} day left.", "{n} days left."],
    cta: "Open your leads",
  },
  trialDay12: {
    subject: ["{n} day left on your Trade Pro trial", "{n} days left on your Trade Pro trial"],
    intro: (d) => `Your trial ends ${d}. After that you're back on the free account: the first ${FREE} leads, no contractor names, no price ranges.`,
    keep: "To keep Trade Pro:",
    founding: (p) => `Founding 500: ${p} once, Trade Pro for life (${FOUNDING.refundDays}-day refund)`,
    annual: (a) => (a ? `Or Trade Pro at ${a} a year` : "Or Trade Pro by the year"),
    cta: "See Founding 500",
    cta2: "Trade Pro yearly",
  },
  trialExpired: {
    subject: "Your trial ended. Your free account stays.",
    intro: "Your Trade Pro trial ended today. No charge and nothing to cancel: your free account and profile stay as they are.",
    offer: (p) => `If the leads were useful, Founding 500 is still open: ${p} once, Trade Pro for life, with a ${FOUNDING.refundDays}-day refund.`,
    cta: "See Founding 500",
    cta2: "Trade Pro yearly",
  },
  winback: {
    subject: (t, a) => `Still looking for ${t} work${a ? ` in ${a}` : ""}?`,
    intro: (n, t, a) => `PMRFP has ${pl(n, "{n} lead", "{n} leads")} matched for ${t}${a ? ` in ${a}` : ""} right now. Your free account shows the first ${FREE}.`,
    offer: (p, a) => `To see them all again: Founding 500 (${p} once, for life) or Trade Pro ${a ? `at ${a} a year` : "by the year"}.`,
    last: "This is the last email about it. Your free account stays either way.",
    cta: "See Founding 500",
  },
};

const FR: Strings = {
  hi: (f) => (f ? `Bonjour ${f},` : "Bonjour,"),
  why: "Vous recevez ce courriel parce que vous avez un compte PMRFP.",
  whyTrial: "Vous recevez ce courriel parce que votre entreprise a commencé un essai Trade Pro sur PMRFP.",
  unsub: "Se désabonner de ces courriels",
  unsubManual: "Pour ne plus recevoir ces courriels, répondez « désabonner ».",
  welcome: {
    subject: (f) => (f ? `Bienvenue sur PMRFP, ${f}` : "Bienvenue sur PMRFP"),
    intro: (c) =>
      `PMRFP trouve du travail commercial pour ${c} : appels d'offres et marchés publics ouverts, nouveaux projets et permis, et les entrepreneurs qui viennent de remporter des contrats et vont embaucher des sous-traitants.`,
    todo: "Une chose d'abord : choisissez vos corps de métier et les régions que vous desservez. Chaque occasion qu'on vous montre ou vous envoie est jumelée sur ces deux critères; sans eux, on ne peut rien jumeler.",
    todoCta: "Compléter votre profil (2 minutes)",
    done: (t) => `Vos corps de métier (${t}) et vos régions sont choisis : vos occasions sont déjà jumelées.`,
    doneCta: "Voir vos occasions",
    doneMore: "Vous travaillez ailleurs ou dans d'autres métiers? Ajoutez-les. Les occasions sont jumelées sur les deux.",
    reply: "Des questions? Répondez simplement à ce courriel.",
  },
  market: {
    subject: (t, a) => (a ? `${t}, ${a} : vos occasions en ce moment` : `${t} : vos occasions en ce moment`),
    subjectNoTrades: "Vos occasions attendent une chose de vous",
    intro: (t, a) => `Voici ce que PMRFP a jumelé pour ${t}${a ? ` (${a})` : ""} :`,
    bids: ["{n} appel d'offres ouvert", "{n} appels d'offres ouverts"],
    projects: ["{n} nouveau projet ou permis ce mois-ci", "{n} nouveaux projets et permis ce mois-ci"],
    winners: [
      "{n} entrepreneur qui a remporté un contrat public ce mois-ci (il embauche des sous-traitants)",
      "{n} entrepreneurs qui ont remporté des contrats publics ce mois-ci (ils embauchent des sous-traitants)",
    ],
    packages: ["{n} lot de sous-traitance d'entrepreneur général", "{n} lots de sous-traitance d'entrepreneurs généraux"],
    priceBands: ["Des fourchettes de prix pour {n} de vos métiers, tirées de vrais contrats publics", "Des fourchettes de prix pour {n} de vos métiers, tirées de vrais contrats publics"],
    lens: {
      recurring: "Les contrats de service reviennent en appel d'offres. Savoir qui détient le vôtre et à quel prix, c'est comme ça qu'on se prépare au prochain appel.",
      specialty: "Chaque contrat attribué montre qui a gagné et quand. L'entrepreneur qui gagne est souvent celui qui embauche des sous-traitants ensuite.",
      subtrade: "Les nouveaux projets et permis, c'est là que les sous-traitants entrent tôt, avant l'appel d'offres.",
    },
    examples: "Quelques exemples :",
    cta: "Voir toutes vos occasions",
    thin: (n, t, a) => `Réponse honnête : PMRFP a ${pl(n, "{n} occasion", "{n} occasions")} pour ${t}${a ? ` (${a})` : ""} en ce moment. C'est mince.`,
    thinTip: "La plupart des membres élargissent en ajoutant des régions voisines ou un deuxième métier qu'ils font. Les occasions sont jumelées sur les deux.",
    thinCta: "Ajouter des régions ou des métiers",
    noTrades: "Vous n'avez pas encore choisi vos corps de métier, donc il n'y a rien à jumeler. Ça prend deux minutes.",
  },
  getFound: {
    subject: "Des façons gratuites de vous faire trouver",
    introTwo: "Les gestionnaires immobiliers embauchent des entrepreneurs qu'ils peuvent vérifier. Deux choses gratuites aident le plus :",
    introOne: "Les gestionnaires immobiliers embauchent des entrepreneurs qu'ils peuvent vérifier. Une chose gratuite aide beaucoup :",
    project: "Ajoutez un projet : des photos avant-après et une phrase. PMRFP rédige le reste pour votre profil.",
    projectCta: "Ajouter un projet",
    badge: "Mettez le badge PMRFP sur votre site Web. Il montre aux visiteurs que vous êtes inscrit et mène à votre profil, vos projets et vos avis.",
    badgeCta: "Obtenir votre badge",
  },
  trialOffer: {
    subject: "Essayez Trade Pro gratuitement pendant 14 jours",
    intro: (s, t) => `Votre compte gratuit montre ${s} de vos ${t} occasions jumelées.`,
    introSmall: "Votre compte gratuit montre vos occasions, sans les détails qui font gagner des contrats.",
    unlock: {
      recurring: (t) => `Trade Pro montre qui détient les contrats en ${t} près de chez vous, à quel prix et quand ils ont été attribués, pour planifier le prochain appel d'offres :`,
      specialty: (t) => `Trade Pro montre qui a remporté le travail en ${t} près de chez vous, et à quel prix :`,
      subtrade: () => "Pour avoir le portrait complet, Trade Pro débloque :",
    },
    allLeads: (t) => `Les ${t} occasions, pas seulement les ${FREE} premières`,
    winners: ["Qui a gagné : l'entrepreneur de {n} contrat récent dans vos métiers", "Qui a gagné : les entrepreneurs de {n} contrats récents dans vos métiers"],
    bench: ["Ce que des contrats semblables ont payé : fourchettes de prix pour {n} de vos métiers", "Ce que des contrats semblables ont payé : fourchettes de prix pour {n} de vos métiers"],
    alerts: "Les nouvelles occasions par courriel chaque matin",
    terms: "14 jours gratuits. Sans carte. Un clic pour commencer, et l'essai se termine tout seul : rien à annuler.",
    cta: "Commencer l'essai gratuit",
  },
  benchmark: {
    subject: (t, p) => `${t}, ${p} : à quel prix les contrats se sont conclus`,
    intro: (v, t, p) => `PMRFP suit les contrats publics attribués. Au cours des 24 derniers mois, ${v} contrats publics (${t}, ${p}) ont été attribués avec un prix publié.`,
    examples: "Deux exemples récents :",
    pro: "Trade Pro montre la fourchette complète (bas, typique, haut), qui a gagné et chaque contrat derrière les chiffres. Utile avant de chiffrer votre prochaine soumission.",
    cta: "Voir la référence de prix",
  },
  community: {
    subject: "Posez vos questions aux autres entrepreneurs (et obtenez du crédit)",
    intro: "Le forum PMRFP, c'est là où les entrepreneurs comparent leurs notes : prix, préqualification, clients qui paient en retard, appels d'offres qui en valent la peine.",
    karma: "Les réponses utiles rapportent des points de réputation visibles sur votre profil d'entreprise, pour que les gestionnaires voient que vous connaissez votre métier.",
    cta: "Visiter le forum",
    cta2: "Comment fonctionne la réputation",
  },
  founding: {
    subject: "Fondateurs 500 : Trade Pro à vie, un seul paiement",
    intro: (p) => `Une offre simple pendant que PMRFP est jeune : les membres Fondateurs 500 paient une fois, ${p}, et gardent Trade Pro à vie. Aucun renouvellement.`,
    regular: (a) => `Sinon, Trade Pro coûte ${a} par année.`,
    low: (n) => `Il reste moins de ${n} places.`,
    refund: `Ce n'est pas pour vous? Écrivez-nous dans les ${FOUNDING.refundDays} jours pour un remboursement complet.`,
    cta: "Voir l'offre",
    terms: "Conditions",
  },
  trialDay1: {
    subject: "Votre essai Trade Pro est commencé",
    intro: "Votre essai de 14 jours est en cours. Trois choses à faire d'abord :",
    feed: (n) =>
      n > 0
        ? `Ouvrez votre fil : vos ${n} occasions jumelées, avec le nom des entrepreneurs et les liens vers les listes de soumissionnaires quand on les a.`
        : "Ouvrez votre fil : le nom des entrepreneurs et les liens vers les listes de soumissionnaires s'affichent quand on les a.",
    alerts: "Vérifiez vos réglages d'alertes, pour recevoir les nouvelles occasions chaque matin.",
    save: "Sauvegardez les appels d'offres qui vous intéressent et manifestez votre intérêt directement depuis l'annonce.",
    cta: "Ouvrir vos occasions",
    cta2: "Réglages d'alertes",
  },
  trialDay7: {
    subject: "Une semaine d'essai : ce que vous avez vu",
    intro: "Une semaine de faite. Votre essai jusqu'ici :",
    alerts: ["{n} nouvelle occasion envoyée par courriel", "{n} nouvelles occasions envoyées par courriel"],
    saved: ["{n} appel d'offres sauvegardé", "{n} appels d'offres sauvegardés"],
    interests: ["{n} manifestation d'intérêt envoyée", "{n} manifestations d'intérêt envoyées"],
    feed: ["{n} occasion dans votre fil en ce moment", "{n} occasions dans votre fil en ce moment"],
    quiet: (n) => `Semaine tranquille de votre côté. Votre fil a ${pl(n, "{n} occasion", "{n} occasions")} qui vous attendent.`,
    left: ["Il reste {n} jour.", "Il reste {n} jours."],
    cta: "Ouvrir vos occasions",
  },
  trialDay12: {
    subject: ["Plus que {n} jour à votre essai Trade Pro", "Plus que {n} jours à votre essai Trade Pro"],
    intro: (d) => `Votre essai se termine le ${d}. Ensuite, vous revenez au compte gratuit : les ${FREE} premières occasions, sans nom d'entrepreneur ni fourchette de prix.`,
    keep: "Pour garder Trade Pro :",
    founding: (p) => `Fondateurs 500 : ${p} une fois, Trade Pro à vie (remboursement sous ${FOUNDING.refundDays} jours)`,
    annual: (a) => (a ? `Ou Trade Pro à ${a} par année` : "Ou Trade Pro à l'année"),
    cta: "Voir Fondateurs 500",
    cta2: "Trade Pro à l'année",
  },
  trialExpired: {
    subject: "Votre essai est terminé. Votre compte gratuit reste.",
    intro: "Votre essai Trade Pro s'est terminé aujourd'hui. Aucuns frais, rien à annuler : votre compte gratuit et votre profil restent tels quels.",
    offer: (p) => `Si les occasions vous ont été utiles, Fondateurs 500 est encore ouvert : ${p} une fois, Trade Pro à vie, remboursement sous ${FOUNDING.refundDays} jours.`,
    cta: "Voir Fondateurs 500",
    cta2: "Trade Pro à l'année",
  },
  winback: {
    subject: (t, a) => `Toujours à la recherche de travail en ${t}${a ? ` (${a})` : ""}?`,
    intro: (n, t, a) =>
      `PMRFP a ${pl(n, "{n} occasion jumelée", "{n} occasions jumelées")} pour ${t}${a ? ` (${a})` : ""} en ce moment. Votre compte gratuit montre les ${FREE} premières.`,
    offer: (p, a) => `Pour toutes les revoir : Fondateurs 500 (${p} une fois, à vie) ou Trade Pro ${a ? `à ${a} par année` : "à l'année"}.`,
    last: "C'est le dernier courriel à ce sujet. Votre compte gratuit reste, peu importe.",
    cta: "Voir Fondateurs 500",
  },
};

const ES: Strings = {
  hi: (f) => (f ? `Hola, ${f}:` : "Hola:"),
  why: "Recibe este correo porque tiene una cuenta en PMRFP.",
  whyTrial: "Recibe este correo porque su empresa comenzó una prueba de Trade Pro en PMRFP.",
  unsub: "Cancelar la suscripción a estos correos",
  unsubManual: "Para dejar de recibir estos correos, responda «cancelar».",
  welcome: {
    subject: (f) => (f ? `Bienvenido a PMRFP, ${f}` : "Bienvenido a PMRFP"),
    intro: (c) =>
      `PMRFP encuentra trabajo comercial para ${c}: licitaciones abiertas, proyectos y permisos nuevos, y los contratistas que acaban de ganar obras y van a contratar subcontratistas.`,
    todo: "Primero, una cosa: elija sus oficios y las zonas donde trabaja. Cada oportunidad que le mostramos o enviamos se busca con esos dos datos; sin ellos no podemos encontrar nada.",
    todoCta: "Complete su perfil (2 minutos)",
    done: (t) => `Sus oficios (${t}) y zonas ya están elegidos, así que sus oportunidades ya están listas.`,
    doneCta: "Ver sus oportunidades",
    doneMore: "¿Trabaja en más zonas u oficios? Agréguelos. Las oportunidades se buscan con ambos.",
    reply: "¿Preguntas? Solo responda a este correo.",
  },
  market: {
    subject: (t, a) => (a ? `${t} en ${a}: lo que hay ahora` : `${t}: lo que hay en PMRFP ahora`),
    subjectNoTrades: "Sus oportunidades necesitan una cosa de usted",
    intro: (t, a) => `Esto es lo que PMRFP encontró para ${t}${a ? ` en ${a}` : ""}:`,
    bids: ["{n} licitación abierta", "{n} licitaciones abiertas"],
    projects: ["{n} proyecto o permiso nuevo este mes", "{n} proyectos y permisos nuevos este mes"],
    winners: [
      "{n} contratista que ganó obra pública este mes (contrata subcontratistas)",
      "{n} contratistas que ganaron obra pública este mes (contratan subcontratistas)",
    ],
    packages: ["{n} paquete de subcontrato de un contratista general", "{n} paquetes de subcontrato de contratistas generales"],
    priceBands: ["Rangos de precios para {n} de sus oficios, de adjudicaciones públicas reales", "Rangos de precios para {n} de sus oficios, de adjudicaciones públicas reales"],
    lens: {
      recurring: "Los contratos de servicio vuelven a licitarse. Saber quién tiene el suyo ahora, y cuánto cobró, es como se prepara para la próxima licitación.",
      specialty: "Cada adjudicación muestra quién ganó y cuándo. El contratista que gana suele ser quien contrata subcontratistas después.",
      subtrade: "Los proyectos y permisos nuevos son donde los subcontratistas entran temprano, antes de que se licite la obra.",
    },
    examples: "Algunos ejemplos:",
    cta: "Ver todas sus oportunidades",
    thin: (n, t, a) => `Respuesta honesta: PMRFP tiene ${pl(n, "{n} oportunidad", "{n} oportunidades")} para ${t}${a ? ` en ${a}` : ""} ahora mismo. Es poco.`,
    thinTip: "La mayoría de los miembros lo amplía agregando zonas cercanas o un segundo oficio que hacen. Las oportunidades se buscan con ambos.",
    thinCta: "Agregar zonas u oficios",
    noTrades: "Todavía no eligió sus oficios, así que no hay nada que buscar. Toma dos minutos.",
  },
  getFound: {
    subject: "Formas gratuitas de que lo encuentren",
    introTwo: "Los administradores de propiedades contratan a quienes pueden verificar. Dos cosas gratuitas ayudan más:",
    introOne: "Los administradores de propiedades contratan a quienes pueden verificar. Una cosa gratuita ayuda mucho:",
    project: "Agregue un proyecto: fotos de antes y después y una frase. PMRFP redacta el resto para su perfil.",
    projectCta: "Agregar un proyecto",
    badge: "Ponga la insignia de PMRFP en su sitio web. Muestra a los visitantes que está registrado y lleva a su perfil, sus proyectos y sus reseñas.",
    badgeCta: "Obtener su insignia",
  },
  trialOffer: {
    subject: "Pruebe Trade Pro gratis durante 14 días",
    intro: (s, t) => `Su cuenta gratuita muestra ${s} de sus ${t} oportunidades.`,
    introSmall: "Su cuenta gratuita muestra sus oportunidades, sin los detalles que ayudan a ganar obras.",
    unlock: {
      recurring: (t) => `Trade Pro muestra quién tiene los contratos de ${t} cerca de usted, cuánto cobraron y cuándo se adjudicaron, para planear la próxima licitación:`,
      specialty: (t) => `Trade Pro muestra quién ganó obras de ${t} cerca de usted, y a qué precio:`,
      subtrade: () => "Si quiere el panorama completo, Trade Pro le abre:",
    },
    allLeads: (t) => `Las ${t} oportunidades, no solo las primeras ${FREE}`,
    winners: ["Quién ganó: el contratista de {n} adjudicación reciente en sus oficios", "Quién ganó: los contratistas de {n} adjudicaciones recientes en sus oficios"],
    bench: ["Lo que pagaron contratos similares: rangos de precios para {n} de sus oficios", "Lo que pagaron contratos similares: rangos de precios para {n} de sus oficios"],
    alerts: "Las nuevas oportunidades por correo cada mañana",
    terms: "14 días gratis. Sin tarjeta. Un clic para empezar, y termina sola: nada que cancelar.",
    cta: "Empezar la prueba gratis",
  },
  benchmark: {
    subject: (t, p) => `${t} en ${p}: a qué precio se adjudicaron los contratos`,
    intro: (v, t, p) => `PMRFP sigue las adjudicaciones de contratos públicos. En los últimos 24 meses se adjudicaron ${v} contratos de ${t} en ${p} con precio publicado.`,
    examples: "Dos recientes:",
    pro: "Trade Pro muestra el rango completo (bajo, típico, alto), quién ganó y cada adjudicación detrás de las cifras. Útil antes de cotizar su próxima oferta.",
    cta: "Ver la referencia de precios",
  },
  community: {
    subject: "Pregunte a otros contratistas y gane crédito por buenas respuestas",
    intro: "El foro de PMRFP es donde los contratistas comparan notas: precios, precalificación, clientes que pagan tarde, qué licitaciones valen la pena.",
    karma: "Las respuestas útiles suman puntos de reputación que se ven en el perfil de su empresa, para que los administradores vean que conoce el oficio.",
    cta: "Visitar el foro",
    cta2: "Cómo funciona la reputación",
  },
  founding: {
    subject: "Fundadores 500: Trade Pro de por vida con un solo pago",
    intro: (p) => `Una oferta sencilla mientras PMRFP es nuevo: los miembros Fundadores 500 pagan una vez, ${p}, y conservan Trade Pro de por vida. Sin renovaciones.`,
    regular: (a) => `De lo contrario, Trade Pro cuesta ${a} al año.`,
    low: (n) => `Quedan menos de ${n} lugares.`,
    refund: `¿No es para usted? Escríbanos dentro de ${FOUNDING.refundDays} días y le devolvemos todo.`,
    cta: "Ver la oferta",
    terms: "Condiciones",
  },
  trialDay1: {
    subject: "Su prueba de Trade Pro ya empezó",
    intro: "Su prueba de 14 días está activa. Tres cosas para empezar:",
    feed: (n) =>
      n > 0
        ? `Abra sus oportunidades: las ${n}, con nombres de contratistas y enlaces a listas de oferentes cuando los tenemos.`
        : "Abra sus oportunidades: los nombres de contratistas y los enlaces a listas de oferentes aparecen cuando los tenemos.",
    alerts: "Revise sus alertas, para recibir las nuevas oportunidades cada mañana.",
    save: "Guarde las licitaciones que le interesan y envíe su interés desde el anuncio.",
    cta: "Abrir sus oportunidades",
    cta2: "Configurar alertas",
  },
  trialDay7: {
    subject: "Una semana de prueba: lo que ha visto",
    intro: "Una semana. Su prueba hasta ahora:",
    alerts: ["{n} oportunidad nueva enviada por correo", "{n} oportunidades nuevas enviadas por correo"],
    saved: ["{n} licitación guardada", "{n} licitaciones guardadas"],
    interests: ["{n} interés enviado", "{n} intereses enviados"],
    feed: ["{n} oportunidad en su lista ahora", "{n} oportunidades en su lista ahora"],
    quiet: (n) => `Semana tranquila de su lado. Tiene ${pl(n, "{n} oportunidad", "{n} oportunidades")} esperando.`,
    left: ["Queda {n} día.", "Quedan {n} días."],
    cta: "Abrir sus oportunidades",
  },
  trialDay12: {
    subject: ["Queda {n} día de su prueba de Trade Pro", "Quedan {n} días de su prueba de Trade Pro"],
    intro: (d) => `Su prueba termina el ${d}. Después vuelve a la cuenta gratuita: las primeras ${FREE} oportunidades, sin nombres de contratistas ni rangos de precios.`,
    keep: "Para conservar Trade Pro:",
    founding: (p) => `Fundadores 500: ${p} una vez, Trade Pro de por vida (reembolso en ${FOUNDING.refundDays} días)`,
    annual: (a) => (a ? `O Trade Pro a ${a} al año` : "O Trade Pro por año"),
    cta: "Ver Fundadores 500",
    cta2: "Trade Pro anual",
  },
  trialExpired: {
    subject: "Su prueba terminó. Su cuenta gratuita sigue.",
    intro: "Su prueba de Trade Pro terminó hoy. Sin cargos y nada que cancelar: su cuenta gratuita y su perfil siguen igual.",
    offer: (p) => `Si las oportunidades le sirvieron, Fundadores 500 sigue abierto: ${p} una vez, Trade Pro de por vida, con reembolso en ${FOUNDING.refundDays} días.`,
    cta: "Ver Fundadores 500",
    cta2: "Trade Pro anual",
  },
  winback: {
    subject: (t, a) => `¿Sigue buscando trabajo de ${t}${a ? ` en ${a}` : ""}?`,
    intro: (n, t, a) => `PMRFP tiene ${pl(n, "{n} oportunidad", "{n} oportunidades")} para ${t}${a ? ` en ${a}` : ""} ahora mismo. Su cuenta gratuita muestra las primeras ${FREE}.`,
    offer: (p, a) => `Para verlas todas otra vez: Fundadores 500 (${p} una vez, de por vida) o Trade Pro ${a ? `a ${a} al año` : "por año"}.`,
    last: "Es el último correo sobre esto. Su cuenta gratuita sigue de todos modos.",
    cta: "Ver Fundadores 500",
  },
};

export const STRINGS: Record<Locale, Strings> = { en: EN, fr: FR, es: ES };

/* ------------------------------------------------------------------ steps */

function body(step: StepId, d: CopyData, url: (path: string) => string): { subject: string; blocks: Block[] } {
  const s = STRINGS[d.lang];
  const trades = d.trades.length ? joinList(d.trades.slice(0, 3), d.lang) : "";
  const firstTrade = d.trades[0] ?? "";
  const founding = foundingPriceLabel(d.country, d.lang);
  const annual = annualLabel(d.country, d.lang);
  const link = (label: string, path: string): Block => ({ link: { label, url: url(path) } });

  switch (step) {
    case "welcome": {
      const w = s.welcome;
      const done = d.hasTrades && d.hasAreas;
      return {
        subject: w.subject(d.firstName),
        blocks: done
          ? [{ p: w.intro(d.company) }, { p: w.done(trades) }, link(w.doneCta, PATHS.leads), { p: w.doneMore }, { p: w.reply }]
          : [{ p: w.intro(d.company) }, { p: w.todo }, link(w.todoCta, PATHS.company), { p: w.reply }],
      };
    }
    case "market": {
      const m = s.market;
      if (!d.hasTrades) return { subject: m.subjectNoTrades, blocks: [{ p: m.noTrades }, link(m.thinCta, PATHS.company)] };
      const c = d.market;
      // Honest when there's nothing; never an empty "your market" when price bands exist.
      if (c.total < THIN_MARKET && !d.proBenchmarks) {
        return { subject: m.subject(firstTrade, d.area), blocks: [{ p: m.thin(c.total, trades, d.area) }, { p: m.thinTip }, link(m.thinCta, PATHS.company)] };
      }
      const lines = marketLines(d, m).filter((x): x is string => Boolean(x));
      const blocks: Block[] = [{ p: m.intro(trades, d.area) }, { list: lines }, { p: m.lens[d.persona] }];
      if (d.leadTitles.length) blocks.push({ p: m.examples }, { list: d.leadTitles.slice(0, 3) });
      blocks.push(link(m.cta, PATHS.leads));
      return { subject: m.subject(firstTrade, d.area), blocks };
    }
    case "get_found": {
      const g = s.getFound;
      const todo: Block[] = [];
      if (!d.hasProject) todo.push({ p: g.project }, link(g.projectCta, PATHS.projectNew));
      if (!d.hasBadge) todo.push({ p: g.badge }, link(g.badgeCta, PATHS.badge));
      return { subject: g.subject, blocks: [{ p: todo.length > 2 ? g.introTwo : g.introOne }, ...todo] };
    }
    case "trial_offer": {
      const t = s.trialOffer;
      const total = d.market.total;
      const all = total > FREE ? t.allLeads(total) : null;
      const won = d.market.winners ? pl(d.market.winners, ...t.winners) : null;
      const paid = d.proBenchmarks ? pl(d.proBenchmarks, ...t.bench) : null;
      // Sell "who wins this work and what it paid", not bid alerts; subtrades get the softer, leads-first version.
      const unlocks = (d.persona === "subtrade" ? [all, won, paid, t.alerts] : [won, paid, all, t.alerts]).filter((x): x is string => Boolean(x));
      return {
        subject: t.subject,
        blocks: [
          { p: total > FREE ? t.intro(FREE, total) : t.introSmall },
          { p: t.unlock[d.persona](firstTrade) },
          { list: unlocks },
          { p: t.terms },
          link(t.cta, PATHS.trial),
        ],
      };
    }
    case "benchmark": {
      const b = s.benchmark;
      const bm = d.benchmark!;
      const cur = d.country === "US" ? "USD" : "CAD";
      const ex = bm.examples.slice(0, 2).map((e) => `${e.title}: ${money(e.amount, cur, d.lang)} (${formatDate(`${e.date}T12:00:00Z`, d.lang)})`);
      return {
        subject: b.subject(bm.trade, bm.province),
        blocks: [{ p: b.intro(bm.valued, bm.trade, bm.province) }, ...(ex.length ? [{ p: b.examples }, { list: ex }] : []), { p: b.pro }, link(b.cta, bm.path)],
      };
    }
    case "community": {
      const c = s.community;
      return { subject: c.subject, blocks: [{ p: c.intro }, link(c.cta, PATHS.forum), { p: c.karma }, link(c.cta2, PATHS.reputation)] };
    }
    case "founding": {
      const f = s.founding;
      const lead = [f.intro(founding), annual ? f.regular(annual) : null, d.foundingScarcity === "low" ? f.low(FOUNDING_LOW_SPOTS) : null].filter(Boolean).join(" ");
      return { subject: f.subject, blocks: [{ p: lead }, { p: f.refund }, link(f.cta, PATHS.founding), link(f.terms, PATHS.terms)] };
    }
    case "trial_day1": {
      const t = s.trialDay1;
      return {
        subject: t.subject,
        blocks: [{ p: t.intro }, { list: [t.feed(d.market.total), t.alerts, t.save] }, link(t.cta, PATHS.leads), link(t.cta2, PATHS.settings)],
      };
    }
    case "trial_day7": {
      const t = s.trialDay7;
      const tr = d.trial ?? { endsAt: "", daysLeft: 7, alertsSent: 0, saved: 0, interests: 0 };
      const active = tr.alertsSent + tr.saved + tr.interests > 0;
      const blocks: Block[] = active
        ? [
            { p: t.intro },
            {
              list: [
                pl(tr.alertsSent, ...t.alerts),
                pl(tr.saved, ...t.saved),
                pl(tr.interests, ...t.interests),
                pl(d.market.total, ...t.feed),
              ],
            },
          ]
        : [{ p: t.quiet(d.market.total) }];
      blocks.push({ p: pl(tr.daysLeft, ...t.left) }, link(t.cta, PATHS.leads));
      return { subject: t.subject, blocks };
    }
    case "trial_day12": {
      const t = s.trialDay12;
      const tr = d.trial ?? { endsAt: new Date().toISOString(), daysLeft: 2, alertsSent: 0, saved: 0, interests: 0 };
      const date = formatDate(tr.endsAt, d.lang, { month: "long", day: "numeric" });
      return {
        subject: pl(tr.daysLeft, ...t.subject),
        blocks: [{ p: t.intro(date) }, { p: t.keep }, { list: [t.founding(founding), t.annual(annual)] }, link(t.cta, PATHS.founding), link(t.cta2, PATHS.annual)],
      };
    }
    case "trial_expired": {
      const t = s.trialExpired;
      return { subject: t.subject, blocks: [{ p: t.intro }, { p: t.offer(founding) }, link(t.cta, PATHS.founding), link(t.cta2, PATHS.annual)] };
    }
    case "trial_winback": {
      const t = s.winback;
      return {
        subject: t.subject(firstTrade || "PMRFP", d.area),
        blocks: [{ p: t.intro(d.market.total, trades || "PMRFP", d.area) }, { p: t.offer(founding, annual) }, link(t.cta, PATHS.founding), { p: t.last }],
      };
    }
  }
}

/**
 * The "your market" lines, in persona order. Fewer than 3 open bids: bids go
 * last and awards, GC packages, projects and price bands lead.
 */
function marketLines(d: CopyData, m: Strings["market"]): (string | null)[] {
  const c = d.market;
  const bids = c.openBids ? pl(c.openBids, ...m.bids) : null;
  const projects = c.projects ? pl(c.projects, ...m.projects) : null;
  const winners = c.winners ? pl(c.winners, ...m.winners) : null;
  const packages = c.packages ? pl(c.packages, ...m.packages) : null;
  const bands = d.proBenchmarks ? pl(d.proBenchmarks, ...m.priceBands) : null;
  const fewBids = c.openBids < 3;
  if (d.persona === "subtrade") return fewBids ? [projects, packages, winners, bands, bids] : [projects, packages, bids, winners, bands];
  return fewBids ? [winners, bands, packages, projects, bids] : [winners, bids, bands, packages, projects];
}

/* ------------------------------------------------------------------ render */

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SIGNATURE = ["R. Talkar", "PMRFP"];

function countWords(lines: string[]): number {
  return lines.join(" ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w) && !/^https?:\/\//.test(w)).length;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The email for one step, in the member's language. */
export function renderStep(step: StepId, d: CopyData, ctx: RenderContext): RenderedEmail {
  const s = STRINGS[d.lang];
  const url = (path: string) => lifecycleUrl(ctx.base, path, d.lang, step);
  const { subject, blocks } = body(step, d, url);
  const all: Block[] = [{ p: s.hi(d.firstName) }, ...blocks];

  // Text first. French puts a space before the colon.
  const colon = d.lang === "fr" ? " :" : ":";
  const textLines: string[] = [];
  const wordLines: string[] = [];
  for (const b of all) {
    if ("p" in b) {
      textLines.push(b.p, "");
      wordLines.push(b.p);
    } else if ("list" in b) {
      for (const li of b.list) {
        textLines.push(`- ${li}`);
        wordLines.push(li);
      }
      textLines.push("");
    } else {
      textLines.push(`${b.link.label}${colon} ${b.link.url}`, "");
      wordLines.push(b.link.label);
    }
  }
  textLines.push(...SIGNATURE, "", "--");
  const why = isTrialStep(step) ? s.whyTrial : s.why;
  const unsubLine = ctx.unsubscribeUrl ? `${s.unsub}${colon} ${ctx.unsubscribeUrl}` : s.unsubManual;
  textLines.push(why, unsubLine, `${LIFECYCLE_SENDER}, ${LIFECYCLE_ADDRESS} · info@pmrfp.com`);
  const text = textLines.join("\n");

  // A simple HTML wrapper of the same blocks.
  const p = (inner: string) => `<p style="margin:0 0 16px">${inner}</p>`;
  const htmlBlocks = all
    .map((b) => {
      if ("p" in b) return p(esc(b.p));
      if ("list" in b) return `<ul style="margin:0 0 16px;padding-left:20px">${b.list.map((li) => `<li style="margin:0 0 6px">${esc(li)}</li>`).join("")}</ul>`;
      return p(`<a href="${esc(b.link.url)}" style="color:#282B59;font-weight:600">${esc(b.link.label)}</a>`);
    })
    .join("\n");
  const footer = [
    esc(why),
    ctx.unsubscribeUrl ? `<a href="${esc(ctx.unsubscribeUrl)}" style="color:#64748b">${esc(s.unsub)}</a>` : esc(s.unsubManual),
    `${esc(LIFECYCLE_SENDER)}, ${esc(LIFECYCLE_ADDRESS)} · <a href="mailto:info@pmrfp.com" style="color:#64748b">info@pmrfp.com</a>`,
  ].join("<br>");
  const htmlLang = d.lang === "fr" ? "fr-CA" : d.lang === "es" ? "es-US" : "en-CA";
  const html = `<!doctype html>
<html lang="${htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 16px;background:#ffffff;">
<div style="max-width:560px;margin:0 auto;font-family:${FONT};font-size:16px;line-height:24px;color:#1B1E45;">
${htmlBlocks}
<p style="margin:0 0 24px">${SIGNATURE.map(esc).join("<br>")}</p>
<p style="margin:0;padding-top:16px;border-top:1px solid #E6E8F0;font-size:12px;line-height:18px;color:#64748b">${footer}</p>
</div>
</body></html>`;

  return { subject, text, html, words: countWords(wordLines) };
}

/* ------------------------------------------------------------------ samples */

const SAMPLE_TITLES: Record<CountryCode, string[]> = {
  CA: ["Roof replacement, 4 low-rise residential blocks (Toronto Community Housing)", "New 18-storey rental tower, Mississauga: building permit issued", "HVAC upgrades, Peel District School Board (awarded)"],
  US: ["Roof replacement, county courthouse annex (Travis County)", "New 240-unit multifamily project, Austin: permit issued", "HVAC retrofit, city library branches (awarded)"],
};

/**
 * Sample data for the admin preview and the brief: plausible, clearly a
 * preview (the cron never uses it). Country-consistent: a Canadian sample is
 * Ontario + CAD, a U.S. sample Texas + USD.
 */
export function sampleCopyData(step: StepId, lang: Locale, country: CountryCode = "CA", persona: Persona = "specialty"): CopyData {
  const ca = country === "CA";
  const trades = lang === "fr" ? ["Toiture", "CVC"] : lang === "es" ? ["Techos", "HVAC"] : ["Roofing", "HVAC"];
  const province = ca ? "Ontario" : "Texas";
  const area = ca ? "Toronto" : "Austin";
  const endsAt = new Date(Date.now() + (step === "trial_day12" ? 2 : 7) * 86_400_000).toISOString();
  return {
    lang,
    country,
    firstName: "Sam",
    company: ca ? "Northline Roofing" : "Lone Star Roofing",
    trades,
    area,
    hasTrades: true,
    hasAreas: step !== "welcome",
    persona,
    market: { openBids: 6, projects: 9, winners: 4, packages: 2, total: 21 },
    leadTitles: SAMPLE_TITLES[country],
    hasProject: false,
    hasBadge: false,
    proBenchmarks: 2,
    benchmark: {
      trade: trades[0],
      province,
      valued: 37,
      examples: [
        { title: ca ? "Roof replacement, Brampton fire hall" : "Roof replacement, Round Rock fire station", amount: ca ? 412_000 : 386_000, date: "2026-09-12" },
        { title: ca ? "Flat roof repairs, Peel housing" : "Flat roof repairs, Austin ISD", amount: ca ? 96_500 : 88_200, date: "2026-08-28" },
      ],
      path: ca ? "/benchmarks/roofing/ontario" : "/benchmarks/roofing/texas",
    },
    foundingScarcity: "quiet",
    trial: { endsAt, daysLeft: step === "trial_day12" ? 2 : 7, alertsSent: 12, saved: 3, interests: 1 },
  };
}
