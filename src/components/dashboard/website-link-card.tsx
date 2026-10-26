import Link from "@/i18n/link";
import { CircleDashed, Globe, Link2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getOrgBadgeStatus } from "@/lib/badge/server";
import { getOrgClickStats } from "@/lib/links/clicks";
import { LINK_MIN_AGE_DAYS, daysLive, linkStatus, type LinkOrg } from "@/lib/links/policy";
import { websiteDomain } from "@/lib/badge/install";
import { getT } from "@/i18n/server";
import type { Locale } from "@/i18n/config";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import type { Organization } from "@/types/db";

/**
 * "Your website link" on the trade dashboard: is PMRFP's link to the
 * company's own website followed (lib/links/policy), what unlocks it, since
 * when, and how many visits PMRFP sent (lib/links/clicks). Server component:
 * reads the company's own columns, its badge status and its click counts
 * with the service role for THIS company only (the caller passes the
 * signed-in member's own organization). The status shown is what the public
 * pages print today (the columns kept by the daily sync); if the live badge
 * or plan already meets the rule, it says the link switches over at the next
 * daily update.
 */
export async function WebsiteLinkCard({ org, lang, paid }: { org: Organization; lang: Locale; paid: boolean }) {
  const t = getT("dash").linkCard;
  const [badge, clicks] = await Promise.all([getOrgBadgeStatus({ id: org.id, slug: org.slug, website: org.website }), getOrgClickStats(org.id)]);
  const domain = websiteDomain(org.website);

  const published: LinkOrg = {
    profileStatus: org.profile_status,
    status: org.status,
    approvedAt: org.approved_at,
    linkTrusted: org.link_trusted,
    paid: org.link_paid,
    badgeInstalled: org.link_badge,
    riskFlagged: org.risk_flagged,
  };
  const now = new Date();
  const shown = linkStatus(published, now);
  const live = linkStatus({ ...published, paid: paid || org.link_paid, badgeInstalled: Boolean(badge?.install.detected) || org.link_badge }, now);
  const pending = !shown.earned && live.earned;
  const days = daysLive(published, now);

  const reasonText = shown.reason === "trusted" ? t.reasonTrusted : shown.reason === "paid" ? t.reasonPaid : shown.reason === "badge" ? t.reasonBadge : "";

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6" data-section="website-link" data-status={!domain ? "no-website" : shown.earned ? "followed" : "nofollow"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="text-base font-semibold">{t.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
              {!domain ? (
                <>
                  <Globe className="size-4 text-amber-600" aria-hidden />
                  <span className="text-amber-700">{t.statusNoSite}</span>
                </>
              ) : shown.earned ? (
                <span className="text-teal-700">{t.statusFollowed}</span>
              ) : (
                <>
                  <CircleDashed className="size-4 text-muted-foreground" aria-hidden />
                  <span className="text-muted-foreground">{t.statusNofollow}</span>
                </>
              )}
            </p>
          </div>
        </div>
        {!domain && (
          <Link href="/dashboard/company" className={buttonVariants({ variant: "outline" })}>
            {t.addWebsite}
          </Link>
        )}
      </div>

      {!domain ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.noSiteBody}</p>
      ) : shown.earned ? (
        <div className="mt-3 space-y-1 text-sm text-muted-foreground">
          <p>{fmt(t.followedBody, { domain })}</p>
          <p>
            {reasonText}
            {org.link_earned_at ? ` ${fmt(t.followedSince, { date: formatDate(org.link_earned_at, lang, { year: "numeric", month: "long", day: "numeric" }) })}` : ""}
          </p>
        </div>
      ) : pending ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.pendingBody}</p>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">
          <p>{fmt(t.nofollowBody, { domain })}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t.stepBadge}</li>
            <li>{t.stepPaid}</li>
          </ul>
          <p className="mt-2">
            {shown.missing.includes("approval")
              ? t.stepApproval
              : shown.missing.includes("review")
                ? t.stepReview
                : shown.missing.includes("age")
                  ? fmt(t.stepAge, { live: formatNumber(Math.min(days ?? 0, LINK_MIN_AGE_DAYS), lang) })
                  : ""}
          </p>
        </div>
      )}
      {domain && <p className="mt-2 text-xs text-muted-foreground">{t.note}</p>}

      {domain && (
        <div className="mt-4 border-t border-border pt-3 text-sm" data-clicks={clicks ? clicks.last30 : "n/a"}>
          {clicks && clicks.total > 0 ? (
            <p className="font-medium">
              {fmt(t.clicks, { n: formatNumber(clicks.last30, lang) })}
              <span className="ml-2 font-normal text-muted-foreground">{fmt(t.clicksTotal, { total: formatNumber(clicks.total, lang) })}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">{t.clicksNone}</p>
          )}
          {!paid && (
            <p className="mt-1 text-muted-foreground">
              {t.upgrade}{" "}
              <Link href="/pricing" className="font-medium text-teal-700 hover:underline">
                {t.upgradeCta} →
              </Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
