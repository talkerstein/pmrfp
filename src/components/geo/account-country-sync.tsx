"use client";

import { useEffect } from "react";
import { setAccountCountry } from "./use-visitor-market";

/**
 * Rendered by the signed-in dashboards: mirrors the company's own country
 * and province/state ("CA-ON", "US-TX") into a cookie, so cached public pages
 * and the CA | US switch follow the account (account > switch > IP).
 */
export function AccountCountrySync({ value }: { value: string | null }) {
  useEffect(() => {
    setAccountCountry(value);
  }, [value]);
  return null;
}
