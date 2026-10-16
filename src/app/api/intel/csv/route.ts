import { getSession } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { provinceFromSlug } from "@/lib/data/price-benchmarks";
import { SITE } from "@/lib/site";
import { loadIntel } from "@/lib/intel/load";
import {
  buyerIndex,
  buyerProfile,
  companyIndex,
  companyProfile,
  currencyOfCountry,
  marketIndex,
  marketShare,
  parseHorizon,
  renewalRadar,
} from "@/lib/intel/model";
import { buyerCsv, buyersCsv, companiesCsv, companyCsv, marketCsv, marketsCsv, renewalsCsv } from "@/lib/intel/csv";

/**
 * /api/intel/csv?view=company|buyer|renewals|market|companies|buyers|markets…
 * Every Award Intelligence table as a CSV, for Intel subscribers only (the
 * same session.hasIntelAccess the pages use). One country per file.
 */
const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "private, no-store" } });

const clean = (s: string) => s.replace(/[^a-z0-9-]/gi, "").slice(0, 80);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (k: string) => url.searchParams.get(k) ?? "";
  const session = isSupabaseConfigured() ? await getSession() : null;
  if (isSupabaseConfigured() && !session?.hasIntelAccess) return text("Award Intelligence subscription required\n", 403);

  const { awards, refs, today } = await loadIntel();
  const { country } = await getVisitorCountry({ param: q("country"), session });
  const site = SITE.url.replace(/\/$/, "");
  let body: string | null = null;
  let name = "";

  switch (q("view")) {
    case "company": {
      const p = companyProfile(awards, q("slug"), country, today);
      if (p) [body, name] = [companyCsv(p, site), `company-${clean(p.slug)}`];
      break;
    }
    case "buyer": {
      const ref = refs.find((r) => r.slug === q("slug"));
      if (ref) [body, name] = [buyerCsv(buyerProfile(awards, ref), site), `buyer-${clean(ref.slug)}`];
      break;
    }
    case "market": {
      const province = provinceFromSlug(q("province"));
      const m = province ? marketShare(awards, q("trade"), province, today) : null;
      if (m && province) [body, name] = [marketCsv(m, site), `market-${clean(q("trade"))}-${clean(q("province"))}`];
      break;
    }
    case "renewals": {
      const province = provinceFromSlug(q("province"));
      const buyer = q("buyer") ? refs.find((r) => r.slug === q("buyer") && r.country === country)?.key ?? "__none__" : null;
      const items = renewalRadar(awards, { country, today, trade: q("trade") || null, province, buyer, horizon: parseHorizon(q("h")) });
      [body, name] = [renewalsCsv(items, site), `renewal-radar-${country.toLowerCase()}`];
      break;
    }
    case "companies":
      [body, name] = [companiesCsv(companyIndex(awards, country), currencyOfCountry(country), site), `companies-${country.toLowerCase()}`];
      break;
    case "buyers":
      [body, name] = [buyersCsv(buyerIndex(awards, refs, country), currencyOfCountry(country), site), `buyers-${country.toLowerCase()}`];
      break;
    case "markets":
      [body, name] = [marketsCsv(marketIndex(awards, country), country), `markets-${country.toLowerCase()}`];
      break;
  }
  if (body === null) return text("Not found\n", 404);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pmrfp-award-intel-${name}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
