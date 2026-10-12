import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SponsorUnit } from "@/lib/sponsors/pick";

/**
 * One quiet sponsor card. The label is ours ("Sponsored" in the page's
 * language); the copy is the sponsor's, as reviewed. Every link out is
 * rel="sponsored noopener" and goes through /go/<id> for click counting.
 * Pure markup (no data loading), so it is unit-tested; SponsorSlot picks
 * the unit and adds the impression counter.
 */
export function SponsorCard({
  unit,
  label,
  className,
  children,
}: {
  unit: SponsorUnit;
  /** The translated label (common.sponsor[unit.label]). */
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <aside
      aria-label={`${label}: ${unit.name}`}
      data-sponsor={unit.id}
      data-placement={unit.placement}
      className={cn("rounded-xl border border-border bg-card p-4 text-left", className)}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <a href={unit.href} target="_blank" rel="sponsored noopener" className="group mt-2 flex gap-3 no-underline">
        {unit.logo ? (
          // Sponsor logos are plain images from any https host (no next/image remote config).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={unit.logo}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
            className="size-10 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
          />
        ) : (
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-xs font-bold text-indigo">
            {unit.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug text-foreground group-hover:text-teal-700">{unit.headline}</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{unit.body}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
            {unit.cta} <ArrowUpRight className="size-3.5" aria-hidden />
          </span>
        </span>
      </a>
      {children}
    </aside>
  );
}
