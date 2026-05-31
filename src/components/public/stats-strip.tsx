/**
 * Small, restrained social-proof strip. Three numbers, neutral type, no icons.
 * Designed to sit under hero copy on /, /rfps, /pricing without screaming.
 *
 * Reference treatment: stripe.com/atlas alumni page, linear.app stats row.
 * Visual story: typography only. No icons, no animations, no gradients.
 */
import type { PlatformStats } from "@/lib/data/stats";

export function StatsStrip({ stats, className = "" }: { stats: PlatformStats; className?: string }) {
  // Hide the strip entirely if we have nothing real to show — pretending zero is
  // a "stat" hurts more than helps.
  if (stats.rfpsPostedLast30Days === 0 && stats.tradesListed === 0) return null;

  return (
    <div className={`flex flex-wrap items-baseline gap-x-8 gap-y-3 ${className}`.trim()}>
      <Stat value={stats.rfpsPostedLast30Days} label="RFPs posted · last 30 days" />
      <Stat value={stats.tradesListed} label="trade companies listed" />
      <Stat value="Canada-first" label="—" />
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
