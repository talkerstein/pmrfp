"use client";

import { useEffect, useRef } from "react";

/**
 * Counts one impression when the sponsor unit is at least half on screen,
 * once per page view: a single first-party POST to /api/sponsors/seen with
 * the sponsor, placement, trade and province. No cookies are sent
 * (credentials: "omit") and nothing identifies the visitor.
 */
export function SponsorSeen({ s, p, t, r }: { s: string; p: string; t?: string; r?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let sent = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (sent || !entries.some((e) => e.isIntersecting)) return;
        sent = true;
        io.disconnect();
        fetch("/api/sponsors/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s, p, t: t ?? "", r: r ?? "" }),
          credentials: "omit",
          keepalive: true,
        }).catch(() => {});
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [s, p, t, r]);
  return <span ref={ref} hidden />;
}
