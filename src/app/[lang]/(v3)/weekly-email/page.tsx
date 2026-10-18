import type { Metadata } from "next";
import { SH2, SimplePage } from "@/components/v3/simple";
import { DigestSignupBlock } from "@/components/growth/digest-signup-block";
import { weeklyDigestEnabled } from "@/lib/digest/config";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";

/**
 * The free weekly email: what's in it, the sign-up form, and where the
 * confirm / unsubscribe links land (?confirmed=1, ?unsubscribed=1,
 * ?invalid=1). The form is always open (sign-up is decoupled from sending);
 * until WEEKLY_DIGEST_ENABLED is on the page says the email hasn't started.
 */
type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).growth.digest;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: alternatesFor(l, "/weekly-email"),
  };
}

export default async function WeeklyEmailPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("growth").digest;
  const sp = await searchParams;
  const enabled = weeklyDigestEnabled();
  const notice = sp.confirmed ? (enabled ? t.confirmed : t.confirmedSoon) : sp.unsubscribed ? t.unsubscribed : sp.invalid ? t.invalid : null;

  return (
    <SimplePage lang={lang} current={null} group="company" crumbs={[{ label: t.pageTitle }]} tabs={false} aside={false} title={t.pageTitle} lead={t.pageLead}>
      {notice && (
        <div className="s-callout" role="status" data-notice={sp.confirmed ? "confirmed" : sp.unsubscribed ? "unsubscribed" : "invalid"}>
          <p><b>{notice}</b></p>
        </div>
      )}
      <SH2 no={1} id="what">{t.whatTitle}</SH2>
      <ul className="s-legal">{t.what.map((w) => <li key={w}>{w}</li>)}</ul>
      {!enabled && <p className="muted" data-digest="not-started">{t.soon}</p>}
      <DigestSignupBlock source="weekly-email" />
    </SimplePage>
  );
}
