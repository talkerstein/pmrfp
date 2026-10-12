/**
 * House sponsors: the sister companies and launch partner that fill a slot
 * when no PAID sponsor (lib/sponsors/model, sold on /advertise) holds it.
 * A paid sponsor always wins its slot; these are the fallback. Rules:
 *   - At most one sponsor unit per page or email.
 *   - Only where it's useful to the reader: a trade-specific sponsor beats a
 *     general one, and a sponsor with nothing relevant to say isn't shown.
 *   - Always labelled ("Sponsored" / "From our sister company"), rel=sponsored.
 *   - Never on dashboards, a company's own profile, sign-up, pricing or
 *     billing pages (model.EXCLUDED_ROUTES).
 * Claims come from each company's own site or PMRFP listing.
 */
import type { PaidSponsor, Placement } from "./model";
import { hash, matchPaidSponsor, sponsorCopy, tradeSlug } from "./model";

export type { Placement } from "./model";
export { PLACEMENTS, tradeSlug } from "./model";

export interface SponsorContext {
  placement: Placement;
  /** Trade names or slugs on the page ("Electrical" or "electrical"). */
  categories?: string[];
  /** Defaults to Canada. */
  market?: "CA" | "US";
  /** Full province/state name (or code) the page or email is about, when there is one. */
  province?: string | null;
  /** A page about a province but no single trade (major projects filtered to a province). */
  anyTrade?: boolean;
  /** A public (government) tender rather than a property manager's RFP. */
  publicTender?: boolean;
  /** Stable per page, so rotation doesn't flicker between renders. */
  seed?: string;
  /** Paid sponsors holding slots (lib/sponsors/data getSponsorSnapshot); they win over house sponsors. */
  paid?: readonly PaidSponsor[];
  /** Page language: French sponsor copy on French pages when supplied. */
  lang?: string;
}

export interface Creative {
  headline: string;
  body: string;
  cta: string;
}

export interface Sponsor {
  id: SponsorId;
  name: string;
  logo: string;
  url: string;
  label: "Sponsored" | "From our sister company";
  markets: ("CA" | "US")[];
  placements: Placement[];
  /** 0 = not relevant here; higher wins. */
  score(ctx: SponsorContext, trades: string[]): number;
  creative(ctx: SponsorContext, trades: string[]): Creative;
}

export type SponsorId = "maple" | "cleverpays" | "talkerstein";

const MAPLE_TRADES = ["electrical", "lighting", "ev-charging", "building-automation", "energy-efficiency"];
/** Trades that bill homeowners and small businesses directly, where card payments on site matter most. */
const CARD_HEAVY = [
  "landscaping", "snow-removal", "cleaning-janitorial", "handyman-maintenance", "pest-control", "painting",
  "plumbing", "hvac", "locksmith", "garage-doors", "appliance-repair", "flooring", "carpentry", "roofing",
  "waste-removal", "dumpster-bin-rental", "fencing", "glass-and-windows",
];
const overlaps = (a: string[], b: string[]) => a.some((x) => b.includes(x));

export const SPONSORS: Sponsor[] = [
  {
    id: "maple",
    name: "Maple Electric Supply",
    logo: "/logos/maple-electric-supply.png",
    url: "https://mapleelectricsupply.ca",
    label: "Sponsored",
    markets: ["CA"],
    placements: ["rfp_detail", "trade_page", "alerts_email", "digest_email"],
    // Only for trades that buy what Maple sells.
    score: (_ctx, trades) => (overlaps(trades, MAPLE_TRADES) ? 3 : 0),
    creative: (ctx) =>
      ctx.placement === "rfp_detail"
        ? {
            headline: "Pricing the materials on this job?",
            body: "Maple Electric Supply ships lighting, breakers, wiring devices, EV chargers and controls Canada-wide, for electricians and contractors.",
            cta: "Get a supply quote",
          }
        : {
            headline: "Electrical supply, shipped Canada-wide",
            body: "Lighting, breakers and wiring devices, automation and controls, EV charging, tools and PPE from Maple Electric Supply, a Canadian-owned distributor.",
            cta: "Shop Maple Electric",
          },
  },
  {
    id: "cleverpays",
    name: "Cleverpays",
    logo: "/logos/cleverpays.png",
    url: "https://cleverpays.ca/payment-processing",
    label: "Sponsored",
    markets: ["CA"],
    placements: ["rfp_detail", "trade_page", "alerts_email", "digest_email"],
    score: (ctx, trades) => {
      // Governments pay by cheque or EFT: card payments don't help on a public tender.
      if (ctx.placement === "rfp_detail" && ctx.publicTender) return 0;
      return overlaps(trades, CARD_HEAVY) ? 2 : 1;
    },
    creative: () => ({
      headline: "Get paid before you leave the site",
      body: "Card terminals your crew can take to the job, and invoices customers can pay the day they arrive. Payment processing from Cleverpays.",
      cta: "See how it works",
    }),
  },
  {
    id: "talkerstein",
    name: "Talkerstein Consulting Group",
    logo: "/logos/talkerstein-consulting.png",
    url: "https://talkerstein.com",
    label: "From our sister company",
    markets: ["CA", "US"],
    // Not on tender pages: open public tenders already carry Talkerstein's
    // bid-help card (components/public/bid-help-card), so a slot would repeat it.
    placements: ["trade_page", "digest_email"],
    score: () => 1,
    creative: () => ({
      headline: "Property managers check you out before they call",
      body: "Talkerstein builds the website, brand and Google profile that make a trade look established. Based in Toronto.",
      cta: "See what's included",
    }),
  },
];

export interface PickedSponsor {
  sponsor: {
    /** /go/<id>: a house id or a paid sponsor's slug. */
    id: string;
    name: string;
    logo: string | null;
    url: string;
    label: Sponsor["label"];
    paid: boolean;
  };
  creative: Creative;
  /** Trade slug the unit counts under ("" when none). */
  trade: string;
}

/**
 * The one sponsor for this page or email: the PAID sponsor holding the
 * trade × province slot (ctx.paid, from lib/sponsors/data), else the best
 * relevant house sponsor, else null.
 */
export function pickSponsor(ctx: SponsorContext): PickedSponsor | null {
  const market = ctx.market ?? "CA";
  const pageTrades = (ctx.categories ?? []).map(tradeSlug).filter(Boolean);
  if (ctx.paid?.length) {
    const p = matchPaidSponsor(
      { placement: ctx.placement, country: market, trades: pageTrades, province: ctx.province, anyTrade: ctx.anyTrade, seed: ctx.seed },
      ctx.paid,
    );
    if (p) {
      const copy = sponsorCopy(p, ctx.lang ?? "en");
      return {
        sponsor: { id: p.slug, name: p.name, logo: p.logoUrl, url: p.url, label: "Sponsored", paid: true },
        creative: { headline: copy.headline, body: copy.message, cta: copy.cta },
        trade: p.trades.find((t) => pageTrades.includes(t)) ?? p.trades[0] ?? "",
      };
    }
  }
  const house = pickHouseSponsor(ctx);
  if (!house) return null;
  const { id, name, logo, url, label } = house.sponsor;
  return { sponsor: { id, name, logo, url, label, paid: false }, creative: house.creative, trade: pageTrades[0] ?? "" };
}

/** The single best HOUSE sponsor for this context, or null when none is relevant. */
export function pickHouseSponsor(ctx: SponsorContext): { sponsor: Sponsor; creative: Creative } | null {
  const market = ctx.market ?? "CA";
  const trades = (ctx.categories ?? []).map(tradeSlug);
  const scored = SPONSORS.filter((s) => s.placements.includes(ctx.placement) && s.markets.includes(market))
    .map((s) => ({ s, score: s.score({ ...ctx, market }, trades) }))
    .filter((x) => x.score > 0);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best).map((x) => x.s);
  // Ties rotate by page, so sponsors share the inventory evenly.
  const sponsor = top[hash(`${ctx.seed ?? ""}|${ctx.placement}`) % top.length];
  return { sponsor, creative: sponsor.creative({ ...ctx, market }, trades) };
}

export function sponsorById(id: string): Sponsor | undefined {
  return SPONSORS.find((s) => s.id === id);
}

/** Tracked outbound link: /go/<slug>?p=<placement>&t=<trade>&r=<province>. */
export function sponsorHref(id: string, placement: Placement, trade?: string | null, base = "", region?: string | null): string {
  const q = new URLSearchParams({ p: placement });
  if (trade) q.set("t", tradeSlug(trade));
  if (region) q.set("r", tradeSlug(region));
  return `${base}/go/${id}?${q}`;
}

/** Destination with UTM tags so the sponsor sees PMRFP traffic in their own analytics. */
export function sponsorDestination(s: { url: string }, placement: Placement, trade?: string | null): string {
  const u = new URL(s.url);
  u.searchParams.set("utm_source", "pmrfp");
  u.searchParams.set("utm_medium", "sponsored");
  u.searchParams.set("utm_campaign", placement);
  if (trade) u.searchParams.set("utm_content", tradeSlug(trade));
  return u.toString();
}
