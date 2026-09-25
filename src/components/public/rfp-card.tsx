import Link from "next/link";
import Image from "next/image";
import { Lock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RfpListItem } from "@/lib/data/types";
import { isPastContract, parseAward } from "@/lib/data/fomo";
import { isGcPackage, sourceTypeLabel } from "@/lib/gc/packages";
import { DeadlineStamp } from "@/components/public/deadline-stamp";

function formatDate(d: string) {
  // timeZone: "UTC" pins server + client to the same day, so no hydration mismatch.
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Public tender · City of Toronto" → "City of Toronto"; PM RFPs → "Property manager". */
function buyerLine(rfp: RfpListItem): string {
  const badge = sourceTypeLabel(rfp.sourceType, rfp.slug);
  if (!badge) return "Property manager";
  const [, issuer] = badge.split(" · ");
  return issuer ?? badge;
}

function kindLabel(rfp: RfpListItem, past: boolean, gc: boolean): string {
  if (past) return "Award notice";
  if (gc) return "GC sub-trade package";
  if (rfp.sourceType === "public_source") return "Public tender";
  return "Private RFP";
}

export function RfpCard({ rfp, locked }: { rfp: RfpListItem; locked: boolean }) {
  const photo = rfp.photoUrls[0];
  const past = isPastContract(rfp);
  const closed = rfp.status !== "open";
  const award = past ? parseAward(rfp.summary) : null;
  const gc = isGcPackage(rfp);
  const place = [rfp.city, rfp.province].filter(Boolean).join(", ") || rfp.regionName;
  const trades = rfp.categories.slice(0, 2).join(" / ");

  return (
    <Link
      href={`/rfps/${rfp.slug}`}
      className={cn(
        "group flex min-w-0 flex-col rounded-lg border border-border bg-card transition-colors hover:border-indigo/40",
        closed && !past && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {kindLabel(rfp, past, gc)}
          {rfp.reference && <span className="text-foreground/60"> · {rfp.reference}</span>}
        </span>
        {past ? (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-teal-ink">Awarded</span>
        ) : closed ? (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {rfp.status === "awarded" ? "Filled" : "Closed"}
          </span>
        ) : locked ? (
          <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Details for members" />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-muted-foreground">{buyerLine(rfp)}</div>
            <h3 className="mt-1 line-clamp-3 break-words font-heading text-[15px] font-semibold leading-snug text-foreground group-hover:text-indigo">
              {rfp.title}
            </h3>
          </div>
          {photo && (
            <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-secondary">
              <Image src={photo} alt="" fill sizes="64px" className="object-cover" />
              {rfp.photoUrls.length > 1 && (
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] font-medium text-white">
                  +{rfp.photoUrls.length - 1}
                </span>
              )}
            </div>
          )}
        </div>

        {award?.winner ? (
          <div className="mt-4 border-l-2 border-teal-400 pl-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Won by</div>
            <div className="truncate text-sm font-semibold text-foreground">{award.winner}</div>
            {award.value && <div className="text-sm tabular-nums text-foreground/80">{award.value}</div>}
          </div>
        ) : (
          rfp.summary && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{rfp.summary}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-4 pt-5">
          <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
            {trades && <div className="truncate font-medium text-foreground/80">{trades}</div>}
            {place && (
              <div className="flex items-center gap-1 truncate">
                <MapPin className="size-3 shrink-0" /> {place}
                {rfp.propertyTypeName && <span className="truncate"> · {rfp.propertyTypeName}</span>}
              </div>
            )}
            {rfp.isDemo && <div className="font-mono text-[10px] uppercase tracking-[0.12em]">Sample listing</div>}
          </div>
          {closed ? (
            <span className="shrink-0 text-right leading-tight">
              <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {past ? "Awarded" : "Closed"}
              </span>
              <span className="block text-sm font-semibold tabular-nums text-foreground/70">
                {rfp.deadline ? formatDate(rfp.deadline) : "n/a"}
              </span>
            </span>
          ) : (
            <DeadlineStamp deadline={rfp.deadline} />
          )}
        </div>
      </div>
    </Link>
  );
}
