"use client";

import { useEffect, useState } from "react";
import { USD_PER_CAD } from "@/lib/markets";
import {
  ACCOUNT_COOKIE,
  GEO_COOKIE,
  MARKET_COOKIE,
  parseAccountCookie,
  parseGeoCookie,
  resolveCountry,
  type MarketCode,
  type ResolvedCountry,
} from "@/lib/visitor-geo";

/** Fired after the header switch changes market, so every price and list on the page follows. */
export const MARKET_EVENT = "pmrfp-market";

function cookie(name: string): string | null {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=")[1];
  return raw ? decodeURIComponent(raw) : null;
}

/** The same resolver as the server (lib/visitor-geo resolveCountry), from the readable cookies. */
export function readCountry(): ResolvedCountry {
  return resolveCountry({
    account: parseAccountCookie(cookie(ACCOUNT_COOKIE)),
    cookie: cookie(MARKET_COOKIE),
    geo: parseGeoCookie(cookie(GEO_COOKIE)),
  });
}

/** The signed-in company's country, else the switch, else their location (Canada by default). */
export function readMarket(): MarketCode {
  return readCountry().country;
}

/**
 * The header switch. A signed-in company's own country outranks the switch,
 * so switching away from it also forgets the account mirror for this browser
 * (it comes back the next time the dashboard loads).
 */
export function setMarket(market: MarketCode) {
  document.cookie = `${MARKET_COOKIE}=${market}; path=/; max-age=31536000; samesite=lax`;
  const acct = parseAccountCookie(cookie(ACCOUNT_COOKIE));
  if (acct && acct.country !== market) document.cookie = `${ACCOUNT_COOKIE}=; path=/; max-age=0; samesite=lax`;
  window.dispatchEvent(new Event(MARKET_EVENT));
}

/** Writes the account mirror (from the dashboard) so cached pages follow the company's country. */
export function setAccountCountry(value: string | null) {
  if (!value) return;
  if (cookie(ACCOUNT_COOKIE) === value) return;
  document.cookie = `${ACCOUNT_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(MARKET_EVENT));
}

/** Province/state to sort first, once known on the client. */
export function useVisitorCountry(): ResolvedCountry | null {
  const [value, setValue] = useState<ResolvedCountry | null>(null);
  useEffect(() => {
    const sync = () => setValue(readCountry());
    sync();
    window.addEventListener(MARKET_EVENT, sync);
    return () => window.removeEventListener(MARKET_EVENT, sync);
  }, []);
  return value;
}

/** Null during the server render and first paint (cached pages show Canada), then the real market. */
export function useVisitorMarket(): MarketCode | null {
  const [market, setMarketState] = useState<MarketCode | null>(null);
  useEffect(() => {
    const sync = () => setMarketState(readMarket());
    // Cookies are only readable after mount; this is the external-system sync.
    sync();
    window.addEventListener(MARKET_EVENT, sync);
    return () => window.removeEventListener(MARKET_EVENT, sync);
  }, []);
  return market;
}

let rate: number | null = null;
let pending: Promise<number> | null = null;

/** Today's USD-per-CAD rate (from /api/fx), fetched once per page; the fixed rate until it lands. */
export function useUsdPerCad(): number {
  const [value, setValue] = useState(rate ?? USD_PER_CAD);
  useEffect(() => {
    if (rate) return;
    pending ??= fetch("/api/fx")
      .then((r) => r.json())
      .then((j: { usdPerCad?: unknown }) => (rate = typeof j.usdPerCad === "number" ? j.usdPerCad : USD_PER_CAD))
      .catch(() => USD_PER_CAD);
    let live = true;
    pending.then((v) => live && setValue(v));
    return () => {
      live = false;
    };
  }, []);
  return value;
}
