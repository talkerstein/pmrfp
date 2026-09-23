"use client";

import { approxUsd } from "@/lib/markets";
import { cn } from "@/lib/utils";
import { useVisitorGeo } from "./use-visitor-geo";

/** "About US$180 a year · billed in CAD" — shown only to visitors in the U.S. */
export function UsdHint({ cad, per, className }: { cad: number; per: "year" | "month"; className?: string }) {
  const geo = useVisitorGeo();
  if (geo?.country !== "US") return null;
  return (
    <p className={cn("text-xs", className)}>
      About US${approxUsd(cad)} a {per} · billed in CAD, your card converts
    </p>
  );
}
