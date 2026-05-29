import Link from "next/link";
import { CalendarClock, Lock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RfpListItem } from "@/lib/data/types";

function formatDeadline(d: string | null) {
  if (!d) return "Open";
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export function RfpCard({ rfp, locked }: { rfp: RfpListItem; locked: boolean }) {
  return (
    <Link
      href={`/rfps/${rfp.slug}`}
      className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-all hover:border-gold-400 hover:shadow-sm"
    >
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
        </div>
        {locked ? (
          <span className="flex items-center gap-1 text-xs font-medium text-gold-600">
            <Lock className="size-3.5" /> Locked
          </span>
        ) : (
          <span className="text-xs font-medium text-success">Full access</span>
        )}
      </div>

      <h3 className="mt-3 text-base font-semibold leading-snug text-foreground group-hover:text-gold-700">
        {rfp.title}
      </h3>
      {rfp.summary && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{rfp.summary}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {rfp.regionName && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" /> {rfp.regionName}
          </span>
        )}
        <span className="flex items-center gap-1">
          <CalendarClock className="size-3.5" /> Closes {formatDeadline(rfp.deadline)}
        </span>
        {rfp.isDemo && (
          <Badge variant="outline" className="ml-auto border-dashed text-[10px] uppercase tracking-wide">
            Sample
          </Badge>
        )}
      </div>
    </Link>
  );
}
