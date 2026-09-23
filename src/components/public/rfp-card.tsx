import Link from "next/link";
import Image from "next/image";
import { CalendarClock, Flame, Lock, MapPin, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RfpListItem } from "@/lib/data/types";
import { publicTenderSource } from "@/lib/tenders/sources";
import { closingLabel, daysUntil, isPastContract, parseAward } from "@/lib/data/fomo";

function formatDeadline(d: string | null) {
  if (!d) return "Open";
  // timeZone: "UTC" pins server + client to the same day → no hydration mismatch.
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function RfpCard({ rfp, locked }: { rfp: RfpListItem; locked: boolean }) {
  const heroPhoto = rfp.photoUrls[0];
  const past = isPastContract(rfp);
  const closed = rfp.status !== "open";
  const statusLabel = past ? "Awarded" : rfp.status === "awarded" ? "Filled" : "Closed";
  const award = past ? parseAward(rfp.summary) : null;
  // Real countdown from the real closing date — only inside the last week.
  const urgency = !closed ? closingLabel(daysUntil(rfp.deadline)) : null;
  return (
    <Link
      href={`/rfps/${rfp.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border bg-card transition-all",
        past
          ? "border-border hover:border-teal-400 hover:shadow-sm"
          : closed
            ? "border-border opacity-60 saturate-[.35]"
            : urgency
              ? "border-warning/50 hover:border-warning hover:shadow-sm"
              : "border-border hover:border-teal-400 hover:shadow-sm",
      )}
    >
      {heroPhoto && (
        <div className="relative aspect-[5/3] overflow-hidden bg-secondary/40">
          <Image
            src={heroPhoto}
            alt=""
            fill
            sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform group-hover:scale-[1.02]"
          />
          {rfp.photoUrls.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
              +{rfp.photoUrls.length - 1} more
            </span>
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {rfp.categories.slice(0, 2).map((c) => (
            <Badge key={c} variant="secondary" className="font-medium">
              {c}
            </Badge>
          ))}
          {rfp.propertyTypeName && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {rfp.propertyTypeName}
            </Badge>
          )}
          {rfp.sourceType === "public_source" && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {publicTenderSource(rfp.slug).badge}
            </Badge>
          )}
        </div>
        {past ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-indigo px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            <Trophy className="size-3" /> {statusLabel}
          </span>
        ) : closed ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {statusLabel}
          </span>
        ) : locked ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-teal-600">
            <Lock className="size-3.5" /> Locked
          </span>
        ) : (
          <span className="text-xs font-medium text-success">Full access</span>
        )}
      </div>

      <h3 className="mt-3 text-base font-semibold leading-snug text-foreground group-hover:text-teal-700">
        {rfp.title}
      </h3>
      {award?.winner ? (
        <div className="mt-3 rounded-md border border-border bg-secondary/40 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Won by</div>
          <div className="truncate text-sm font-semibold text-foreground">{award.winner}</div>
          {award.value && <div className="mt-0.5 text-lg font-bold text-indigo">{award.value}</div>}
        </div>
      ) : (
        rfp.summary && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{rfp.summary}</p>
        )
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {rfp.regionName && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" /> {rfp.regionName}
          </span>
        )}
        {urgency ? (
          <span className="flex items-center gap-1 font-semibold text-warning">
            <Flame className="size-3.5" /> {urgency}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" />{" "}
            {!rfp.deadline
              ? "Ongoing — no fixed deadline"
              : `${past ? "Awarded" : closed ? "Closed" : "Closes"} ${formatDeadline(rfp.deadline)}`}
          </span>
        )}
        {rfp.isDemo && (
          <Badge variant="outline" className="ml-auto border-dashed text-[10px] uppercase tracking-wide">
            Sample
          </Badge>
        )}
      </div>
      </div>
    </Link>
  );
}
