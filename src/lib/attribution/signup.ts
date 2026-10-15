/**
 * The signup_attribution row for a new account, built from the first-touch
 * cookie (lib/attribution/cookie). Pure and unit-tested. A browser without
 * the cookie (cleared, blocked, a different device) is recorded as
 * channel "unknown" with no landing data, rather than guessed.
 */

import { hasUtm, sameUtm, type FirstTouch } from "./cookie";
import { classifyChannel, type Channel } from "./channel";

export type SignupMethod = "email" | "google";

export interface SignupAttributionRow {
  user_id: string;
  org_id: string | null;
  channel: Channel;
  landing_path: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  last_utm_source: string | null;
  last_utm_medium: string | null;
  last_utm_campaign: string | null;
  last_utm_content: string | null;
  last_touch_at: string | null;
  first_seen: string | null;
  signed_up_at: string;
  lang: string | null;
  country: string | null;
  method: SignupMethod | null;
}

const orNull = (v: string | undefined | null) => (v ? v : null);

export function signupAttributionRow(i: {
  userId: string;
  orgId?: string | null;
  ft: FirstTouch | null;
  method?: SignupMethod | null;
  ownHosts?: readonly string[];
  now?: Date;
}): SignupAttributionRow {
  const ft = i.ft;
  // Last touch only when it says something the first touch doesn't.
  const last = ft?.last && hasUtm(ft.last) && !sameUtm(ft.last, ft.utm) ? ft.last : null;
  return {
    user_id: i.userId,
    org_id: i.orgId ?? null,
    channel: ft ? classifyChannel(ft, i.ownHosts) : "unknown",
    landing_path: orNull(ft?.path),
    referrer_host: orNull(ft?.ref),
    utm_source: orNull(ft?.utm.source),
    utm_medium: orNull(ft?.utm.medium),
    utm_campaign: orNull(ft?.utm.campaign),
    utm_content: orNull(ft?.utm.content),
    last_utm_source: orNull(last?.source),
    last_utm_medium: orNull(last?.medium),
    last_utm_campaign: orNull(last?.campaign),
    last_utm_content: orNull(last?.content),
    last_touch_at: orNull(last?.at),
    first_seen: orNull(ft?.first),
    signed_up_at: (i.now ?? new Date()).toISOString(),
    lang: orNull(ft?.lang),
    country: orNull(ft?.country),
    method: i.method ?? null,
  };
}
