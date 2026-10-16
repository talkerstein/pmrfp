/**
 * The writer, template first: one plain sentence (or two) per fact kind, in
 * English, French and Spanish, filled ONLY from the fact record. No advice
 * ("worth a look" at most), no forecasts beyond what the record states (the
 * renewal radar's estimated windows are labelled as estimates), and when
 * the history is too short the sentence says so.
 *
 * Output is plain text (escape it when building HTML). Item lists (projects,
 * winners, renewals) are separate from `text`, so an AI polish of `text`
 * never touches a link.
 */
import { LOCALE_TAG, type Locale } from "@/i18n/config";
import { formatDate, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import type { CountryCode } from "@/lib/visitor-geo";
import type { LockedInsight, InsightView } from "./gating";
import type { InsightFact, InsightGap, InsightKind, TradeRef } from "./types";

export interface RenderedItem {
  label: string;
  href: string;
  meta: string;
}

export interface RenderedInsight {
  id: string;
  kind: InsightKind;
  locked: boolean;
  unlock: "pro" | "intel" | null;
  title: string;
  /** The sentence(s). The only part an AI polish may reword. */
  text: string;
  items: RenderedItem[];
  /** Follow-up links with translated labels. */
  links: { label: string; href: string }[];
  /** "24 awards · since Oct 2025 · medium confidence" (empty for teasers). */
  basis: string;
}

const NBSP = " ";

/* ------------------------------------------------------------------ formatting */

export interface Fmt {
  lang: Locale;
  n(x: number): string;
  pct(x: number): string;
  money(x: number, currency: "CAD" | "USD"): string;
  month(m: number): string;
  monthRange(a: number, b: number): string;
  day(d: string): string;
  shortDay(d: string): string;
  monthYear(d: string): string;
  /** Trade as used mid-sentence. */
  trade(t: TradeRef | null): string;
  /** Trade at the start of a title. */
  Trade(t: TradeRef | null): string;
  where(region: string | null, country: CountryCode): string;
  place(region: string | null, country: CountryCode): string;
}

const FR_PREP: Record<string, string> = {
  Ontario: "en",
  Quebec: "au",
  "British Columbia": "en",
  Alberta: "en",
  Manitoba: "au",
  Saskatchewan: "en",
  "Nova Scotia": "en",
  "New Brunswick": "au",
  "Newfoundland and Labrador": "à",
  "Prince Edward Island": "à l'",
  Yukon: "au",
  "Northwest Territories": "dans les",
  Nunavut: "au",
};

/** One / other: "1 contract", "2 contracts" (French and Spanish too). */
const P = (n: number, one: string, other: string) => (n === 1 ? one : other);
const lowerWords = (s: string) => s.split(" ").map((w) => (/^[A-Z0-9&/()-]{2,}$/.test(w) ? w : w.toLowerCase())).join(" ");
const upperFirst = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

export function fmtFor(lang: Locale): Fmt {
  const n = (x: number) => formatNumber(x, lang);
  const month = (m: number) => new Date(Date.UTC(2026, m - 1, 15, 12)).toLocaleDateString(LOCALE_TAG[lang], { month: "long", timeZone: "UTC" });
  const tradeLabel = (t: TradeRef | null) => (t ? tradeName(t.name, lang) : lang === "fr" ? "tous les métiers" : lang === "es" ? "todos los oficios" : "all trades");
  return {
    lang,
    n,
    pct: (x) => (lang === "fr" ? `${n(Math.abs(x))}${NBSP}%` : `${n(Math.abs(x))}%`),
    money: (x, currency) => (lang === "fr" ? `${n(Math.round(x))}${NBSP}$${NBSP}${currency}` : `$${n(Math.round(x))}${NBSP}${currency}`),
    month,
    monthRange: (a, b) => `${month(a)}–${month(b)}`,
    day: (d) => formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "long", day: "numeric", year: "numeric" }),
    shortDay: (d) => formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "short", day: "numeric" }),
    monthYear: (d) => formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "long", year: "numeric" }),
    trade: (t) => (lang === "en" ? lowerWords(tradeLabel(t)) : tradeLabel(t)),
    Trade: (t) => upperFirst(lang === "en" ? lowerWords(tradeLabel(t)) : tradeLabel(t)),
    place: (region, country) =>
      region ? regionName(region, lang) : country === "US" ? (lang === "fr" ? "États-Unis" : lang === "es" ? "Estados Unidos" : "U.S.") : lang === "es" ? "Canadá" : "Canada",
    where: (region, country) => {
      if (!region) {
        if (lang === "fr") return country === "US" ? "partout aux États-Unis" : "partout au Canada";
        if (lang === "es") return country === "US" ? "en todo Estados Unidos" : "en todo Canadá";
        return country === "US" ? "across the U.S." : "across Canada";
      }
      const name = regionName(region, lang);
      if (lang === "fr") {
        const p = country === "US" ? "dans l'État de" : FR_PREP[region] ?? "en";
        return p.endsWith("'") ? `${p}${name}` : `${p} ${name}`;
      }
      return lang === "es" ? `en ${name}` : `in ${name}`;
    },
  };
}

/* ------------------------------------------------------------------ fixed labels */

const LABELS = {
  en: {
    board: "See the open tenders",
    market: "Market share",
    benchmark: "Full price benchmark",
    radar: "Renewal radar",
    leads: "All your leads",
    "gc-hub": "GC Hub",
    buyer: "Buyer profile",
    company: "Company profile",
    unlockPro: "Unlock with Trade Pro",
    unlockIntel: "See it in Award Intelligence",
    awards: (n: number) => `${n} ${n === 1 ? "award" : "awards"}`,
    listings: (n: number) => `${n} ${n === 1 ? "listing" : "listings"}`,
    since: (d: string) => `records since ${d}`,
    conf: { high: "high confidence", medium: "medium confidence", low: "low confidence" },
    kinds: { project: "Major project", permit: "Building permit", application: "Development application", award: "Just won public work" },
    stated: "term stated in the notice",
    estimated: "estimated (typical term)",
    windowOpens: (d: string) => `window opens about ${d}`,
    heldBy: (w: string) => `held by ${w}`,
    wins: (k: number) => `${k} ${k === 1 ? "win" : "wins"}`,
  },
  fr: {
    board: "Voir les appels d'offres ouverts",
    market: "Parts de marché",
    benchmark: "Repère de prix complet",
    radar: "Radar des renouvellements",
    leads: "Toutes vos pistes",
    "gc-hub": "Carrefour des EG",
    buyer: "Profil de l'acheteur",
    company: "Profil de l'entreprise",
    unlockPro: "Débloquer avec Trade Pro",
    unlockIntel: "Voir dans Award Intelligence",
    awards: (n: number) => `${n} ${n === 1 ? "octroi" : "octrois"}`,
    listings: (n: number) => `${n} ${n === 1 ? "avis" : "avis"}`,
    since: (d: string) => `données depuis ${d}`,
    conf: { high: "fiabilité élevée", medium: "fiabilité moyenne", low: "fiabilité faible" },
    kinds: { project: "Grand projet", permit: "Permis de construire", application: "Demande d'aménagement", award: "Vient de remporter un contrat public" },
    stated: "durée indiquée dans l'avis",
    estimated: "estimation (durée habituelle)",
    windowOpens: (d: string) => `fenêtre vers ${d}`,
    heldBy: (w: string) => `détenu par ${w}`,
    wins: (k: number) => `${k} ${k === 1 ? "contrat" : "contrats"}`,
  },
  es: {
    board: "Ver las licitaciones abiertas",
    market: "Cuota de mercado",
    benchmark: "Referencia de precios completa",
    radar: "Radar de renovaciones",
    leads: "Todas sus oportunidades",
    "gc-hub": "Centro de contratistas generales",
    buyer: "Perfil del comprador",
    company: "Perfil de la empresa",
    unlockPro: "Desbloquear con Trade Pro",
    unlockIntel: "Ver en Award Intelligence",
    awards: (n: number) => `${n} ${n === 1 ? "adjudicación" : "adjudicaciones"}`,
    listings: (n: number) => `${n} ${n === 1 ? "aviso" : "avisos"}`,
    since: (d: string) => `datos desde ${d}`,
    conf: { high: "confianza alta", medium: "confianza media", low: "confianza baja" },
    kinds: { project: "Gran proyecto", permit: "Permiso de construcción", application: "Solicitud de desarrollo", award: "Acaba de ganar un contrato público" },
    stated: "plazo indicado en el aviso",
    estimated: "estimado (plazo típico)",
    windowOpens: (d: string) => `ventana hacia ${d}`,
    heldBy: (w: string) => `en manos de ${w}`,
    wins: (k: number) => `${k} ${k === 1 ? "contrato" : "contratos"}`,
  },
} as const;

export const insightLabels = (lang: Locale) => LABELS[lang];

/* ------------------------------------------------------------------ sentences */

type Sentences = { title: string; text: string };

function volumeCopy(f: Extract<InsightFact, { kind: "volume" }>, c: Fmt): Sentences {
  const d = f.data;
  const where = c.where(f.region, f.country);
  const week = `${c.shortDay(dayBefore(f.to, 6))}–${c.shortDay(f.to)}`;
  const L = c.lang;
  const cur = c.n(d.current);
  const prev = c.n(d.previous);
  const pct = d.changePct !== null ? c.pct(d.changePct) : "";
  let title: string;
  let lead: string;
  if (L === "fr") {
    title =
      d.direction === "up" ? `${c.Trade(f.trade)} : plus d'appels d'offres la semaine dernière` : d.direction === "down" ? `${c.Trade(f.trade)} : moins d'appels d'offres la semaine dernière` : `${c.Trade(f.trade)} : un volume d'appels d'offres stable`;
    lead =
      d.direction === "steady"
        ? `${cur} nouveaux avis dans la catégorie ${c.trade(f.trade)} ${where} la semaine dernière (${week}), à peu près comme les ${prev} de la semaine précédente.`
        : `${cur} nouveaux avis dans la catégorie ${c.trade(f.trade)} ${where} la semaine dernière (${week}), contre ${prev} la semaine précédente (${d.direction === "up" ? "+" : "−"}${pct}).`;
  } else if (L === "es") {
    title =
      d.direction === "up" ? `${c.Trade(f.trade)}: más licitaciones la semana pasada` : d.direction === "down" ? `${c.Trade(f.trade)}: menos licitaciones la semana pasada` : `${c.Trade(f.trade)}: volumen de licitaciones estable`;
    lead =
      d.direction === "steady"
        ? `${cur} avisos nuevos en la categoría ${c.trade(f.trade)} ${where} la semana pasada (${week}), casi igual que los ${prev} de la semana anterior.`
        : `${cur} avisos nuevos en la categoría ${c.trade(f.trade)} ${where} la semana pasada (${week}), frente a ${prev} la semana anterior (${d.direction === "up" ? "+" : "−"}${pct}).`;
  } else {
    title =
      d.direction === "up" ? `More ${c.trade(f.trade)} tenders last week` : d.direction === "down" ? `Fewer ${c.trade(f.trade)} tenders last week` : `${c.Trade(f.trade)} tender volume is steady`;
    lead =
      d.direction === "steady"
        ? `${cur} new ${c.trade(f.trade)} listings were posted ${where} last week (${week}), about the same as the ${prev} the week before.`
        : `${cur} new ${c.trade(f.trade)} listings were posted ${where} last week (${week}), ${d.direction === "up" ? "up" : "down"} from ${prev} the week before (${d.direction === "up" ? "+" : "−"}${pct}).`;
  }
  const ly =
    d.lastYear.status === "ok"
      ? L === "fr"
        ? ` Même semaine l'an dernier : ${c.n(d.lastYear.count)}.`
        : L === "es"
          ? ` Misma semana del año pasado: ${c.n(d.lastYear.count)}.`
          : ` Same week last year: ${c.n(d.lastYear.count)}.`
      : L === "fr"
        ? " Pas encore assez d'historique pour comparer avec l'an dernier."
        : L === "es"
          ? " Todavía no hay suficiente historial para comparar con el año pasado."
          : " Not enough history yet to compare with last year.";
  const feeds =
    d.excludedSources > 0
      ? L === "fr"
        ? " Les sources ajoutées récemment ne sont pas comptées."
        : L === "es"
          ? " Las fuentes añadidas hace poco no se cuentan."
          : " Feeds added recently are left out of the count."
      : "";
  return { title, text: lead + ly + feeds };
}

function dayBefore(d: string, days: number): string {
  return new Date(Date.parse(`${d}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

function seasonalityCopy(f: Extract<InsightFact, { kind: "seasonality" }>, c: Fmt): Sentences {
  const d = f.data;
  const range = c.monthRange(d.peak.fromMonth, d.peak.toMonth);
  // "entre octobre et décembre" / "entre octubre y diciembre" (no "de octobre").
  const between = c.lang === "fr" ? `entre ${c.month(d.peak.fromMonth)} et ${c.month(d.peak.toMonth)}` : `entre ${c.month(d.peak.fromMonth)} y ${c.month(d.peak.toMonth)}`;
  const where = c.where(f.region, f.country);
  const since = c.monthYear(d.historyFrom);
  const x = d.excluded;
  if (c.lang === "fr")
    return {
      title: `${c.Trade(f.trade)} : la plupart des contrats sont octroyés ${between}`,
      text: `${c.pct(d.peak.sharePct)} des ${c.n(f.sample.n)} contrats publics de la catégorie ${c.trade(f.trade)} octroyés ${where} au cours des 12 derniers mois l'ont été ${between} (données depuis ${since}).${x ? ` ${c.n(x)} ${P(x, "octroi provenant d'une source", "octrois provenant de sources")} avec moins d'un an d'historique ${P(x, "n'est pas compté", "ne sont pas comptés")}.` : ""}`,
    };
  if (c.lang === "es")
    return {
      title: `${c.Trade(f.trade)}: la mayoría de los contratos se adjudica ${between}`,
      text: `El ${c.pct(d.peak.sharePct)} de los ${c.n(f.sample.n)} contratos públicos de la categoría ${c.trade(f.trade)} adjudicados ${where} en los últimos 12 meses se adjudicó ${between} (datos desde ${since}).${x ? ` No se cuentan ${c.n(x)} ${P(x, "adjudicación de una fuente", "adjudicaciones de fuentes")} con menos de un año de historial.` : ""}`,
    };
  return {
    title: `Most ${c.trade(f.trade)} contracts are awarded ${range}`,
    text: `${c.pct(d.peak.sharePct)} of the ${c.n(f.sample.n)} public ${c.trade(f.trade)} contracts awarded ${where} in the last 12 months were awarded ${range} (records since ${since}).${x ? ` ${c.n(x)} ${P(x, "award from a source", "awards from sources")} with less than a year of records ${P(x, "is", "are")} left out.` : ""}`,
  };
}

function priceBandCopy(f: Extract<InsightFact, { kind: "price_band" }>, c: Fmt): Sentences {
  const d = f.data;
  const m = (x: number) => c.money(x, d.currency);
  const where = c.where(f.region, f.country);
  if (c.lang === "fr")
    return {
      title: `${c.Trade(f.trade)} : fourchette de prix ${where}`,
      text: `Sur 24 mois, la moitié centrale des ${c.n(d.n)} contrats de la catégorie ${c.trade(f.trade)} octroyés ${where} se situe entre ${m(d.p25)} et ${m(d.p75)}; la médiane est de ${m(d.median)}.`,
    };
  if (c.lang === "es")
    return {
      title: `${c.Trade(f.trade)}: rango de precios ${where}`,
      text: `En 24 meses, la mitad central de los ${c.n(d.n)} contratos de la categoría ${c.trade(f.trade)} adjudicados ${where} estuvo entre ${m(d.p25)} y ${m(d.p75)}; la mediana fue de ${m(d.median)}.`,
    };
  return {
    title: `${c.Trade(f.trade)} price band ${where}`,
    text: `Over 24 months, the middle half of the ${c.n(d.n)} ${c.trade(f.trade)} contracts awarded ${where} ran ${m(d.p25)} to ${m(d.p75)}; the median was ${m(d.median)}.`,
  };
}

function priceMoveCopy(f: Extract<InsightFact, { kind: "price_move" }>, c: Fmt): Sentences {
  const d = f.data;
  const m = (x: number) => c.money(x, d.currency);
  const where = c.where(f.region, f.country);
  const split = c.monthYear(d.splitDate);
  if (c.lang === "fr") {
    const dir = d.direction === "up" ? `en hausse de ${c.pct(d.changePct)}` : d.direction === "down" ? `en baisse de ${c.pct(d.changePct)}` : "proche";
    return {
      title: `${c.Trade(f.trade)} ${where} : ${d.direction === "up" ? "prix médian en hausse" : d.direction === "down" ? "prix médian en baisse" : "prix médian stable"}`,
      text: `La médiane des ${c.n(d.recentN)} contrats de la catégorie ${c.trade(f.trade)} octroyés depuis ${split} est de ${m(d.recentMedian)}, ${dir} de celle des ${c.n(d.earlierN)} contrats précédents (${m(d.earlierMedian)}).`,
    };
  }
  if (c.lang === "es") {
    const dir = d.direction === "up" ? `un ${c.pct(d.changePct)} más que` : d.direction === "down" ? `un ${c.pct(d.changePct)} menos que` : "cerca de";
    return {
      title: `${c.Trade(f.trade)} ${where}: ${d.direction === "up" ? "mediana en alza" : d.direction === "down" ? "mediana a la baja" : "mediana estable"}`,
      text: `La mediana de los ${c.n(d.recentN)} contratos de la categoría ${c.trade(f.trade)} adjudicados desde ${split} es de ${m(d.recentMedian)}, ${dir} la de los ${c.n(d.earlierN)} contratos anteriores (${m(d.earlierMedian)}).`,
    };
  }
  const dir = d.direction === "up" ? `up ${c.pct(d.changePct)} from` : d.direction === "down" ? `down ${c.pct(d.changePct)} from` : "close to";
  return {
    title: `${c.Trade(f.trade)} prices ${where}: median ${d.direction === "up" ? "up" : d.direction === "down" ? "down" : "steady"}`,
    text: `The median of the ${c.n(d.recentN)} ${c.trade(f.trade)} contracts awarded since ${split} is ${m(d.recentMedian)}, ${dir} the ${m(d.earlierMedian)} median of the ${c.n(d.earlierN)} awards before that.`,
  };
}

function buyerSurgeCopy(f: Extract<InsightFact, { kind: "buyer_surge" }>, c: Fmt): Sentences {
  const d = f.data;
  const usual = c.n(d.usualPerMonth);
  if (c.lang === "fr")
    return {
      title: `${d.buyer} publie plus que d'habitude`,
      text: `${d.buyer} a publié ${c.n(d.recent)} avis dans la catégorie ${c.trade(f.trade)} au cours des ${c.n(d.recentDays)} derniers jours; son rythme habituel sur PMRFP est d'environ ${usual} par mois (sur ${c.n(d.months)} mois).`,
    };
  if (c.lang === "es")
    return {
      title: `${d.buyer} publica más de lo habitual`,
      text: `${d.buyer} publicó ${c.n(d.recent)} avisos en la categoría ${c.trade(f.trade)} en los últimos ${c.n(d.recentDays)} días; su ritmo habitual en PMRFP es de unos ${usual} al mes (en ${c.n(d.months)} meses).`,
    };
  return {
    title: `${d.buyer} is posting more ${c.trade(f.trade)} work than usual`,
    text: `${d.buyer} posted ${c.n(d.recent)} ${c.trade(f.trade)} listings in the last ${c.n(d.recentDays)} days; its usual pace on PMRFP is about ${usual} a month (over ${c.n(d.months)} months).`,
  };
}

function streakCopy(f: Extract<InsightFact, { kind: "incumbent_streak" }>, c: Fmt): Sentences {
  const d = f.data;
  const since = c.monthYear(f.from);
  const last = c.day(d.lastDate);
  if (c.lang === "fr")
    return {
      title: `${d.buyer} : ${d.winner} remporte les derniers contrats`,
      text: `${d.winner} a remporté les ${c.n(d.streak)} derniers contrats de ${d.buyer} dans la catégorie ${c.trade(f.trade)} (${c.n(d.buyerAwards)} octrois depuis ${since}; le plus récent le ${last}).`,
    };
  if (c.lang === "es")
    return {
      title: `${d.buyer}: ${d.winner} gana los últimos contratos`,
      text: `${d.winner} ganó los últimos ${c.n(d.streak)} contratos de ${d.buyer} en la categoría ${c.trade(f.trade)} (${c.n(d.buyerAwards)} adjudicaciones desde ${since}; la más reciente el ${last}).`,
    };
  return {
    title: `${d.buyer} keeps awarding ${c.trade(f.trade)} to ${d.winner}`,
    text: `${d.winner} won ${d.buyer}'s last ${c.n(d.streak)} ${c.trade(f.trade)} awards on record (${c.n(d.buyerAwards)} awards since ${since}; the latest on ${last}).`,
  };
}

function projectsCopy(f: Extract<InsightFact, { kind: "new_projects" }>, c: Fmt): Sentences {
  const d = f.data;
  const parts: string[] = [];
  const L = c.lang;
  const pick = (n: number, en: [string, string], fr: [string, string], es: [string, string]) => `${c.n(n)} ${P(n, ...(L === "fr" ? fr : L === "es" ? es : en))}`;
  if (d.projects) parts.push(pick(d.projects, ["major project", "major projects"], ["grand projet", "grands projets"], ["gran proyecto", "grandes proyectos"]));
  if (d.permits) parts.push(pick(d.permits, ["permit", "permits"], ["permis", "permis"], ["permiso", "permisos"]));
  if (d.applications) parts.push(pick(d.applications, ["development application", "development applications"], ["demande d'aménagement", "demandes d'aménagement"], ["solicitud de desarrollo", "solicitudes de desarrollo"]));
  const list = parts.join(", ");
  if (L === "fr")
    return {
      title: `${c.n(d.count)} ${P(d.count, "nouvelle piste de projet", "nouvelles pistes de projets")} près de chez vous`,
      text: `Nouveau dans vos métiers et votre région la semaine dernière : ${list}.${d.withGc ? ` ${c.n(d.withGc)} ${P(d.withGc, "nomme", "nomment")} un entrepreneur général.` : ""} Les lots de sous-traitance passent habituellement par l'entrepreneur général.`,
    };
  if (L === "es")
    return {
      title: `${c.n(d.count)} ${P(d.count, "nueva oportunidad de proyecto", "nuevas oportunidades de proyectos")} cerca de usted`,
      text: `Nuevo en sus oficios y su zona la semana pasada: ${list}.${d.withGc ? ` ${c.n(d.withGc)} ${P(d.withGc, "indica", "indican")} un contratista general.` : ""} Los paquetes para subcontratistas suelen salir a través del contratista general.`,
    };
  return {
    title: `${c.n(d.count)} new project ${d.count === 1 ? "lead" : "leads"} near you`,
    text: `New in your trades and area last week: ${list}.${d.withGc ? ` ${c.n(d.withGc)} ${P(d.withGc, "of them names", "of them name")} a general contractor.` : ""} Trade packages usually go out through the general contractor.`,
  };
}

function gcCopy(f: Extract<InsightFact, { kind: "gc_named" }>, c: Fmt): Sentences {
  const d = f.data;
  const where = c.where(f.region, f.country);
  if (c.lang === "fr")
    return {
      title: `Entrepreneurs généraux qui viennent de remporter des travaux ${where}`,
      text: `${c.n(d.count)} ${P(d.count, "contrat public d'entreprise générale a été octroyé", "contrats publics d'entreprise générale ont été octroyés")} ${where} au cours des ${c.n(d.days)} derniers jours. Les lots de sous-traitance passent habituellement par ces entrepreneurs.`,
    };
  if (c.lang === "es")
    return {
      title: `Contratistas generales que acaban de ganar obras ${where}`,
      text: `${P(d.count, "Se adjudicó", "Se adjudicaron")} ${c.n(d.count)} ${P(d.count, "contrato público de contratista general", "contratos públicos de contratista general")} ${where} en los últimos ${c.n(d.days)} días. Los paquetes para subcontratistas suelen salir a través de estos contratistas.`,
    };
  return {
    title: `General contractors who just won work ${where}`,
    text: `${c.n(d.count)} public general-contracting ${d.count === 1 ? "contract was" : "contracts were"} awarded ${where} in the last ${c.n(d.days)} days. Trade packages usually go out through these contractors.`,
  };
}

function renewalsCopy(f: Extract<InsightFact, { kind: "renewals" }>, c: Fmt): Sentences {
  const d = f.data;
  const where = c.where(f.region, f.country);
  const soon = c.monthYear(d.soonest);
  const est = d.count - d.stated;
  if (c.lang === "fr")
    return {
      title: `${c.Trade(f.trade)} : ${c.n(d.count)} ${P(d.count, "contrat à renouveler", "contrats à renouveler")} d'ici ${c.n(d.horizonMonths)} mois`,
      text: `${c.n(d.count)} ${P(d.count, "contrat", "contrats")} de la catégorie ${c.trade(f.trade)} ${where} ${P(d.count, "devrait", "devraient")} revenir en appel d'offres d'ici ${c.n(d.horizonMonths)} mois; la première fenêtre s'ouvre vers ${soon}. ${c.n(d.stated)} ${P(d.stated, "indique sa", "indiquent leur")} durée dans l'avis${est > 0 ? `; ${c.n(est)} ${P(est, "est estimé", "sont estimés")} d'après une durée habituelle de ${c.n(d.typicalTermYears)} ans` : ""}.`,
    };
  if (c.lang === "es")
    return {
      title: `${c.Trade(f.trade)}: ${c.n(d.count)} ${P(d.count, "contrato por renovar", "contratos por renovar")} en ${c.n(d.horizonMonths)} meses`,
      text: `${c.n(d.count)} ${P(d.count, "contrato", "contratos")} de la categoría ${c.trade(f.trade)} ${where} probablemente ${P(d.count, "vuelva", "vuelvan")} a licitarse en los próximos ${c.n(d.horizonMonths)} meses; la primera ventana se abre hacia ${soon}. ${c.n(d.stated)} ${P(d.stated, "indica", "indican")} su plazo en el aviso${est > 0 ? `; ${c.n(est)} ${P(est, "se estima", "se estiman")} con un plazo típico de ${c.n(d.typicalTermYears)} años` : ""}.`,
    };
  return {
    title: `${c.n(d.count)} ${c.trade(f.trade)} ${d.count === 1 ? "contract" : "contracts"} likely up for rebid within ${c.n(d.horizonMonths)} months`,
    text: `${c.n(d.count)} ${c.trade(f.trade)} ${d.count === 1 ? "contract" : "contracts"} ${where} ${d.count === 1 ? "is" : "are"} likely up for rebid in the next ${c.n(d.horizonMonths)} months; the first window opens around ${soon}. ${c.n(d.stated)} ${P(d.stated, "states its", "state their")} term in the notice${est > 0 ? `; ${c.n(est)} ${P(est, "is", "are")} estimated from a typical ${c.n(d.typicalTermYears)}-year term` : ""}.`,
  };
}

function winsCopy(f: Extract<InsightFact, { kind: "competitor_wins" }>, c: Fmt): Sentences {
  const d = f.data;
  const where = c.where(f.region, f.country);
  const total = d.valued ? c.money(d.total, d.currency) : null;
  if (c.lang === "fr")
    return {
      title: `${c.Trade(f.trade)} : qui a remporté les contrats récents ${where}`,
      text: `${c.n(d.count)} contrats de la catégorie ${c.trade(f.trade)} ont été octroyés ${where} au cours des ${c.n(d.days)} derniers jours${total ? `, pour ${total} en valeur divulguée (${c.n(d.valued)} avec une valeur)` : ""}.`,
    };
  if (c.lang === "es")
    return {
      title: `${c.Trade(f.trade)}: quién ganó los contratos recientes ${where}`,
      text: `Se adjudicaron ${c.n(d.count)} contratos de la categoría ${c.trade(f.trade)} ${where} en los últimos ${c.n(d.days)} días${total ? `, por ${total} en valor divulgado (${c.n(d.valued)} con valor)` : ""}.`,
    };
  return {
    title: `Who won ${c.trade(f.trade)} work ${where} lately`,
    text: `${c.n(d.count)} ${c.trade(f.trade)} contracts were awarded ${where} in the last ${c.n(d.days)} days${total ? `, worth ${total} in disclosed value (${c.n(d.valued)} with a value)` : ""}.`,
  };
}

/** The template sentences for a fact (no items, no links). */
export function templateFor(f: InsightFact, lang: Locale): Sentences {
  const c = fmtFor(lang);
  switch (f.kind) {
    case "volume":
      return volumeCopy(f, c);
    case "seasonality":
      return seasonalityCopy(f, c);
    case "price_band":
      return priceBandCopy(f, c);
    case "price_move":
      return priceMoveCopy(f, c);
    case "buyer_surge":
      return buyerSurgeCopy(f, c);
    case "incumbent_streak":
      return streakCopy(f, c);
    case "new_projects":
      return projectsCopy(f, c);
    case "gc_named":
      return gcCopy(f, c);
    case "renewals":
      return renewalsCopy(f, c);
    case "competitor_wins":
      return winsCopy(f, c);
  }
}

/* ------------------------------------------------------------------ items & links */

function itemsFor(f: InsightFact, c: Fmt): RenderedItem[] {
  const L = LABELS[c.lang];
  switch (f.kind) {
    case "new_projects":
      return f.data.items.map((i) => ({
        label: i.name,
        href: i.href,
        meta: [L.kinds[i.kind], i.city, i.valueCad ? c.money(i.valueCad, "CAD") : null].filter(Boolean).join(" · "),
      }));
    case "gc_named":
      return f.data.items.map((i) => ({ label: i.winner, href: i.href, meta: [i.title, i.amount ? c.money(i.amount, f.data.currency) : null, c.shortDay(i.date)].filter(Boolean).join(" · ") }));
    case "renewals":
      return f.data.items.map((i) => ({
        label: i.title,
        href: i.href,
        meta: [i.buyer, i.incumbent ? L.heldBy(i.incumbent) : null, L.windowOpens(c.monthYear(i.windowStart)), i.stated ? L.stated : L.estimated].filter(Boolean).join(" · "),
      }));
    case "competitor_wins":
      return f.data.winners.map((w) => ({
        label: w.name,
        href: w.slug ? `/intel/companies/${w.slug}` : "",
        meta: [L.wins(w.wins), w.value ? c.money(w.value, f.data.currency) : null].filter(Boolean).join(" · "),
      }));
    default:
      return [];
  }
}

const LINK_LABEL_KEYS = new Set(["board", "market", "benchmark", "radar", "leads", "gc-hub"]);

function linksFor(f: InsightFact, c: Fmt): { label: string; href: string }[] {
  const L = LABELS[c.lang] as unknown as Record<string, string>;
  return f.links.map((l) => ({ label: LINK_LABEL_KEYS.has(l.label) ? L[l.label] : l.label, href: l.href })).filter((l) => l.label && l.href);
}

function basisFor(f: InsightFact, c: Fmt): string {
  const L = LABELS[c.lang];
  const count = ["volume", "buyer_surge"].includes(f.kind) ? L.listings(f.sample.n) : f.kind === "new_projects" ? "" : L.awards(f.sample.n);
  return [count, L.since(c.monthYear(f.from)), L.conf[f.confidence]].filter(Boolean).join(" · ");
}

/** A fact the viewer may see, in full. */
export function renderFact(f: InsightFact, lang: Locale, text?: string): RenderedInsight {
  const c = fmtFor(lang);
  const t = templateFor(f, lang);
  return { id: f.id, kind: f.kind, locked: false, unlock: null, title: t.title, text: text ?? t.text, items: itemsFor(f, c), links: linksFor(f, c), basis: basisFor(f, c) };
}

/* ------------------------------------------------------------------ teasers */

function teaserCopy(s: LockedInsight, c: Fmt): Sentences {
  const where = c.where(s.region, s.country);
  const tr = c.trade(s.trade);
  const n = (k: string) => (typeof s.numbers[k] === "number" ? c.n(s.numbers[k]) : null);
  const L = c.lang;
  const pick = (en: string, fr: string, es: string) => (L === "fr" ? fr : L === "es" ? es : en);
  switch (s.kind) {
    case "volume":
      return { title: pick(`Weekly ${tr} tender volume ${where}`, `${c.Trade(s.trade)} : volume hebdomadaire ${where}`, `${c.Trade(s.trade)}: volumen semanal ${where}`), text: pick("How last week compares with the week before.", "Comment la semaine dernière se compare à la précédente.", "Cómo se compara la semana pasada con la anterior.") };
    case "seasonality":
      return { title: pick(`When ${tr} contracts get awarded ${where}`, `${c.Trade(s.trade)} : quand les contrats sont octroyés ${where}`, `${c.Trade(s.trade)}: cuándo se adjudican los contratos ${where}`), text: pick("The busy months on record.", "Les mois les plus actifs selon les données.", "Los meses con más actividad según los datos.") };
    case "price_band":
      return {
        title: pick(`${c.Trade(s.trade)} price band ${where}`, `${c.Trade(s.trade)} : fourchette de prix ${where}`, `${c.Trade(s.trade)}: rango de precios ${where}`),
        text: pick(`From ${n("n")} awarded contracts. Trade Pro shows the range and the median.`, `D'après ${n("n")} contrats octroyés. Trade Pro affiche la fourchette et la médiane.`, `Según ${n("n")} contratos adjudicados. Trade Pro muestra el rango y la mediana.`),
      };
    case "price_move":
      return { title: pick(`How ${tr} prices moved ${where}`, `${c.Trade(s.trade)} : évolution des prix ${where}`, `${c.Trade(s.trade)}: evolución de precios ${where}`), text: pick("Recent awards compared with earlier ones.", "Les octrois récents comparés aux précédents.", "Las adjudicaciones recientes comparadas con las anteriores.") };
    case "buyer_surge":
      return { title: pick(`A buyer ${where} is posting more ${tr} work than usual`, `Un acheteur ${where} publie plus que d'habitude`, `Un comprador ${where} publica más de lo habitual`), text: pick("Award Intelligence shows which one.", "Award Intelligence indique lequel.", "Award Intelligence muestra cuál.") };
    case "incumbent_streak":
      return { title: pick(`A buyer ${where} keeps awarding ${tr} to the same company`, `Un acheteur ${where} octroie ses contrats à la même entreprise`, `Un comprador ${where} adjudica a la misma empresa`), text: pick("Award Intelligence shows the buyer and the company.", "Award Intelligence indique l'acheteur et l'entreprise.", "Award Intelligence muestra el comprador y la empresa.") };
    case "new_projects":
      return { title: pick(`${n("count")} new project leads near you`, `${n("count")} nouvelles pistes de projets près de chez vous`, `${n("count")} nuevas oportunidades de proyectos cerca de usted`), text: pick("Trade Pro shows which ones.", "Trade Pro indique lesquelles.", "Trade Pro muestra cuáles.") };
    case "gc_named":
      return { title: pick(`General contractors who just won work ${where}`, `Entrepreneurs généraux qui viennent de remporter des travaux ${where}`, `Contratistas generales que acaban de ganar obras ${where}`), text: pick(`${n("count")} recent awards. Trade Pro shows who won.`, `${n("count")} octrois récents. Trade Pro indique qui les a remportés.`, `${n("count")} adjudicaciones recientes. Trade Pro muestra quién ganó.`) };
    case "renewals":
      return { title: pick(`${tr} contracts likely up for rebid ${where}`, `${c.Trade(s.trade)} : contrats à renouveler ${where}`, `${c.Trade(s.trade)}: contratos por renovar ${where}`), text: pick(`${n("count")} in the next 12 months. Trade Pro shows when; Award Intelligence shows the buyers.`, `${n("count")} d'ici 12 mois. Trade Pro indique quand; Award Intelligence indique les acheteurs.`, `${n("count")} en los próximos 12 meses. Trade Pro muestra cuándo; Award Intelligence muestra los compradores.`) };
    case "competitor_wins":
      return { title: pick(`Who won ${tr} work ${where} lately`, `${c.Trade(s.trade)} : qui a remporté les contrats récents ${where}`, `${c.Trade(s.trade)}: quién ganó los contratos recientes ${where}`), text: pick(`${n("count")} recent awards.`, `${n("count")} octrois récents.`, `${n("count")} adjudicaciones recientes.`) };
  }
}

export function renderLocked(s: LockedInsight, lang: Locale): RenderedInsight {
  const c = fmtFor(lang);
  const t = teaserCopy(s, c);
  const L = LABELS[lang];
  return {
    id: s.id,
    kind: s.kind,
    locked: true,
    unlock: s.unlock,
    title: t.title.replace(/^./, (x) => x.toLocaleUpperCase()),
    text: t.text,
    items: [],
    links: [{ label: s.unlock === "intel" ? L.unlockIntel : L.unlockPro, href: s.unlock === "intel" ? "/intel" : "/dashboard/billing?plan=pro&interval=monthly" }],
    basis: "",
  };
}

export function renderView(v: InsightView, lang: Locale, text?: string): RenderedInsight {
  return v.locked ? renderLocked(v.stub, lang) : renderFact(v.fact, lang, text);
}

/* ------------------------------------------------------------------ gaps */

/** "Not enough history yet" lines for public pages. */
export function gapText(g: InsightGap, lang: Locale): string {
  const c = fmtFor(lang);
  const where = c.where(g.region, g.country);
  const what =
    g.kind === "seasonality"
      ? { en: "say when contracts get awarded", fr: "dire à quel moment les contrats sont octroyés", es: "decir cuándo se adjudican los contratos" }
      : g.kind === "price_move" || g.kind === "price_band"
        ? { en: "compare prices", fr: "comparer les prix", es: "comparar precios" }
        : { en: "compare with earlier weeks", fr: "comparer avec les semaines précédentes", es: "comparar con semanas anteriores" };
  if (g.reason === "short-history")
    return lang === "fr"
      ? `Pas encore assez d'historique ${where} pour ${what.fr} dans la catégorie ${c.trade(g.trade)}.`
      : lang === "es"
        ? `Todavía no hay suficiente historial ${where} para ${what.es} en la categoría ${c.trade(g.trade)}.`
        : `Not enough history yet ${where} to ${what.en} for ${c.trade(g.trade)}.`;
  return lang === "fr"
    ? `Trop peu de données ${where} pour ${what.fr} dans la catégorie ${c.trade(g.trade)} (${c.n(g.sample.n)} sur ${c.n(g.sample.min)} nécessaires).`
    : lang === "es"
      ? `Muy pocos datos ${where} para ${what.es} en la categoría ${c.trade(g.trade)} (${c.n(g.sample.n)} de ${c.n(g.sample.min)} necesarios).`
      : `Too little data ${where} to ${what.en} for ${c.trade(g.trade)} yet (${c.n(g.sample.n)} of the ${c.n(g.sample.min)} needed).`;
}
