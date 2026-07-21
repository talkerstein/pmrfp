/**
 * Small, restrained social-proof strip. Three numbers, neutral type, no icons.
 * Designed to sit under hero copy on /, /rfps, /pricing without screaming.
 *
 * Reference treatment: stripe.com/atlas alumni page, linear.app stats row.
 * Visual story: typography only. No icons, no animations, no gradients.
 */
import type { PlatformStats } from "@/lib/data/stats";

export function StatsStrip({ stats, className = "" }: { stats: PlatformStats; className?: string }) {
  // Only show a stat when its real number is > 0. A "0 posted · last 30 days"
  // sitting above the paywall reads as a dead marketplace and pre-refutes the
  // sale — omit any individual zero, hide the strip only when nothing is real.
  const items: { value: number | string; label: string }[] = [];
  if (stats.rfpsPostedLast30Days > 0)
    items.push({ value: stats.rfpsPostedLast30Days, label: "RFPs posted · last 30 days" });
  if (stats.tradesListed > 0)
    items.push({ value: stats.tradesListed, label: "trade companies listed" });
  if (items.length === 0) return null;
  items.push({ value: "By region", label: "commercial & residential" });

  return (
    <div className={`flex flex-wrap items-baseline gap-x-8 gap-y-3 ${className}`.trim()}>
      {items.map((it) => (
        <Stat key={it.label} value={it.value} label={it.label} />
      ))}
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tracking-tight text-indigo">{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
