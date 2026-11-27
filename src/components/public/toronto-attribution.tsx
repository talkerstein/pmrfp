import { TORONTO_ATTRIBUTION, TORONTO_DATASET_URL, TORONTO_LICENCE_URL, TORONTO_NONCOMPETITIVE_DATASET_URL } from "@/lib/data/toronto-awards";
import { cn } from "@/lib/utils";

/** Required by the Open Government Licence – Toronto on every page using TOBids award data. */
export function TorontoAttribution({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
      {TORONTO_ATTRIBUTION.replace(/Open Government Licence – Toronto\.$/, "")}
      <a href={TORONTO_LICENCE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
        Open Government Licence – Toronto
      </a>
      . Sources include{" "}
      <a href={TORONTO_DATASET_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
        TOBids Awarded Contracts
      </a>{" "}
      and{" "}
      <a href={TORONTO_NONCOMPETITIVE_DATASET_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
        TOBids Non-Competitive Contracts
      </a>
      . PMRFP is an independent service and is not affiliated with or endorsed by the City of Toronto.
      Supplier names are normalised to merge spelling variants; amounts are as published by the City.
    </p>
  );
}
