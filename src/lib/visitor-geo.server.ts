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
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "../../workers/d1-api/customer-signup";

type AccountRegion = { name: string; province: string | null; country: string };

async function accountRegions(session: SessionContext, orgId: string): Promise<AccountRegion[]> {
  if (isVpsLiveCustomerAuth()) {
    const rows = await vpsAppDatabase().prepare(`SELECT r.name,r.province,r.country
      FROM organization_regions a JOIN regions r ON r.id=a.region_id
      WHERE a.organization_id=? AND ${customerAppAuthority}
        AND EXISTS (SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
          WHERE m.organization_id=a.organization_id AND m.user_id=? AND u.status='active')`)
      .bind(orgId, session.userId).all<AccountRegion>();
    return rows.results;
  }
  const { createClient } = await import("@/lib/supabase/server");
  const { data } = await (await createClient()).from("organization_regions")
    .select("regions(name,province,country)").eq("organization_id", orgId);
  return ((data ?? []) as unknown as { regions: AccountRegion | null }[])
    .flatMap((row) => row.regions ? [row.regions] : []);
}

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
  if (!session || !org) return null;
  const own = accountGeo(org);
  if (own) return own;
  try {
    const regions = (await accountRegions(session, org.id))
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
