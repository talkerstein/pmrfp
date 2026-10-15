/**
 * Copy-paste badge code (pure, unit-tested). The rules that keep a badge an
 * honest link and not link spam:
 *  - exactly ONE visible link, and it points at the company's own PMRFP page;
 *  - branded anchor text only: the company's name (the image's alt, or the
 *    text link). Never trade or city keywords ("best roofer Toronto");
 *  - nothing hidden: no display:none, no 1px images, no extra links in the code;
 *  - rel="noopener" only — a normal, followable link, and nobody is asked to
 *    add it as a condition of anything.
 */

export type BadgeKind = "listed" | "winner" | "karma";

export interface BadgeSnippetInput {
  kind: BadgeKind;
  /** Absolute site origin, no trailing slash ("https://pmrfp.com"). */
  base: string;
  /** Company slug (directory slug, or contract-winner slug for "winner"). */
  slug: string;
  /** The company's own PMRFP page in the visitor's language (absolute URL). */
  pageUrl: string;
  /** The company's name: the branded anchor text. */
  name: string;
  theme?: "light" | "dark";
  /** Badge text language (the image follows the page language). */
  lang?: "en" | "fr" | "es";
}

export const BADGE_SIZE: Record<BadgeKind, { width: number; height: number }> = {
  listed: { width: 214, height: 54 },
  winner: { width: 240, height: 66 },
  karma: { width: 240, height: 66 },
};

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The badge image URL (/api/badge/<slug>, /api/badge/winner/<slug>, /api/badge/karma/<slug>). */
export function badgeImageUrl(i: Pick<BadgeSnippetInput, "kind" | "base" | "slug" | "theme" | "lang">): string {
  const path = i.kind === "listed" ? `/api/badge/${encodeURIComponent(i.slug)}` : `/api/badge/${i.kind}/${encodeURIComponent(i.slug)}`;
  const q = new URLSearchParams();
  if (i.theme === "dark") q.set("theme", "dark");
  if (i.lang && i.lang !== "en" && i.kind !== "listed") q.set("lang", i.lang);
  const qs = q.toString();
  return `${i.base}${path}${qs ? `?${qs}` : ""}`;
}

/** <a href="their page"><img alt="Company name" …></a> */
export function badgeHtml(i: BadgeSnippetInput): string {
  const { width, height } = BADGE_SIZE[i.kind];
  return `<a href="${attr(i.pageUrl)}" target="_blank" rel="noopener">\n  <img src="${attr(badgeImageUrl(i))}" alt="${attr(i.name)}" width="${width}" height="${height}" />\n</a>`;
}

/** A plain text link with the company's name as the anchor. */
export function badgeTextLink(i: Pick<BadgeSnippetInput, "pageUrl" | "name">): string {
  return `<a href="${attr(i.pageUrl)}" target="_blank" rel="noopener">${text(i.name)}</a>`;
}

/** Markdown (GitHub READMEs, some site builders). */
export function badgeMarkdown(i: BadgeSnippetInput): string {
  const alt = i.name.replace(/[[\]]/g, "");
  return `[![${alt}](${badgeImageUrl(i)})](${i.pageUrl})`;
}
