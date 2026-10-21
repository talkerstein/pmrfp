import "./follows.css";
import type { BuyerPage } from "@/lib/buyers/model";
import { followerCount } from "@/lib/follows/counts";
import { FOLLOWING_PATH, FREE_FOLLOW_LIMIT, buyerFollowAlertsEnabled, followIntentPath, followSignUpHref } from "@/lib/follows/rules";
import { buyerKey } from "@/lib/towns/managed";
import { getLang, getT } from "@/i18n/server";
import { LOCALE_TAG, localizePath, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { FollowButton, type FollowButtonLabels } from "./follow-button";

/**
 * Server halves of the Follow button: the labels in the page's language,
 * the sign-up link that keeps the follow, and the follower count from the
 * shared snapshot (lib/follows/counts). Followers never change indexing.
 */

/** The button's copy for one buyer, filled in (name, free limit). */
export function followLabels(name: string, opts: { followers?: "town" | "buyer" } = {}): FollowButtonLabels {
  const t = getT("follows");
  const b = t.button;
  const v = { name, limit: FREE_FOLLOW_LIMIT };
  return {
    follow: b.follow,
    following: b.following,
    unfollow: b.unfollow,
    followAria: fmt(b.followAria, v),
    unfollowAria: fmt(b.unfollowAria, v),
    usage: b.usage,
    limit: fmt(b.limit, v),
    upgrade: b.upgrade,
    manage: b.manage,
    role: b.role,
    error: b.error,
    unavailable: b.unavailable,
    followed: fmt(b.followed, v),
    unfollowed: fmt(b.unfollowed, v),
    signUp: b.signUp,
    ...(opts.followers ? { followers: opts.followers === "town" ? t.block.followers : t.block.followersBuyer, first: t.block.first } : {}),
  };
}

/** Sign-up (free trade account, the town's region picked) that comes back through /follow. */
export function followSignUpFor(key: string, regionSlug: string | null, lang: Locale): string {
  return localizePath(followSignUpHref(localizePath(followIntentPath(key), lang), regionSlug), lang);
}

/** "Follow {name}": the call to action on a buyer or town page, with "N contractors follow this town". */
export async function FollowBlock({
  page: p,
  name,
  title,
  regionSlug,
  kind,
}: {
  page: Pick<BuyerPage, "provinceSlug" | "buyer">;
  /** In a sentence: "the Town of Cobourg". */
  name: string;
  /** The block's heading (default "Follow {name}"). */
  title?: string;
  regionSlug: string | null;
  kind: "town" | "buyer";
}) {
  const lang = getLang();
  const t = getT("follows").block;
  const key = buyerKey(p.provinceSlug, p.buyer.slug);
  const followers = await followerCount(key);
  return (
    <div className="g-cta" data-cta="follow" id="follow">
      <h3 className="hd">{title ?? fmt(t.title, { name })}</h3>
      <p>{fmt(t.body, { name })}</p>
      <p className="small">{fmt(buyerFollowAlertsEnabled() ? t.timingOn : t.timingOff, { limit: FREE_FOLLOW_LIMIT })}</p>
      <FollowButton
        buyerKey={key}
        signUpHref={followSignUpFor(key, regionSlug, lang)}
        manageHref={localizePath(FOLLOWING_PATH, lang)}
        upgradeHref={localizePath("/pricing", lang)}
        followers={followers}
        labels={followLabels(name, { followers: kind })}
        locale={LOCALE_TAG[lang]}
      />
    </div>
  );
}

/** The small "+ Follow" pill (a public tender's buyer link). No count. */
export function FollowPill({ page: p, name, regionSlug = null }: { page: Pick<BuyerPage, "provinceSlug" | "buyer">; name: string; regionSlug?: string | null }) {
  const lang = getLang();
  const key = buyerKey(p.provinceSlug, p.buyer.slug);
  return (
    <FollowButton
      compact
      buyerKey={key}
      signUpHref={followSignUpFor(key, regionSlug, lang)}
      manageHref={localizePath(FOLLOWING_PATH, lang)}
      upgradeHref={localizePath("/pricing", lang)}
      labels={followLabels(name)}
      locale={LOCALE_TAG[lang]}
    />
  );
}
