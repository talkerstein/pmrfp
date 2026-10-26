import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/i18n/link";
import { getSession } from "@/lib/access/access";
import { TrialStartForm } from "@/components/leads/trial";
import { safeReturnPath, startTrialPath, trialSignUpHref } from "@/lib/entitlement/gate";
import { parseTrialSource, trialRefusal } from "@/lib/entitlement/trial";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { localizePath } from "@/i18n/config";

// A step in a flow, never a page to index.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Where a visitor lands after asking for the free trial before they had an
 * account (sign-up with plan=trial, or a company still setting up). It never
 * starts the trial by itself: opening a link must not change anything. The
 * one button below posts startTrialAction (origin-checked by Next.js) and
 * returns to the page they came from, unlocked.
 *
 *   signed out            -> sign-up for the trial (resumes here)
 *   not onboarded         -> onboarding, then back here
 *   already paying / had  -> straight back to the page, nothing to start
 *   cannot (role, held …) -> the dashboard, which says why
 */
export default async function StartTrialPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ source?: string; return?: string }>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const sp = await searchParams;
  const source = parseTrialSource(sp.source);
  const back = safeReturnPath(sp.return);
  const session = await getSession().catch(() => null);
  if (!session) redirect(localizePath(trialSignUpHref(source, back), lang));
  if (!session.profile.onboarding_completed || !session.organization) {
    redirect(localizePath(`/onboarding?next=${encodeURIComponent(startTrialPath(source, back))}`, lang));
  }
  const org = session.organization;
  const refusal = trialRefusal({
    signedIn: true,
    organizationType: org.organization_type,
    organizationStatus: org.status,
    organizationProfileStatus: org.profile_status,
    riskFlagged: org.risk_flagged,
    paid: Boolean(session.paid),
    existing: session.trial && session.trial.status !== "none" ? { startedAt: session.trial.startedAt ?? "", endsAt: session.trial.endsAt ?? "" } : null,
  });
  if (refusal === "paid" || refusal === "used") redirect(localizePath(back ?? "/dashboard", lang));
  if (refusal) redirect(localizePath(`/dashboard?trial=${refusal}`, lang));

  const t = getT("trialFirst");
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t.confirm.title}</h1>
      <p className="mt-3 text-muted-foreground">{t.confirm.body}</p>
      <div className="mt-6">
        <TrialStartForm source={source} label={t.cta.start} lang={getLang()} returnTo={back} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t.cta.note}</p>
      <Link href={back ?? "/dashboard"} className="mt-6 text-sm text-muted-foreground underline underline-offset-2">
        {t.confirm.back}
      </Link>
    </main>
  );
}
