import Link from "@/i18n/link";
import { BadgeCheck, CircleDashed, Globe } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Snippet } from "@/components/public/badge-embed";
import { getOrgBadgeStatus } from "@/lib/badge/server";
import { badgeRewardEnabled, REWARD_DAYS } from "@/lib/badge/reward";
import { badgeHtml } from "@/lib/badge/snippet";
import { websiteDomain } from "@/lib/badge/install";
import { BADGE_STRINGS, mailtoUrl } from "@/lib/lifecycle/badge-copy";
import { SITE } from "@/lib/site";
import { getT } from "@/i18n/server";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";

/**
 * "Add your badge" on the trade dashboard: whether the PMRFP badge is
 * detected on the company's own website (lib/badge/install: its badge loading
 * from the domain on its profile on 2+ different days), the copy-paste code
 * with the company's real slug (the /badge page's own generator), and, only
 * while BADGE_REWARD_ENABLED is on, the one-time reward. Server component:
 * the status is read with the service role for THIS company only (the caller
 * passes the signed-in member's own organization).
 */
export async function BadgeInstallCard({
  org,
  lang,
  paid,
}: {
  org: { id: string; slug: string; name: string; website: string | null };
  lang: Locale;
  paid: boolean;
}) {
  const t = getT("dash").badgeCard;
  const status = await getOrgBadgeStatus(org);
  const domain = websiteDomain(org.website);
  const detected = Boolean(status?.install.detected);
  const base = SITE.url.replace(/\/$/, "");
  const profileUrl = `${base}${localizePath(`/directory/${org.slug}`, lang)}`;
  const code = badgeHtml({ kind: "listed", base, slug: org.slug, pageUrl: profileUrl, name: org.name, lang });
  const mail = BADGE_STRINGS[lang].mail;
  const mailto = mailtoUrl(mail.subject, mail.body(code, profileUrl));
  const rewardOn = badgeRewardEnabled() && !paid && !status?.reward && Boolean(domain);

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6" data-section="badge-install" data-status={detected ? "detected" : domain ? "none" : "no-website"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/badge/${org.slug}`} alt={t.alt} width={214} height={54} className="mt-1 hidden sm:block" />
          <div>
            <h2 className="text-base font-semibold">{t.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
              {detected ? (
                <>
                  <BadgeCheck className="size-4 text-teal-600" aria-hidden />
                  <span className="text-teal-700">{fmt(t.statusDetected, { domain: status!.install.domain ?? domain ?? "" })}</span>
                </>
              ) : domain ? (
                <>
                  <CircleDashed className="size-4 text-muted-foreground" aria-hidden />
                  <span className="text-muted-foreground">{t.statusNone}</span>
                </>
              ) : (
                <>
                  <Globe className="size-4 text-amber-600" aria-hidden />
                  <span className="text-amber-700">{t.statusNoSite}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/badge" className={buttonVariants({ variant: "outline" })}>
            {t.more}
          </Link>
          <Link href="/widgets?w=company" className={buttonVariants({ variant: "outline" })}>
            {t.companyWidget}
          </Link>
        </div>
      </div>

      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{detected ? t.detectedBody : domain ? t.body : t.noSiteBody}</p>
      {!domain && (
        <p className="mt-2">
          <Link href="/dashboard/company" className="text-sm font-medium text-teal-700 hover:underline">
            {t.addWebsite} →
          </Link>
        </p>
      )}
      {rewardOn && !detected && <p className="mt-2 text-sm font-medium text-teal-700">{fmt(t.rewardOffer, { days: REWARD_DAYS })}</p>}
      {status?.reward && <p className="mt-2 text-sm font-medium text-teal-700">{fmt(t.rewardGranted, { date: formatDate(status.reward.endsAt, lang, { month: "long", day: "numeric" }) })}</p>}

      {!detected && (
        <div className="mt-4 space-y-2">
          <Snippet label={t.codeLabel} code={code} />
          <a href={mailto} className="inline-block text-sm font-medium text-teal-700 hover:underline">
            {t.send} →
          </a>
        </div>
      )}
    </section>
  );
}
