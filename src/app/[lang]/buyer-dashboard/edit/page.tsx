import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { LogoUploader } from "@/components/forms/logo-uploader";
import { TownWidgetCode } from "@/components/towns/blocks";
import { updateBuyerPageAction } from "@/lib/towns/actions";
import { loadBuyerDashboard } from "@/lib/towns/dashboard-data";
import { MAX_INTRO, MAX_UPCOMING } from "@/lib/towns/managed";
import { BUYER_DASHBOARD_PATH } from "@/lib/towns/paths";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").towns.meta.edit };
}

const input = "mt-1 block w-full rounded-md border border-border bg-card px-3 py-2 text-sm";
/** Six rows for upcoming purchases (blank rows are ignored); more rows appear once these are filled. */
const ROWS = 6;

/**
 * The verified buyer edits its page: logo, procurement contact (public only
 * when ticked), where it posts bids, its vendor registration link, a short
 * intro and upcoming purchases. Saved by updateBuyerPageAction (audit
 * logged); the page and its widget show the change at once.
 */
export default async function BuyerPageEdit({ params, searchParams }: { params: Promise<object>; searchParams?: Promise<{ saved?: string; error?: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("towns").edit;
  const session = await requireRole(["public_buyer"]);
  const demo = isDemoMode();
  if (!demo && !session.organization) redirect(localizePath("/onboarding", lang));
  const sp = (await searchParams) ?? {};
  const { own, page } = demo ? { own: null, page: null } : await loadBuyerDashboard(session);
  const errorText = sp.error ? (sp.error in t.errors ? t.errors[sp.error as keyof typeof t.errors] : sp.error === "notVerified" ? t.notVerified : t.errors.failed) : null;
  const rows = own ? [...own.upcoming, ...Array.from({ length: Math.max(ROWS, Math.min(MAX_UPCOMING, own.upcoming.length + 2)) - own.upcoming.length }, () => ({ title: "", month: "" }))] : [];

  return (
    <div className="max-w-3xl">
      {demo && <DemoBanner />}
      <PageHeader title={t.title} description={own?.buyer_name ?? ""} />
      <p className="mb-4 text-sm"><Link href={BUYER_DASHBOARD_PATH} className="text-teal-700 underline">← {t.back}</Link></p>
      {sp.saved && <p role="status" className="mb-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">{t.saved}</p>}
      {errorText && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorText}</p>}

      {!own ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm">{t.notVerified}</p>
      ) : (
        <form action={updateBuyerPageAction} className="grid gap-5 rounded-xl border border-border bg-card p-5">
          <input type="hidden" name="lang" value={lang} />
          <p className="text-sm text-muted-foreground">{t.intro}</p>
          <LogoUploader organizationId={session.organization?.id ?? null} initialLogoUrl={own.logo_url} label={t.logo} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              {t.contactEmail}
              <input name="contactEmail" type="email" maxLength={254} defaultValue={own.contact_email ?? ""} className={input} />
            </label>
            <label className="text-sm font-medium">
              {t.contactPhone}
              <input name="contactPhone" type="tel" maxLength={40} defaultValue={own.contact_phone ?? ""} className={input} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="showContact" defaultChecked={own.show_contact} />
            {t.showContact}
          </label>
          <label className="text-sm font-medium">
            {t.bidsUrl}
            <input name="bidsUrl" type="url" maxLength={500} placeholder="https://" defaultValue={own.bids_url ?? ""} className={input} />
          </label>
          <label className="text-sm font-medium">
            {t.platformUrl}
            <input name="platformUrl" type="url" maxLength={500} placeholder="https://" defaultValue={own.platform_url ?? ""} className={input} />
          </label>
          <label className="text-sm font-medium">
            {t.vendorRegistrationUrl}
            <input name="vendorRegistrationUrl" type="url" maxLength={500} placeholder="https://" defaultValue={own.vendor_registration_url ?? ""} className={input} />
          </label>
          <label className="text-sm font-medium">
            {t.intro_label}
            <textarea name="intro" rows={4} maxLength={MAX_INTRO} placeholder={t.introPlaceholder} defaultValue={own.intro ?? ""} className={input} />
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t.upcoming}</legend>
            <p className="text-xs text-muted-foreground">{t.upcomingHelp}</p>
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_180px]">
                <input name="upcomingTitle" aria-label={t.upcomingTitle} placeholder={t.upcomingTitle} maxLength={120} defaultValue={r.title} className={input} />
                <input name="upcomingMonth" type="month" aria-label={t.upcomingMonth} defaultValue={r.month} className={input} />
              </div>
            ))}
          </fieldset>
          <button type="submit" className="justify-self-start rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">{t.save}</button>
        </form>
      )}

      {own && page && (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <TownWidgetCode provinceSlug={page.provinceSlug} slug={page.buyer.slug} lang={lang} title={getT("towns").dashboard.widgetTitle} body={getT("towns").dashboard.widgetBody} />
        </div>
      )}
    </div>
  );
}
