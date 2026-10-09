import { getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { PUBLIC_BADGE_MIN_LEVEL, isLevel, levelSlug } from "@/lib/karma/rules";
import { cn } from "@/lib/utils";

/**
 * The public reputation badge: five rising bars and "Level 3 · Established".
 * Shows nothing below level 2 (everyone starts at level 1) unless `always`.
 * Server component (reads translations); pass the level, never the score.
 */
export function LevelBadge({
  level,
  tone = "light",
  short = false,
  always = false,
  className,
}: {
  level: number | null | undefined;
  /** light = on white/mint backgrounds, dark = on navy/ink. */
  tone?: "light" | "dark";
  /** "Level 3" instead of "Level 3 · Established" (tight spots). */
  short?: boolean;
  always?: boolean;
  className?: string;
}) {
  if (!isLevel(level) || (!always && level < PUBLIC_BADGE_MIN_LEVEL)) return null;
  const t = getT("karma");
  const name = t.levels[levelSlug(level)];
  const on = tone === "dark" ? "#91F2CF" : "#282B59";
  const off = tone === "dark" ? "rgba(255,255,255,.25)" : "#D5D6E6";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5",
        tone === "dark" ? "bg-white/10 text-white" : "bg-[#EEEEF8] text-[#1B1D3A]",
        className,
      )}
      title={fmt(t.badge.aria, { n: level, name })}
      data-karma-level={level}
    >
      <span aria-hidden className="inline-flex items-end gap-[2px]">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} style={{ display: "block", width: 3, height: 3 + i * 2, borderRadius: 1, background: i <= level ? on : off }} />
        ))}
      </span>
      <span className="sr-only">{fmt(t.badge.aria, { n: level, name })}</span>
      <span aria-hidden>{fmt(short ? t.badge.short : t.badge.label, { n: level, name })}</span>
    </span>
  );
}
