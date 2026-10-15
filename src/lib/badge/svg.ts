import { MARK_PATH, MARK_VIEWBOX, WORDMARK_PATHS, WORDMARK_VIEWBOX } from "@/lib/brand/logo-paths";
import type { BadgeTier } from "./data";

/**
 * The badge images (pure SVG strings, unit-tested). Three kinds:
 *  - listed: "Listed on / ✓ Verified on PMRFP" for directory companies (unchanged sizes, 214×54 / 188×32).
 *  - winner: "Public contract winner" + the real award count and years.
 *  - karma:  "Reputation level N" + the level name (level 2+ only; below that the plain seal).
 * Every number comes from the caller's real data; nothing is invented here.
 */

export type BadgeTheme = "light" | "dark";
export type BadgeVariant = "standard" | "compact";
export type BadgeLang = "en" | "fr" | "es";

const C = {
  indigo: "#282B59",
  teal: "#91F2CF",
  tealInk: "#0C7A5A",
  border: "#E2E6F0",
  white: "#FFFFFF",
  slate: "#6A6E80",
  light: "#C7CAE3",
};

const FONT = "system-ui, -apple-system, Segoe UI, Arial, sans-serif";
const WORD_RATIO = 463 / 72; // wordmark width per unit of height

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

const mark = (x: number, y: number, size: number, fill: string) =>
  `<svg x="${x.toFixed(1)}" y="${y}" width="${size}" height="${size}" viewBox="${MARK_VIEWBOX}"><path fill-rule="evenodd" clip-rule="evenodd" fill="${fill}" d="${MARK_PATH}"/></svg>`;

const wordmark = (x: number, y: number, h: number, fill: string) =>
  `<svg x="${x.toFixed(1)}" y="${y}" width="${(h * WORD_RATIO).toFixed(1)}" height="${h}" viewBox="${WORDMARK_VIEWBOX}" fill="${fill}">${WORDMARK_PATHS.map((d) => `<path d="${d}"/>`).join("")}</svg>`;

function palette(theme: BadgeTheme) {
  const dark = theme === "dark";
  return {
    frame: dark ? `fill="#FFFFFF" fill-opacity="0.04" stroke="#FFFFFF" stroke-opacity="0.22"` : `fill="${C.white}" stroke="${C.border}"`,
    mark: dark ? C.teal : C.indigo,
    word: dark ? C.white : C.indigo,
    sub: dark ? C.light : C.slate,
    accent: dark ? C.teal : C.tealInk,
  };
}

/* ------------------------------------------------------------------ listed (unchanged look) */

/**
 * Official mark + "pmrfp.com" wordmark, content centred in the frame so there's
 * no empty tail. Dark is see-through with a hairline edge, so it sits on any dark
 * footer. Sizes stay 214×54 / 188×32 so existing embeds keep their proportions.
 */
export function renderListedBadge(tier: BadgeTier, found: boolean, theme: BadgeTheme, variant: BadgeVariant): string {
  const p = palette(theme);
  // Only a live listing gets a tier claim; anything else just points at PMRFP.
  const label = !found ? "Find us on" : tier.verified ? "✓ Verified on" : "Listed on";
  const labelFill = found && tier.verified ? p.accent : p.sub;
  const aria = found ? `${tier.label} on PMRFP` : "Find us on PMRFP";

  if (variant === "compact") {
    const w = 188, h = 32, m = 20, wh = 13;
    const labelW = label.length * 5.1; // ~7.5px caps text
    const content = m + 7 + labelW + 5 + wh * WORD_RATIO;
    const x0 = (w - content) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(aria)}">
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" ${p.frame}/>
${mark(x0, 6, m, p.mark)}
<text x="${(x0 + m + 7).toFixed(1)}" y="19.5" font-family="${FONT}" font-size="7.5" font-weight="600" letter-spacing="0.6" fill="${labelFill}">${escapeXml(label.toUpperCase())}</text>
${wordmark(x0 + m + 7 + labelW + 5, 9.5, wh, p.word)}
</svg>`;
  }

  const w = 214, h = 54, m = 32, wh = 20;
  const content = m + 12 + wh * WORD_RATIO;
  const x0 = (w - content) / 2;
  const tx = x0 + m + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(aria)}">
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" ${p.frame}/>
${mark(x0, 11, m, p.mark)}
<text x="${tx.toFixed(1)}" y="21" font-family="${FONT}" font-size="8.5" font-weight="600" letter-spacing="1.1" fill="${labelFill}">${escapeXml(label.toUpperCase())}</text>
${wordmark(tx, 24.5, wh, p.word)}
</svg>`;
}

/* ------------------------------------------------------------------ three-line badges */

export const TALL_BADGE = { width: 240, height: 66 } as const;

/** Mark on the left; a caps label, the wordmark and one line of facts on the right. */
function renderTall(opts: { label: string; sub: string; aria: string; theme: BadgeTheme; accentLabel?: boolean; bars?: number }): string {
  const p = palette(opts.theme);
  const { width: w, height: h } = TALL_BADGE;
  const m = 34;
  const x0 = 14;
  const tx = x0 + m + 12;
  // Five rising bars (the reputation level), drawn, so no font glyph is needed.
  const barsSvg = opts.bars
    ? [1, 2, 3, 4, 5]
        .map((i) => `<rect x="${tx + (i - 1) * 4}" y="${55 - (2 + i * 1.6)}" width="3" height="${(2 + i * 1.6).toFixed(1)}" rx="0.8" fill="${i <= opts.bars! ? p.accent : p.sub}" fill-opacity="${i <= opts.bars! ? 1 : 0.35}"/>`)
        .join("")
    : "";
  const subX = opts.bars ? tx + 24 : tx;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(opts.aria)}">
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" ${p.frame}/>
${mark(x0, 16, m, p.mark)}
<text x="${tx}" y="19" font-family="${FONT}" font-size="8" font-weight="700" letter-spacing="0.9" fill="${opts.accentLabel ? p.accent : p.sub}">${escapeXml(opts.label.toUpperCase())}</text>
${wordmark(tx, 23, 18, p.word)}
${barsSvg}<text x="${subX}" y="55" font-family="${FONT}" font-size="9.5" font-weight="600" fill="${p.sub}">${escapeXml(opts.sub)}</text>
</svg>`;
}

const WINNER_COPY: Record<BadgeLang, { label: string; one: string; other: string; aria: string }> = {
  en: { label: "Public contract winner", one: "{n} public award", other: "{n} public awards", aria: "Public contract winner on PMRFP: {sub}" },
  fr: { label: "Adjudicataire public", one: "{n} contrat public", other: "{n} contrats publics", aria: "Adjudicataire de contrats publics sur PMRFP : {sub}" },
  es: { label: "Ganador de contrato público", one: "{n} contrato público", other: "{n} contratos públicos", aria: "Ganador de contratos públicos en PMRFP: {sub}" },
};

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

/** "12 public awards · 2021–2026" — the count and the years of the real award notices. */
export function winnerFactsLine(awards: number, years: { from: number | null; to: number | null }, lang: BadgeLang = "en"): string {
  const c = WINNER_COPY[lang];
  const count = fill(awards === 1 ? c.one : c.other, { n: awards });
  const span = years.from && years.to ? (years.from === years.to ? String(years.to) : `${years.from}–${years.to}`) : "";
  return span ? `${count} · ${span}` : count;
}

export function renderWinnerBadge(
  info: { found: boolean; awards: number; from: number | null; to: number | null },
  theme: BadgeTheme,
  lang: BadgeLang = "en",
): string {
  // Unknown slug: the plain seal, never a made-up award count.
  if (!info.found || info.awards < 1) return renderListedBadge({ label: "Listed Vendor", verified: false, insured: false }, false, theme, "standard");
  const c = WINNER_COPY[lang];
  const sub = winnerFactsLine(info.awards, info, lang);
  return renderTall({ label: c.label, sub, aria: fill(c.aria, { sub }), theme, accentLabel: true });
}

const KARMA_COPY: Record<BadgeLang, { label: string; aria: string }> = {
  en: { label: "Reputation · level {n}", aria: "Company reputation on PMRFP: level {n} of 5, {name}" },
  fr: { label: "Réputation · niveau {n}", aria: "Réputation d'entreprise sur PMRFP : niveau {n} sur 5, {name}" },
  es: { label: "Reputación · nivel {n}", aria: "Reputación de la empresa en PMRFP: nivel {n} de 5, {name}" },
};

/** Minimum level that gets a reputation badge (level 1 is everyone's starting point). */
export const KARMA_BADGE_MIN_LEVEL = 2;

export function renderKarmaBadge(
  info: { found: boolean; level: number | null; levelName: string },
  theme: BadgeTheme,
  lang: BadgeLang = "en",
): string {
  if (!info.found || !info.level || info.level < KARMA_BADGE_MIN_LEVEL) {
    return renderListedBadge({ label: "Listed Vendor", verified: false, insured: false }, false, theme, "standard");
  }
  const c = KARMA_COPY[lang];
  const vars = { n: info.level, name: info.levelName };
  return renderTall({ label: fill(c.label, vars), sub: info.levelName, aria: fill(c.aria, vars), theme, accentLabel: true, bars: info.level });
}

export function parseBadgeLang(v: string | null | undefined): BadgeLang {
  return v === "fr" || v === "es" ? v : "en";
}
