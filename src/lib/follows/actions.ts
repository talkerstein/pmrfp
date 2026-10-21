"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { loadBuyers } from "@/lib/buyers/load";
import { findBuyerPage } from "@/lib/buyers/model";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";
import { FOLLOWING_PATH, canFollowBuyers, followIntentPath, parseFollowKey } from "./rules";
import { followBuyer, unfollowBuyer } from "./server";
import { EVENT, trackEvent } from "@/lib/analytics";

/**
 * Form actions for following (server actions carry Next's own origin check):
 * the one-click confirm on /follow, and Unfollow on /dashboard/following.
 * The Follow buttons on public pages use /api/follows instead.
 */

function formLang(fd: FormData): Locale {
  const v = fd.get("lang");
  return isEnabledLocale(v) ? v : DEFAULT_LOCALE;
}

/** /follow's "Follow {name}" button (a follow that arrived from another site, or a prefetch). */
export async function confirmFollowAction(formData: FormData): Promise<void> {
  const lang = formLang(formData);
  const key = parseFollowKey(formData.get("buyer"));
  if (!key) redirect(localizePath("/buyers", lang));
  const back = (state: string): never => redirect(localizePath(`${followIntentPath(key!)}&state=${state}`, lang));
  const session = await getSession();
  if (!session) redirect(localizePath(followIntentPath(key!), lang));
  if (!canFollowBuyers({ primaryRole: session.profile.primary_role, hasTradeAccess: session.hasTradeAccess })) back("role");
  if (!isServiceConfigured()) back("unavailable");
  const [provinceSlug, slug] = key!.split("/");
  const page = findBuyerPage((await loadBuyers()).pages, provinceSlug, slug);
  if (!page) redirect(localizePath("/buyers", lang));
  const r = await followBuyer(createServiceClient(), { userId: session.userId, orgId: session.organization?.id ?? null, key: key!, pro: session.hasTradeAccess });
  if (r.status === "limit") back("limit");
  if (r.status === "unavailable" || r.status === "error") back("unavailable");
  await trackEvent(EVENT.FOLLOW_BUYER, { buyer: key!, pro: session.hasTradeAccess }, { userId: session.userId, role: session.profile.primary_role });
  redirect(localizePath(`${page!.path}?follow=done#follow`, lang));
}

/** /dashboard/following: stop following one buyer. */
export async function unfollowAction(formData: FormData): Promise<void> {
  const lang = formLang(formData);
  const key = parseFollowKey(formData.get("buyer"));
  const session = await getSession();
  if (!session) redirect(localizePath("/sign-in", lang));
  if (!key || !isServiceConfigured()) redirect(localizePath(FOLLOWING_PATH, lang));
  const r = await unfollowBuyer(createServiceClient(), { userId: session.userId, key: key!, pro: session.hasTradeAccess });
  redirect(localizePath(`${FOLLOWING_PATH}?${r.status === "unfollowed" ? "removed=1" : "error=1"}`, lang));
}
