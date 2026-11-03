"use client";

import { useState } from "react";
import Link from "@/i18n/link";
import { ArrowRight, Plus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLang } from "@/i18n/provider";
import { fmt, formatNumber } from "@/i18n/format";
import type { Messages } from "@/i18n/dictionaries";
import { MAX_BIDS, compareBids, parsePercent, type BidCountry } from "@/lib/bid-compare/rules";
import { parseAmount } from "@/lib/vendor-certs/rules";
import { formatMoney } from "@/lib/bid-compare/view";

type Row = { id: number; name: string; price: string; tax: string };

/**
 * The landing page's quick demo: up to 6 prices side by side, lowest
 * highlighted, spread and totals worked out with the same rules as the
 * real sheet. Nothing is saved or sent anywhere.
 */
export function BidDemo({ t, country, ctaHref }: { t: Messages["bidCompare"]["demo"]; country: BidCountry; ctaHref: string }) {
  const lang = useLang();
  const tax = country === "US" ? "" : "13";
  const [rows, setRows] = useState<Row[]>([
    { id: 1, name: "", price: "", tax },
    { id: 2, name: "", price: "", tax },
    { id: 3, name: "", price: "", tax },
  ]);
  const math = compareBids(
    rows.map((r) => ({ id: String(r.id), price: parseAmount(r.price), taxAmount: null, taxPercent: parsePercent(r.tax), linePrices: {} })),
    [],
  );
  const lowest = new Set(math.lowestIds);
  const set = (id: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  const money = (n: number | null) => (n == null ? "—" : formatMoney(n, country, lang));
  const pct = (n: number) => formatNumber(n, lang, { maximumFractionDigits: 1 });

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="space-y-3">
        {rows.map((r, i) => {
          const above = math.aboveLowest[String(r.id)];
          const isLow = lowest.has(String(r.id)) && math.priced >= 2;
          return (
            <div key={r.id} className={`grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-[1.4fr_1fr_0.7fr_1fr_auto] sm:items-center ${isLow ? "border-teal-300 bg-teal-50/70" : "border-border"}`}>
              <Input aria-label={t.bidder} placeholder={fmt(t.bidderPlaceholder, { n: i + 1 })} value={r.name} maxLength={80} onChange={(e) => set(r.id, "name", e.target.value)} className="col-span-2 sm:col-span-1" />
              <Input aria-label={t.price} placeholder={t.price} inputMode="decimal" value={r.price} onChange={(e) => set(r.id, "price", e.target.value)} />
              <Input aria-label={t.taxPct[country]} placeholder={t.taxPct[country]} inputMode="decimal" value={r.tax} onChange={(e) => set(r.id, "tax", e.target.value)} />
              <div className="text-sm">
                {isLow ? (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-teal-900">{t.lowest}</span>
                ) : above && math.priced >= 2 ? (
                  <span className="text-muted-foreground">{fmt(t.above, { amount: money(above.amount), pct: above.pct == null ? "—" : pct(above.pct) })}</span>
                ) : null}
                {math.total[String(r.id)] != null && (
                  <div className="text-xs text-muted-foreground">
                    {t.total}: {money(math.total[String(r.id)])}
                  </div>
                )}
              </div>
              {rows.length > 2 ? (
                <Button variant="ghost" size="icon-sm" aria-label={t.remove} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className="justify-self-end">
                  <X className="size-4" />
                </Button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {rows.length < MAX_BIDS ? (
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { id: Math.max(...rs.map((x) => x.id)) + 1, name: "", price: "", tax }])}>
            <Plus className="size-3.5" /> {t.add}
          </Button>
        ) : (
          <span />
        )}
        <p className="text-sm font-medium" aria-live="polite">
          {math.spreadPct != null ? fmt(t.spread, { pct: pct(math.spreadPct) }) : <span className="font-normal text-muted-foreground">{t.needTwo}</span>}
        </p>
      </div>
      <Link href={ctaHref} className={`${buttonVariants({ variant: "accent" })} mt-5 w-full sm:w-auto`}>
        {t.keep} <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
