"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useVisitorMarket } from "@/components/geo/use-visitor-market";
import { SPOTLIGHT } from "@/lib/spotlight/config";

/** Starts the one-time Spotlight checkout in the visitor's market currency. */
export function SpotlightBuyButton({ className }: { className?: string }) {
  const market = useVisitorMarket() === "US" ? "US" : "CA";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = market === "US" ? `Get a Spotlight · $${SPOTLIGHT.priceUsd} USD` : `Get a Spotlight · $${SPOTLIGHT.priceCad} CAD`;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spotlight/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error ?? "Couldn't start checkout.");
    } catch {
      setError("Couldn't start checkout. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className={className}>
      <Button size="lg" onClick={go} disabled={busy}>
        {busy ? "Opening checkout…" : label}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
