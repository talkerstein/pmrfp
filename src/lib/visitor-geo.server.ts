import { cookies, headers } from "next/headers";
import { GEO_COOKIE, geoFrom, parseGeoCookie, type VisitorGeo } from "@/lib/visitor-geo";

/** The visitor's location in a dynamic server render: Vercel's headers, else the proxy's cookie. */
export async function getVisitorGeo(): Promise<VisitorGeo> {
  const h = await headers();
  const country = h.get("x-vercel-ip-country");
  if (country) return geoFrom(country, h.get("x-vercel-ip-country-region"));
  return parseGeoCookie((await cookies()).get(GEO_COOKIE)?.value);
}
