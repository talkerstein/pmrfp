import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { isEnabledLocale, DEFAULT_LOCALE } from "@/i18n/config";
import { trialBannerView } from "@/lib/entitlement/banner";
import { bannerCopy } from "@/lib/entitlement/banner-copy";
import { loadTrialUsage } from "@/lib/entitlement/usage-server";

export const dynamic = "force-dynamic";

/**
 * What the trial banner shows for whoever is signed in (the browser asks
 * once per page load, only when a sign-in cookie exists). Read-only; a
 * visitor, a paying member, a non-trade account or a company that never
 * started a trial gets { banner: null }. The words come back already in the
 * page language so the banner needs no client translations.
 */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const lang = new URL(request.url).searchParams.get("lang");
  const locale = isEnabledLocale(lang) ? lang : DEFAULT_LOCALE;
  try {
    const session = await getSession();
    const view = session ? trialBannerView({ paid: session.paid, trial: session.trial }) : null;
    if (!session || !view) return NextResponse.json({ banner: null }, { headers });
    const since = session.trial?.startedAt ?? new Date(Date.now() - 14 * 86_400_000).toISOString();
    const usage = await loadTrialUsage(session.userId, session.organization?.id ?? null, since);
    return NextResponse.json({ banner: bannerCopy(view, usage, locale) }, { headers });
  } catch {
    return NextResponse.json({ banner: null }, { headers });
  }
}
