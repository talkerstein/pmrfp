import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/i18n/link";
import { requireRole } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { TrialStartForm, TrialStatus, canStartTrial } from "@/components/leads/trial";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").leads.trial.page.title };
}

/**
 * Where "Start 14-day free trial" lands after sign-up (pricing → sign-up →
 * here). One button starts it; companies that pay already, or had their
 * trial, see their status instead.
 */
export default async function TrialPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("leads").trial;
  const session = await requireRole(["trade"]);
  if (session.paid) redirect(localizePath("/dashboard", lang));
  const { country } = await getVisitorCountry({ session });
  const can = canStartTrial({ paid: session.paid, trial: session.trial, organizationType: session.organization?.organization_type });

  return (
    <div className="max-w-2xl">
      <PageHeader title={t.page.title} description={t.page.body} />
      <TrialStatus trial={session.trial} paid={session.paid} country={country} />
      <ul className="mb-6 space-y-2 text-sm">
        {t.page.points.map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-500" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      {can ? (
        <div>
          <TrialStartForm source="pricing" label={t.start} lang={lang} />
          <p className="mt-2 text-xs text-muted-foreground">{t.note}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {session.trial?.status === "expired" && <p className="w-full text-sm text-muted-foreground">{t.page.already}</p>}
          <Link href="/dashboard/billing?plan=pro&interval=annual" className={buttonVariants()}>{t.page.plans}</Link>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>{t.page.back}</Link>
        </div>
      )}
    </div>
  );
}
