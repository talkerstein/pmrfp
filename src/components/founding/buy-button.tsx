"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useVisitorMarket } from "@/components/geo/use-visitor-market";
import { useLang, useT } from "@/i18n/provider";
import { localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { PriceSkeleton, useFoundingPriceLabel } from "./market-text";

/** Starts the one-time Founding 500 checkout in the visitor's market currency. */
export function FoundingBuyButton({ className }: { className?: string }) {
  const t = useT("foundingClient");
  const lang = useLang();
  const market = useVisitorMarket() === "US" ? "US" : "CA";
  const price = useFoundingPriceLabel();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/founding/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.redirect) {
        window.location.href = localizePath(data.redirect, lang);
        return;
      }
      setError(data.error ?? t.failed);
    } catch {
      setError(t.failed);
    }
    setBusy(false);
  }

  return (
    <div className={className}>
      <Button size="lg" onClick={go} disabled={busy || price == null}>
        {busy ? t.busy : price == null ? <>{t.buy.split("{price}")[0]}<PriceSkeleton width="4.5rem" /></> : fmt(t.buy, { price })}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
