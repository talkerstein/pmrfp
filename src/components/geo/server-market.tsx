"use client";

import { createContext, type ReactNode } from "react";
import type { MarketCode } from "@/lib/visitor-geo";

/**
 * The market and CAD→USD rate a DYNAMIC page resolved on the server
 * (getVisitorCountry + getUsdPerCad). Inside this provider, useVisitorMarket()
 * and useUsdPerCad() start from these values instead of "unknown", so prices
 * and per-country numbers are in the server HTML in the visitor's one
 * currency. The header switch still takes over after it fires. Cached (ISR)
 * pages don't use it and keep the placeholder-until-known behaviour.
 */
export interface ServerMarket {
  market: MarketCode;
  usdPerCad: number;
}

export const ServerMarketContext = createContext<ServerMarket | null>(null);

export function ServerMarketProvider({ value, children }: { value: ServerMarket; children: ReactNode }) {
  return <ServerMarketContext.Provider value={value}>{children}</ServerMarketContext.Provider>;
}
