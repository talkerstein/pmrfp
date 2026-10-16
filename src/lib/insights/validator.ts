/**
 * The STRICT check an AI-polished insight sentence must pass before it can
 * replace the template sentence. The template is built only from the fact
 * record, so "nothing the template doesn't have" = "nothing the record
 * doesn't have". Rejected when the polished text:
 *  - has a number that isn't in the template, or drops one that is
 *    (dates and years are numbers too);
 *  - names a company, buyer, place or month the template doesn't;
 *  - gives advice or predicts ("you should", "will rise", "recommend"…) in
 *    any of the three languages;
 *  - carries a link, Markdown, or is empty / much longer than the template.
 * Pure; unit-tested (test/unit/insights.test.ts).
 */
import { LOCALE_TAG, LOCALES } from "@/i18n/config";
import type { InsightFact } from "./types";

export interface Validation {
  ok: boolean;
  reasons: string[];
}

/** Space-like characters used as thousands separators (fr: U+00A0 / U+202F; also thin space). */
const SEP = "[,    ]";
const NUM_RE = new RegExp(`\\d{1,3}(?:${SEP}\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?`, "g");

/** Numbers in a text, normalized: "24,000" / "24 000" → "24000", "1,5" → "1.5", leading zeros dropped. */
export function numberTokens(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(NUM_RE)) {
    let n = m[0];
    if (new RegExp(`^\\d{1,3}(?:${SEP}\\d{3})+`).test(n)) {
      const dec = n.match(/[.,](\d{1,2})$/);
      n = (dec ? n.slice(0, -dec[0].length) : n).replace(new RegExp(SEP, "g"), "") + (dec ? `.${dec[1]}` : "");
    } else n = n.replace(",", ".");
    n = n.replace(/^0+(?=\d)/, "");
    if (n.includes(".")) n = n.replace(/\.?0+$/, "");
    out.push(n);
  }
  return out;
}

const WORD_RE = /\p{Lu}[\p{Ll}'’-]+/gu;
const CAPS_RE = /\b\p{Lu}{2,}\b/gu;

/** Capitalized words mid-sentence (and all-caps words anywhere) that the source doesn't contain. */
export function newNames(source: string, output: string): string[] {
  const src = source.toLowerCase();
  const found = new Set<string>();
  for (const m of output.matchAll(WORD_RE)) {
    const before = output.slice(0, m.index ?? 0).trimEnd();
    if (before === "" || /[.!?:;\n]$/.test(before)) continue;
    if (!src.includes(m[0].toLowerCase())) found.add(m[0]);
  }
  for (const m of output.matchAll(CAPS_RE)) if (!src.includes(m[0].toLowerCase())) found.add(m[0]);
  return [...found];
}

/** Month names in every language we write (so a French polish can't slip in "mars"). */
const MONTHS: string[] = LOCALES.flatMap((l) =>
  Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, i, 15, 12)).toLocaleDateString(LOCALE_TAG[l], { month: "long", timeZone: "UTC" }).toLowerCase()),
);
const SHORT_MONTHS: string[] = LOCALES.flatMap((l) =>
  Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2026, i, 15, 12)).toLocaleDateString(LOCALE_TAG[l], { month: "short", timeZone: "UTC" }).toLowerCase().replace(/\.$/, ""),
  ),
).filter((m) => m.length >= 3);

const monthsIn = (s: string): Set<string> => {
  const text = s.toLowerCase();
  const out = new Set<string>();
  for (const m of [...MONTHS, ...SHORT_MONTHS]) {
    if (new RegExp(`(^|[^\\p{L}])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(text)) out.add(m);
  }
  return out;
};

/** Advice and prediction, in en / fr / es. The insights describe the record; they never tell anyone what to do or what will happen. */
export const ADVICE_RES: readonly RegExp[] = [
  /\byou (?:should|must|need to|ought to|have to)\b/i,
  /\b(?:we |i )?recommend/i,
  /\bshould (?:bid|price|quote|apply|consider|target)\b/i,
  /\bbid (?:at|around|below|above|under|lower|higher)\b/i,
  /\bguarantee/i,
  /\bwill (?:rise|fall|increase|decrease|grow|drop|continue|keep|win|go up|go down)\b/i,
  /\b(?:predict|forecast)/i,
  /\bexpect(?:ed)? (?:prices|demand|to (?:rise|fall|grow|drop))\b/i,
  /\b(?:don'?t|do not) miss\b/i,
  /\bmake sure\b/i,
  /\bvous (?:devriez|devez)\b/i,
  /\bnous recommandons\b|\brecommand(?:é|e|ons|ez)/i,
  /\bgaranti/i,
  /\bva(?:nt)? (?:augmenter|baisser|continuer|grimper)\b/i,
  /\bpr[ée]vision|\bpr[ée]voi[rst]/i,
  /\bn['’]oubliez pas\b/i,
  /\bdeber[íi]a|\bdebe (?:ofertar|licitar|cotizar)\b/i,
  /\brecomend/i,
  /\bgarantiz/i,
  /\bva(?:n)? a (?:subir|bajar|aumentar|disminuir|crecer|seguir)\b/i,
  /\bpron[óo]stic|\bpredic/i,
  /\bno se pierda\b/i,
];

const LINKISH = /https?:|www\.|\*\*|__|\[[^\]]*\]\(|<\/?[a-z]/i;

/** All names the fact itself carries (companies, buyers, projects), added to what the template allows. */
export function factNames(f: InsightFact): string[] {
  const d = f.data as unknown as Record<string, unknown>;
  const out: string[] = [];
  for (const k of ["buyer", "winner"]) if (typeof d[k] === "string") out.push(d[k] as string);
  for (const list of ["items", "winners"]) {
    const arr = d[list];
    if (!Array.isArray(arr)) continue;
    for (const it of arr as Record<string, unknown>[]) for (const k of ["name", "winner", "buyer", "incumbent", "title"]) if (typeof it[k] === "string") out.push(it[k] as string);
  }
  return out;
}

export function validatePolished(template: string, output: string, fact?: InsightFact): Validation {
  const reasons: string[] = [];
  const out = output.trim();
  if (!out) return { ok: false, reasons: ["empty"] };
  if (out.length > Math.round(template.length * 1.6) + 40) reasons.push(`too long (${out.length} vs ${template.length})`);
  if (LINKISH.test(out)) reasons.push("link or markup");

  const have = numberTokens(template);
  const got = numberTokens(out);
  const extra = [...new Set(got.filter((n) => !have.includes(n)))];
  if (extra.length) reasons.push(`new numbers: ${extra.join(", ")}`);
  const dropped = [...new Set(have.filter((n) => !got.includes(n)))];
  if (dropped.length) reasons.push(`dropped numbers: ${dropped.join(", ")}`);

  const source = [template, ...(fact ? factNames(fact) : [])].join(" \n ");
  const names = newNames(source, out);
  if (names.length) reasons.push(`new names: ${names.join(", ")}`);

  const tMonths = monthsIn(template);
  const newMonths = [...monthsIn(out)].filter((m) => !tMonths.has(m));
  if (newMonths.length) reasons.push(`new months: ${newMonths.join(", ")}`);

  const advice = ADVICE_RES.filter((re) => re.test(out) && !re.test(template));
  if (advice.length) reasons.push(`advice or prediction: ${advice.map((r) => r.source).join(" | ")}`);

  return { ok: reasons.length === 0, reasons };
}
