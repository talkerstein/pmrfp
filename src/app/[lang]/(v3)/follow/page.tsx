import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/access/access";
import { onboardingPath } from "@/lib/auth/oauth";
import { loadBuyers } from "@/lib/buyers/load";
import { BUYERS_PATH, findBuyerPage } from "@/lib/buyers/model";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { confirmFollowAction } from "@/lib/follows/actions";
import { FOLLOWING_PATH, FREE_FOLLOW_LIMIT, canFollowBuyers, followIntentPath, followLanding, parseFollowKey } from "@/lib/follows/rules";
import { followBuyer } from "@/lib/follows/server";
import { followSignUpFor } from "@/components/follows/blocks";
import { buyerDisplayName } from "@/lib/towns/claimable";
import { inSentence } from "@/lib/towns/names";
import { followRegionSlug } from "@/lib/towns/page-data";
import { SimplePage } from "@/components/v3/simple";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  // A utility step of sign-up: never indexed.
  return { title: getDictionary(hasLocale(lang) ? lang : "en").follows.landing.metaTitle, robots: { index: false, follow: true } };
}

/**
 * /follow?buyer=<province>/<slug>: where "Follow" lands when the person
 * wasn't signed in (it rides through sign-up and onboarding in `next`).
 * Signed out → sign-up; a trade that hasn't finished onboarding → onboarding;
 * a property manager or public buyer → "following is for contractors".
 * Otherwise the follow completes and they're back on the buyer's page,
 * unless the request came from another site (or is a prefetch): then one
 * click confirms it (lib/follows/rules followLanding).
 */
export default async function FollowLandingPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<{ buyer?: string; state?: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("follows").landing;
  const L = (p: string) => localizePath(p, lang);
  const { buyer, state } = await searchParams;
  const key = parseFollowKey(buyer);
  const [provinceSlug, slug] = key ? key.split("/") : ["", ""];
  const page = key ? findBuyerPage((await loadBuyers()).pages, provinceSlug, slug) : null;

  const shell = (title: string, body: React.ReactNode) => (
    <SimplePage lang={lang} current={null} group="company" crumbs={[{ label: getT("follows").province.crumb, href: BUYERS_PATH }]} tabs={false} aside={false} title={title}>
      {body}
    </SimplePage>
  );
  if (!key || !page) {
    return shell(t.metaTitle, (
      <>
        <p>{t.notFound}</p>
        <div className="s-links"><a href={L(BUYERS_PATH)}>{t.browse} →</a></div>
      </>
    ));
  }
  const name = buyerDisplayName(page, lang);
  const named = inSentence(name, lang);
  const backLink = <div className="s-links"><a href={L(page.path)}>{fmt(t.back, { name })} →</a><a href={L(FOLLOWING_PATH)}>{getT("follows").button.manage} →</a></div>;
  const limitView = () =>
    shell(fmt(t.limitTitle, { limit: FREE_FOLLOW_LIMIT }), (
      <>
        <p data-state="limit">{fmt(t.limitBody, { limit: FREE_FOLLOW_LIMIT, name: named })}</p>
        <div className="g-cta"><div className="acts"><a className="btn mint lg" href={L("/pricing")}>{getT("follows").button.upgrade}</a><a className="lnk" href={L(FOLLOWING_PATH)}>{getT("follows").button.manage} →</a></div></div>
        {backLink}
      </>
    ));
  if (state === "limit") return limitView();
  if (state === "unavailable") return shell(fmt(t.title, { name }), <><p>{t.unavailable}</p>{backLink}</>);

  const session = await getSession().catch(() => null);
  const h = await headers();
  const landing = followLanding({
    signedIn: Boolean(session),
    onboarded: Boolean(session?.profile.onboarding_completed),
    canFollow: canFollowBuyers(session ? { primaryRole: session.profile.primary_role, hasTradeAccess: session.hasTradeAccess } : null),
    fetchSite: h.get("sec-fetch-site"),
    prefetch: h.get("next-router-prefetch") === "1" || /prefetch/i.test(h.get("sec-purpose") ?? h.get("purpose") ?? ""),
  });

  if (landing === "sign-up") redirect(followSignUpFor(key, await followRegionSlug(page), lang));
  if (landing === "onboarding") redirect(L(onboardingPath({ next: L(followIntentPath(key)) })));
  if (landing === "not-allowed" || state === "role") {
    return shell(t.notAllowedTitle, <><p data-state="not-allowed">{t.notAllowedBody}</p>{backLink}</>);
  }
  if (landing === "follow" && session && isServiceConfigured()) {
    const r = await followBuyer(createServiceClient(), { userId: session.userId, orgId: session.organization?.id ?? null, key, pro: session.hasTradeAccess });
    if (r.status === "followed" || r.status === "already") redirect(L(`${page.path}?follow=done#follow`));
    if (r.status === "limit") return limitView();
    return shell(fmt(t.title, { name }), <><p>{t.unavailable}</p>{backLink}</>);
  }
  // From another site, or a prefetch: one click to confirm.
  return shell(fmt(t.title, { name }), (
    <>
      <p>{fmt(t.confirmBody, { name: named })}</p>
      <form action={confirmFollowAction} className="g-cta" data-state="confirm">
        <input type="hidden" name="buyer" value={key} />
        <input type="hidden" name="lang" value={lang} />
        <div className="acts"><button type="submit" className="btn mint lg">{fmt(t.confirmBtn, { name })}</button></div>
      </form>
      {backLink}
    </>
  ));
}
