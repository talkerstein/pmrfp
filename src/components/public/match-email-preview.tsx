import Image from "next/image";
import { Lock } from "lucide-react";
import type { RfpListItem } from "@/lib/data/types";
import { closingLabel, daysUntil } from "@/lib/data/fomo";

/**
 * What a Trade Pro member's morning email looks like, drawn from tenders that
 * are open on the board right now (not a mock list). Styled like an inbox
 * preview so a visitor can picture it arriving.
 */
export function MatchEmailPreview({ trade, place, rows }: { trade: string; place: string; rows: RfpListItem[] }) {
  if (!rows.length) return null;
  const subject = `${rows.length} new ${trade} ${rows.length === 1 ? "match" : "matches"} ${place}`;
  return (
    <div className="relative pt-4">
      {/* Yesterday's and the day before's, peeking out behind. */}
      <div aria-hidden className="absolute inset-x-10 top-0 h-24 rounded-2xl border border-border bg-card/60" />
      <div aria-hidden className="absolute inset-x-5 top-2 h-24 rounded-2xl border border-border bg-card/80" />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-indigo/15">
        <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-5 py-3.5">
          <Image src="/brand/mark.svg" alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-foreground">PMRFP</span>
              <span className="shrink-0 text-xs text-muted-foreground">9:00 AM</span>
            </div>
            <div className="truncate text-sm font-medium text-foreground/90">{subject}</div>
          </div>
        </div>
        <div className="px-5 pb-6 pt-5 sm:px-7">
          <p className="text-sm text-muted-foreground">
            New RFPs and public tenders in your trades and regions since yesterday, soonest deadline first:
          </p>
          <ul className="mt-4 space-y-3">
            {rows.map((r, i) => {
              const soon = closingLabel(daysUntil(r.deadline));
              return (
                <li
                  key={r.slug}
                  className="animate-rise rounded-xl border border-border bg-background p-4"
                  style={{ animationDelay: `${150 + i * 110}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-mono text-[11px] uppercase tracking-wide text-teal-700">
                      {r.categories[0] ?? trade} · {r.regionName ?? "Canada"}
                    </div>
                    {soon && (
                      <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                        {soon}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 line-clamp-2 font-semibold leading-snug text-indigo">{r.title}</div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="size-3" /> Full scope, documents and buyer contact
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 inline-flex rounded-[10px] bg-indigo px-5 py-2.5 text-sm font-semibold text-white">
            Open your feed
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Built from tenders open on the board right now.</p>
    </div>
  );
}
