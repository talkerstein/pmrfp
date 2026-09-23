import { Mail } from "lucide-react";
import type { RfpListItem } from "@/lib/data/types";
import { SITE } from "@/lib/site";

const fmt = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * What a Trade Pro member actually receives: the daily match digest
 * (lib/alerts/digest + sendDailyMatches), rendered with real open RFPs so the
 * buyer sees the product before paying. Mirrors the email's structure: one
 * email, every match, soonest deadline first.
 */
export function EmailPreview({ items, tradeLabel }: { items: RfpListItem[]; tradeLabel: string }) {
  const n = items.length;
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-indigo/10">
      <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-5 py-3 text-sm">
        <Mail className="size-4 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {n} new {tradeLabel} {n === 1 ? "match" : "matches"} on {SITE.name} today
          </p>
          <p className="text-xs text-muted-foreground">From {SITE.name} &lt;{SITE.email}&gt; · every morning</p>
        </div>
      </div>
      <div className="px-6 py-5">
        <p className="text-sm text-muted-foreground">
          New RFPs and public tenders in your trades and regions since yesterday, soonest deadline first:
        </p>
        <ul className="mt-4 space-y-4">
          {items.map((r) => (
            <li key={r.slug}>
              <p className="font-semibold text-indigo">{r.title}</p>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-teal-700">
                {[r.categories[0], r.regionName, r.deadline ? `Closes ${fmt(r.deadline)}` : "No fixed closing date"]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.summary && (
                <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{r.summary}</p>
              )}
            </li>
          ))}
        </ul>
        <span className="mt-5 inline-block rounded-lg bg-indigo px-4 py-2 text-sm font-semibold text-white">Open your feed</span>
      </div>
    </div>
  );
}
