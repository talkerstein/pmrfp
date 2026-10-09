import { getLang, getT } from "@/i18n/server";
import { fmt, formatNumber } from "@/i18n/format";
import { localizePath } from "@/i18n/config";
import { LEVELS } from "@/lib/karma/rules";
import { featuredContributors } from "@/lib/karma/data";
import { LevelBadge } from "./level-badge";

/** Staircase look per level: height, background, text, accent (v3 forum design). */
const LOOK: [number, string, string, string][] = [
  [190, "#FFFFFF", "#1B1D3A", "#282B59"],
  [240, "#5FD3AC", "#1B1D3A", "#1B1D3A"],
  [290, "#3E9F85", "#FFFFFF", "#FFFFFF"],
  [340, "#282B59", "#FFFFFF", "#91F2CF"],
  [400, "#1B1D3A", "#FFFFFF", "#91F2CF"],
];

const two = (i: number) => String(i).padStart(2, "0");

/** The five company levels as the v3 staircase (needs the .v3p f-ranks CSS). */
export function LevelStairs() {
  const k = getT("karma");
  const lang = getLang();
  return (
    <ol className="f-ranks">
      {LEVELS.map((l, i) => {
        const [h, bg, fg, accent] = LOOK[i];
        return (
          <li key={l.slug} className="f-rank step" style={{ height: h, background: bg, color: fg }}>
            <div className="top" style={{ color: accent }}>
              <span>{fmt(k.forum.levelN, { n: l.level }).toUpperCase()}</span>
              <span>{two(l.level)}/{two(LEVELS.length)}</span>
            </div>
            <div>
              <div className="nm">{k.levels[l.slug]}</div>
              <div className="pts"><b style={{ color: accent }}>{formatNumber(l.min, lang)}</b><span>{k.forum.points}</span></div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Featured contributor slot: up to three level 4-5 companies, rotated daily.
 * Renders nothing until a real company gets there (no placeholders).
 */
export async function FeaturedContributors({ tone = "light" }: { tone?: "light" | "dark" }) {
  const list = await featuredContributors(3);
  if (!list.length) return null;
  const k = getT("karma");
  const L = (p: string) => localizePath(p, getLang());
  return (
    <div className="karma-featured" style={{ marginTop: 32 }} data-featured="contributors">
      <div className="eb" style={{ color: "inherit" }}>{k.featured.title}</div>
      <p style={{ margin: "6px 0 12px", fontSize: 14 }}>{k.featured.lead}</p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {list.map((c) => (
          <li key={c.orgId} style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 999, padding: "8px 14px", background: tone === "dark" ? "rgba(255,255,255,.08)" : "#FFFFFF" }}>
            {c.listed ? <a href={L(`/directory/${c.slug}`)} style={{ fontWeight: 700 }}>{c.name}</a> : <b>{c.name}</b>}
            <LevelBadge level={c.level} tone={tone} short />
          </li>
        ))}
      </ul>
    </div>
  );
}
