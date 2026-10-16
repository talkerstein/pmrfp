import "server-only";
import type { Locale } from "@/i18n/config";
import type { SessionContext } from "@/lib/access/access";
import type { MemberMarket } from "@/lib/leads/load";
import { renderView, type RenderedInsight } from "./copy";
import { entitlementsOf, viewFacts } from "./gating";
import { insightsForProfile } from "./load";
import { scopeFromProfile } from "./scope";
import { insightsMarketPath } from "./paths";
import type { Persona } from "./types";

export const DASHBOARD_MAX = 6;

export interface DashboardInsights {
  persona: Persona;
  insights: RenderedInsight[];
  isPro: boolean;
  marketHref: string | null;
}

/**
 * The dashboard card's content for the signed-in company: its market's
 * facts, ranked for its persona, gated by the central entitlement flags on
 * the session, rendered (templates only, no AI on page loads).
 */
export async function dashboardInsights(session: SessionContext, market: MemberMarket, lang: Locale): Promise<DashboardInsights | null> {
  if (market.missing.trades) return null;
  const orgProvince = session.organization?.province ?? null;
  const run = await insightsForProfile(market.profile, orgProvince);
  const ent = entitlementsOf(session);
  const views = viewFacts(run.ranked.slice(0, DASHBOARD_MAX + 4), ent);
  const open = views.filter((v) => !v.locked).slice(0, DASHBOARD_MAX);
  const locked = views.filter((v) => v.locked);
  const scope = scopeFromProfile(market.profile, orgProvince);
  const first = scope.trades[0];
  const province = scope.provinces[0];
  return {
    persona: run.persona,
    insights: [...open, ...locked].map((v) => renderView(v, lang)),
    isPro: ent.pro,
    marketHref: first && province ? insightsMarketPath(first.slug, province) : null,
  };
}
