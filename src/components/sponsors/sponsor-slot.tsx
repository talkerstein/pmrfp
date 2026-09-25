import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { pickSponsor, sponsorHref, type SponsorContext } from "@/lib/sponsors/registry";
import { cn } from "@/lib/utils";

/**
 * One quiet, labelled sponsor card, or nothing when no sponsor is relevant
 * here. Server-rendered; clicks go through /go/<id> for counting.
 */
export function SponsorSlot({ ctx, className }: { ctx: SponsorContext; className?: string }) {
  const picked = pickSponsor(ctx);
  if (!picked) return null;
  const { sponsor, creative } = picked;
  const href = sponsorHref(sponsor.id, ctx.placement, ctx.categories?.[0]);
  return (
    <aside aria-label={`${sponsor.label}: ${sponsor.name}`} className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{sponsor.label}</p>
      <a href={href} target="_blank" rel="sponsored noopener" className="group mt-2 flex gap-3">
        <Image
          src={sponsor.logo}
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug text-foreground group-hover:text-teal-700">
            {creative.headline}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{creative.body}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
            {creative.cta} <ArrowUpRight className="size-3.5" />
          </span>
        </span>
      </a>
    </aside>
  );
}
