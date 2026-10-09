/**
 * Forum auto-threads (pure part): turn a real PMRFP record (public tender,
 * PM-posted RFP, or past contract award) into one clearly labelled
 * "PMRFP Board · automatic post" discussion thread.
 *
 * Honesty rules, enforced here and tested in test/forum-auto-threads.test.ts:
 *  - the body is built ONLY from the record's own fields (title, issuer,
 *    location, trade, dates, summary, source + licence) plus one fixed,
 *    neutral discussion prompt. No opinions, quotes, replies, votes.
 *  - createdAt is the record's real date (published / awarded), never now.
 *  - every body opens with the automatic-post label.
 * The DB side lives in auto-threads-server.ts.
 */
import { SITE } from "@/lib/site";
import { localizePath } from "@/i18n/config";
import { publicTenderSource } from "@/lib/tenders/sources";
import { CIVIL } from "@/lib/tenders/shared";
import { forumForTrade, type ForumCategorySlug } from "./categories";
import { normalizeBody, normalizeTitle, slugify, wordCount } from "./text";

export const SYSTEM_HANDLE = "pmrfp_board";
export const SYSTEM_DISPLAY_NAME = "PMRFP Board";
export const AUTO_LABEL_EN = "PMRFP Board · automatic post";
export const AUTO_LABEL_FR = "Tableau PMRFP · publication automatique";
export const BACKFILL_DAYS = 90;
export const BACKFILL_CAP = 400;
/** Daily cron: look back a few days (late-published rows) and cap per run. */
export const CRON_DAYS = 3;
export const CRON_CAP = 80;

/** Feature flag: on unless FORUM_AUTO_THREADS is explicitly 0/false/off. */
export function autoThreadsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.FORUM_AUTO_THREADS ?? "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(v);
}

/** One rfp_posts row (service read) plus its trade category slugs. */
export interface AutoSourceRecord {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  city: string | null;
  province: string | null;
  deadline: string | null;
  publishedAt: string | null;
  createdAt: string;
  sourceType: string | null;
  isDemo: boolean;
  status: string;
  tradeSlugs: string[];
  tradeNames: string[];
}

export type AutoKind = "tender" | "award" | "rfp";

export interface AutoThreadDraft {
  sourceKey: string;
  kind: AutoKind;
  category: ForumCategorySlug;
  lang: "en" | "fr";
  title: string;
  slug: string;
  body: string;
  bodyWords: number;
  createdAt: string;
  region: string | null;
  /** Lower sorts first: 0 = a trade forum, 1 = GC via trade, 2 = fallback. */
  priority: number;
}

/** Work a property trade doesn't bid on, on top of the importers' own filters. */
const OUT_OF_SCOPE =
  /dredg|marine|wharf|\bpier\b|vessel|\bship\b|harbour|harbor|software|\bit\b services|information technology|cyber|telecom|helicopter|aircraft|airfield|consult(ing|ant)|advisory|translation|analyst|training services|medical|pharma|laboratory/i;

export function isOutOfScope(r: Pick<AutoSourceRecord, "title" | "summary">): boolean {
  const text = `${r.title} ${r.summary ?? ""}`;
  return CIVIL.test(text) || OUT_OF_SCOPE.test(text);
}

export function sourceKeyFor(r: Pick<AutoSourceRecord, "id">): string {
  return `rfp:${r.id}`;
}

export function kindOf(r: Pick<AutoSourceRecord, "slug" | "sourceType">): AutoKind {
  if (r.sourceType !== "public_source") return "rfp";
  return publicTenderSource(r.slug).past ? "award" : "tender";
}

/** Québec (SEAO) items go to the French Québec forum. */
export function isQuebecSource(r: Pick<AutoSourceRecord, "slug" | "sourceType">): boolean {
  return r.sourceType === "public_source" && publicTenderSource(r.slug).key === "seao";
}

/** Real event date: when it was published (awards: the award date). */
export function eventDate(r: Pick<AutoSourceRecord, "publishedAt" | "createdAt">): string {
  return new Date(r.publishedAt ?? r.createdAt).toISOString();
}

export function categoryFor(r: Pick<AutoSourceRecord, "slug" | "sourceType" | "tradeSlugs">): { category: ForumCategorySlug; priority: number } {
  if (isQuebecSource(r)) return { category: "quebec", priority: r.tradeSlugs.some((s) => forumForTrade(s)) ? 0 : 1 };
  const forums = r.tradeSlugs.map((s) => forumForTrade(s)).filter((f): f is ForumCategorySlug => f != null);
  const trade = forums.find((f) => f !== "general-contractors");
  if (trade) return { category: trade, priority: 0 };
  if (forums.length) return { category: "general-contractors", priority: 1 };
  return { category: "general-contractors", priority: 2 };
}

function fmtDate(iso: string | null, lang: "en" | "fr"): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function clip(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

const SITE_BASE = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");

export const PROMPTS = {
  en: {
    tender: "Bidding on this? Questions about scope or site conditions — ask here.",
    rfp: "Bidding on this? Questions about scope or site conditions — ask here.",
    award: "Worked with this buyer or on similar jobs? Share what to expect.",
  },
  fr: {
    tender: "Vous soumissionnez ? Des questions sur la portée ou les conditions du site — posez-les ici.",
    rfp: "Vous soumissionnez ? Des questions sur la portée ou les conditions du site — posez-les ici.",
    award: "Vous avez travaillé avec cet organisme ou sur des contrats semblables ? Partagez à quoi s'attendre.",
  },
} as const;

/** Build the thread, or null when the record is out of scope / unusable. */
export function buildAutoThread(r: AutoSourceRecord): AutoThreadDraft | null {
  if (r.isDemo || r.status !== "published") return null;
  // Closed-archive tenders already closed — "bidding on this?" would be wrong.
  if (r.sourceType === "public_source" && publicTenderSource(r.slug).closedArchive) return null;
  const rawTitle = normalizeTitle(r.title ?? "");
  if (rawTitle.length < 4 || isOutOfScope(r)) return null;

  const kind = kindOf(r);
  const { category, priority } = categoryFor(r);
  const lang: "en" | "fr" = category === "quebec" ? "fr" : "en";
  const fr = lang === "fr";
  const src = r.sourceType === "public_source" ? publicTenderSource(r.slug) : null;

  const prefix = fr
    ? { tender: "Appel d'offres", award: "Contrat octroyé", rfp: "Appel d'offres" }[kind]
    : { tender: "Tender", award: "Awarded", rfp: "RFP" }[kind];
  const title = normalizeTitle(fr ? `${prefix} : ${rawTitle}` : `${prefix}: ${rawTitle}`);

  const location = [r.city, r.province].filter(Boolean).join(", ") || null;
  const trades = r.tradeNames.length ? r.tradeNames.join(", ") : null;
  const posted = fmtDate(r.publishedAt ?? r.createdAt, lang);
  const closing = kind === "award" ? null : fmtDate(r.deadline, lang);
  const awarded = kind === "award" ? fmtDate(r.deadline ?? r.publishedAt, lang) : null;
  const summary = r.summary ? clip(r.summary, 600) : null;
  const page = `${SITE_BASE}${localizePath(`/rfps/${r.slug}`, lang)}`;

  const L = fr
    ? { buyer: "Émetteur", where: "Lieu", trade: "Corps de métier", posted: "Publié le", closing: "Date de clôture", awarded: "Octroyé le", summary: "Résumé", source: "Source", details: "Fiche complète sur PMRFP", pm: "un gestionnaire immobilier sur PMRFP", noPm: "Cet appel d'offres a été publié sur PMRFP." }
    : { buyer: "Issued by", where: "Location", trade: "Trade", posted: "Posted", closing: "Closing date", awarded: "Award date", summary: "Summary", source: "Source", details: "Full listing on PMRFP", pm: "a property manager on PMRFP", noPm: "This RFP was posted on PMRFP." };

  const lines: string[] = [];
  lines.push(`**${fr ? AUTO_LABEL_FR : AUTO_LABEL_EN}**`);
  lines.push(
    fr
      ? "Ce fil a été créé automatiquement à partir d'un avis public réel. Aucune réponse, note ou opinion n'est ajoutée par PMRFP."
      : "This thread was created automatically from a real listing. PMRFP adds no replies, ratings or opinions.",
  );
  const facts: string[] = [];
  facts.push(`${L.buyer}: ${src ? src.issuer : L.pm}`);
  if (location) facts.push(`${L.where}: ${location}`);
  if (trades) facts.push(`${L.trade}: ${trades}`);
  if (posted && kind !== "award") facts.push(`${L.posted}: ${posted}`);
  if (closing) facts.push(`${L.closing}: ${closing}`);
  if (awarded) facts.push(`${L.awarded}: ${awarded}`);
  lines.push(facts.join("\n"));
  if (summary) lines.push(`${L.summary}: ${summary}`);
  lines.push(src ? `${L.source}: ${src.portal}. ${src.attribution}` : L.noPm);
  lines.push(`${L.details}: ${page}`);
  lines.push(PROMPTS[lang][kind]);

  const body = normalizeBody(lines.join("\n\n"));
  if (title.length < 8 || body.length < 20) return null;
  return {
    sourceKey: sourceKeyFor(r),
    kind,
    category,
    lang,
    title,
    slug: slugify(title.replace(/^[^:]+:\s*/, "")),
    body,
    bodyWords: wordCount(body) + wordCount(title),
    createdAt: eventDate(r),
    region: r.province ? r.province.slice(0, 40) : null,
    priority,
  };
}

/**
 * Drafts for records not yet threaded, in priority order (trade forums
 * first, then newest), capped. `existing` = source keys already threaded.
 */
export function planAutoThreads(records: AutoSourceRecord[], existing: Set<string>, cap: number): AutoThreadDraft[] {
  const seen = new Set(existing);
  const drafts: AutoThreadDraft[] = [];
  for (const r of records) {
    const key = sourceKeyFor(r);
    if (seen.has(key)) continue;
    const d = buildAutoThread(r);
    if (!d) continue;
    seen.add(key);
    drafts.push(d);
  }
  drafts.sort((a, b) => a.priority - b.priority || b.createdAt.localeCompare(a.createdAt));
  return drafts.slice(0, Math.max(0, cap));
}
