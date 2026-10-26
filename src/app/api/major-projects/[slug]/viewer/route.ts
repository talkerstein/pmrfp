import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { getCategories } from "@/lib/data/taxonomy";
import { isPastContract } from "@/lib/data/fomo";
import { rfpMarket } from "@/lib/visitor-geo";
import { getMajorProject, getProjectProFields } from "@/lib/major-projects/data";
import { relatedWork, type RelatedCandidate } from "@/lib/major-projects/filters";
import { majorProjectView } from "@/lib/growth/gate";
import { gateOffer, whoFromSession } from "@/lib/entitlement/gate";
import { trialsOpen } from "@/lib/entitlement/server";
import { upgradeInterval } from "@/lib/billing/checkout-flow";

export const dynamic = "force-dynamic";

/**
 * Everything on a /major-projects/[slug] page that depends on WHO is looking:
 * the free-account details, the Trade Pro fields (GC, bid list, bid route),
 * related open bids, and what the Pro buttons should offer (one-click trial,
 * trial sign-up, or the paid link).
 *
 * The page itself is ISR and renders the signed-out version for everybody.
 * Reading the session there (cookies()) throws DYNAMIC_SERVER_USAGE and the page
 * returns 500 (incident 2026-10-26), so signed-in browsers ask this route once,
 * and only when a sign-in cookie exists. Private, never cached.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const out = (body: object) => NextResponse.json(body, { headers });
  try {
    const { slug } = await ctx.params;
    const session = await getSession();
    if (!session) return out({ signedIn: false });
    const p = await getMajorProject(slug);
    if (!p) return out({ signedIn: false });

    const [board, categories, pro, open] = await Promise.all([
      listAllRfpsCached().catch(() => []),
      getCategories().catch(() => []),
      session.hasTradeAccess ? getProjectProFields(p.id) : Promise.resolve(null),
      trialsOpen().catch(() => false),
    ]);
    const slugByName = new Map(categories.map((c) => [c.name, c.slug]));
    const nameBySlug = new Map(categories.map((c) => [c.slug, c.name]));
    const candidates: RelatedCandidate[] = board
      .filter((r) => rfpMarket(r) === "CA")
      .map((r) => ({
        slug: r.slug,
        title: r.title,
        city: r.city,
        province: r.province,
        categorySlugs: r.categories.map((c) => slugByName.get(c) ?? "").filter(Boolean),
        deadline: r.deadline,
        isOpen: r.status === "open",
        isAward: isPastContract(r),
      }));
    const related = relatedWork(p, candidates);
    const trades = p.tradesNeeded.map((s) => nameBySlug.get(s)).filter((x): x is string => Boolean(x));
    const { member } = majorProjectView(p, { trades, open: related.open, awards: related.awards }, true);

    const interval = upgradeInterval(Boolean(process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY));
    const offer = gateOffer(whoFromSession(session, open), {
      source: "projects",
      returnPath: `/major-projects/${p.slug}`,
      paidHref: `/dashboard/billing?plan=pro&interval=${interval}`,
    });
    return out({ signedIn: true, member, pro, offer: { mode: offer.mode, href: offer.href } });
  } catch {
    return out({ signedIn: false });
  }
}
