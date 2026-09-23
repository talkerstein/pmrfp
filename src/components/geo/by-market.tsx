"use client";

import type { ReactNode } from "react";
import { visitorMarket } from "@/lib/visitor-geo";
import { useVisitorGeo } from "./use-visitor-geo";

/**
 * Renders `ca` (the default every crawler and first paint sees), and swaps to
 * `us` for visitors browsing from the United States. Both are server-rendered
 * props, so this adds no data fetching on the client.
 */
export function ByMarket({ ca, us }: { ca: ReactNode; us?: ReactNode }) {
  const geo = useVisitorGeo();
  return <>{geo && us && visitorMarket(geo) === "US" ? us : ca}</>;
}
