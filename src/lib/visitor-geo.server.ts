import "server-only";
import { cookies, headers } from "next/headers";
import {
  ACCOUNT_COOKIE,
  GEO_COOKIE,
  MARKET_COOKIE,
  accountGeo,
  geoFrom,
  parseAccountCookie,
  parseGeoCookie,
  resolveCountry,
  type MarketCode,
  type ResolvedCountry,
  type VisitorGeo,
} from "@/lib/visitor-geo";
import type { SessionContext } from "@/lib/access/access";

/** The visitor's location in a dynamic server render: Vercel's headers, else the proxy's cookie. */
export async function getVisitorGeo(): Promise<VisitorGeo> {
  const h = await headers();
  const country = h.get("x-vercel-ip-country");
  if (country) return geoFrom(country, h.get("x-vercel-ip-country-region"));
  return parseGeoCookie((await cookies()).get(GEO_COOKIE)?.value);
}

/**
 * The visitor's country and province/state for a dynamic render — the one
 * resolver every page, list and count uses (precedence in lib/visitor-geo
 * resolveCountry). `param` is the page's ?country= when it takes one.
 * `session` is optional: pass it when the page already loaded it, so the
 * signed-in company's location wins; otherwise the account mirror cookie
 * (written when the company's dashboard loads) stands in for it.
 */
export async function getVisitorCountry(opts: { param?: string | null; session?: SessionContext | null } = {}): Promise<ResolvedCountry> {
  const jar = await cookies();
  const account = opts.session?.organization
    ? (await getAccountGeo(opts.session)) ?? parseAccountCookie(jar.get(ACCOUNT_COOKIE)?.value)
    : parseAccountCookie(jar.get(ACCOUNT_COOKIE)?.value);
  return resolveCountry({
    param: opts.param,
    account,
    cookie: jar.get(MARKET_COOKIE)?.value,
    geo: await getVisitorGeo(),
  });
}

/**
 * A signed-in company's location: its province/state, else its service
 * regions' country (organization_regions → regions.country). Null when
 * nothing says.
 */
export async function getAccountGeo(session: SessionContext | null | undefined): Promise<VisitorGeo | null> {
  const org = session?.organization;
  if (!org) return null;
  const own = accountGeo(org);
  if (own) return own;
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("organization_regions")
      .select("regions(name,province,country)")
      .eq("organization_id", org.id);
    const regions = ((data ?? []) as unknown as { regions: { name: string; province: string | null; country: string } | null }[])
      .map((r) => r.regions)
      .filter((r): r is { name: string; province: string | null; country: string } => !!r)
      .map((r) => ({ country: r.country, province: r.province ?? (r.country === "USA" && r.name !== "United States" ? r.name : null) }));
    return accountGeo({ province: null, country: null }, regions);
  } catch {
    return null;
  }
}

/** "US" or "CA" for the visitor (see getVisitorCountry). */
export async function getVisitorMarket(): Promise<MarketCode> {
  return (await getVisitorCountry()).country;
}
