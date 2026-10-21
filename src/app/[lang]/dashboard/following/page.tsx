import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadBuyers } from "@/lib/buyers/load";
import { BUYERS_PATH, findBuyerPage } from "@/lib/buyers/model";
import { buyerDisplayName } from "@/lib/towns/claimable";
import { FREE_FOLLOW_LIMIT, buyerFollowAlertsEnabled, followUsage } from "@/lib/follows/rules";
import { myFollows, type FollowRow } from "@/lib/follows/server";
import { unfollowAction } from "@/lib/follows/actions";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { regionName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").follows.dashboard.metaTitle };
}

/**
 * /dashboard/following: the buyers and towns this person follows, with
 * Unfollow. Free accounts see "2 of 3 free follows used — Pro is
 * unlimited"; new bids from these buyers come in the weekly roundup (free)
 * or by email the same day (Trade Pro and trial, once
 * BUYER_FOLLOW_ALERTS_ENABLED is on).
 */
export default async function FollowingPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<{ removed?: string; error?: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("follows").dashboard;
  const session = await requireRole(["trade", "supplier"]);
  const flash = await searchParams;
  const pro = session.hasTradeAccess;

  let rows: FollowRow[] = [];
  let missing = false;
  if (!isDemoMode() && isServiceConfigured()) ({ rows, missing } = await myFollows(createServiceClient(), session.userId));
  const { pages } = rows.length ? await loadBuyers() : { pages: [] };
  const list = rows.map((r) => {
    const [provinceSlug, slug] = r.key.split("/");
    return { ...r, page: findBuyerPage(pages, provinceSlug, slug) };
  });
  const usage = followUsage(rows.length, pro);
  const day = (d: string) => formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang);

  return (
    <div>
      <PageHeader title={t.title} description={t.description} />

      <div className="mb-6 rounded-lg border border-border bg-card p-4 text-sm">
        <p data-usage={`${usage.used}/${usage.limit ?? "unlimited"}`}>
          <b>{usage.limit != null ? fmt(t.usageFree, { used: formatNumber(Math.min(usage.used, usage.limit), lang), limit: FREE_FOLLOW_LIMIT }) : fmt(t.usagePro, { used: formatNumber(usage.used, lang) })}</b>
          {!pro && (
            <>
              {" "}
              <Link href="/pricing" className="text-teal-700 underline">{t.upgrade} →</Link>
            </>
          )}
        </p>
        <p className="mt-1 text-muted-foreground">{!pro ? t.timingFree : buyerFollowAlertsEnabled() ? t.timingProOn : t.timingProOff}</p>
      </div>

      {flash.removed === "1" && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">{t.removed}</p>}
      {(flash.error === "1" || missing) && <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">{t.unavailable}</p>}

      {list.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody}>
          <Link href={BUYERS_PATH} className={buttonVariants()}>{t.browse}</Link>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card" data-list="following">
          {list.map(({ key, createdAt, page }) => {
            const open = page?.openBids.length ?? 0;
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-3 p-4" data-key={key}>
                <div className="min-w-0">
                  {page ? (
                    <Link href={page.path} className="font-semibold hover:underline">{buyerDisplayName(page, lang)}</Link>
                  ) : (
                    <span className="font-semibold text-muted-foreground">{t.gone}</span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {[
                      page ? regionName(page.province, lang) : key,
                      page ? (open ? fmt(open === 1 ? t.open.one : t.open.other, { n: open >= 12 ? "12+" : formatNumber(open, lang) }) : t.noOpen) : null,
                      fmt(t.since, { date: day(createdAt) }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <form action={unfollowAction}>
                  <input type="hidden" name="buyer" value={key} />
                  <input type="hidden" name="lang" value={lang} />
                  <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>{t.unfollow}</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
