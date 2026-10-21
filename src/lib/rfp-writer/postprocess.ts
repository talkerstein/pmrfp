import type { RfpDraft, WizardInput } from "./schema";

/**
 * Last pass over every RFP Writer draft (template and AI paths alike), so a
 * property manager can send it as is:
 *
 *  - Site specifics the manager never gave (access routes, crane or parking
 *    areas, working hours, service elevators) are never stated as facts. They
 *    become visible "[Confirm: …]" blanks.
 *  - "[X]%" blanks get a sensible default with a "(confirm)" note, or the line
 *    is dropped.
 *  - The manager's own words appear once ("What we need"), sentence-cased;
 *    the summary is built from the structured answers instead.
 *  - Québec properties ask for an RBQ licence.
 *
 * Every function is pure and idempotent: running a draft through twice
 * changes nothing the second time.
 *
 * Why (persona QA, 2026-10-21): a Mississauga roof draft said "Crane staging
 * area available in north parking lot … Work hours 7am to 6pm weekdays"
 * (never given), kept "[X]%" and pasted the raw lowercase description into
 * both the summary and the scope. That came from the expert templates'
 * siteAccess text (the no-AI path every anonymous visitor gets); the AI path
 * was fed the same text as its starting draft.
 */

export type WriterLang = "en" | "fr" | "es";

/**
 * The wizard's default bid deadline, in days from today: 5 for urgent work
 * ("as soon as possible"), three weeks otherwise. The manager can still pick
 * any date (3 days minimum). An emergency repair that promises a contractor
 * on site in 48 hours shouldn't carry a three-week bid window.
 */
export function defaultDeadlineDays(timing: string): number {
  return timing === "asap" ? 5 : 21;
}

/** A visible blank the manager has to fill in before sending. */
export function confirmBlank(lang: WriterLang, what: string): string {
  if (lang === "fr") return `[À confirmer : ${what}]`;
  if (lang === "es") return `[Por confirmar: ${what}]`;
  return `[Confirm: ${what}]`;
}

/** Any blank still in a draft: "[Confirm: …]", "[À confirmer : …]", "[Por confirmar: …]", "[X]", "[#]", "[property type]"… */
const BLANK = /\[(?:Confirm|À confirmer|Por confirmar)\b[^\]]*\]|\[(?:X|Y|#)\]|\[[a-zà-ÿ][^\]\n]{1,60}\]/g;

/** How many blanks are left to fill in (shown on the result screen). */
export function countBlanks(draft: Pick<RfpDraft, "title" | "summary" | "scope" | "requirements" | "submissionInstructions" | "questionsForBidders">): number {
  const text = [draft.title, draft.summary, draft.scope, draft.requirements, draft.submissionInstructions, ...draft.questionsForBidders].join("\n");
  return text.match(BLANK)?.length ?? 0;
}

/* ------------------------------------------------------------------ site access */

const ACCESS_HEAD: Record<WriterLang, string> = {
  en: "Site access (to confirm for this property):",
  fr: "Accès au site (à confirmer pour cet immeuble) :",
  es: "Acceso al sitio (por confirmar para esta propiedad):",
};

const ACCESS_LINES: Record<WriterLang, [label: string, blank: string][]> = {
  en: [
    ["Access to the work area", "site access details"],
    ["Permitted working hours", "working hours"],
    ["Staging, parking and equipment areas", "staging and parking"],
  ],
  fr: [
    ["Accès à l'aire de travail", "accès au site"],
    ["Heures de travail permises", "heures de travail"],
    ["Aires d'entreposage, de stationnement et d'équipement", "entreposage et stationnement"],
  ],
  es: [
    ["Acceso al área de trabajo", "acceso al sitio"],
    ["Horario de trabajo permitido", "horario de trabajo"],
    ["Áreas de acopio, estacionamiento y equipos", "acopio y estacionamiento"],
  ],
};

/** Extra lines when the template's own access notes mention them (crane, lift, elevator, shut-offs). */
const ACCESS_EXTRAS: { test: RegExp; line: Record<WriterLang, [string, string]> }[] = [
  {
    test: /crane|grue|grúa/i,
    line: { en: ["Crane location and any street permit", "crane location"], fr: ["Emplacement de la grue et permis de la Ville, s'il y a lieu", "emplacement de la grue"], es: ["Ubicación de la grúa y permiso municipal, si corresponde", "ubicación de la grúa"] },
  },
  {
    test: /boom lift|lift required|nacelle|plataforma elevadora/i,
    line: { en: ["Lift placement", "lift placement"], fr: ["Emplacement de la nacelle", "emplacement de la nacelle"], es: ["Ubicación de la plataforma elevadora", "ubicación de la plataforma"] },
  },
  {
    test: /service elevator|ascenseur de service|elevador de servicio/i,
    line: { en: ["Service elevator for materials", "service elevator availability"], fr: ["Ascenseur de service pour le matériel", "disponibilité de l'ascenseur de service"], es: ["Elevador de servicio para materiales", "disponibilidad del elevador de servicio"] },
  },
  {
    test: /shut-?(?:off|down)|arrêt|coupure|corte/i,
    line: { en: ["Shut-offs and notice to occupants", "shut-off windows"], fr: ["Coupures et avis aux occupants", "périodes de coupure"], es: ["Cortes de servicio y aviso a los ocupantes", "periodos de corte"] },
  },
];

/**
 * The "Site access" section of a writer draft: visible blanks only, never the
 * template's sample facts. `templateAccess` (the template's own notes) only
 * decides which extra lines are relevant to this trade.
 */
export function siteAccessBlock(lang: WriterLang, input: Pick<WizardInput, "occupied">, templateAccess?: string | null): string {
  const sep = lang === "fr" ? " : " : ": ";
  const lines = ACCESS_LINES[lang].map(([label, what]) => `- ${label}${sep}${confirmBlank(lang, what)}`);
  for (const x of ACCESS_EXTRAS) {
    if (templateAccess && x.test.test(templateAccess)) {
      const [label, what] = x.line[lang];
      lines.push(`- ${label}${sep}${confirmBlank(lang, what)}`);
    }
  }
  if (input.occupied === true) {
    const [label, what] =
      lang === "fr"
        ? ["Avis aux résidents et locataires", "délai d'avis"]
        : lang === "es"
          ? ["Aviso a residentes e inquilinos", "plazo de aviso"]
          : ["Notice to residents and tenants", "notice period"];
    lines.push(`- ${label}${sep}${confirmBlank(lang, what)}`);
  }
  return `${ACCESS_HEAD[lang]}\n${lines.join("\n")}`;
}

/* ------------------------------------------------------------------ [X]% blanks */

/** Known "[X]%" phrases in the expert templates, with a sensible default and a confirm note. */
const PERCENT_DEFAULTS: Record<WriterLang, [RegExp, string][]> = {
  en: [
    [/beyond \[X\]\s?% of (the )?total area/gi, "beyond 10% of $1total area (confirm the threshold)"],
    [/(uptime target:?\s*)\[X\]\s?%/gi, "$198% (confirm)"],
    [/at least \[X\]\s?% of (the )?stalls/gi, "at least 50% of $1stalls (confirm)"],
  ],
  fr: [
    [/au-delà de \[X\]\s?% de la surface totale/gi, "au-delà de 10 % de la surface totale (seuil à confirmer)"],
    [/(disponibilité visé\s*:\s*)\[X\]\s?%/gi, "$198 % (à confirmer)"],
    [/au moins \[X\]\s?% des cases/gi, "au moins 50 % des cases (à confirmer)"],
  ],
  es: [
    [/en más del \[X\]\s?% del área total/gi, "en más del 10% del área total (umbral por confirmar)"],
    [/(meta de disponibilidad:\s*)\[X\]\s?%/gi, "$198% (por confirmar)"],
    [/al menos el \[X\]\s?% de los espacios/gi, "al menos el 50% de los espacios (por confirmar)"],
  ],
};

const PERCENT_BLANK = /\[X\]\s?%/;

/** "[X]%" never survives: known phrases get a default + confirm note; any other line with one is dropped. */
export function fillPercentBlanks(text: string, lang: WriterLang): string {
  let out = text;
  for (const [re, to] of PERCENT_DEFAULTS[lang]) out = out.replace(re, to);
  if (!PERCENT_BLANK.test(out)) return out;
  return out
    .split("\n")
    .filter((line) => !PERCENT_BLANK.test(line))
    .join("\n");
}

/* ------------------------------------------------------------------ invented facts */

interface FactRule {
  /** What the sentence states as fact. Matches up to the end of the clause. */
  re: RegExp;
  /** If the manager's own words mention this, they gave it: leave it alone. */
  given: RegExp;
  blank: Record<WriterLang, string>;
}

const END = String.raw`[^.\n;]*`;

const FACT_RULES: FactRule[] = [
  {
    // "Roof access via interior stairwell + roof hatch", "Accès au toit par la cage d'escalier", "Acceso al techo por la escalera"
    re: new RegExp(String.raw`\b(?:(?:roof|site|building|mechanical room|main electrical room) )?access (?:is )?(?:via|through) (?!\[)${END}|\bacc[èe]s (?:au toit|au site|à la salle [a-zé]+(?: principale)?) par (?!\[)${END}|\bacceso al (?:techo|sitio|cuarto [a-zé]+(?: principal)?) por (?!\[)${END}`, "gi"),
    given: /access|acc[èe]s|acceso|stair|escalier|escalera|hatch|trappe|escotilla|ladder|échelle/i,
    blank: { en: "site access details", fr: "accès au site", es: "acceso al sitio" },
  },
  {
    // "Crane staging area available in north parking lot", "Aire de mise en place de la grue disponible…", "Área de montaje de la grúa disponible…"
    re: new RegExp(String.raw`\bcrane (?:staging|set-?up|pad)${END}|\b(?:aire|zone) de mise en place de la grue${END}|\bárea de montaje de la grúa${END}|\bstaging (?:area|space)s? (?:is |are )?(?:available|provided|located)${END}`, "gi"),
    given: /crane|grue|grúa|staging|entreposage|acopio/i,
    blank: { en: "crane / staging area", fr: "aire de grue / d'entreposage", es: "área de grúa / acopio" },
  },
  {
    // "Work hours 7am–6pm weekdays", "Heures de travail : de 7 h à 18 h", "Horario de trabajo: de 7 a. m. a 6 p. m.", "Work weekdays 8am–5pm"
    re: new RegExp(
      String.raw`\b(?:work(?:ing)? hours|site hours|hours of work)\s*:?\s*(?:are\s*)?(?:typically\s*)?(?:overnight\s*)?\d${END}|\bwork weekdays\s*\d${END}|\bheures de travail\s*:\s*${END}\d${END}|\btravaux en semaine de \d${END}|\bhorario de trabajo\s*:\s*${END}\d${END}|\btrabajo entre semana de \d${END}`,
      "gi",
    ),
    given: /\b(?:hours?|heures?|horario|weekdays?|semaine|\d{1,2}\s?(?:am|pm|h\b|a\. ?m\.|p\. ?m\.))/i,
    blank: { en: "working hours", fr: "heures de travail", es: "horario de trabajo" },
  },
  {
    // "Service elevator available for materials", "Ascenseur de service disponible", "Elevador de servicio disponible"
    re: /\bservice elevator (?:is )?available[^.\n;]*|\bascenseur de service disponible[^.\n;]*|\belevador de servicio disponible[^.\n;]*/gi,
    given: /elevator|ascenseur|elevador/i,
    blank: { en: "service elevator availability", fr: "disponibilité de l'ascenseur de service", es: "disponibilidad del elevador de servicio" },
  },
  {
    // "Parking available in the north lot", "Park in [designated area]" is already a blank and is left alone
    re: /\b(?:contractor )?parking (?:is )?(?:available|provided) (?:in|on|at) [^.\n;]*|\bstationnement (?:disponible|fourni) (?:dans|sur) [^.\n;]*|\bestacionamiento disponible en [^.\n;]*/gi,
    given: /parking|stationnement|estacionamiento/i,
    blank: { en: "contractor parking", fr: "stationnement des entrepreneurs", es: "estacionamiento para contratistas" },
  },
];

/**
 * Sentences that state site specifics as facts become visible blanks, unless
 * the manager's own answers (`userText`) mention that topic.
 */
export function blankInventedFacts(text: string, lang: WriterLang, userText: string): string {
  let out = text;
  for (const rule of FACT_RULES) {
    if (rule.given.test(userText)) continue;
    out = out.replace(rule.re, () => confirmBlank(lang, rule.blank[lang]));
  }
  // Two blanks for the same thing in a row read as a glitch: keep one.
  return out.replace(/(\[(?:Confirm|À confirmer|Por confirmar)[^\]]*\])(?:[.;,]?\s*\1)+/g, "$1");
}

/* ------------------------------------------------------------------ the manager's words */

/** "mississauga" → "Mississauga", "saint-jean-sur-richelieu" → "Saint-Jean-Sur-Richelieu"; mixed case is kept as typed. */
export function properCase(name: string): string {
  const s = name.trim().replace(/\s+/g, " ");
  if (s !== s.toLowerCase()) return s;
  return s.replace(/(^|[\s\-'’])(\p{Ll})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

/** "Ontario", "Mississauga": names we know are proper, from the answers. */
function properNames(input: Pick<WizardInput, "city" | "province">): string[] {
  return [input.city, input.province].filter((s): s is string => Boolean(s && s.trim())).map(properCase);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Sentence case for the manager's own description: first letter of each
 * sentence capitalized, known place names capitalized, "i" → "I" in English.
 * Nothing else is rewritten.
 */
export function tidyUserText(text: string, input: Pick<WizardInput, "city" | "province">, lang: WriterLang = "en"): string {
  let out = text.trim().replace(/[ \t]+/g, " ");
  for (const name of properNames(input)) {
    out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRe(name)}(?![\\p{L}])`, "giu"), name);
  }
  if (lang === "en") out = out.replace(/(?<![\p{L}'’.])i(?=\s|['’]\p{L}|$)/gu, "I");
  // Start of text and after a sentence end (". ", "! ", "? " or a new line).
  out = out.replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
  if (!/[.!?…)]$/.test(out)) out += ".";
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** True when `haystack` contains the manager's description (or its first 40+ characters) verbatim. */
function containsUserText(haystack: string, description: string): boolean {
  const d = fold(description).replace(/[.!?]+$/, "");
  if (d.length < 12) return false;
  const h = fold(haystack);
  return h.includes(d) || (d.length > 40 && h.includes(d.slice(0, 40)));
}

/* ------------------------------------------------------------------ Québec */

const RBQ_LINE: Record<WriterLang, string> = {
  en: "- Valid Régie du bâtiment du Québec (RBQ) licence covering the subclass of work being bid.",
  fr: "- Licence valide de la Régie du bâtiment du Québec (RBQ) couvrant la sous-catégorie des travaux soumissionnés.",
  es: "- Licencia vigente de la Régie du bâtiment du Québec (RBQ) para la subcategoría de los trabajos ofertados.",
};

const isQuebec = (province: string | undefined) => fold(province ?? "") === "quebec";

/** Québec drafts ask for an RBQ licence (CNESST is already handled per language). */
export function ensureQuebecLicence(requirements: string, lang: WriterLang, province: string | undefined): string {
  if (!isQuebec(province) || /\bRBQ\b/.test(requirements)) return requirements;
  return `${requirements.trimEnd()}\n${RBQ_LINE[lang]}`;
}

/* ------------------------------------------------------------------ all together */

/**
 * Clean a finished draft. `structuredSummary` is the summary built from the
 * answers; it replaces a summary that repeats the manager's raw description.
 */
export function finalizeDraft(
  draft: RfpDraft,
  input: WizardInput,
  opts: { lang?: WriterLang; structuredSummary?: string } = {},
): RfpDraft {
  const lang: WriterLang = opts.lang ?? input.lang ?? "en";
  const userText = [input.description, input.size, input.city].filter(Boolean).join("\n");
  const clean = (s: string) => blankInventedFacts(fillPercentBlanks(s, lang), lang, userText);

  // The manager's words appear once, in "What we need" (scope). A summary that
  // repeats them is replaced by the one built from the structured answers.
  let summary = draft.summary;
  if (opts.structuredSummary && containsUserText(summary, input.description) && containsUserText(draft.scope, input.description)) {
    summary = opts.structuredSummary;
  }

  return {
    ...draft,
    summary: clean(summary),
    scope: clean(draft.scope),
    requirements: ensureQuebecLicence(clean(draft.requirements), lang, input.province),
    questionsForBidders: draft.questionsForBidders.map((q) => fillPercentBlanks(q, lang)).filter((q) => q.trim().length > 0),
  };
}
