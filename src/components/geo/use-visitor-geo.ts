"use client";

import { useEffect, useState } from "react";
import { GEO_COOKIE, parseGeoCookie, type VisitorGeo } from "@/lib/visitor-geo";

/**
 * The visitor's location from the proxy's cookie. Null during the server
 * render and first paint (cached pages render the Canadian default), then the
 * real value — so there's never a hydration mismatch.
 */
export function useVisitorGeo(): VisitorGeo | null {
  const [geo, setGeo] = useState<VisitorGeo | null>(null);
  useEffect(() => {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${GEO_COOKIE}=`))?.split("=")[1];
    // Cookies are only readable after mount; this is the external-system sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGeo(parseGeoCookie(raw ? decodeURIComponent(raw) : null));
  }, []);
  return geo;
}
